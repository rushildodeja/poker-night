import { describe, expect, it } from 'vitest';
import { Deck, type RandomSource } from '../src/cards/deck.js';

describe('Deck', () => {
  it('contains exactly 52 unique cards', () => {
    const deck = Deck.standard();
    const cards = deck.draw(52);
    expect(cards).toHaveLength(52);
    expect(new Set(cards.map((card) => `${card.rank}-${card.suit}`)).size).toBe(52);
    expect(deck.remaining()).toBe(0);
  });

  it('rejects impossible draws', () => {
    const deck = Deck.standard();
    expect(() => deck.draw(53)).toThrow('Invalid draw count');
    expect(() => deck.draw(-1)).toThrow('Invalid draw count');
  });

  it('uses the injected random source for deterministic shuffling', () => {
    const source: RandomSource = {
      nextInt: (maxExclusive) => maxExclusive - 1,
    };
    const deck = Deck.standard().shuffle(source);
    const cards = deck.draw(52);
    expect(cards).toHaveLength(52);
    expect(new Set(cards.map((card) => `${card.rank}-${card.suit}`)).size).toBe(52);
    expect(cards[0]).toEqual({ rank: 2, suit: 'clubs' });
  });
});
