import { PokerTable } from '@poker-night/poker-engine';

export class TableRegistry {
  private readonly tables = new Map<string, PokerTable>();
  create(tableId: string, smallBlind: number, bigBlind: number, maxPlayers = 9): PokerTable { if (this.tables.has(tableId)) throw new Error('Table already exists'); const table = new PokerTable(tableId, smallBlind, bigBlind, maxPlayers); this.tables.set(tableId, table); return table; }
  register(table: PokerTable): void { if (this.tables.has(table.state.tableId)) throw new Error('Table already exists'); this.tables.set(table.state.tableId, table); }
  get(tableId: string): PokerTable | undefined { return this.tables.get(tableId); }
  delete(tableId: string): boolean { return this.tables.delete(tableId); }
  has(tableId: string): boolean { return this.tables.has(tableId); }
  list(): PokerTable[] { return [...this.tables.values()]; }
}
