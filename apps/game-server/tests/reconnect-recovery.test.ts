import { describe, expect, it } from 'vitest';
import { PokerTable } from '@poker-night/poker-engine';
import { toPrivateSnapshot } from '@poker-night/game-types';
import { InMemoryDurableTableStore } from '../src/durable-store.js';
import { TableRuntime } from '../src/table-runtime.js';

describe('reconnect and recovery', () => {
  it('recovers an active hand with the same sequence and private cards', async () => {
    const store = new InMemoryDurableTableStore();
    const table = new PokerTable('resume-table', 50, 100, 2);
    table.seatPlayer('p1', 0, 1000);
    table.seatPlayer('p2', 1, 1000);
    table.startHand();

    const runtime = new TableRuntime(table, store);
    await runtime.initialize();
    const handId = table.state.handId!;
    const actor = table.state.currentPlayerId!;
    const actorCards = table.state.players.find((player) => player.playerId === actor)!.holeCards.map((card) => ({ ...card }));

    const accepted = await runtime.apply({ requestId: 'resume-action-1', authenticatedPlayerId: actor, tableId: table.state.tableId, handId, action: 'CALL', expectedSequence: 0 });
    expect('type' in accepted).toBe(true);
    expect(runtime.getSequence()).toBe(1);

    const recovered = await TableRuntime.recover(store, table.state.tableId);
    expect(recovered).not.toBeNull();
    expect(recovered!.getSequence()).toBe(1);
    expect(recovered!.table.state.handId).toBe(handId);
    expect(recovered!.table.state.players.find((player) => player.playerId === actor)!.holeCards).toEqual(actorCards);
    expect(recovered!.table.state.currentPlayerId).toBe(table.state.currentPlayerId);
  });

  it('replaying an already committed action after reconnect cannot mutate twice', async () => {
    const store = new InMemoryDurableTableStore();
    const table = new PokerTable('duplicate-resume', 50, 100, 2);
    table.seatPlayer('p1', 0, 1000);
    table.seatPlayer('p2', 1, 1000);
    table.startHand();
    const runtime = new TableRuntime(table, store);
    await runtime.initialize();
    const actor = table.state.currentPlayerId!;
    const handId = table.state.handId!;

    await runtime.apply({ requestId: 'once', authenticatedPlayerId: actor, tableId: table.state.tableId, handId, action: 'CALL', expectedSequence: 0 });
    const recovered = await TableRuntime.recover(store, table.state.tableId);
    const duplicate = await recovered!.apply({ requestId: 'once', authenticatedPlayerId: actor, tableId: table.state.tableId, handId, action: 'CALL', expectedSequence: 1 });

    expect('code' in duplicate && duplicate.code).toBe('DUPLICATE_REQUEST');
    expect(recovered!.getSequence()).toBe(1);
  });

  it('private resume snapshots expose only the reconnecting player’s hole cards', async () => {
    const table = new PokerTable('private-resume', 50, 100, 2);
    table.seatPlayer('p1', 0, 1000);
    table.seatPlayer('p2', 1, 1000);
    table.startHand();
    const p1 = toPrivateSnapshot(table.state, 0, 'p1');
    const p2 = toPrivateSnapshot(table.state, 0, 'p2');
    expect(p1.ownHoleCards).toHaveLength(2);
    expect(p2.ownHoleCards).toHaveLength(2);
    expect(JSON.stringify(p1)).not.toContain(JSON.stringify(p2.ownHoleCards));
  });
});
