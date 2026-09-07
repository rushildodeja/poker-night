import { describe, expect, it } from 'vitest';
import { PokerTable } from '@poker-night/poker-engine';
import { InMemoryDurableTableStore } from '../src/durable-store.js';
import { TableRuntime } from '../src/table-runtime.js';

function createTable(): PokerTable {
  const table = new PokerTable('recovery-test', 50, 100, 2);
  table.seatPlayer('p1', 0, 1000);
  table.seatPlayer('p2', 1, 1000);
  table.startHand();
  return table;
}

describe('durable table recovery', () => {
  it('persists an accepted action and reconstructs the same authoritative state', async () => {
    const store = new InMemoryDurableTableStore();
    const table = createTable();
    const runtime = TableRuntime.create(table, store);
    await runtime.initialize();
    const actor = table.state.currentPlayerId!;
    const handId = table.state.handId!;

    const accepted = await runtime.apply({ requestId: 'crash-1', authenticatedPlayerId: actor, tableId: table.state.tableId, handId, action: 'FOLD', expectedSequence: 0 });
    expect('type' in accepted).toBe(true);

    const beforeRestart = runtime.snapshot();
    const recovered = await TableRuntime.recover(store, table.state.tableId);
    expect(recovered).not.toBeNull();
    expect(recovered!.getSequence()).toBe(1);
    expect(recovered!.snapshot()).toEqual(beforeRestart);
    expect(recovered!.table.state.players).toEqual(table.state.players);
  });

  it('does not lose an action when the request is retried after restart', async () => {
    const store = new InMemoryDurableTableStore();
    const table = createTable();
    const runtime = TableRuntime.create(table, store);
    await runtime.initialize();
    const actor = table.state.currentPlayerId!;
    const command = { requestId: 'retry-1', authenticatedPlayerId: actor, tableId: table.state.tableId, handId: table.state.handId!, action: 'FOLD' as const, expectedSequence: 0 };

    const first = await runtime.apply(command);
    expect('type' in first).toBe(true);

    const recovered = await TableRuntime.recover(store, table.state.tableId);
    expect(recovered).not.toBeNull();
    const retry = await recovered!.apply({ ...command, expectedSequence: 1 });
    expect('code' in retry && retry.code).toBe('DUPLICATE_REQUEST');
    expect(recovered!.getSequence()).toBe(1);
  });

  it('rolls the engine back if durable persistence fails', async () => {
    const store = new InMemoryDurableTableStore();
    const table = createTable();
    const runtime = TableRuntime.create(table, store);
    await runtime.initialize();
    const before = runtime.snapshot();
    const actor = table.state.currentPlayerId!;

    const original = store.persistMutation.bind(store);
    store.persistMutation = async () => { throw new Error('simulated database outage'); };
    const result = await runtime.apply({ requestId: 'failure-1', authenticatedPlayerId: actor, tableId: table.state.tableId, handId: table.state.handId!, action: 'FOLD', expectedSequence: 0 });
    store.persistMutation = original;

    expect('code' in result && result.code).toBe('INTERNAL_ERROR');
    expect(runtime.snapshot()).toEqual(before);
    expect(runtime.getSequence()).toBe(0);
  });
});
