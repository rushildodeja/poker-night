import type { Card, ActionType, PotState, Street, TableEvent } from '@poker-night/poker-engine';

export type ProtocolVersion = 1;

/** Client input. Player identity comes from the authenticated connection, never this payload. */
export type ClientActionRequest = Readonly<{
  protocolVersion: ProtocolVersion;
  requestId: string;
  tableId: string;
  handId: string;
  action: ActionType;
  amount?: number;
  /** Optional optimistic concurrency guard. The server remains authoritative. */
  expectedSequence?: number;
}>;

export type ServerActionAccepted = Readonly<{
  type: 'ACTION_ACCEPTED';
  protocolVersion: ProtocolVersion;
  requestId: string;
  tableId: string;
  handId: string;
  sequence: number;
}>;

export type ServerErrorCode =
  | 'BAD_REQUEST'
  | 'STALE_HAND'
  | 'STALE_SEQUENCE'
  | 'DUPLICATE_REQUEST'
  | 'NOT_YOUR_TURN'
  | 'INVALID_ACTION'
  | 'TABLE_NOT_FOUND'
  | 'PLAYER_NOT_SEATED'
  | 'UNAUTHORIZED'
  | 'INTERNAL_ERROR';

export type ServerError = Readonly<{
  type: 'ERROR';
  protocolVersion: ProtocolVersion;
  requestId?: string;
  code: ServerErrorCode;
  message: string;
}>;

export type PublicPlayerSnapshot = Readonly<{
  playerId: string;
  seat: number;
  stack: number;
  currentBet: number;
  totalContribution: number;
  status: 'WAITING' | 'ACTIVE' | 'FOLDED' | 'ALL_IN' | 'OUT';
  hasActed: boolean;
  canRaise: boolean;
  holeCardCount: number;
}>;

export type TableSnapshot = Readonly<{
  protocolVersion: ProtocolVersion;
  tableId: string;
  handId: string | null;
  sequence: number;
  maxPlayers: number;
  players: readonly PublicPlayerSnapshot[];
  dealerButton: number;
  smallBlind: number;
  bigBlind: number;
  communityCards: readonly Card[];
  street: Street;
  currentPlayerId: string | null;
  currentBet: number;
  minRaise: number;
  pots: readonly PotState[];
  actionDeadline: number | null;
  winners: readonly Readonly<{ playerId: string; amount: number; category: string }>[];
  recentEvents: readonly TableEvent[];
}>;

export type PrivateTableSnapshot = TableSnapshot & Readonly<{
  viewerPlayerId: string;
  ownHoleCards: readonly Card[];
}>;

export type ServerEvent = Readonly<{
  type: 'TABLE_SNAPSHOT' | 'ACTION_ACCEPTED' | 'ERROR';
  protocolVersion: ProtocolVersion;
  sequence: number;
  payload: TableSnapshot | PrivateTableSnapshot | ServerActionAccepted | ServerError;
}>;
