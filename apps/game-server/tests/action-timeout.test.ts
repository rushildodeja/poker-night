import { describe, expect, it } from 'vitest';
import { PokerTable } from '@poker-night/poker-engine';
import { InMemoryDurableTableStore } from '../src/durable-store.js';
import { TableRuntime } from '../src/table-runtime.js';

function makeTable(): PokerTable {
  const table = new PokerTable('timeout-test', 50, 100, 2);
  table.seatPlayer('p1', 0, 10000);
  table.seatPlayer('p2', 1, 10000);
  table.startHand();
  return table;
}

describe('action timeout', () => {
  it('executes exactly one timeout action for the expected turn', async () => {
    const store = new InMemoryDurableTableStore();
    const runtime = new TableRuntime(makeTable(), store, 0, 1000);
    await runtime.initialize();

    const playerId = runtime.table.state.currentPlayerId!;
    const handId = runtime.table.state.handId!;
    const deadline = runtime.getActionDeadline()!;
    const timeout = { tableId: 'timeout-test', handId, playerId, expectedSequence: 0, requestId: 'timeout:timeout-test:1:0:p2' };

    const first = await runtime.applyTimeout(timeout, deadline + 1);
    expect('type' in first && first.type).toBe('ACTION_ACCEPTED');
    expect(runtime.getSequence()).toBe(1);
    expect(runtime.table.state.currentPlayerId).not.toBe(playerId);

    const second = await runtime.applyTimeout(timeout, deadline + 2);
    expect('code' in second && second.code).toBe('STALE_SEQUENCE');
    expect(runtime.getSequence()).toBe(1);
  });

  it('recovers a persisted deadline and can timeout an active hand after restart', async () => {
    const store = new InMemoryDurableTableStore();
    const runtime = new TableRuntime(makeTable(), store, 0, 1000);
    await runtime.initialize();

    const deadline = runtime.getActionDeadline()!;
    const playerId = runtime.table.state.currentPlayerId!;
    const handId = runtime.table.state.handId!;

    const recovered = await TableRuntime.recover(store, 'timeout-test', 1000);
    expect(recovered).not.toBeNull();
    expect(recovered!.getActionDeadline()).toBe(deadline);

    const result = await recovered!.applyTimeout({
      tableId: 'timeout-test',
      handId,
      playerId,
      expectedSequence: 0,
      requestId: 'timeout:timeout-test:1:0:recovered',
    }, deadline + 1);

    expect('type' in result && result.type).toBe('ACTION_ACCEPTED');
    expect(recovered!.getSequence()).toBe(1);
  });
});
