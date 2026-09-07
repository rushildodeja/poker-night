export type MembershipResult =
  | { ok: true }
  | { ok: false; code: 'TABLE_FULL' | 'ALREADY_SEATED' | 'NOT_SEATED' | 'SEAT_OCCUPIED'; message: string };

export class TableMembership {
  constructor(private readonly maxPlayers: number) {}

  canSeat(playerIds: readonly string[], playerId: string, seat: number): MembershipResult {
    if (playerIds.includes(playerId)) return { ok: false, code: 'ALREADY_SEATED', message: 'Player is already seated' };
    if (playerIds.length >= this.maxPlayers) return { ok: false, code: 'TABLE_FULL', message: 'Table is full' };
    if (!Number.isInteger(seat) || seat < 0 || seat >= this.maxPlayers) return { ok: false, code: 'SEAT_OCCUPIED', message: 'Invalid seat' };
    return { ok: true };
  }
}
