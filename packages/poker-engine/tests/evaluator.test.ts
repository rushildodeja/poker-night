import { describe, expect, it } from 'vitest';
import { bestHand, compareHands, evaluateFive } from '../src/evaluator/evaluate.js';
import type { Card } from '../src/cards/types.js';

const c = (rank: Card['rank'], suit: Card['suit']): Card => ({ rank, suit });

describe('hand evaluator', () => {
  it('recognizes all major hand categories', () => {
    expect(evaluateFive([c(14, 'spades'), c(13, 'spades'), c(12, 'spades'), c(11, 'spades'), c(10, 'spades')]).category).toBe('STRAIGHT_FLUSH');
    expect(evaluateFive([c(9, 'clubs'), c(9, 'diamonds'), c(9, 'hearts'), c(9, 'spades'), c(2, 'clubs')]).category).toBe('FOUR_OF_A_KIND');
    expect(evaluateFive([c(10, 'clubs'), c(10, 'diamonds'), c(10, 'hearts'), c(4, 'spades'), c(4, 'clubs')]).category).toBe('FULL_HOUSE');
    expect(evaluateFive([c(14, 'hearts'), c(11, 'hearts'), c(8, 'hearts'), c(5, 'hearts'), c(2, 'hearts')]).category).toBe('FLUSH');
    expect(evaluateFive([c(14, 'clubs'), c(2, 'diamonds'), c(3, 'hearts'), c(4, 'spades'), c(5, 'clubs')]).category).toBe('STRAIGHT');
    expect(evaluateFive([c(7, 'clubs'), c(7, 'diamonds'), c(7, 'hearts'), c(13, 'spades'), c(2, 'clubs')]).category).toBe('THREE_OF_A_KIND');
    expect(evaluateFive([c(12, 'clubs'), c(12, 'diamonds'), c(8, 'hearts'), c(8, 'spades'), c(3, 'clubs')]).category).toBe('TWO_PAIR');
    expect(evaluateFive([c(9, 'clubs'), c(9, 'diamonds'), c(14, 'spades'), c(8, 'clubs'), c(7, 'hearts')]).category).toBe('ONE_PAIR');
    expect(evaluateFive([c(14, 'clubs'), c(11, 'diamonds'), c(8, 'hearts'), c(5, 'spades'), c(2, 'clubs')]).category).toBe('HIGH_CARD');
  });

  it('recognizes an ace-low straight', () => {
    expect(evaluateFive([c(14, 'clubs'), c(2, 'diamonds'), c(3, 'hearts'), c(4, 'spades'), c(5, 'clubs')]).score).toEqual([5]);
  });

  it('uses kickers for one pair', () => {
    const a = evaluateFive([c(9, 'clubs'), c(9, 'diamonds'), c(14, 'spades'), c(8, 'clubs'), c(7, 'hearts')]);
    const b = evaluateFive([c(9, 'clubs'), c(9, 'hearts'), c(13, 'spades'), c(12, 'clubs'), c(11, 'hearts')]);
    expect(compareHands(a, b)).toBeGreaterThan(0);
  });

  it('compares two pair by second pair and then kicker', () => {
    const secondPairWins = evaluateFive([c(14, 'clubs'), c(14, 'diamonds'), c(8, 'hearts'), c(8, 'spades'), c(2, 'clubs')]);
    const lowerSecondPair = evaluateFive([c(14, 'hearts'), c(14, 'spades'), c(7, 'clubs'), c(7, 'diamonds'), c(13, 'hearts')]);
    expect(compareHands(secondPairWins, lowerSecondPair)).toBeGreaterThan(0);
  });

  it('returns a tie for identical hand values', () => {
    const a = evaluateFive([c(14, 'clubs'), c(13, 'clubs'), c(12, 'clubs'), c(11, 'clubs'), c(10, 'clubs')]);
    const b = evaluateFive([c(14, 'diamonds'), c(13, 'diamonds'), c(12, 'diamonds'), c(11, 'diamonds'), c(10, 'diamonds')]);
    expect(compareHands(a, b)).toBe(0);
  });

  it('finds the best five cards out of seven', () => {
    const hand = bestHand([
      c(14, 'clubs'), c(13, 'clubs'), c(12, 'clubs'), c(11, 'clubs'),
      c(10, 'clubs'), c(2, 'hearts'), c(2, 'diamonds'),
    ]);
    expect(hand.category).toBe('STRAIGHT_FLUSH');
    expect(hand.score).toEqual([14]);
  });

  it('does not let a board-only hand produce a false kicker advantage', () => {
    const board = [c(14, 'clubs'), c(13, 'diamonds'), c(12, 'hearts'), c(11, 'spades'), c(10, 'clubs')];
    const a = bestHand([...board, c(2, 'hearts'), c(3, 'diamonds')]);
    const b = bestHand([...board, c(4, 'hearts'), c(5, 'diamonds')]);
    expect(compareHands(a, b)).toBe(0);
  });
});
