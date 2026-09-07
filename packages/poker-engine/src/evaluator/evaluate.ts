import type { Card, Rank } from '../cards/types.js';

export const HAND_RANK = {
  HIGH_CARD: 1,
  ONE_PAIR: 2,
  TWO_PAIR: 3,
  THREE_OF_A_KIND: 4,
  STRAIGHT: 5,
  FLUSH: 6,
  FULL_HOUSE: 7,
  FOUR_OF_A_KIND: 8,
  STRAIGHT_FLUSH: 9,
} as const;
export type HandCategory = keyof typeof HAND_RANK;
export type HandValue = Readonly<{ category: HandCategory; score: number[] }>;

const counts = (cards: readonly Card[]) => {
  const map = new Map<number, number>();
  for (const c of cards) map.set(c.rank, (map.get(c.rank) ?? 0) + 1);
  return map;
};

const straightHigh = (cards: readonly Card[]): Rank | null => {
  const ranks = new Set<number>(cards.map((c) => c.rank));
  if (ranks.has(14)) ranks.add(1);
  for (let high = 14; high >= 5; high--) {
    let ok = true;
    for (let r = high; r > high - 5; r--) if (!ranks.has(r)) ok = false;
    if (ok) return high as Rank;
  }
  return null;
};

const desc = (cards: readonly Card[]) => [...new Set(cards.map((c) => c.rank))].sort((a, b) => b - a);

export function evaluateFive(cards: readonly Card[]): HandValue {
  if (cards.length !== 5) throw new Error('Exactly five cards are required');
  const byRank = counts(cards);
  const groups = [...byRank.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const flush = cards.every((c) => c.suit === cards[0]!.suit);
  const straight = straightHigh(cards);
  if (flush && straight) return { category: 'STRAIGHT_FLUSH', score: [straight] };

  const four = groups.find(([, n]) => n === 4);
  if (four) return { category: 'FOUR_OF_A_KIND', score: [four[0], ...desc(cards).filter((r) => r !== four[0])] };

  const trips = groups.filter(([, n]) => n === 3).map(([r]) => r).sort((a, b) => b - a);
  const pairs = groups.filter(([, n]) => n === 2).map(([r]) => r).sort((a, b) => b - a);
  if (trips.length && (pairs.length || trips.length > 1)) {
    return { category: 'FULL_HOUSE', score: [trips[0]!, pairs[0] ?? trips[1]!] };
  }
  if (flush) return { category: 'FLUSH', score: desc(cards) };
  if (straight) return { category: 'STRAIGHT', score: [straight] };
  if (trips.length) return { category: 'THREE_OF_A_KIND', score: [trips[0]!, ...desc(cards).filter((r) => r !== trips[0])] };
  if (pairs.length >= 2) return { category: 'TWO_PAIR', score: [pairs[0]!, pairs[1]!, ...desc(cards).filter((r) => r !== pairs[0] && r !== pairs[1])] };
  if (pairs.length === 1) return { category: 'ONE_PAIR', score: [pairs[0]!, ...desc(cards).filter((r) => r !== pairs[0])] };
  return { category: 'HIGH_CARD', score: desc(cards) };
}

export function compareHands(a: HandValue, b: HandValue): number {
  const categoryDiff = HAND_RANK[a.category] - HAND_RANK[b.category];
  if (categoryDiff) return categoryDiff;
  const len = Math.max(a.score.length, b.score.length);
  for (let i = 0; i < len; i++) {
    const diff = (a.score[i] ?? 0) - (b.score[i] ?? 0);
    if (diff) return diff;
  }
  return 0;
}

export function bestHand(cards: readonly Card[]): HandValue {
  if (cards.length < 5 || cards.length > 7) throw new Error('Best hand requires 5 to 7 cards');
  let best: HandValue | null = null;
  for (let a = 0; a < cards.length - 4; a++)
    for (let b = a + 1; b < cards.length - 3; b++)
      for (let c = b + 1; c < cards.length - 2; c++)
        for (let d = c + 1; d < cards.length - 1; d++)
          for (let e = d + 1; e < cards.length; e++) {
            const value = evaluateFive([cards[a]!, cards[b]!, cards[c]!, cards[d]!, cards[e]!]);
            if (!best || compareHands(value, best) > 0) best = value;
          }
  return best!;
}
