import type { AuthenticatedActionCommand, CommandRejection, PrivateTableSnapshot, ProtocolVersion, ServerActionAccepted, TableSnapshot } from '@poker-night/game-types';
import type { Action } from '@poker-night/poker-engine';
import { PokerTable } from '@poker-night/poker-engine';
import { toPrivateSnapshot, toPublicSnapshot } from '@poker-night/game-types';
import { TableCommandQueue } from './table-queue.js';

const REQUEST_REPLAY_WINDOW = 10_000;

type ProcessedRequest = { sequence: number; processedAt: number };

export class TableRuntime {
  private sequence = 0;
  private readonly processed = new Map<string, ProcessedRequest>();
  private readonly queue = new TableCommandQueue();

  constructor(readonly table: PokerTable) {}

  snapshot(): TableSnapshot { return toPublicSnapshot(this.table.state, this.sequence); }
  privateSnapshot(playerId: string): PrivateTableSnapshot { return toPrivateSnapshot(this.table.state, this.sequence, playerId); }
  getSequence(): number { return this.sequence; }

  apply(command: AuthenticatedActionCommand): Promise<ServerActionAccepted | CommandRejection> {
    return this.queue.enqueue(() => this.applySerialized(command));
  }

  async idle(): Promise<void> { await this.queue.idle(); }

  private applySerialized(command: AuthenticatedActionCommand): ServerActionAccepted | CommandRejection {
    this.pruneProcessed();
    if (command.tableId !== this.table.state.tableId) return this.reject(command, 'TABLE_NOT_FOUND', 'Table not found');
    if (command.handId !== this.table.state.handId) return this.reject(command, 'STALE_HAND', 'Hand is no longer current');

    const previous = this.processed.get(command.requestId);
    if (previous) return this.reject(command, 'DUPLICATE_REQUEST', `Request was already processed at sequence ${previous.sequence}`);
    if (command.expectedSequence !== undefined && command.expectedSequence !== this.sequence) return this.reject(command, 'STALE_SEQUENCE', 'Client state is stale');
    if (!this.table.state.players.some((p) => p.playerId === command.authenticatedPlayerId)) return this.reject(command, 'PLAYER_NOT_SEATED', 'Player is not seated at this table');

    const action: Action = { playerId: command.authenticatedPlayerId, type: command.action, ...(command.amount === undefined ? {} : { amount: command.amount }) };
    try {
      this.table.act(action);
    } catch (error) {
      return this.reject(command, 'INVALID_ACTION', error instanceof Error ? error.message : 'Invalid action');
    }

    this.sequence += 1;
    this.processed.set(command.requestId, { sequence: this.sequence, processedAt: Date.now() });
    return { type: 'ACTION_ACCEPTED', protocolVersion: 1 as ProtocolVersion, requestId: command.requestId, tableId: command.tableId, handId: command.handId, sequence: this.sequence };
  }

  private pruneProcessed(): void {
    const cutoff = Date.now() - REQUEST_REPLAY_WINDOW;
    for (const [requestId, entry] of this.processed) {
      if (entry.processedAt < cutoff) this.processed.delete(requestId);
      else break;
    }
  }

  private reject(command: AuthenticatedActionCommand, code: CommandRejection['code'], message: string): CommandRejection {
    return { requestId: command.requestId, code, message };
  }
}
