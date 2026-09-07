import type { PokerTableCheckpoint } from '@poker-night/poker-engine';

export type TableCheckpointRecord = Readonly<{
  tableId: string;
  sequence: number;
  checkpoint: PokerTableCheckpoint;
  savedAt: number;
}>;

export type TableEventRecord = Readonly<{
  tableId: string;
  sequence: number;
  handId: string;
  event: PokerTableCheckpoint['state']['events'][number];
  savedAt: number;
}>;

export interface DurableTableStore {
  loadCheckpoint(tableId: string): Promise<TableCheckpointRecord | null>;
  saveCheckpoint(record: TableCheckpointRecord): Promise<void>;
  appendEvent(record: TableEventRecord): Promise<void>;
  listEventsAfter(tableId: string, sequence: number): Promise<TableEventRecord[]>;
}

/** Development/test store. Production should replace this boundary with PostgreSQL. */
export class InMemoryDurableTableStore implements DurableTableStore {
  private readonly checkpoints = new Map<string, TableCheckpointRecord>();
  private readonly events = new Map<string, TableEventRecord[]>();

  async loadCheckpoint(tableId: string): Promise<TableCheckpointRecord | null> {
    const record = this.checkpoints.get(tableId);
    return record ? structuredClone(record) : null;
  }

  async saveCheckpoint(record: TableCheckpointRecord): Promise<void> {
    const existing = this.checkpoints.get(record.tableId);
    if (existing && record.sequence < existing.sequence) throw new Error('Checkpoint sequence cannot move backwards');
    this.checkpoints.set(record.tableId, structuredClone(record));
  }

  async appendEvent(record: TableEventRecord): Promise<void> {
    const list = this.events.get(record.tableId) ?? [];
    const last = list.at(-1);
    if (last && record.sequence <= last.sequence) throw new Error('Event sequence must increase');
    list.push(structuredClone(record));
    this.events.set(record.tableId, list);
  }

  async listEventsAfter(tableId: string, sequence: number): Promise<TableEventRecord[]> {
    return structuredClone((this.events.get(tableId) ?? []).filter((event) => event.sequence > sequence));
  }
}
