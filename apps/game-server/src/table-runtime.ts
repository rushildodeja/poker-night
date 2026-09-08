import type { AuthenticatedActionCommand, CommandRejection, PrivateTableSnapshot, ProtocolVersion, ServerActionAccepted, TableSnapshot } from '@poker-night/game-types';
import type { Action, PokerTable, TableEvent } from '@poker-night/poker-engine';
import { PokerTable as PokerTableClass } from '@poker-night/poker-engine';
import { toPrivateSnapshot, toPublicSnapshot } from '@poker-night/game-types';
import { TableCommandQueue } from './table-queue.js';
import type { DurableTableStore } from './durable-store.js';
import type { ActionTimeout } from './action-timer.js';

const REQUEST_REPLAY_WINDOW = 10_000;
const DEFAULT_ACTION_TIMEOUT_MS = 30_000;
type ProcessedRequest = { sequence: number; processedAt: number };
type LifecycleFailureCode = 'TABLE_NOT_FOUND' | 'TABLE_FULL' | 'ALREADY_SEATED' | 'SEAT_OCCUPIED' | 'INVALID_TABLE_CONFIG' | 'INTERNAL_ERROR' | 'DUPLICATE_REQUEST';
type LifecycleFailure = Readonly<{ ok: false; code: LifecycleFailureCode; message: string }>;
export type LifecycleMutationResult<T> =
  | Readonly<{ ok: true; value: T; sequence: number }>
  | LifecycleFailure;

export class TableRuntime {
  private sequence = 0;
  private readonly processed = new Map<string, ProcessedRequest>();
  private readonly queue = new TableCommandQueue();
  private readonly actionTimeoutMs: number;

  constructor(readonly table: PokerTable, private readonly store: DurableTableStore | null = null, sequence = 0, actionTimeoutMs = Number(process.env.ACTION_TIMEOUT_MS ?? DEFAULT_ACTION_TIMEOUT_MS)) {
    if (!Number.isInteger(actionTimeoutMs) || actionTimeoutMs <= 0) throw new Error('Action timeout must be a positive integer');
    this.sequence = sequence;
    this.actionTimeoutMs = actionTimeoutMs;
  }

  static create(table: PokerTable, store: DurableTableStore | null = null, sequence = 0, actionTimeoutMs = Number(process.env.ACTION_TIMEOUT_MS ?? DEFAULT_ACTION_TIMEOUT_MS)): TableRuntime {
    return new TableRuntime(table, store, sequence, actionTimeoutMs);
  }

  async initialize(): Promise<void> {
    if (!this.store) return;
    const existing = await this.store.loadCheckpoint(this.table.state.tableId);
    if (existing) throw new Error(`Cannot initialize an already persisted table at sequence ${existing.sequence}`);
    this.armDeadlineIfNeeded(Date.now());
    await this.store.saveCheckpoint({ tableId: this.table.state.tableId, sequence: 0, checkpoint: this.table.checkpoint(), savedAt: Date.now() });
  }

  static async recover(store: DurableTableStore, tableId: string, actionTimeoutMs?: number): Promise<TableRuntime | null> {
    const record = await store.loadCheckpoint(tableId);
    if (!record) return null;
    const table = PokerTableClass.fromCheckpoint(record.checkpoint);
    const runtime = new TableRuntime(table, store, record.sequence, actionTimeoutMs);
    const persisted = await store.listEventsAfter(tableId, Math.max(0, record.sequence - 100));
    for (const event of persisted) runtime.processed.set(event.requestId, { sequence: event.sequence, processedAt: event.savedAt });
    return runtime;
  }

  async ensureActionDeadlinePersisted(now = Date.now()): Promise<void> {
    if (!this.store || this.table.state.actionDeadline !== null) return;
    const before = this.table.state.actionDeadline;
    this.armDeadlineIfNeeded(now);
    if (this.table.state.actionDeadline === before) return;
    await this.store.saveCheckpoint({ tableId: this.table.state.tableId, sequence: this.sequence, checkpoint: this.table.checkpoint(), savedAt: now });
  }

  snapshot(): TableSnapshot { return toPublicSnapshot(this.table.state, this.sequence); }
  privateSnapshot(playerId: string): PrivateTableSnapshot { return toPrivateSnapshot(this.table.state, this.sequence, playerId); }
  getSequence(): number { return this.sequence; }
  getActionDeadline(): number | null { return this.table.state.actionDeadline; }
  getActionTimeoutMs(): number { return this.actionTimeoutMs; }

  apply(command: AuthenticatedActionCommand): Promise<ServerActionAccepted | CommandRejection> { return this.queue.enqueue(() => this.applySerialized(command)); }

