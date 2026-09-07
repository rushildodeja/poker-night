import { describe, expect, it } from 'vitest';
import { createAuthenticator } from '../src/authenticator.js';

describe('authenticator boundary', () => {
  it('accepts the development player header outside production', () => {
    const authenticator = createAuthenticator({ nodeEnv: 'test', authMode: 'development-header' });
    expect(authenticator.authenticate({ headers: { 'x-player-id': 'player-1' } })).toBe('player-1');
    expect(authenticator.authenticate({ headers: {} })).toBeNull();
  });

  it('rejects the development header mode in production', () => {
    expect(() => createAuthenticator({ nodeEnv: 'production', authMode: 'development-header' })).toThrow(/forbidden in production/);
  });

  it('supports an explicit rejecting mode', () => {
    const authenticator = createAuthenticator({ nodeEnv: 'production', authMode: 'reject' });
    expect(authenticator.authenticate({ headers: { 'x-player-id': 'player-1' } })).toBeNull();
  });

  it('defaults production to rejecting unauthenticated requests', () => {
    const authenticator = createAuthenticator({ nodeEnv: 'production' });
    expect(authenticator.authenticate({ headers: { 'x-player-id': 'player-1' } })).toBeNull();
  });

  it('rejects unsupported authentication modes', () => {
    expect(() => createAuthenticator({ nodeEnv: 'test', authMode: 'unknown' })).toThrow(/Unsupported AUTH_MODE/);
  });
});
