const SESSION_TTL_MS = 5 * 60_000;

export type Session = Readonly<{
  sessionId: string;
  playerId: string;
  connectionId: string | null;
  connectedAt: number;
  lastSeenAt: number;
}>;

/** Tracks authenticated player sessions independently from WebSocket objects. */
export class SessionManager {
  private readonly sessions = new Map<string, Session>();
  private readonly byPlayer = new Map<string, string>();

  createPending(sessionId: string, playerId: string, connectionId: string, now = Date.now()): Session {
    this.prune(now);
    const session: Session = { sessionId, playerId, connectionId, connectedAt: now, lastSeenAt: now };
    this.sessions.set(sessionId, session);
    return session;
  }

  activate(sessionId: string, now = Date.now()): Session | null {
    this.prune(now);
    const current = this.sessions.get(sessionId);
    if (!current) return null;
    const previous = this.byPlayer.get(current.playerId);
    if (previous && previous !== sessionId) this.sessions.delete(previous);
    this.byPlayer.set(current.playerId, sessionId);
    return current;
  }

  attachNew(sessionId: string, playerId: string, connectionId: string, now = Date.now()): Session {
    this.prune(now);
    const previous = this.byPlayer.get(playerId);
    if (previous) this.sessions.delete(previous);
    const session: Session = { sessionId, playerId, connectionId, connectedAt: now, lastSeenAt: now };
    this.sessions.set(sessionId, session);
    this.byPlayer.set(playerId, sessionId);
    return session;
  }

  attach(sessionId: string, playerId: string, connectionId: string, now = Date.now()): Session {
    return this.attachNew(sessionId, playerId, connectionId, now);
  }

  resume(sessionId: string, playerId: string, connectionId: string, now = Date.now()): { session: Session; previousConnectionId: string | null } | null {
    this.prune(now);
    const current = this.sessions.get(sessionId);
    if (!current || current.playerId !== playerId) return null;
    const previousSessionId = this.byPlayer.get(playerId);
    if (previousSessionId && previousSessionId !== sessionId) this.sessions.delete(previousSessionId);
    const previousConnectionId = current.connectionId;
    const resumed: Session = { ...current, connectionId, lastSeenAt: now };
    this.sessions.set(sessionId, resumed);
    this.byPlayer.set(playerId, sessionId);
    return { session: resumed, previousConnectionId };
  }

  discard(sessionId: string): void {
    const current = this.sessions.get(sessionId);
    if (!current) return;
    this.sessions.delete(sessionId);
    if (this.byPlayer.get(current.playerId) === sessionId) this.byPlayer.delete(current.playerId);
  }

  disconnect(sessionId: string, connectionId: string, now = Date.now()): Session | null {
    const current = this.sessions.get(sessionId);
    if (!current || current.connectionId !== connectionId) return null;
    const updated: Session = { ...current, connectionId: null, lastSeenAt: now };
    this.sessions.set(sessionId, updated);
    return updated;
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

  prune(now = Date.now()): void {
    for (const [sessionId, session] of this.sessions) {
      if (session.connectionId === null && now - session.lastSeenAt > SESSION_TTL_MS) this.discard(sessionId);
    }
  }

  size(): number { return this.sessions.size; }
}
