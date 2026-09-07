import { describe, expect, it } from 'vitest';
import { compareHands, evaluateFive } from '../src/evaluator/evaluate.js';
import type { Card } from '../src/cards/types.js';

const c=(rank: Card['rank'], suit: Card['suit']): Card=>({rank,suit});

describe('hand evaluator',()=>{
  it('recognizes a royal flush',()=>expect(evaluateFive([c(14,'spades'),c(13,'spades'),c(12,'spades'),c(11,'spades'),c(10,'spades')]).category).toBe('STRAIGHT_FLUSH'));
  it('recognizes an ace-low straight',()=>expect(evaluateFive([c(14,'clubs'),c(2,'diamonds'),c(3,'hearts'),c(4,'spades'),c(5,'clubs')]).score).toEqual([5]));
  it('uses kickers for one pair',()=>{
    const a=evaluateFive([c(9,'clubs'),c(9,'diamonds'),c(14,'spades'),c(8,'clubs'),c(7,'hearts')]);
    const b=evaluateFive([c(9,'clubs'),c(9,'hearts'),c(13,'spades'),c(12,'clubs'),c(11,'hearts')]);
    expect(compareHands(a,b)).toBeGreaterThan(0);
  });
  it('recognizes full house',()=>expect(evaluateFive([c(10,'clubs'),c(10,'diamonds'),c(10,'hearts'),c(4,'spades'),c(4,'clubs')]).category).toBe('FULL_HOUSE'));
});
