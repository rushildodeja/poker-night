import { describe, expect, it } from 'vitest';
import { PokerTable } from '@poker-night/poker-engine';
import { TableRuntime } from '../src/table-runtime.js';

describe('TableRuntime', () => {
  it('binds actions to the authenticated player and rejects duplicates', () => {
    const table = new PokerTable('test', 50, 100, 2);
    table.seatPlayer('p1', 0, 1000);
    table.seatPlayer('p2', 1, 1000);
    table.startHand();
    const runtime = new TableRuntime(table);
    const handId = table.state.handId!;
    const actor = table.state.currentPlayerId!;

    const accepted = runtime.apply({ requestId: 'req-1', authenticatedPlayerId: actor, tableId: 'test', handId, action: 'FOLD', expectedSequence: 0 });
    expect('type' in accepted).toBe(true);
    expect(runtime.snapshot().sequence).toBe(1);

    const duplicate = runtime.apply({ requestId: 'req-1', authenticatedPlayerId: actor, tableId: 'test', handId, action: 'FOLD', expectedSequence: 1 });
    expect('code' in duplicate && duplicate.code).toBe('DUPLICATE_REQUEST');
  });

  it('rejects a player that is not seated without mutating the table', () => {
    const table = new PokerTable('test-2', 50, 100, 2);
    table.seatPlayer('p1', 0, 1000);
    table.seatPlayer('p2', 1, 1000);
    table.startHand();
    const runtime = new TableRuntime(table);
    const before = runtime.snapshot();
    const result = runtime.apply({ requestId: 'req-x', authenticatedPlayerId: 'intruder', tableId: 'test-2', handId: table.state.handId!, action: 'FOLD', expectedSequence: 0 });
    expect('code' in result && result.code).toBe('PLAYER_NOT_SEATED');
    expect(runtime.snapshot()).toEqual(before);
  });

  it('rejects stale optimistic-concurrency sequence', () => {
    const table = new PokerTable('test-3', 50, 100, 2);
    table.seatPlayer('p1', 0, 1000);
    table.seatPlayer('p2', 1, 1000);
    table.startHand();
    const runtime = new TableRuntime(table);
    const actor = table.state.currentPlayerId!;
    const handId = table.state.handId!;
    runtime.apply({ requestId: 'req-1', authenticatedPlayerId: actor, tableId: 'test-3', handId, action: 'FOLD', expectedSequence: 0 });
    const result = runtime.apply({ requestId: 'req-2', authenticatedPlayerId: actor, tableId: 'test-3', handId, action: 'FOLD', expectedSequence: 0 });
    expect('code' in result && result.code).toBe('STALE_SEQUENCE');
  });
});
