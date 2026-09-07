import { describe, expect, it } from 'vitest';
import { SessionManager } from '../src/session-manager.js';

describe('SessionManager', () => {
  it('replaces an older session for the same player', () => {
    const manager = new SessionManager();
    manager.attach('s1', 'p1', 'c1', 100);
    manager.attach('s2', 'p1', 'c2', 200);
    expect(manager.getBySession('s1')).toBeNull();
    expect(manager.getByPlayer('p1')?.connectionId).toBe('c2');
    expect(manager.size()).toBe(1);
  });

  it('touches activity without changing session identity', () => {
    const manager = new SessionManager();
    manager.attach('s1', 'p1', 'c1', 100);
    const updated = manager.touch('s1', 250);
    expect(updated?.sessionId).toBe('s1');
    expect(updated?.lastSeenAt).toBe(250);
  });
});
