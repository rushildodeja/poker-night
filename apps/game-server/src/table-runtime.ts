import type { AuthenticatedActionCommand, CommandRejection, PrivateTableSnapshot, ProtocolVersion, ServerActionAccepted, TableSnapshot } from '@poker-night/game-types';
import type { Action, PokerTable, TableEvent } from '@poker-night/poker-engine';
import { PokerTable as PokerTableClass } from '@poker-night/poker-engine';
import { toPrivateSnapshot, toPublicSnapshot } from '@poker-night/game-types';
import { TableCommandQueue } from './table-queue.js';
import type { DurableTableStore } from './durable-store.js';

const REQUEST_REPLAY_WINDOW = 10_000;

type ProcessedRequest = { sequence: number; processedAt: number };

export class TableRuntime {
  private sequence = 0;
  private readonly processed = new Map<string, ProcessedRequest>();
  private readonly queue = new TableCommandQueue();

  constructor(readonly table: PokerTable, private readonly store: DurableTableStore | null = null, sequence = 0) {
    this.sequence = sequence;
  }

  /** Persists the initial authoritative state before the table accepts live actions. */
  async initialize(): Promise<void> {
    if (!this.store) return;
    const existing = await this.store.loadCheckpoint(this.table.state.tableId);
    if (existing) throw new Error(`Cannot initialize an already persisted table at sequence ${existing.sequence}`);
    await this.store.saveCheckpoint({ tableId: this.table.state.tableId, sequence: 0, checkpoint: this.table.checkpoint(), savedAt: Date.now() });
  }

  static async recover(store: DurableTableStore, tableId: string): Promise<TableRuntime | null> {
    const record = await store.loadCheckpoint(tableId);
    if (!record) return null;
    const table = PokerTableClass.fromCheckpoint(record.checkpoint);
    const runtime = new TableRuntime(table, store, record.sequence);
    const persisted = await store.listEventsAfter(tableId, Math.max(0, record.sequence - 100));
    for (const event of persisted) runtime.processed.set(event.requestId, { sequence: event.sequence, processedAt: event.savedAt });
    return runtime;
  }

  snapshot(): TableSnapshot { return toPublicSnapshot(this.table.state, this.sequence); }
  privateSnapshot(playerId: string): PrivateTableSnapshot { return toPrivateSnapshot(this.table.state, this.sequence, playerId); }
  getSequence(): number { return this.sequence; }

  apply(command: AuthenticatedActionCommand): Promise<ServerActionAccepted | CommandRejection> { return this.queue.enqueue(() => this.applySerialized(command)); }
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
    const action: Action = { playerId: command.authenticatedPlayerId, type: command.action, ...(command.amount === undefined ? {} : { amount: command.amount }) };
    try {
      this.table.act(action);
      const nextSequence = this.sequence + 1;
      if (this.store) {
        const events = this.table.state.events.slice(before.state.events.length) as TableEvent[];
        if (events.length === 0) throw new Error('Engine mutation produced no durable event');
        await this.store.persistMutation({ tableId: command.tableId, sequence: nextSequence, handId: command.handId, requestId: command.requestId, events, checkpoint: this.table.checkpoint(), savedAt: Date.now() });
      }
      this.sequence = nextSequence;
      this.processed.set(command.requestId, { sequence: this.sequence, processedAt: Date.now() });
      return { type: 'ACTION_ACCEPTED', protocolVersion: 1 as ProtocolVersion, requestId: command.requestId, tableId: command.tableId, handId: command.handId, sequence: this.sequence };
    } catch (error) {
      this.table.restore(before);
      return this.reject(command, 'INTERNAL_ERROR', error instanceof Error ? error.message : 'Action could not be committed');
    }
  }

  private pruneProcessed(): void {
    const cutoff = Date.now() - REQUEST_REPLAY_WINDOW;
    for (const [requestId, entry] of this.processed) if (entry.processedAt < cutoff) this.processed.delete(requestId);
  }
  private reject(command: AuthenticatedActionCommand, code: CommandRejection['code'], message: string): CommandRejection { return { requestId: command.requestId, code, message }; }
}
