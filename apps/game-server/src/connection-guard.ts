const DEFAULT_MAX_MESSAGES_PER_WINDOW = 40;
const DEFAULT_WINDOW_MS = 1_000;

export type ConnectionGuardOptions = {
  maxMessagesPerWindow?: number;
  windowMs?: number;
};

/**
 * Per-connection protocol guard. This is deliberately transport-level:
 * gameplay validation remains server-authoritative in TableRuntime.
 */
export class ConnectionGuard {
  private readonly maxMessagesPerWindow: number;
  private readonly windowMs: number;
  private readonly receivedAt: number[] = [];

  constructor(options: ConnectionGuardOptions = {}) {
    this.maxMessagesPerWindow = options.maxMessagesPerWindow ?? DEFAULT_MAX_MESSAGES_PER_WINDOW;
    this.windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;

    if (!Number.isInteger(this.maxMessagesPerWindow) || this.maxMessagesPerWindow < 1) {
      throw new Error('maxMessagesPerWindow must be a positive integer');
    }
    if (!Number.isInteger(this.windowMs) || this.windowMs < 1) {
      throw new Error('windowMs must be a positive integer');
    }
  }

  allow(now = Date.now()): boolean {
    const cutoff = now - this.windowMs;
    while (this.receivedAt.length > 0 && this.receivedAt[0]! <= cutoff) this.receivedAt.shift();
    if (this.receivedAt.length >= this.maxMessagesPerWindow) return false;
    this.receivedAt.push(now);
    return true;
  }

  reset(): void {
    this.receivedAt.length = 0;
  }
}
