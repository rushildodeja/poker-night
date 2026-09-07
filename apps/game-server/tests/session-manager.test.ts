import { describe, expect, it } from 'vitest';
import { SessionManager } from '../src/session-manager.js';

describe('SessionManager', () => {
  it('creates a pending session without destroying an existing resumable session', () => {
    const manager = new SessionManager();
    manager.attach('old', 'p1', 'c1', 100);
    manager.createPending('pending', 'p1', 'c2', 200);
    expect(manager.getBySession('old')?.connectionId).toBe('c1');
    expect(manager.getBySession('pending')?.connectionId).toBe('c2');
  });

  it('resumes the old session and reports the replaced connection', () => {
    const manager = new SessionManager();
    manager.attach('old', 'p1', 'c1', 100);
    const resumed = manager.resume('old', 'p1', 'c2', 200);
    expect(resumed?.session.connectionId).toBe('c2');
    expect(resumed?.previousConnectionId).toBe('c1');
    expect(manager.getByPlayer('p1')?.sessionId).toBe('old');
  });

  it('rejects a session owned by another player', () => {
    const manager = new SessionManager();
    manager.attach('s1', 'p1', 'c1', 100);
    expect(manager.resume('s1', 'attacker', 'c2', 200)).toBeNull();
  });

  it('does not let an old connection detach a newer resumed connection', () => {
    const manager = new SessionManager();
    manager.attach('s1', 'p1', 'c1', 100);
    manager.resume('s1', 'p1', 'c2', 200);
    expect(manager.disconnect('s1', 'c1', 300)).toBeNull();
    expect(manager.getBySession('s1')?.connectionId).toBe('c2');
  });

  it('expires disconnected sessions after the reconnect window', () => {
    const manager = new SessionManager();
    manager.attach('s1', 'p1', 'c1', 100);
    manager.disconnect('s1', 'c1', 200);
    manager.prune(5 * 60_000 + 201);
    expect(manager.getBySession('s1')).toBeNull();
  });
});
