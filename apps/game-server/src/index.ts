import { randomUUID } from 'node:crypto';
import { WebSocketServer, type WebSocket } from 'ws';
import { parseClientActionRequest, parseClientCreateTableRequest, parseClientJoinTableRequest, parseClientListTablesRequest, parseClientResumeRequest, toPrivateSnapshot } from '@poker-night/game-types';
import { ConnectionManager } from './connection-manager.js';
import { ConnectionGuard } from './connection-guard.js';
import { SessionManager } from './session-manager.js';
import { TableRegistry } from './table-registry.js';
import { TableRuntime } from './table-runtime.js';
import { PostgresDurableTableStore } from './postgres-store.js';
import { ActionTimerManager } from './action-timer.js';
import { ActionTimeoutCoordinator } from './action-timeout-coordinator.js';
import { createAuthenticator } from './authenticator.js';
import { TableLifecycleService } from './table-lifecycle.js';

const port = Number(process.env.PORT ?? 8080);
const tables = new TableRegistry();
const runtimes = new Map<string, TableRuntime>();
const connections = new ConnectionManager();
const sessions = new SessionManager();
const timers = new ActionTimerManager();
const store = process.env.DATABASE_URL ? new PostgresDurableTableStore() : null;
const authenticator = createAuthenticator();
const lifecycle = new TableLifecycleService(tables, runtimes, store);

const server = new WebSocketServer({ port, maxPayload: 16 * 1024 });
const send = (socket: WebSocket, payload: unknown): void => { if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(payload)); };
const sendError = (socket: WebSocket, code: string, message: string, requestId?: string, sequence = 0): void => {
  send(socket, { type: 'ERROR', protocolVersion: 1, sequence, payload: { type: 'ERROR', protocolVersion: 1, requestId, code, message } });
};

const broadcastRuntime = (runtime: TableRuntime): void => {
  const playerIds = runtime.table.state.players.map((player) => player.playerId);
  connections.broadcastToPlayers(playerIds, (recipientId) => JSON.stringify({ type: 'TABLE_SNAPSHOT', protocolVersion: 1, sequence: runtime.getSequence(), payload: runtime.privateSnapshot(recipientId) }));
};
const timeoutCoordinator = new ActionTimeoutCoordinator(timers, (runtime, result) => {
  if ('type' in result && result.type === 'ACTION_ACCEPTED') broadcastRuntime(runtime);
});

