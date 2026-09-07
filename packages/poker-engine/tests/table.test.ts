import { describe, expect, it } from 'vitest';
import { PokerTable } from '../src/table/table.js';

describe('PokerTable', () => {
  it('starts a heads-up hand with two cards each and correct blinds', () => {
    const table = new PokerTable('table-1', 5, 10, 2);
    table.seatPlayer('alice', 0, 100);
    table.seatPlayer('bob', 1, 100);
    table.startHand();

    expect(table.state.street).toBe('PRE_FLOP');
    expect(table.state.players.every((p) => p.holeCards.length === 2)).toBe(true);
    expect(table.state.players.reduce((n, p) => n + p.currentBet, 0)).toBe(15);
    expect(table.state.currentPlayerId).toBeTruthy();
    expect(table.state.events.map((event) => event.type)).toContain('CARDS_DEALT');
  });

  it('rejects actions from the wrong player', () => {
    const table = new PokerTable('table-2', 5, 10, 2);
    table.seatPlayer('alice', 0, 100);
    table.seatPlayer('bob', 1, 100);
    table.startHand();

    const wrong = table.state.players.find((p) => p.playerId !== table.state.currentPlayerId)!;
    expect(() => table.act({ playerId: wrong.playerId, type: 'FOLD' })).toThrow('Not a legal acting player');
  });

  it('ends the hand immediately when every opponent folds', () => {
    const table = new PokerTable('fold-hand', 5, 10, 2);
    table.seatPlayer('alice', 0, 100);
    table.seatPlayer('bob', 1, 100);
    table.startHand();

    const actingPlayerId = table.state.currentPlayerId!;
    const otherPlayer = table.state.players.find((p) => p.playerId !== actingPlayerId)!;
    const before = table.state.players.reduce((sum, p) => sum + p.stack, 0);

    table.act({ playerId: actingPlayerId, type: 'FOLD' });

    expect(table.state.street).toBe('HAND_COMPLETE');
    expect(table.state.winners).toEqual([{ playerId: otherPlayer.playerId, amount: 15, category: 'UNCONTESTED' }]);
    expect(table.state.players.reduce((sum, p) => sum + p.stack, 0)).toBe(200);
    expect(before).toBe(185);
  });

  it('never makes an all-in player the next actor', () => {
    const table = new PokerTable('all-in', 5, 10, 3);
    table.seatPlayer('alice', 0, 100);
    table.seatPlayer('bob', 1, 15);
    table.seatPlayer('carol', 2, 100);
    table.startHand();

    table.act({ playerId: 'alice', type: 'CALL' });
    table.act({ playerId: 'bob', type: 'CALL' });
    table.act({ playerId: 'carol', type: 'ALL_IN' });

    expect(table.state.currentPlayerId).not.toBe('carol');
    expect(table.state.players.find((p) => p.playerId === 'carol')?.status).toBe('ALL_IN');
  });

  it('does not reopen raising after a short all-in raise', () => {
    const table = new PokerTable('short-all-in', 5, 10, 3);
    table.seatPlayer('alice', 0, 100);
    table.seatPlayer('bob', 1, 100);
    table.seatPlayer('carol', 2, 15);
    table.startHand();

    table.act({ playerId: 'alice', type: 'CALL' });
    table.act({ playerId: 'bob', type: 'CALL' });
    table.act({ playerId: 'carol', type: 'ALL_IN' });

    expect(table.state.currentBet).toBe(15);
    expect(table.state.players.find((p) => p.playerId === 'alice')?.canRaise).toBe(false);
    expect(table.state.players.find((p) => p.playerId === 'bob')?.canRaise).toBe(false);

    expect(() => table.act({ playerId: 'alice', type: 'RAISE', amount: 30 })).toThrow('Betting has not been reopened for this player');

    table.act({ playerId: 'alice', type: 'CALL' });
    table.act({ playerId: 'bob', type: 'CALL' });
    expect(table.state.street).toBe('FLOP');
  });

  it('preserves chip conservation across a complete all-in hand', () => {
    const table = new PokerTable('chip-conservation', 5, 10, 2);
    table.seatPlayer('alice', 0, 100);
    table.seatPlayer('bob', 1, 100);
    table.startHand();
    const startingChips = table.state.players.reduce((sum, p) => sum + p.stack, 0);

    const first = table.state.currentPlayerId!;
    table.act({ playerId: first, type: 'ALL_IN' });
    const second = table.state.currentPlayerId!;
    table.act({ playerId: second, type: 'ALL_IN' });

    expect(table.state.street).toBe('HAND_COMPLETE');
    expect(table.state.communityCards).toHaveLength(5);
    expect(table.state.players.reduce((sum, p) => sum + p.stack, 0)).toBe(200);
    expect(startingChips).toBe(185);
    expect(table.state.winners.reduce((sum, winner) => sum + winner.amount, 0)).toBe(200);
  });
});
