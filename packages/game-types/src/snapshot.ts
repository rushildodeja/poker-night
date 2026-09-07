import type { PrivateTableSnapshot, PublicPlayerSnapshot, TableSnapshot } from './protocol.js';
import type { PlayerState, TableState } from '@poker-night/poker-engine';

const RECENT_EVENT_LIMIT = 100;

function publicPlayer(player: PlayerState): PublicPlayerSnapshot {
  return {
    playerId: player.playerId,
    seat: player.seat,
    stack: player.stack,
    currentBet: player.currentBet,
    totalContribution: player.totalContribution,
    status: player.status,
    hasActed: player.hasActed,
    canRaise: player.canRaise,
    holeCardCount: player.holeCards.length,
  };
}

export function toPublicSnapshot(state: TableState, sequence: number): TableSnapshot {
  return {
    protocolVersion: 1,
    tableId: state.tableId,
    handId: state.handId,
    sequence,
    maxPlayers: state.maxPlayers,
    players: state.players.map(publicPlayer),
    dealerButton: state.dealerButton,
    smallBlind: state.smallBlind,
    bigBlind: state.bigBlind,
    communityCards: state.communityCards.map((card) => ({ ...card })),
    street: state.street,
    currentPlayerId: state.currentPlayerId,
    currentBet: state.currentBet,
    minRaise: state.minRaise,
    pots: state.pots.map((pot) => ({ amount: pot.amount, eligiblePlayerIds: [...pot.eligiblePlayerIds] })),
    actionDeadline: state.actionDeadline,
    winners: state.winners.map((winner) => ({ ...winner })),
    recentEvents: state.events.slice(-RECENT_EVENT_LIMIT).map((event) => ({ ...event })),
  };
}

export function toPrivateSnapshot(state: TableState, sequence: number, viewerPlayerId: string): PrivateTableSnapshot {
  const player = state.players.find((candidate) => candidate.playerId === viewerPlayerId);
  if (!player) throw new Error('Viewer is not seated at this table');

  return {
    ...toPublicSnapshot(state, sequence),
    viewerPlayerId,
    ownHoleCards: player.holeCards.map((card) => ({ ...card })),
  };
}
