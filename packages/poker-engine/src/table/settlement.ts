import { bestHand, compareHands } from '../evaluator/evaluate.js';
import type { Card } from '../cards/types.js';
import { buildPots } from '../pots/side-pots.js';
import type { PlayerState } from './types.js';

export type Winner = Readonly<{
  playerId: string;
  amount: number;
  category: string;
}>;

/**
 * Settles every pot without mutating player state.
 * The table applies the returned payouts to stacks.
 *
 * For tied pots, odd chips are awarded clockwise from the dealer button,
 * matching standard button-game live poker rules.
 */
export function settle(
  players: readonly PlayerState[],
  board: readonly Card[],
  dealerSeat = -1,
): Winner[] {
  const pots = buildPots(
    players.map((p) => ({
      playerId: p.playerId,
      amount: p.totalContribution,
      folded: p.status === 'FOLDED',
    })),
  );

  const payouts = new Map<string, number>();
  const categories = new Map<string, string>();
  const seatByPlayerId = new Map(players.map((p) => [p.playerId, p.seat]));

  const clockwiseDistance = (seat: number): number => {
    if (dealerSeat < 0) return seat;
    const maxSeat = Math.max(...players.map((p) => p.seat), dealerSeat) + 1;
    return (seat - dealerSeat + maxSeat) % maxSeat;
  };

  for (const pot of pots) {
    const eligible = players.filter((p) => pot.eligiblePlayerIds.includes(p.playerId));
    if (eligible.length === 0) continue;

    if (eligible.length === 1) {
      const winner = eligible[0]!;
      payouts.set(winner.playerId, (payouts.get(winner.playerId) ?? 0) + pot.amount);
      categories.set(winner.playerId, 'UNCONTESTED');
      continue;
    }

    let best: ReturnType<typeof bestHand> | null = null;
    const winners: PlayerState[] = [];

    for (const player of eligible) {
      const hand = bestHand([...player.holeCards, ...board]);
      if (!best) {
        best = hand;
        winners.length = 0;
        winners.push(player);
        continue;
      }

      const comparison = compareHands(hand, best);
      if (comparison > 0) {
        best = hand;
        winners.length = 0;
        winners.push(player);
      } else if (comparison === 0) {
        winners.push(player);
      }
    }

    const orderedWinners = [...winners].sort(
      (a, b) => clockwiseDistance(a.seat) - clockwiseDistance(b.seat),
    );
    const share = Math.floor(pot.amount / orderedWinners.length);
    let remainder = pot.amount % orderedWinners.length;

    for (const winner of orderedWinners) {
      const payout = share + (remainder > 0 ? 1 : 0);
      remainder -= remainder > 0 ? 1 : 0;
      payouts.set(winner.playerId, (payouts.get(winner.playerId) ?? 0) + payout);
      categories.set(winner.playerId, best!.category);
    }
  }

  return [...payouts.entries()].map(([playerId, amount]) => ({
    playerId,
    amount,
    category: categories.get(playerId) ?? 'SETTLED',
  }));
}
