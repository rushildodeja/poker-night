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
  expectedSequence?: number;
}>;

export type ClientResumeRequest = Readonly<{
  type: 'RESUME';
  protocolVersion: ProtocolVersion;
  sessionId: string;
  tableId: string;
  lastSequence: number;
}>;

export type ClientListTablesRequest = Readonly<{
  type: 'LIST_TABLES';
  protocolVersion: ProtocolVersion;
}>;

export type ClientCreateTableRequest = Readonly<{
  type: 'CREATE_TABLE';
  protocolVersion: ProtocolVersion;
  requestId: string;
  smallBlind: number;
  bigBlind: number;
  maxPlayers: number;
  startingStack: number;
}>;

export type ClientJoinTableRequest = Readonly<{
  type: 'JOIN_TABLE';
  protocolVersion: ProtocolVersion;
  requestId: string;
  tableId: string;
  seat?: number;
}>;

export type ClientLeaveTableRequest = Readonly<{
  type: 'LEAVE_TABLE';
  protocolVersion: ProtocolVersion;
  requestId: string;
  tableId: string;
}>;

export type ServerActionAccepted = Readonly<{
  type: 'ACTION_ACCEPTED';
  protocolVersion: ProtocolVersion;
  requestId: string;
  tableId: string;
  handId: string;
  sequence: number;
}>;

export type ServerSessionReady = Readonly<{
  type: 'SESSION_READY';
  protocolVersion: ProtocolVersion;
  sessionId: string;
  playerId: string;
}>;

export type ServerResumeAccepted = Readonly<{
  type: 'RESUME_ACCEPTED';
  protocolVersion: ProtocolVersion;
  sessionId: string;
  playerId: string;
  tableId: string;
  sequence: number;
  staleClient: boolean;
}>;

export type ServerTableSummary = Readonly<{
  tableId: string;
  maxPlayers: number;
  seatedPlayers: number;
  smallBlind: number;
  bigBlind: number;
  street: Street;
  handId: string | null;
}>;

export type ServerTableList = Readonly<{
  type: 'TABLE_LIST';
  protocolVersion: ProtocolVersion;
  tables: readonly ServerTableSummary[];
}>;

export type ServerTableCreated = Readonly<{
  type: 'TABLE_CREATED';
  protocolVersion: ProtocolVersion;
  tableId: string;
  sequence: number;
}>;

export type ServerTableJoined = Readonly<{
  type: 'TABLE_JOINED';
  protocolVersion: ProtocolVersion;
  requestId: string;
  tableId: string;
  sequence: number;
}>;

export type ServerTableLeft = Readonly<{
  type: 'TABLE_LEFT';
  protocolVersion: ProtocolVersion;
  requestId: string;
  tableId: string;
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
  | 'INVALID_SESSION'
  | 'TABLE_FULL'
  | 'ALREADY_SEATED'
  | 'SEAT_OCCUPIED'
  | 'INVALID_TABLE_CONFIG'
  | 'CANNOT_LEAVE_DURING_HAND'
  | 'NOT_SEATED'
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
  type: 'TABLE_SNAPSHOT' | 'ACTION_ACCEPTED' | 'SESSION_READY' | 'RESUME_ACCEPTED' | 'TABLE_LIST' | 'TABLE_CREATED' | 'TABLE_JOINED' | 'TABLE_LEFT' | 'ERROR';
  protocolVersion: ProtocolVersion;
  sequence: number;
  payload: TableSnapshot | PrivateTableSnapshot | ServerActionAccepted | ServerSessionReady | ServerResumeAccepted | ServerTableList | ServerTableCreated | ServerTableJoined | ServerTableLeft | ServerError;
}>;
