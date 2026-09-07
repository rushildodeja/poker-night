import { bestHand, compareHands } from '../evaluator/evaluate.js';
import type { Card } from '../cards/types.js';
import { buildPots } from '../pots/side-pots.js';
import type { PlayerState } from './types.js';

export type Winner = Readonly<{ playerId: string; amount: number; category: string }>;

export function settle(players: readonly PlayerState[], board: readonly Card[]): Winner[] {
  const pots = buildPots(players.map(p => ({ playerId: p.playerId, amount: p.totalContribution, folded: p.status === 'FOLDED' })));
  const payouts = new Map<string, number>();
  for (const pot of pots) {
    if (!pot.eligiblePlayerIds.length) continue;
    const eligible = players.filter(p => pot.eligiblePlayerIds.includes(p.playerId));
    let best = null as ReturnType<typeof bestHand> | null;
    const winners: PlayerState[] = [];
    for (const p of eligible) {
      const hand = bestHand([...p.holeCards, ...board]);
      if (!best) { best=hand; winners.length=0; winners.push(p); }
      else { const cmp=compareHands(hand,best); if (cmp>0) { best=hand; winners.length=0; winners.push(p); } else if (cmp===0) winners.push(p); }
    }
    const share=Math.floor(pot.amount/winners.length), remainder=pot.amount%winners.length;
    winners.forEach((p,i)=>payouts.set(p.playerId,(payouts.get(p.playerId)??0)+share+(i<remainder?1:0)));
  }
  return [...payouts.entries()].map(([playerId,amount])=>({ playerId, amount, category: 'SETTLED' }));
}
