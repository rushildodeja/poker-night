import { randomUUID } from 'node:crypto';
import { WebSocketServer, type WebSocket } from 'ws';
import { parseClientActionRequest, toPrivateSnapshot } from '@poker-night/game-types';
import { ConnectionManager } from './connection-manager.js';
import { TableRegistry } from './table-registry.js';
import { TableRuntime } from './table-runtime.js';

const port = Number(process.env.PORT ?? 8080);
const tables = new TableRegistry();
const runtimes = new Map<string, TableRuntime>();
const connections = new ConnectionManager();

// Temporary development identity adapter. Production must replace this with verified session/JWT authentication.
const authenticate = (request: { headers: Record<string, string | string[] | undefined> }): string | null => {
  const value = request.headers['x-player-id'];
  return typeof value === 'string' && value.trim() ? value : null;
};

const server = new WebSocketServer({ port });

const send = (socket: WebSocket, payload: unknown): void => socket.send(JSON.stringify(payload));

server.on('connection', (socket, request) => {
  const playerId = authenticate(request as { headers: Record<string, string | string[] | undefined> });
  if (!playerId) {
    send(socket, { type: 'ERROR', protocolVersion: 1, sequence: 0, payload: { type: 'ERROR', protocolVersion: 1, code: 'UNAUTHORIZED', message: 'Authentication required' } });
    socket.close(1008, 'Authentication required');
    return;
  }

  const connectionId = randomUUID();
  const connection = { id: connectionId, playerId, send: (message: string) => socket.send(message), close: (code?: number, reason?: string) => socket.close(code, reason) };
  connections.add(connection);

  socket.on('message', (raw) => {
    let requestPayload: unknown;
    try { requestPayload = JSON.parse(raw.toString()); } catch {
      send(socket, { type: 'ERROR', protocolVersion: 1, sequence: 0, payload: { type: 'ERROR', protocolVersion: 1, code: 'BAD_REQUEST', message: 'Message must be valid JSON' } });
      return;
    }
    const parsed = parseClientActionRequest(requestPayload);
    if (!parsed.ok) {
      send(socket, { type: 'ERROR', protocolVersion: 1, sequence: 0, payload: { type: 'ERROR', protocolVersion: 1, code: 'BAD_REQUEST', message: parsed.message } });
      return;
    }
    const command = { ...parsed.value, authenticatedPlayerId: playerId };
    const table = tables.get(command.tableId);
    if (!table) {
      send(socket, { type: 'ERROR', protocolVersion: 1, sequence: 0, payload: { type: 'ERROR', protocolVersion: 1, requestId: command.requestId, code: 'TABLE_NOT_FOUND', message: 'Table not found' } });
      return;
    }
    const runtime = runtimes.get(command.tableId);
    if (!runtime) {
      send(socket, { type: 'ERROR', protocolVersion: 1, sequence: 0, payload: { type: 'ERROR', protocolVersion: 1, requestId: command.requestId, code: 'INTERNAL_ERROR', message: 'Table runtime unavailable' } });
      return;
    }
    const result = runtime.apply(command);
    if (result.code) {
      send(socket, { type: 'ERROR', protocolVersion: 1, sequence: runtime.snapshot().sequence, payload: { type: 'ERROR', protocolVersion: 1, requestId: result.requestId, code: result.code === 'STALE_SEQUENCE' ? 'BAD_REQUEST' : result.code, message: result.message } });
      return;
    }
    send(socket, { type: 'ACTION_ACCEPTED', protocolVersion: 1, sequence: result.sequence, payload: result });
    const playerIds = table.state.players.map((p) => p.playerId);
    connections.broadcastToPlayers(playerIds, (recipientId) => JSON.stringify({ type: 'TABLE_SNAPSHOT', protocolVersion: 1, sequence: runtime.snapshot().sequence, payload: toPrivateSnapshot(table.state, recipientId, runtime.snapshot().sequence) }));
  });

  socket.on('close', () => connections.remove(connectionId));
  socket.on('error', () => connections.remove(connectionId));
});

// Development bootstrap only; production tables will come from authenticated lobby/matchmaking flows.
const demo = tables.create('dev-table', 50, 100, 9);
demo.seatPlayer('demo-1', 0, 10000);
demo.seatPlayer('demo-2', 1, 10000);
demo.startHand();
runtimes.set(demo.state.tableId, new TableRuntime(demo));

console.log(`Poker Night game server listening on :${port}`);
