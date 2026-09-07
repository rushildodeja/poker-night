import { randomUUID } from 'node:crypto';
import { WebSocketServer, type WebSocket } from 'ws';
import { parseClientActionRequest, parseClientResumeRequest, toPrivateSnapshot } from '@poker-night/game-types';
import { ConnectionManager } from './connection-manager.js';
import { SessionManager } from './session-manager.js';
import { TableRegistry } from './table-registry.js';
import { TableRuntime } from './table-runtime.js';
import { PostgresDurableTableStore } from './postgres-store.js';

const port = Number(process.env.PORT ?? 8080);
const tables = new TableRegistry();
const runtimes = new Map<string, TableRuntime>();
const connections = new ConnectionManager();
const sessions = new SessionManager();
const store = process.env.DATABASE_URL ? new PostgresDurableTableStore() : null;

const authenticate = (request: { headers: Record<string, string | string[] | undefined> }): string | null => {
  const value = request.headers['x-player-id'];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
};
const server = new WebSocketServer({ port, maxPayload: 16 * 1024 });
const send = (socket: WebSocket, payload: unknown): void => { if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(payload)); };
const sendError = (socket: WebSocket, code: string, message: string, requestId?: string, sequence = 0): void => {
  send(socket, { type: 'ERROR', protocolVersion: 1, sequence, payload: { type: 'ERROR', protocolVersion: 1, requestId, code, message } });
};

server.on('connection', (socket, request) => {
  const playerId = authenticate(request as { headers: Record<string, string | string[] | undefined> });
  if (!playerId) { sendError(socket, 'UNAUTHORIZED', 'Authentication required'); socket.close(1008, 'Authentication required'); return; }

  const connectionId = randomUUID();
  const provisionalSessionId = randomUUID();
  let sessionId = provisionalSessionId;
  let active = false;
  sessions.createPending(provisionalSessionId, playerId, connectionId);

  const connection = {
    id: connectionId,
    playerId,
    send: (message: string) => { if (socket.readyState === socket.OPEN) socket.send(message); },
    close: (code?: number, reason?: string) => socket.close(code, reason),
  };
  connections.add(connection);

  send(socket, { type: 'SESSION_READY', protocolVersion: 1, sequence: 0, payload: { type: 'SESSION_READY', protocolVersion: 1, sessionId: provisionalSessionId, playerId } });

  socket.on('message', async (raw) => {
    sessions.touch(sessionId);
    let requestPayload: unknown;
    try { requestPayload = JSON.parse(raw.toString()); }
    catch { sendError(socket, 'BAD_REQUEST', 'Message must be valid JSON'); return; }

    if (requestPayload && typeof requestPayload === 'object' && (requestPayload as Record<string, unknown>).type === 'RESUME') {
      let resume;
      try { resume = parseClientResumeRequest(requestPayload); }
      catch (error) { sendError(socket, 'BAD_REQUEST', error instanceof Error ? error.message : 'Invalid resume request'); return; }

      const table = tables.get(resume.tableId);
      const runtime = runtimes.get(resume.tableId);
      if (!table || !runtime) { sendError(socket, 'TABLE_NOT_FOUND', 'Table not found'); return; }

      const result = sessions.resume(resume.sessionId, playerId, connectionId);
      if (!result) { sendError(socket, 'INVALID_SESSION', 'Session is invalid, expired, or belongs to another player'); return; }
      if (sessionId !== resume.sessionId) sessions.discard(sessionId);
      sessionId = resume.sessionId;
      active = true;

      if (result.previousConnectionId && result.previousConnectionId !== connectionId) connections.get(result.previousConnectionId)?.close(4001, 'Session resumed on another connection');

      const sequence = runtime.getSequence();
      send(socket, { type: 'RESUME_ACCEPTED', protocolVersion: 1, sequence, payload: { type: 'RESUME_ACCEPTED', protocolVersion: 1, sessionId, playerId, tableId: resume.tableId, sequence, staleClient: resume.lastSequence !== sequence } });
      if (!table.state.players.some((player) => player.playerId === playerId)) { sendError(socket, 'PLAYER_NOT_SEATED', 'Player is no longer seated at this table', undefined, sequence); return; }
      send(socket, { type: 'TABLE_SNAPSHOT', protocolVersion: 1, sequence, payload: toPrivateSnapshot(table.state, sequence, playerId) });
      return;
    }

    if (!active) {
      if (!sessions.activate(sessionId)) { sendError(socket, 'INVALID_SESSION', 'Session is no longer valid'); socket.close(1008, 'Invalid session'); return; }
      active = true;
    }

    let parsed;
    try { parsed = parseClientActionRequest(requestPayload); }
    catch (error) { sendError(socket, 'BAD_REQUEST', error instanceof Error ? error.message : 'Invalid request'); return; }

    const command = { ...parsed, authenticatedPlayerId: playerId };
    const table = tables.get(command.tableId);
    const runtime = runtimes.get(command.tableId);
    if (!table || !runtime) { sendError(socket, 'TABLE_NOT_FOUND', 'Table not found', command.requestId); return; }

    const result = await runtime.apply(command);
    if ('code' in result) { sendError(socket, result.code, result.message, result.requestId, runtime.getSequence()); return; }

    send(socket, { type: 'ACTION_ACCEPTED', protocolVersion: 1, sequence: result.sequence, payload: result });
    const sequence = runtime.getSequence();
    connections.broadcastToPlayers(table.state.players.map((player) => player.playerId), (recipientId) => JSON.stringify({ type: 'TABLE_SNAPSHOT', protocolVersion: 1, sequence, payload: toPrivateSnapshot(table.state, sequence, recipientId) }));
  });

  const detach = () => { connections.remove(connectionId); sessions.disconnect(sessionId, connectionId); };
  socket.on('close', detach);
  socket.on('error', detach);
});

async function bootstrap(): Promise<void> {
  if (store) {
    const checkpoints = await store.listCheckpoints();
    for (const record of checkpoints) {
      const runtime = await TableRuntime.recover(store, record.tableId);
      if (!runtime) continue;
      tables.register(runtime.table);
      runtimes.set(record.tableId, runtime);
    }
    console.log(`Recovered ${runtimes.size} persisted table(s)`);
  } else {
    const demo = tables.create('dev-table', 50, 100, 9);
    demo.seatPlayer('demo-1', 0, 10000);
    demo.seatPlayer('demo-2', 1, 10000);
    demo.startHand();
    const runtime = new TableRuntime(demo);
    runtimes.set(demo.state.tableId, runtime);
  }
  console.log(`Poker Night game server listening on :${port}`);
}

void bootstrap().catch((error) => { console.error('Game server bootstrap failed', error); process.exitCode = 1; });
