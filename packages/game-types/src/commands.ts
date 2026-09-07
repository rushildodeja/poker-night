import type { ActionType } from '@poker-night/poker-engine';

/** Internal command after the WebSocket/session identity has been authenticated. */
export type AuthenticatedActionCommand = Readonly<{
  requestId: string;
  authenticatedPlayerId: string;
  tableId: string;
  handId: string;
  action: ActionType;
  amount?: number;
  expectedSequence?: number;
}>;

export type CommandRejection = Readonly<{
  requestId: string;
  code:
    | 'STALE_HAND'
    | 'STALE_SEQUENCE'
    | 'DUPLICATE_REQUEST'
    | 'NOT_YOUR_TURN'
    | 'INVALID_ACTION'
    | 'TABLE_NOT_FOUND'
    | 'PLAYER_NOT_SEATED'
    | 'UNAUTHORIZED';
  message: string;
}>;
