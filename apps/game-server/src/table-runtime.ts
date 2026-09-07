import type { AuthenticatedActionCommand, CommandRejection, PrivateTableSnapshot, ProtocolVersion, ServerActionAccepted, TableSnapshot } from '@poker-night/game-types';
import type { PokerTable, TableEvent, PokerTableCheckpoint } from '@poker-night/poker-engine';
import { toPrivateSnapshot, toPublicSnapshot } from '@poker-night/game-types';
import { TableCommandQueue } from './table-queue.js';
import type { DurableTableStore } from './durable-store.js';

const REQUEST_REPLAY_WINDOW = 10_000;

type ProcessedRequest = { sequence: number; processedAt: number };

export class TableRuntime {
  private sequence: number;
  private readonly processed = new Map<string, ProcessedRequest>();
  private readonly queue = new TableCommandQueue();

  private constructor(readonly table: PokerTable, private readonly store: DurableTableStore | null, sequence: number) {
    this.sequence = sequence;
  }

  static create(table: PokerTable, store: DurableTableStore | null = null): TableRuntime {
    return new TableRuntime(table, store, 0);
  }

  static async recover(table: PokerTable, store: DurableTableStore): Promise<TableRuntime> {
    const record = await store.loadCheckpoint(table.state.tableId);
    if (!record) return new TableRuntime(table, store, 0);
    const recovered = (await import('@poker-night/poker-engine')).PokerTable.fromCheckpoint(record.checkpoint);
    const runtime = new TableRuntime(recovered, store, record.sequence);
    const recent = await store.listEventsAfter(table.state.tableId, Math.max(0, record.sequence - 100));
    for (const event of recent) runtime.processed.set(event.requestId, { sequence: event.sequence, processedAt: event.savedAt });
    return runtime;
  }

  snapshot(): TableSnapshot { return toPublicSnapshot(this.table.state, this.sequence); }
  privateSnapshot(playerId: string): PrivateTableSnapshot { return toPrivateSnapshot(this.table.state, this.sequence, playerId); }
  getSequence(): number { return this.sequence; }

  apply(command: AuthenticatedActionCommand): Promise<ServerActionAccepted | CommandRejection> {
    return this.queue.enqueue(() => this.applySerialized(command));
  }

  async idle(): Promise<void> { await this.queue.idle(); }

  private async applySerialized(command: AuthenticatedActionCommand): Promise<ServerActionAccepted | CommandRejection> {
    this.pruneProcessed();
    if (command.tableId !== this.table.state.tableId) return this.reject(command, 'TABLE_NOT_FOUND', 'Table not found');
    if (command.handId !== this.table.state.handId) return this.reject(command, 'STALE_HAND', 'Hand is no longer current');
    const previous = this.processed.get(command.requestId);
    if (previous) return this.reject(command, 'DUPLICATE_REQUEST', `Request was already processed at sequence ${previous.sequence}`);
    if (this.store) {
      const persisted = await this.store.findRequest(command.tableId, command.requestId);
      if (persisted !== null) {
        this.processed.set(command.requestId, { sequence: persisted, processedAt: Date.now() });
        return this.reject(command, 'DUPLICATE_REQUEST', `Request was already processed at sequence ${persisted}`);
      }
    }
    if (command.expectedSequence !== undefined && command.expectedSequence !== this.sequence) return this.reject(command, 'STALE_SEQUENCE', 'Client state is stale');
    if (!this.table.state.players.some((p) => p.playerId === command.authenticatedPlayerId)) return this.reject(command, 'PLAYER_NOT_SEATED', 'Player is not seated at this table');

    const before = this.table.checkpoint();
    const action: import('@poker-night/poker-engine').Action = { playerId: command.authenticatedPlayerId, type: command.action, ...(command.amount === undefined ? {} : { amount: command.amount }) };
    try {
      this.table.act(action);
      const nextSequence = this.sequence + 1;
      if (this.store) {
        const events = this.table.state.events.slice(before.state.events.length) as TableEvent[];
        await this.store.persistMutation({ tableId: command.tableId, sequence: nextSequence, handId: command.handId, requestId: command.requestId, events, checkpoint: this.table.checkpoint(), savedAt: Date.now() });
      }
      this.sequence = nextSequence;
      this.processed.set(command.requestId, { sequence: this.sequence, processedAt: Date.now() });
      return { type: 'ACTION_ACCEPTED', protocolVersion: 1 as ProtocolVersion, requestId: command.requestId, tableId: command.tableId, handId: command.handId, sequence: this.sequence };
    } catch (error) {
      if (this.store) {
        Object.assign(this.table.state, structuredClone(before.state));
      }
      return this.reject(command, 'INTERNAL_ERROR', error instanceof Error ? error.message : 'Action could not be committed');
    }
  }

  private pruneProcessed(): void {
    const cutoff = Date.now() - REQUEST_REPLAY_WINDOW;
    for (const [requestId, entry] of this.processed) if (entry.processedAt < cutoff) this.processed.delete(requestId);
  }

  private reject(command: AuthenticatedActionCommand, code: CommandRejection['code'], message: string): CommandRejection { return { requestId: command.requestId, code, message }; }
}
