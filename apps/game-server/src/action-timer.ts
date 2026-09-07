export type ActionTimeout = Readonly<{
  tableId: string;
  handId: string;
  playerId: string;
  expectedSequence: number;
}>;

export type ActionTimerHandler = (timeout: ActionTimeout) => void | Promise<void>;

/** Owns one deadline per table and cancels/replaces it whenever state advances. */
export class ActionTimerManager {
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();

  schedule(timeout: ActionTimeout, deadline: number, handler: ActionTimerHandler): void {
    this.cancel(timeout.tableId);
    const delay = Math.max(0, deadline - Date.now());
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
    for (const tableId of this.timers.keys()) this.cancel(tableId);
  }
}
