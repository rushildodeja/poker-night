export type Contribution = Readonly<{ playerId: string; amount: number; folded: boolean }>;
export type Pot = Readonly<{ amount: number; eligiblePlayerIds: string[] }>;

export function buildPots(contributions: readonly Contribution[]): Pot[] {
  const seen = new Set<string>();
  for (const contribution of contributions) {
    if (!contribution.playerId.trim()) throw new Error('Player id is required');
    if (seen.has(contribution.playerId)) throw new Error('Duplicate player contribution');
    seen.add(contribution.playerId);
    if (!Number.isInteger(contribution.amount) || contribution.amount < 0) {
      throw new Error('Contribution must be a non-negative integer');
    }
  }

  const levels = [...new Set(contributions.map((c) => c.amount).filter((amount) => amount > 0))].sort(
    (a, b) => a - b,
  );
  const pots: Pot[] = [];
  let previous = 0;

  for (const level of levels) {
    const layer = level - previous;
    const involved = contributions.filter((c) => c.amount >= level).length;
    const amount = layer * involved;
    const eligiblePlayerIds = contributions
      .filter((c) => c.amount >= level && !c.folded)
      .map((c) => c.playerId);

    if (amount > 0) pots.push({ amount, eligiblePlayerIds });
    previous = level;
  }

  return pots;
}
