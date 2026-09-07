import { describe, expect, it } from 'vitest';
import { ConnectionGuard } from '../src/connection-guard.js';

describe('ConnectionGuard', () => {
  it('allows messages up to the configured window limit', () => {
    const guard = new ConnectionGuard({ maxMessagesPerWindow: 2, windowMs: 1000 });

    expect(guard.allow(1000)).toBe(true);
    expect(guard.allow(1100)).toBe(true);
    expect(guard.allow(1200)).toBe(false);
  });

  it('expires messages outside the rolling window', () => {
    const guard = new ConnectionGuard({ maxMessagesPerWindow: 2, windowMs: 1000 });

    expect(guard.allow(1000)).toBe(true);
    expect(guard.allow(1100)).toBe(true);
    expect(guard.allow(2001)).toBe(true);
  });

  it('can be reset after a connection-level protocol violation', () => {
    const guard = new ConnectionGuard({ maxMessagesPerWindow: 1, windowMs: 1000 });

    expect(guard.allow(1000)).toBe(true);
    expect(guard.allow(1001)).toBe(false);
    guard.reset();
    expect(guard.allow(1002)).toBe(true);
  });
});
