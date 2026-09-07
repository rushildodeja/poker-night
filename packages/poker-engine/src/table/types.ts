import type { Card } from '../cards/types.js';

export type Street = 'WAITING' | 'STARTING' | 'PRE_FLOP' | 'FLOP' | 'TURN' | 'RIVER' | 'SHOWDOWN' | 'SETTLEMENT' | 'HAND_COMPLETE';
export type PlayerStatus = 'WAITING' | 'ACTIVE' | 'FOLDED' | 'ALL_IN' | 'OUT';
export type ActionType = 'CHECK' | 'BET' | 'CALL' | 'RAISE' | 'FOLD' | 'ALL_IN';

export type PlayerState = {
  playerId: string;
  seat: number;
  stack: number;
  holeCards: Card[];
  currentBet: number;
  totalContribution: number;
  status: PlayerStatus;
  hasActed: boolean;
};

export type TableState = {
  tableId: string;
  handId: string | null;
  maxPlayers: number;
  players: PlayerState[];
  dealerButton: number;
  smallBlind: number;
  bigBlind: number;
  communityCards: Card[];
  street: Street;
  currentPlayerId: string | null;
  currentBet: number;
  minRaise: number;
  pots: { amount: number; eligiblePlayerIds: string[] }[];
  actionDeadline: number | null;
};

export type Action = Readonly<{ playerId: string; type: ActionType; amount?: number }>;
