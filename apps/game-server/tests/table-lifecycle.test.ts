import { describe, expect, it } from 'vitest';
import { TableRegistry } from '../src/table-registry.js';
import { TableLifecycleService } from '../src/table-lifecycle.js';
import { InMemoryDurableTableStore } from '../src/durable-store.js';

describe('TableLifecycleService', () => {
  it('creates a table with the creator seated', async () => {
    const registry = new TableRegistry();
    const runtimes = new Map();
    const service = new TableLifecycleService(registry, runtimes, new InMemoryDurableTableStore());
    const result = await service.create({ type: 'CREATE_TABLE', protocolVersion: 1, requestId: 'create-1', smallBlind: 50, bigBlind: 100, maxPlayers: 9, startingStack: 10000 }, 'p1');
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(`create failed: ${result.message}`);
    expect(result.runtime.table.state.players).toHaveLength(1);
    expect(result.runtime.table.state.players[0]?.playerId).toBe('p1');
    expect(registry.has(result.tableId)).toBe(true);
  });

  it('joins an open table and starts a hand when the second funded player arrives', async () => {
    const registry = new TableRegistry();
    const runtimes = new Map();
    const service = new TableLifecycleService(registry, runtimes, new InMemoryDurableTableStore());
    const created = await service.create({ type: 'CREATE_TABLE', protocolVersion: 1, requestId: 'create-2', smallBlind: 50, bigBlind: 100, maxPlayers: 9, startingStack: 10000 }, 'p1');
    if (!created.ok) throw new Error(`create failed: ${created.message}`);
    const joined = await service.join({ type: 'JOIN_TABLE', protocolVersion: 1, requestId: 'join-1', tableId: created.tableId }, 'p2');
    expect(joined.ok).toBe(true);
    if (!joined.ok) return;
    expect(joined.runtime.table.state.players).toHaveLength(2);
    expect(joined.runtime.table.state.street).toBe('PRE_FLOP');
    expect(joined.runtime.table.state.currentPlayerId).not.toBeNull();
    expect(joined.runtime.getSequence()).toBe(1);
  });

  it('rejects duplicate seating and full tables', async () => {
    const registry = new TableRegistry();
    const runtimes = new Map();
    const service = new TableLifecycleService(registry, runtimes, null);
    const created = await service.create({ type: 'CREATE_TABLE', protocolVersion: 1, requestId: 'create-3', smallBlind: 50, bigBlind: 100, maxPlayers: 2, startingStack: 10000 }, 'p1');
    if (!created.ok) throw new Error(`create failed: ${created.message}`);
    const duplicate = await service.join({ type: 'JOIN_TABLE', protocolVersion: 1, requestId: 'join-dup', tableId: created.tableId }, 'p1');
    expect(duplicate).toEqual({ ok: false, code: 'ALREADY_SEATED', message: 'Player is already seated' });
    const first = await service.join({ type: 'JOIN_TABLE', protocolVersion: 1, requestId: 'join-4', tableId: created.tableId }, 'p2');
    expect(first.ok).toBe(true);
    const full = await service.join({ type: 'JOIN_TABLE', protocolVersion: 1, requestId: 'join-5', tableId: created.tableId }, 'p3');
    expect(full).toEqual({ ok: false, code: 'TABLE_FULL', message: 'Table is full' });
  });

  it('serializes concurrent joins so only one player can claim the same seat', async () => {
    const registry = new TableRegistry();
    const runtimes = new Map();
    const service = new TableLifecycleService(registry, runtimes, new InMemoryDurableTableStore());
    const created = await service.create({ type: 'CREATE_TABLE', protocolVersion: 1, requestId: 'create-4', smallBlind: 50, bigBlind: 100, maxPlayers: 2, startingStack: 10000 }, 'p1');
    if (!created.ok) throw new Error(`create failed: ${created.message}`);

    const [a, b] = await Promise.all([
      service.join({ type: 'JOIN_TABLE', protocolVersion: 1, requestId: 'join-a', tableId: created.tableId, seat: 1 }, 'p2'),
      service.join({ type: 'JOIN_TABLE', protocolVersion: 1, requestId: 'join-b', tableId: created.tableId, seat: 1 }, 'p3'),
    ]);

    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    expect(created.runtime.table.state.players).toHaveLength(2);
    expect(created.runtime.table.state.players.some((player) => player.playerId === 'p2')).not.toBe(created.runtime.table.state.players.some((player) => player.playerId === 'p3'));
    expect(created.runtime.getSequence()).toBe(1);
  });
});
