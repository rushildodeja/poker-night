import type { Card } from '../cards/types.js';
import type { TableState } from '../table/types.js';

const cardKey = (card: Card): string => `${card.rank}:${card.suit}`;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function assertTableInvariant(state: TableState, expectedChipTotal: number): void {
  const ids = new Set<string>();
  const seats = new Set<number>();

  for (const player of state.players) {
    assert(!ids.has(player.playerId), `Duplicate player id: ${player.playerId}`);
    assert(!seats.has(player.seat), `Duplicate seat: ${player.seat}`);
    ids.add(player.playerId);
    seats.add(player.seat);
    assert(Number.isInteger(player.stack) && player.stack >= 0, `Invalid stack for ${player.playerId}`);
    assert(Number.isInteger(player.currentBet) && player.currentBet >= 0, `Invalid current bet for ${player.playerId}`);
    assert(Number.isInteger(player.totalContribution) && player.totalContribution >= 0, `Invalid contribution for ${player.playerId}`);
    assert(player.totalContribution >= player.currentBet, `Contribution below current bet for ${player.playerId}`);
    assert(player.status !== 'ALL_IN' || player.stack === 0, `ALL_IN player still has chips: ${player.playerId}`);
  }

  const cards: Card[] = [];
  for (const player of state.players) cards.push(...player.holeCards);
  cards.push(...state.communityCards);
  const uniqueCards = new Set(cards.map(cardKey));
  assert(uniqueCards.size === cards.length, 'Duplicate card detected in live table state');
  assert(cards.length <= 52, 'More than 52 cards are present');

  if (state.street !== 'WAITING') {
    const dealtPlayers = state.players.filter((p) => p.status !== 'OUT');
    for (const player of dealtPlayers) assert(player.holeCards.length === 2, `Player ${player.playerId} does not have two hole cards`);
  }

  const expectedCommunityCards =
    state.street === 'FLOP' || state.street === 'TURN' || state.street === 'RIVER' || state.street === 'SHOWDOWN' || state.street === 'SETTLEMENT' || state.street === 'HAND_COMPLETE'
      ? state.street === 'FLOP' ? 3 : state.street === 'TURN' ? 4 : 5
      : 0;
  assert(state.communityCards.length === expectedCommunityCards, `Unexpected community-card count in ${state.street}`);

  const contributionTotal = state.players.reduce((sum, player) => sum + player.totalContribution, 0);
  const stackTotal = state.players.reduce((sum, player) => sum + player.stack, 0);
  if (state.street === 'HAND_COMPLETE') {
    assert(stackTotal === expectedChipTotal, `Final stacks ${stackTotal} do not equal expected total ${expectedChipTotal}`);
  } else {
    assert(stackTotal + contributionTotal === expectedChipTotal, `Chip conservation failed: stacks=${stackTotal}, contributions=${contributionTotal}, expected=${expectedChipTotal}`);
  }

  const potTotal = state.pots.reduce((sum, pot) => sum + pot.amount, 0);
  if (state.pots.length > 0) assert(potTotal === contributionTotal, `Pot total ${potTotal} does not equal contributions ${contributionTotal}`);

  if (state.street === 'HAND_COMPLETE') {
    const winnerTotal = state.winners.reduce((sum, winner) => sum + winner.amount, 0);
    assert(winnerTotal === contributionTotal, `Winner payouts ${winnerTotal} do not equal contributions ${contributionTotal}`);
    assert(state.currentPlayerId === null, 'Completed hand still has an acting player');
  }
}
