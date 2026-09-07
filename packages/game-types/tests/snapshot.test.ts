import { describe, expect, it } from 'vitest';
import { PokerTable } from '@poker-night/poker-engine';
import { toPrivateSnapshot, toPublicSnapshot } from '../src/snapshot.js';

function createTable(): PokerTable {
  const table = new PokerTable('snapshot-test', 50, 100, 2);
  table.seatPlayer('alice', 0, 1_000);
  table.seatPlayer('bob', 1, 1_000);
  table.startHand();
  return table;
}

describe('table snapshot projection', () => {
  it('does not expose opponents hole cards', () => {
    const table = createTable();
    const publicSnapshot = toPublicSnapshot(table.state, 7);

    expect(publicSnapshot.players).toHaveLength(2);
    expect(publicSnapshot.players.every((player) => player.holeCardCount === 2)).toBe(true);
    expect('holeCards' in publicSnapshot.players[0]!).toBe(false);
    expect('ownHoleCards' in publicSnapshot).toBe(false);
  });

  it('exposes only the viewer hole cards in a private snapshot', () => {
    const table = createTable();
    const privateSnapshot = toPrivateSnapshot(table.state, 8, 'alice');

    expect(privateSnapshot.viewerPlayerId).toBe('alice');
    expect(privateSnapshot.ownHoleCards).toHaveLength(2);
    expect(privateSnapshot.players.every((player) => !('holeCards' in player))).toBe(true);
  });

  it('rejects a viewer who is not seated', () => {
    const table = createTable();
    expect(() => toPrivateSnapshot(table.state, 1, 'mallory')).toThrow('Viewer is not seated at this table');
  });
});
