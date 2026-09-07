import { describe, expect, it } from 'vitest';
import { buildPots } from '../src/pots/side-pots.js';

describe('side pots', () => {
  it('builds layered pots from unequal contributions', () => {
    const pots = buildPots([
      { playerId: 'a', amount: 100, folded: false },
      { playerId: 'b', amount: 60, folded: false },
      { playerId: 'c', amount: 20, folded: true },
    ]);

    expect(pots).toEqual([
      { amount: 60, eligiblePlayerIds: ['a', 'b'] },
      { amount: 80, eligiblePlayerIds: ['a', 'b'] },
      { amount: 40, eligiblePlayerIds: ['a'] },
    ]);
  });

  it('keeps folded chips in the pot but removes the folded player from eligibility', () => {
    const pots = buildPots([
      { playerId: 'winner', amount: 50, folded: false },
      { playerId: 'caller', amount: 50, folded: false },
      { playerId: 'folded', amount: 50, folded: true },
    ]);

    expect(pots).toEqual([{ amount: 150, eligiblePlayerIds: ['winner', 'caller'] }]);
  });

  it('rejects duplicate players and invalid contributions', () => {
    expect(() => buildPots([
      { playerId: 'a', amount: 10, folded: false },
      { playerId: 'a', amount: 20, folded: false },
    ])).toThrow('Duplicate player contribution');

    expect(() => buildPots([{ playerId: 'a', amount: -1, folded: false }])).toThrow(
      'Contribution must be a non-negative integer',
    );
    expect(() => buildPots([{ playerId: 'a', amount: 1.5, folded: false }])).toThrow(
      'Contribution must be a non-negative integer',
    );
  });
});
