export type Contribution = Readonly<{ playerId: string; amount: number; folded: boolean }>;
export type Pot = Readonly<{ amount: number; eligiblePlayerIds: string[] }>;

export function buildPots(contributions: readonly Contribution[]): Pot[] {
  const levels = [...new Set(contributions.map(c => c.amount).filter(a => a > 0))].sort((a,b)=>a-b);
  const pots: Pot[] = [];
  let previous = 0;
  for (const level of levels) {
    const layer = level - previous;
    const involved = contributions.filter(c => c.amount >= level);
    const amount = layer * contributions.filter(c => c.amount >= level || c.amount > previous).length;
    const eligiblePlayerIds = contributions.filter(c => c.amount >= level && !c.folded).map(c => c.playerId);
    if (amount > 0) pots.push({ amount, eligiblePlayerIds });
    previous = level;
  }
  return pots;
}
