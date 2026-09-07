import { Card, RANKS, SUITS } from './types.js';

export interface RandomSource {
  nextInt(maxExclusive: number): number;
}

export class CryptoRandom implements RandomSource {
  nextInt(maxExclusive: number): number {
    if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) throw new Error('Invalid random range');
    const crypto = globalThis.crypto;
    if (!crypto?.getRandomValues) throw new Error('Secure random source unavailable');
    const maxUint = 0x100000000;
    const limit = Math.floor(maxUint / maxExclusive) * maxExclusive;
    const buffer = new Uint32Array(1);
    do crypto.getRandomValues(buffer); while (buffer[0]! >= limit);
    return buffer[0]! % maxExclusive;
  }
}

export class Deck {
  private readonly cards: Card[];

  private constructor(cards: Card[]) { this.cards = cards; }

  static standard(): Deck {
    return new Deck(SUITS.flatMap(suit => RANKS.map(rank => ({ suit, rank }))));
  }

  shuffle(random: RandomSource = new CryptoRandom()): this {
    for (let i = this.cards.length - 1; i > 0; i--) {
      const j = random.nextInt(i + 1);
      [this.cards[i], this.cards[j]] = [this.cards[j]!, this.cards[i]!];
    }
    return this;
  }

  draw(count = 1): Card[] {
    if (!Number.isInteger(count) || count < 0 || count > this.cards.length) throw new Error('Invalid draw count');
    return this.cards.splice(0, count);
  }

  remaining(): number { return this.cards.length; }
}
