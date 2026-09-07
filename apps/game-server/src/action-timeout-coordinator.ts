import { ActionTimerManager, type ActionTimeout } from './action-timer.js';
import type { TableRuntime } from './table-runtime.js';

export type TimeoutResult = Awaited<ReturnType<TableRuntime['applyTimeout']>>;
export type TimeoutBroadcast = (runtime: TableRuntime, result: TimeoutResult) => void;

/** Bridges persisted table deadlines to exactly-once, serialized timeout commands. */
export class ActionTimeoutCoordinator {
  constructor(private readonly timers: ActionTimerManager, private readonly broadcast: TimeoutBroadcast) {}

  arm(runtime: TableRuntime, now = Date.now()): void {
    const deadline = runtime.getActionDeadline();
    const tableId = runtime.table.state.tableId;
    if (deadline === null || runtime.table.state.currentPlayerId === null || runtime.table.state.handId === null) {
      this.timers.cancel(tableId);
      return;
    }

    const timeout: ActionTimeout = {
      tableId,
      handId: runtime.table.state.handId,
      playerId: runtime.table.state.currentPlayerId,
      expectedSequence: runtime.getSequence(),
      requestId: `timeout:${tableId}:${runtime.table.state.handId}:${runtime.getSequence()}:${runtime.table.state.currentPlayerId}`,
    };

    this.timers.schedule(timeout, deadline, async (expired) => {
      const result = await runtime.applyTimeout(expired, Date.now());
      this.broadcast(runtime, result);
      // A stale timer must not replace a newer timer. Only the current state is armed.
      this.arm(runtime);
    }, now);
  }

  cancel(tableId: string): void { this.timers.cancel(tableId); }
  cancelAll(): void { this.timers.cancelAll(); }
}
