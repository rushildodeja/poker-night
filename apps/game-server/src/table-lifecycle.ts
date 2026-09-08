import type { ClientCreateTableRequest, ClientJoinTableRequest, ServerTableJoined } from '@poker-night/game-types';
import { TableRegistry } from './table-registry.js';
import { TableRuntime } from './table-runtime.js';
import type { DurableTableStore } from './durable-store.js';

export type LifecycleResult =
  | { ok: true; runtime: TableRuntime; response: ServerTableJoined }
  | { ok: false; code: 'TABLE_NOT_FOUND' | 'TABLE_FULL' | 'ALREADY_SEATED' | 'SEAT_OCCUPIED' | 'INVALID_TABLE_CONFIG' | 'INTERNAL_ERROR' | 'DUPLICATE_REQUEST'; message: string };

export type CreateTableResult =
  | { ok: true; tableId: string; runtime: TableRuntime }
  | { ok: false; code: 'INVALID_TABLE_CONFIG' | 'INTERNAL_ERROR'; message: string };

type JoinMutationValue = {
  runtime: TableRuntime;
  response: ServerTableJoined;
};

export class TableLifecycleService {
  constructor(private readonly tables: TableRegistry, private readonly runtimes: Map<string, TableRuntime>, private readonly store: DurableTableStore | null) {}

  async create(request: ClientCreateTableRequest, playerId: string): Promise<CreateTableResult> {
    try {
      const table = this.tables.createGenerated(request.smallBlind, request.bigBlind, request.maxPlayers);
      table.seatPlayer(playerId, 0, request.startingStack);
      const runtime = new TableRuntime(table, this.store);
      if (this.store) await runtime.initialize();
      this.runtimes.set(table.state.tableId, runtime);
      return { ok: true, tableId: table.state.tableId, runtime };
    } catch (error) {
      return { ok: false, code: 'INVALID_TABLE_CONFIG', message: error instanceof Error ? error.message : 'Table could not be created' };
    }
  }

  async join(request: ClientJoinTableRequest, playerId: string): Promise<LifecycleResult> {
    const runtime = this.runtimes.get(request.tableId);
    const table = this.tables.get(request.tableId);
    if (!runtime || !table) return { ok: false, code: 'TABLE_NOT_FOUND', message: 'Table not found' };

    return runtime.mutateLifecycle<JoinMutationValue>(request.requestId, () => {
      if (table.state.players.some((player) => player.playerId === playerId)) return { ok: false, code: 'ALREADY_SEATED', message: 'Player is already seated' } as const;
      if (table.state.players.length >= table.state.maxPlayers) return { ok: false, code: 'TABLE_FULL', message: 'Table is full' } as const;
      const seat = request.seat ?? this.firstOpenSeat(table.state.players.map((player) => player.seat), table.state.maxPlayers);
      if (seat === null || seat < 0 || seat >= table.state.maxPlayers || table.state.players.some((player) => player.seat === seat)) return { ok: false, code: 'SEAT_OCCUPIED', message: 'Seat is occupied or invalid' } as const;
      table.seatPlayer(playerId, seat, this.startingStackFor(table));
      if (table.state.players.filter((player) => player.stack > 0).length >= 2 && (table.state.street === 'WAITING' || table.state.street === 'HAND_COMPLETE')) table.startHand();
      return {
        runtime,
        response: {
          type: 'TABLE_JOINED',
          protocolVersion: 1,
          requestId: request.requestId,
          tableId: table.state.tableId,
          sequence: 0,
        },
      };
    }).then((result) => {
      if (!result.ok) return result;
      return { ok: true, runtime: result.value.runtime, response: { ...result.value.response, sequence: result.sequence } };
    });
  }

  list() { return this.tables.list().map((table) => ({ tableId: table.state.tableId, maxPlayers: table.state.maxPlayers, seatedPlayers: table.state.players.length, smallBlind: table.state.smallBlind, bigBlind: table.state.bigBlind, street: table.state.street, handId: table.state.handId })); }

  private firstOpenSeat(occupied: readonly number[], maxPlayers: number): number | null { for (let seat = 0; seat < maxPlayers; seat += 1) if (!occupied.includes(seat)) return seat; return null; }
  private startingStackFor(table: { state: { players: readonly { stack: number }[] } }): number { return table.state.players[0]?.stack ?? 10000; }
}
