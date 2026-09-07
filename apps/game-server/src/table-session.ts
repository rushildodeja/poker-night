import { randomUUID } from 'node:crypto';
import type { PrivateTableSnapshot } from '@poker-night/game-types';
import { ConnectionManager, type GameConnection } from './connection-manager.js';
import { TableRuntime } from './table-runtime.js';
import { TableCommandQueue } from './table-queue.js';

export type Session = {
  sessionId: string;
  playerId: string;
  tableId: string;
  connectionId: string;
  connectedAt: number;
};

/** Owns connection membership for one live table and provides reconnect-safe snapshots. */
export class TableSessionManager {
  private readonly sessions = new Map<string, Session>();

  constructor(private readonly connections: ConnectionManager) {}

  attach(runtime: TableRuntime, connection: GameConnection, playerId: string): Session {
    const previous = this.sessions.get(playerId);
    if (previous) this.detach(previous.connectionId);

    const session: Session = {
      sessionId: randomUUID(),
      playerId,
      tableId: runtime.table.state.tableId,
      connectionId: connection.id,
      connectedAt: Date.now(),
    };
    this.sessions.set(playerId, session);
    connection.playerId = playerId;
    this.connections.add(connection);
    return session;
  }

  detach(connectionId: string): Session | undefined {
    const connection = this.connections.get(connectionId);
    const session = connection?.playerId ? this.sessions.get(connection.playerId) : undefined;
    if (session?.connectionId === connectionId) this.sessions.delete(session.playerId);
    this.connections.remove(connectionId);
    return session;
  }

  sessionForPlayer(playerId: string): Session | undefined { return this.sessions.get(playerId); }

  reconnectSnapshot(runtime: TableRuntime, playerId: string): PrivateTableSnapshot {
    return runtime.privateSnapshot(playerId);
  }
}
