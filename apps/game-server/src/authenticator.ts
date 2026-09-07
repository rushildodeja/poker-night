export type RequestHeaders = Record<string, string | string[] | undefined>;

export interface AuthenticationRequest {
  headers: RequestHeaders;
}

export interface Authenticator {
  authenticate(request: AuthenticationRequest): string | null;
}

class DevelopmentHeaderAuthenticator implements Authenticator {
  authenticate(request: AuthenticationRequest): string | null {
    const value = request.headers['x-player-id'];
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }
}

class RejectingAuthenticator implements Authenticator {
  authenticate(_request: AuthenticationRequest): string | null {
    return null;
  }
}

export type AuthMode = 'development-header' | 'reject';

export interface AuthenticatorOptions {
  nodeEnv?: string;
  authMode?: string;
}

/**
 * Selects the server authentication boundary.
 *
 * The header authenticator is intentionally development-only. It must never be
 * enabled in production because x-player-id is caller-controlled and provides
 * no proof of identity.
 */
export const createAuthenticator = (options: AuthenticatorOptions = {}): Authenticator => {
  const nodeEnv = options.nodeEnv ?? process.env.NODE_ENV ?? 'development';
  const requestedMode = options.authMode ?? process.env.AUTH_MODE ?? (nodeEnv === 'production' ? 'reject' : 'development-header');

  if (requestedMode === 'development-header') {
    if (nodeEnv === 'production') {
      throw new Error('AUTH_MODE=development-header is forbidden in production');
    }
    return new DevelopmentHeaderAuthenticator();
  }

  if (requestedMode === 'reject') {
    return new RejectingAuthenticator();
  }

  throw new Error(`Unsupported AUTH_MODE: ${requestedMode}`);
};
