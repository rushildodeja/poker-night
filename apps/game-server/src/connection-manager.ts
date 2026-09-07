export type Connection = Readonly<{
  id: string;
  playerId: string;
  send: (message: string) => void;
  close: (code?: number, reason?: string) => void;
}>;

export class ConnectionManager {
  private readonly connections = new Map<string, Connection>();
  private readonly byPlayer = new Map<string, Set<string>>();

  add(connection: Connection): void {
    this.connections.set(connection.id, connection);
    const ids = this.byPlayer.get(connection.playerId) ?? new Set<string>();
    ids.add(connection.id);
    this.byPlayer.set(connection.playerId, ids);
  }

  remove(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (!connection) return;
    this.connections.delete(connectionId);
    const ids = this.byPlayer.get(connection.playerId);
    ids?.delete(connectionId);
    if (ids?.size === 0) this.byPlayer.delete(connection.playerId);
  }

  forPlayer(playerId: string): Connection[] {
    return [...(this.byPlayer.get(playerId) ?? [])].map((id) => this.connections.get(id)).filter((connection): connection is Connection => Boolean(connection));
  }

  broadcastToPlayers(playerIds: readonly string[], messageFor: (playerId: string) => string): void {
    for (const playerId of playerIds) for (const connection of this.forPlayer(playerId)) connection.send(messageFor(playerId));
  }
}
