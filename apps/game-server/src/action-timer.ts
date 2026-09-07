export type ActionTimeout = Readonly<{
  tableId: string;
  handId: string;
  playerId: string;
  expectedSequence: number;
  requestId: string;
}>;

export type ActionTimerHandler = (timeout: ActionTimeout) => void | Promise<void>;

/** Owns one deadline per table and replaces stale timers whenever table state advances. */
export class ActionTimerManager {
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();

  schedule(timeout: ActionTimeout, deadline: number, handler: ActionTimerHandler, now = Date.now()): void {
    this.cancel(timeout.tableId);
    const delay = Math.max(0, deadline - now);
    const timer = setTimeout(() => {
      this.timers.delete(timeout.tableId);
      void handler(timeout);
    }, delay);
    this.timers.set(timeout.tableId, timer);
  }

  cancel(tableId: string): void {
    const timer = this.timers.get(tableId);
    if (timer) clearTimeout(timer);
    this.timers.delete(tableId);
  }

  cancelAll(): void {
    for (const tableId of [...this.timers.keys()]) this.cancel(tableId);
  }

  has(tableId: string): boolean { return this.timers.has(tableId); }
}