server.on('connection', (socket, request) => {
  const playerId = authenticator.authenticate(request as { headers: Record<string, string | string[] | undefined> });
  if (!playerId) { sendError(socket, 'UNAUTHORIZED', 'Authentication required'); socket.close(1008, 'Authentication required'); return; }
  const connectionId = randomUUID();
  const provisionalSessionId = randomUUID();
  const guard = new ConnectionGuard({ maxMessagesPerWindow: Number(process.env.MAX_MESSAGES_PER_SECOND ?? 40), windowMs: 1000 });
  let sessionId: string = provisionalSessionId;
  let active = false;
  sessions.createPending(provisionalSessionId, playerId, connectionId);
  const connection = { id: connectionId, playerId, send: (message: string) => { if (socket.readyState === socket.OPEN) socket.send(message); }, close: (code?: number, reason?: string) => socket.close(code, reason) };
  connections.add(connection);
  send(socket, { type: 'SESSION_READY', protocolVersion: 1, sequence: 0, payload: { type: 'SESSION_READY', protocolVersion: 1, sessionId: provisionalSessionId, playerId } });

  socket.on('message', async (raw) => {
    if (!guard.allow()) { sendError(socket, 'BAD_REQUEST', 'Message rate limit exceeded'); socket.close(1008, 'Message rate limit exceeded'); return; }
    sessions.touch(sessionId);
    let requestPayload: unknown;
    try { requestPayload = JSON.parse(raw.toString()); } catch { sendError(socket, 'BAD_REQUEST', 'Message must be valid JSON'); return; }
    if (!active) {
      if (!sessions.activate(sessionId)) { sendError(socket, 'INVALID_SESSION', 'Session is no longer valid'); socket.close(1008, 'Invalid session'); return; }
      active = true;
    }
    const type = requestPayload && typeof requestPayload === 'object' ? (requestPayload as Record<string, unknown>).type : undefined;
    if (type === 'LIST_TABLES') {
      try { parseClientListTablesRequest(requestPayload); } catch (error) { sendError(socket, 'BAD_REQUEST', error instanceof Error ? error.message : 'Invalid list request'); return; }
      send(socket, { type: 'TABLE_LIST', protocolVersion: 1, sequence: 0, payload: { type: 'TABLE_LIST', protocolVersion: 1, tables: lifecycle.list() } }); return;
    }
    if (type === 'CREATE_TABLE') {
      let create;
      try { create = parseClientCreateTableRequest(requestPayload); } catch (error) { sendError(socket, 'BAD_REQUEST', error instanceof Error ? error.message : 'Invalid create request'); return; }
      const created = await lifecycle.create(create, playerId);
      if ('ok' in created) { sendError(socket, created.code, created.message, create.requestId); return; }
      const runtime = created.runtime;
      send(socket, { type: 'TABLE_CREATED', protocolVersion: 1, sequence: runtime.getSequence(), payload: { type: 'TABLE_CREATED', protocolVersion: 1, tableId: created.tableId, sequence: runtime.getSequence() } });
      timeoutCoordinator.arm(runtime); send(socket, { type: 'TABLE_SNAPSHOT', protocolVersion: 1, sequence: runtime.getSequence(), payload: runtime.privateSnapshot(playerId) }); return;
    }
    if (type === 'JOIN_TABLE') {
      let join;
      try { join = parseClientJoinTableRequest(requestPayload); } catch (error) { sendError(socket, 'BAD_REQUEST', error instanceof Error ? error.message : 'Invalid join request'); return; }
      const result = await lifecycle.join(join, playerId);
      if (!result.ok) { sendError(socket, result.code, result.message, join.requestId); return; }
      timeoutCoordinator.arm(result.runtime); send(socket, { type: 'TABLE_JOINED', protocolVersion: 1, sequence: result.runtime.getSequence(), payload: result.response }); broadcastRuntime(result.runtime); return;
    }
    if (type === 'RESUME') {
      let resume;
      try { resume = parseClientResumeRequest(requestPayload); } catch (error) { sendError(socket, 'BAD_REQUEST', error instanceof Error ? error.message : 'Invalid resume request'); return; }
      const table = tables.get(resume.tableId); const runtime = runtimes.get(resume.tableId);
      if (!table || !runtime) { sendError(socket, 'TABLE_NOT_FOUND', 'Table not found'); return; }
      const result = sessions.resume(resume.sessionId, playerId, connectionId);
      if (!result) { sendError(socket, 'INVALID_SESSION', 'Session is invalid, expired, or belongs to another player'); return; }
      if (sessionId !== resume.sessionId) sessions.discard(sessionId); sessionId = resume.sessionId; active = true;
      if (result.previousConnectionId && result.previousConnectionId !== connectionId) connections.get(result.previousConnectionId)?.close(4001, 'Session resumed on another connection');
      await runtime.ensureActionDeadlinePersisted(); timeoutCoordinator.arm(runtime); const sequence = runtime.getSequence();
      send(socket, { type: 'RESUME_ACCEPTED', protocolVersion: 1, sequence, payload: { type: 'RESUME_ACCEPTED', protocolVersion: 1, sessionId, playerId, tableId: resume.tableId, sequence, staleClient: resume.lastSequence !== sequence } });
      if (!table.state.players.some((player) => player.playerId === playerId)) { sendError(socket, 'PLAYER_NOT_SEATED', 'Player is no longer seated at this table', undefined, sequence); return; }
      send(socket, { type: 'TABLE_SNAPSHOT', protocolVersion: 1, sequence, payload: toPrivateSnapshot(table.state, sequence, playerId) }); return;
    }
    let parsed;
    try { parsed = parseClientActionRequest(requestPayload); } catch (error) { sendError(socket, 'BAD_REQUEST', error instanceof Error ? error.message : 'Invalid request'); return; }
    const command = { ...parsed, authenticatedPlayerId: playerId };
    const table = tables.get(command.tableId); const runtime = runtimes.get(command.tableId);
    if (!table || !runtime) { sendError(socket, 'TABLE_NOT_FOUND', 'Table not found', command.requestId); return; }
    const result = await runtime.apply(command);
    if ('code' in result) { sendError(socket, result.code, result.message, result.requestId, runtime.getSequence()); return; }
    timeoutCoordinator.arm(runtime); send(socket, { type: 'ACTION_ACCEPTED', protocolVersion: 1, sequence: result.sequence, payload: result }); broadcastRuntime(runtime);
  });
  const detach = () => { connections.remove(connectionId); sessions.disconnect(sessionId, connectionId); };
  socket.on('close', detach); socket.on('error', detach);
});

async function bootstrap(): Promise<void> {
  if (store) {
    const checkpoints = await store.listCheckpoints();
    for (const record of checkpoints) { const runtime = await TableRuntime.recover(store, record.tableId); if (!runtime) continue; await runtime.ensureActionDeadlinePersisted(); tables.register(runtime.table); runtimes.set(record.tableId, runtime); timeoutCoordinator.arm(runtime); }
    console.log(`Recovered ${runtimes.size} persisted table(s)`);
  } else {
    const demo = tables.create('dev-table', 50, 100, 9); demo.seatPlayer('demo-1', 0, 10000); demo.seatPlayer('demo-2', 1, 10000); demo.startHand(); const runtime = new TableRuntime(demo); runtimes.set(demo.state.tableId, runtime); timeoutCoordinator.arm(runtime);
  }
  console.log(`Poker Night game server listening on :${port}`);
}
void bootstrap().catch((error) => { console.error('Game server bootstrap failed', error); process.exitCode = 1; });
