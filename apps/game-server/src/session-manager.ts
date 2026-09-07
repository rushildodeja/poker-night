export type Session = Readonly<{
  sessionId: string;
  playerId: string;
  connectionId: string;
  connectedAt: number;
  lastSeenAt: number;
}>;

/** Tracks authenticated player sessions independently from WebSocket objects. */
export class SessionManager {
  private readonly sessions = new Map<string, Session>();
  private readonly byPlayer = new Map<string, string>();

  attach(sessionId: string, playerId: string, connectionId: string, now = Date.now()): Session {
    const previous = this.byPlayer.get(playerId);
    if (previous) this.sessions.delete(previous);
    const session: Session = { sessionId, playerId, connectionId, connectedAt: now, lastSeenAt: now };
    this.sessions.set(sessionId, session);
    this.byPlayer.set(playerId, sessionId);
    return session;
  }

  touch(sessionId: string, now = Date.now()): Session | null {
    const current = this.sessions.get(sessionId);
    if (!current) return null;
    const updated = { ...current, lastSeenAt: now };
    this.sessions.set(sessionId, updated);
    return updated;
  }

  getBySession(sessionId: string): Session | null { return this.sessions.get(sessionId) ?? null; }
  getByPlayer(playerId: string): Session | null {
    const id = this.byPlayer.get(playerId);
    return id ? this.sessions.get(id) ?? null : null;
  }

  remove(sessionId: string): Session | null {
    const current = this.sessions.get(sessionId);
    if (!current) return null;
    this.sessions.delete(sessionId);
    if (this.byPlayer.get(current.playerId) === sessionId) this.byPlayer.delete(current.playerId);
    return current;
  }

  size(): number { return this.sessions.size; }
}
