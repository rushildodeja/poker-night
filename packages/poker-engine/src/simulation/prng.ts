import type { RandomSource } from '../cards/deck.js';

/** Deterministic PRNG for tests/simulation only. Never use this for production gameplay randomness. */
export class SeededRandom implements RandomSource {
  private state: number;

  constructor(seed: number) {
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
      throw new Error('Seed must be an unsigned 32-bit integer');
    }
    this.state = seed >>> 0;
  }

  nextInt(maxExclusive: number): number {
    if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) throw new Error('Invalid random range');

    // Mulberry32. The rejection-free mapping is acceptable for simulation policy
    // choices; production deck shuffling uses CryptoRandom instead.
    let z = (this.state += 0x6d2b79f5);
    z = Math.imul(z ^ (z >>> 15), z | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    const unit = ((z ^ (z >>> 14)) >>> 0) / 0x100000000;
    return Math.floor(unit * maxExclusive);
  }

  nextFloat(): number {
    return this.nextInt(0x1000000) / 0x1000000;
  }
}
