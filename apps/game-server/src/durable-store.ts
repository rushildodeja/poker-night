import type { PokerTableCheckpoint } from '@poker-night/poker-engine';

export type TableCheckpointRecord = Readonly<{ tableId: string; sequence: number; checkpoint: PokerTableCheckpoint; savedAt: number }>;
export type TableEventRecord = Readonly<{ tableId: string; sequence: number; eventIndex: number; handId: string; requestId: string; event: PokerTableCheckpoint['state']['events'][number]; savedAt: number }>;
export type PersistedMutation = Readonly<{ tableId: string; sequence: number; handId: string; requestId: string; events: readonly TableEventRecord['event'][]; checkpoint: PokerTableCheckpoint; savedAt: number }>;

export interface DurableTableStore {
  listCheckpoints(): Promise<TableCheckpointRecord[]>;
  loadCheckpoint(tableId: string): Promise<TableCheckpointRecord | null>;
  saveCheckpoint(record: TableCheckpointRecord): Promise<void>;
  appendEvent(record: TableEventRecord): Promise<void>;
  listEventsAfter(tableId: string, sequence: number): Promise<TableEventRecord[]>;
  persistMutation(mutation: PersistedMutation): Promise<void>;
  findRequest(tableId: string, requestId: string): Promise<number | null>;
}

export class InMemoryDurableTableStore implements DurableTableStore {
  private readonly checkpoints = new Map<string, TableCheckpointRecord>();
  private readonly events = new Map<string, TableEventRecord[]>();

  async listCheckpoints(): Promise<TableCheckpointRecord[]> { return structuredClone([...this.checkpoints.values()]); }
  async loadCheckpoint(tableId: string): Promise<TableCheckpointRecord | null> { const record = this.checkpoints.get(tableId); return record ? structuredClone(record) : null; }
  async saveCheckpoint(record: TableCheckpointRecord): Promise<void> { const existing = this.checkpoints.get(record.tableId); if (existing && record.sequence < existing.sequence) throw new Error('Checkpoint sequence cannot move backwards'); this.checkpoints.set(record.tableId, structuredClone(record)); }
  async appendEvent(record: TableEventRecord): Promise<void> { const list = this.events.get(record.tableId) ?? []; if (list.some((event) => event.sequence === record.sequence && event.eventIndex === record.eventIndex)) throw new Error('Duplicate event'); list.push(structuredClone(record)); list.sort((a, b) => a.sequence - b.sequence || a.eventIndex - b.eventIndex); this.events.set(record.tableId, list); }
  async listEventsAfter(tableId: string, sequence: number): Promise<TableEventRecord[]> { return structuredClone((this.events.get(tableId) ?? []).filter((event) => event.sequence > sequence)); }
  async persistMutation(mutation: PersistedMutation): Promise<void> {
    const current = this.checkpoints.get(mutation.tableId)?.sequence ?? 0;
    if (mutation.sequence !== current + 1) throw new Error(`Persistence sequence conflict: expected ${current + 1}, got ${mutation.sequence}`);
    if ((await this.findRequest(mutation.tableId, mutation.requestId)) !== null) throw new Error('Request already persisted');
    const nextEvents = this.events.get(mutation.tableId) ?? [];
    for (let eventIndex = 0; eventIndex < mutation.events.length; eventIndex += 1) nextEvents.push({ tableId: mutation.tableId, sequence: mutation.sequence, eventIndex, handId: mutation.handId, requestId: mutation.requestId, event: structuredClone(mutation.events[eventIndex]!), savedAt: mutation.savedAt });
    this.events.set(mutation.tableId, structuredClone(nextEvents));
    this.checkpoints.set(mutation.tableId, { tableId: mutation.tableId, sequence: mutation.sequence, checkpoint: structuredClone(mutation.checkpoint), savedAt: mutation.savedAt });
  }
  async findRequest(tableId: string, requestId: string): Promise<number | null> { const found = (this.events.get(tableId) ?? []).find((event) => event.requestId === requestId); return found?.sequence ?? null; }
}