  applyTimeout(timeout: ActionTimeout, now = Date.now()): Promise<ServerActionAccepted | CommandRejection> {
    return this.queue.enqueue(async () => {
      const base: AuthenticatedActionCommand = { requestId: timeout.requestId, tableId: timeout.tableId, handId: timeout.handId, authenticatedPlayerId: timeout.playerId, action: 'FOLD' };
      if (timeout.tableId !== this.table.state.tableId) return this.reject(base, 'TABLE_NOT_FOUND', 'Table not found');
      if (timeout.handId !== this.table.state.handId) return this.reject(base, 'STALE_HAND', 'Hand is no longer current');
      if (timeout.expectedSequence !== this.sequence) return this.reject(base, 'STALE_SEQUENCE', 'Timeout is no longer current');
      if (this.table.state.currentPlayerId !== timeout.playerId) return this.reject(base, 'NOT_YOUR_TURN', 'Timeout is no longer for the acting player');
      if (this.table.state.actionDeadline === null || this.table.state.actionDeadline > now) return this.reject(base, 'INVALID_ACTION', 'Action deadline has not expired');
      const player = this.table.state.players.find((candidate) => candidate.playerId === timeout.playerId);
      if (!player || player.status !== 'ACTIVE') return this.reject(base, 'NOT_YOUR_TURN', 'Player is no longer actionable');
      const action: Action = player.currentBet === this.table.state.currentBet ? { playerId: timeout.playerId, type: 'CHECK' } : { playerId: timeout.playerId, type: 'FOLD' };
      return this.applyMutation(base, action);
    });
  }

  mutateLifecycle<T>(requestId: string, mutation: () => T | LifecycleFailure): Promise<LifecycleMutationResult<T>> {
    return this.queue.enqueue(async () => {
      this.pruneProcessed();
      const previous = this.processed.get(requestId);
      if (previous) return { ok: false, code: 'DUPLICATE_REQUEST', message: `Request was already processed at sequence ${previous.sequence}` } as const;
      if (this.store) {
        const persisted = await this.store.findRequest(this.table.state.tableId, requestId);
        if (persisted !== null) {
          this.processed.set(requestId, { sequence: persisted, processedAt: Date.now() });
          return { ok: false, code: 'DUPLICATE_REQUEST', message: `Request was already processed at sequence ${persisted}` } as const;
        }
      }

      const before = this.table.checkpoint();
      try {
        const mutationResult = mutation();
        if (isLifecycleFailure(mutationResult)) {
          this.table.restore(before);
          return mutationResult;
        }
        const nextSequence = this.sequence + 1;
        if (this.store) {
          const events = this.table.state.events.slice(before.state.events.length) as TableEvent[];
          if (events.length === 0) throw new Error('Lifecycle mutation produced no durable event');
          await this.store.persistMutation({ tableId: this.table.state.tableId, sequence: nextSequence, handId: this.table.state.handId ?? '', requestId, events, checkpoint: this.table.checkpoint(), savedAt: Date.now() });
        }
        this.sequence = nextSequence;
        this.processed.set(requestId, { sequence: this.sequence, processedAt: Date.now() });
        return { ok: true, value: mutationResult, sequence: this.sequence } as const;
      } catch (error) {
        this.table.restore(before);
        return { ok: false, code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Lifecycle mutation could not be committed' } as const;
      }
    });
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
    return this.applyMutation(command, { playerId: command.authenticatedPlayerId, type: command.action, ...(command.amount === undefined ? {} : { amount: command.amount }) });
  }

  private async applyMutation(command: AuthenticatedActionCommand, action: Action): Promise<ServerActionAccepted | CommandRejection> {
    const before = this.table.checkpoint();
    try {
      this.table.act(action);
      this.armDeadlineIfNeeded(Date.now());
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

  private armDeadlineIfNeeded(now: number): void {
    const playerId = this.table.state.currentPlayerId;
    const bettingStreet = this.table.state.street === 'PRE_FLOP' || this.table.state.street === 'FLOP' || this.table.state.street === 'TURN' || this.table.state.street === 'RIVER';
    if (playerId && bettingStreet && this.table.state.players.some((player) => player.playerId === playerId && player.status === 'ACTIVE')) this.table.state.actionDeadline = now + this.actionTimeoutMs;
    else this.table.state.actionDeadline = null;
  }

  private pruneProcessed(): void { const cutoff = Date.now() - REQUEST_REPLAY_WINDOW; for (const [requestId, entry] of this.processed) if (entry.processedAt < cutoff) this.processed.delete(requestId); }
  private reject(command: Pick<AuthenticatedActionCommand, 'requestId'>, code: CommandRejection['code'], message: string): CommandRejection { return { requestId: command.requestId, code, message }; }
}

function isLifecycleFailure(value: unknown): value is LifecycleFailure {
  return typeof value === 'object' && value !== null && 'ok' in value && (value as { ok?: unknown }).ok === false;
}
