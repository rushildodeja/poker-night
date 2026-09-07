import { describe, expect, it } from 'vitest';
import { settle } from '../src/table/settlement.js';
import type { Card } from '../src/cards/types.js';
import type { PlayerState } from '../src/table/types.js';

const c = (rank: Card['rank'], suit: Card['suit']): Card => ({ rank, suit });
const player = (
  playerId: string,
  seat: number,
  contribution: number,
  status: PlayerState['status'] = 'ACTIVE',
): PlayerState => ({
  playerId,
  seat,
  stack: 100 - contribution,
  holeCards: [c(2, 'clubs'), c(3, 'diamonds')],
  currentBet: 0,
  totalContribution: contribution,
  status,
  hasActed: true,
  canRaise: true,
});

describe('settlement', () => {
  it('splits tied pots and assigns the odd chip clockwise from the dealer', () => {
    const players = [
      player('a', 1, 2),
      player('b', 2, 2),
      player('dead', 3, 1, 'FOLDED'),
    ];
    const board = [
      c(14, 'clubs'), c(13, 'diamonds'), c(12, 'hearts'), c(11, 'spades'), c(10, 'clubs'),
    ];

    const winners = settle(players, board, 0);

    expect(winners).toEqual([
      { playerId: 'a', amount: 3, category: 'STRAIGHT' },
      { playerId: 'b', amount: 2, category: 'STRAIGHT' },
    ]);
  });

  it('does not mutate contributions or stacks', () => {
    const players = [player('a', 1, 50), player('b', 2, 50)];
    const before = players.map((p) => ({ stack: p.stack, contribution: p.totalContribution }));
    const board = [c(2, 'clubs'), c(7, 'diamonds'), c(9, 'hearts'), c(11, 'spades'), c(14, 'clubs')];

    settle(players, board, 0);

    expect(players.map((p) => ({ stack: p.stack, contribution: p.totalContribution }))).toEqual(before);
  });
});
