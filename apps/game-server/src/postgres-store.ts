import { Pool, type PoolClient } from 'pg';
import type { PokerTableCheckpoint } from '@poker-night/poker-engine';
import type { DurableTableStore, PersistedMutation, TableCheckpointRecord, TableEventRecord } from './durable-store.js';

export class PostgresDurableTableStore implements DurableTableStore {
  readonly pool: Pool;

  constructor(connectionString = process.env.DATABASE_URL) {
    if (!connectionString) throw new Error('DATABASE_URL is required for PostgreSQL persistence');
    this.pool = new Pool({ connectionString, max: Number(process.env.DB_POOL_MAX ?? 10), idleTimeoutMillis: 30_000 });
  }

  async loadCheckpoint(tableId: string): Promise<TableCheckpointRecord | null> {
    const result = await this.pool.query(
      `select table_id, sequence, checkpoint, extract(epoch from saved_at) * 1000 as saved_at
       from public.poker_table_checkpoints where table_id = $1`, [tableId]);
    const row = result.rows[0];
    if (!row) return null;
    return { tableId: row.table_id, sequence: Number(row.sequence), checkpoint: row.checkpoint as PokerTableCheckpoint, savedAt: Number(row.saved_at) };
  }

  async saveCheckpoint(record: TableCheckpointRecord): Promise<void> {
    const client = await this.pool.connect();
    try { await client.query('begin'); await this.writeCheckpoint(client, record); await client.query('commit'); }
    catch (error) { await client.query('rollback'); throw error; }
    finally { client.release(); }
  }

  async appendEvent(record: TableEventRecord): Promise<void> {
    await this.pool.query(
      `insert into public.poker_table_events(table_id, sequence, event_index, hand_id, event, request_id, saved_at)
       values ($1, $2, $3, $4, $5::jsonb, $6, to_timestamp($7 / 1000.0))`,
      [record.tableId, record.sequence, record.eventIndex, record.handId, JSON.stringify(record.event), record.requestId, record.savedAt]);
  }

  async listEventsAfter(tableId: string, sequence: number): Promise<TableEventRecord[]> {
    const result = await this.pool.query(
      `select table_id, sequence, event_index, hand_id, event, request_id, extract(epoch from saved_at) * 1000 as saved_at
       from public.poker_table_events where table_id = $1 and sequence > $2 order by sequence asc, event_index asc`, [tableId, sequence]);
    return result.rows.map((row) => ({ tableId: row.table_id, sequence: Number(row.sequence), eventIndex: Number(row.event_index), handId: row.hand_id, event: row.event, requestId: row.request_id, savedAt: Number(row.saved_at) }));
  }

  async persistMutation(mutation: PersistedMutation): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const lock = await client.query(`select sequence from public.poker_table_checkpoints where table_id = $1 for update`, [mutation.tableId]);
      const current = lock.rows[0] ? Number(lock.rows[0].sequence) : 0;
      if (mutation.sequence !== current + 1) throw new Error(`Persistence sequence conflict: expected ${current + 1}, got ${mutation.sequence}`);
      const existing = await client.query(`select sequence from public.poker_table_events where table_id = $1 and request_id = $2 limit 1`, [mutation.tableId, mutation.requestId]);
      if (existing.rows[0]) throw new Error(`Request already persisted at sequence ${Number(existing.rows[0].sequence)}`);
      for (let eventIndex = 0; eventIndex < mutation.events.length; eventIndex += 1) {
        await client.query(
          `insert into public.poker_table_events(table_id, sequence, event_index, hand_id, event, request_id, saved_at)
           values ($1, $2, $3, $4, $5::jsonb, $6, to_timestamp($7 / 1000.0))`,
          [mutation.tableId, mutation.sequence, eventIndex, mutation.handId, JSON.stringify(mutation.events[eventIndex]), mutation.requestId, mutation.savedAt]);
      }
      await this.writeCheckpoint(client, { tableId: mutation.tableId, sequence: mutation.sequence, checkpoint: mutation.checkpoint, savedAt: mutation.savedAt });
      await client.query('commit');
    } catch (error) { await client.query('rollback'); throw error; }
    finally { client.release(); }
  }

  async findRequest(tableId: string, requestId: string): Promise<number | null> {
    const result = await this.pool.query(`select sequence from public.poker_table_events where table_id = $1 and request_id = $2 limit 1`, [tableId, requestId]);
    return result.rows[0] ? Number(result.rows[0].sequence) : null;
  }

  async close(): Promise<void> { await this.pool.end(); }

  private async writeCheckpoint(client: PoolClient, record: TableCheckpointRecord): Promise<void> {
    await client.query(
      `insert into public.poker_table_checkpoints(table_id, sequence, hand_id, checkpoint, saved_at)
       values ($1, $2, $3, $4::jsonb, to_timestamp($5 / 1000.0))
       on conflict (table_id) do update set sequence = excluded.sequence, hand_id = excluded.hand_id, checkpoint = excluded.checkpoint, saved_at = excluded.saved_at
       where public.poker_table_checkpoints.sequence <= excluded.sequence`,
      [record.tableId, record.sequence, record.checkpoint.state.handId ?? '', JSON.stringify(record.checkpoint), record.savedAt]);
  }
}
