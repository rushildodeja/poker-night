import type { ActionType } from '@poker-night/poker-engine';
import type { ClientActionRequest } from './protocol.js';

const ACTIONS: readonly ActionType[] = ['CHECK', 'BET', 'CALL', 'RAISE', 'FOLD', 'ALL_IN'];

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isActionType(value: unknown): value is ActionType {
  return typeof value === 'string' && ACTIONS.includes(value as ActionType);
}

export function parseClientActionRequest(input: unknown): ClientActionRequest {
  if (!input || typeof input !== 'object') throw new Error('Action request must be an object');
  const value = input as Record<string, unknown>;

  if (value.protocolVersion !== 1) throw new Error('Unsupported protocol version');
  if (!isNonEmptyString(value.requestId)) throw new Error('requestId is required');
  if (!isNonEmptyString(value.tableId)) throw new Error('tableId is required');
  if (!isNonEmptyString(value.handId)) throw new Error('handId is required');
  if (!isActionType(value.action)) throw new Error('Invalid action');
  if (value.amount !== undefined && (!Number.isInteger(value.amount) || (value.amount as number) < 0)) throw new Error('Invalid action amount');
  if (value.expectedSequence !== undefined && (!Number.isInteger(value.expectedSequence) || (value.expectedSequence as number) < 0)) throw new Error('Invalid expected sequence');

  return {
    protocolVersion: 1,
    requestId: value.requestId,
    tableId: value.tableId,
    handId: value.handId,
    action: value.action,
    ...(value.amount === undefined ? {} : { amount: value.amount as number }),
    ...(value.expectedSequence === undefined ? {} : { expectedSequence: value.expectedSequence as number }),
  };
}
