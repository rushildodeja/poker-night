import type { Card } from '../cards/types.js';

export type Street =
  | 'WAITING'
  | 'STARTING'
  | 'PRE_FLOP'
  | 'FLOP'
  | 'TURN'
  | 'RIVER'
  | 'SHOWDOWN'
  | 'SETTLEMENT'
  | 'HAND_COMPLETE';

export type PlayerStatus = 'WAITING' | 'ACTIVE' | 'FOLDED' | 'ALL_IN' | 'OUT';
export type ActionType = 'CHECK' | 'BET' | 'CALL' | 'RAISE' | 'FOLD' | 'ALL_IN';

export type PlayerState = {
  playerId: string;
  seat: number;
  stack: number;
  holeCards: Card[];
  /** Chips committed during the current betting street. */
  currentBet: number;
  /** Chips committed during the whole hand. */
  totalContribution: number;
  status: PlayerStatus;
  /** True after this player has acted since the latest full raise. */
  hasActed: boolean;
  /** False after acting until a full raise reopens this player's betting rights. */
  canRaise: boolean;
};

export type PotState = Readonly<{
  amount: number;
  eligiblePlayerIds: string[];
}>;

export type HandWinner = Readonly<{
  playerId: string;
  amount: number;
  category: string;
}>;

export type TableEvent = Readonly<{
  type:
    | 'HAND_CREATED'
    | 'PLAYER_SEATED'
    | 'BLINDS_POSTED'
    | 'CARDS_DEALT'
    | 'PLAYER_ACTION'
    | 'FLOP_DEALT'
    | 'TURN_DEALT'
    | 'RIVER_DEALT'
    | 'SHOWDOWN'
    | 'POT_SETTLED'
    | 'HAND_COMPLETED';
  handId: string;
  playerId?: string;
  action?: ActionType;
  amount?: number;
  timestamp: number;
}>;

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
  /** Highest current-street wager that active players must match. */
  currentBet: number;
  /** Size of the most recent full raise; also the minimum full raise size. */
  minRaise: number;
  pots: PotState[];
  actionDeadline: number | null;
  winners: HandWinner[];
  events: TableEvent[];
};

export type Action = Readonly<{
  playerId: string;
  type: ActionType;
  /** For BET/RAISE this is the player's desired total current-street wager. */
  amount?: number;
}>;
