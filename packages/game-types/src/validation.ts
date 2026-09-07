import type { ActionType } from '@poker-night/poker-engine';
import type { ClientActionRequest, ClientCreateTableRequest, ClientJoinTableRequest, ClientListTablesRequest, ClientResumeRequest } from './protocol.js';

const ACTIONS: readonly ActionType[] = ['CHECK', 'BET', 'CALL', 'RAISE', 'FOLD', 'ALL_IN'];
function isNonEmptyString(value: unknown): value is string { return typeof value === 'string' && value.trim().length > 0; }
function isActionType(value: unknown): value is ActionType { return typeof value === 'string' && ACTIONS.includes(value as ActionType); }
function positiveInteger(value: unknown): value is number { return Number.isInteger(value) && (value as number) > 0; }

export function parseClientActionRequest(input: unknown): ClientActionRequest {
  if (!input || typeof input !== 'object') throw new Error('Action request must be an object'); const value = input as Record<string, unknown>;
  if (value.protocolVersion !== 1) throw new Error('Unsupported protocol version'); if (!isNonEmptyString(value.requestId)) throw new Error('requestId is required'); if (!isNonEmptyString(value.tableId)) throw new Error('tableId is required'); if (!isNonEmptyString(value.handId)) throw new Error('handId is required'); if (!isActionType(value.action)) throw new Error('Invalid action');
  if (value.amount !== undefined && (!Number.isInteger(value.amount) || (value.amount as number) < 0)) throw new Error('Invalid action amount'); if (value.expectedSequence !== undefined && (!Number.isInteger(value.expectedSequence) || (value.expectedSequence as number) < 0)) throw new Error('Invalid expected sequence');
  return { protocolVersion: 1, requestId: value.requestId, tableId: value.tableId, handId: value.handId, action: value.action, ...(value.amount === undefined ? {} : { amount: value.amount as number }), ...(value.expectedSequence === undefined ? {} : { expectedSequence: value.expectedSequence as number }) };
}
export function parseClientResumeRequest(input: unknown): ClientResumeRequest {
  if (!input || typeof input !== 'object') throw new Error('Resume request must be an object'); const value = input as Record<string, unknown>;
  if (value.type !== 'RESUME') throw new Error('Invalid resume request type'); if (value.protocolVersion !== 1) throw new Error('Unsupported protocol version'); if (!isNonEmptyString(value.sessionId)) throw new Error('sessionId is required'); if (!isNonEmptyString(value.tableId)) throw new Error('tableId is required'); if (!Number.isInteger(value.lastSequence) || (value.lastSequence as number) < 0) throw new Error('Invalid lastSequence');
  return { type: 'RESUME', protocolVersion: 1, sessionId: value.sessionId, tableId: value.tableId, lastSequence: value.lastSequence as number };
}
export function parseClientListTablesRequest(input: unknown): ClientListTablesRequest {
  if (!input || typeof input !== 'object') throw new Error('List tables request must be an object'); const value = input as Record<string, unknown>; if (value.type !== 'LIST_TABLES') throw new Error('Invalid list tables request type'); if (value.protocolVersion !== 1) throw new Error('Unsupported protocol version'); return { type: 'LIST_TABLES', protocolVersion: 1 };
}
export function parseClientCreateTableRequest(input: unknown): ClientCreateTableRequest {
  if (!input || typeof input !== 'object') throw new Error('Create table request must be an object'); const value = input as Record<string, unknown>;
  if (value.type !== 'CREATE_TABLE') throw new Error('Invalid create table request type'); if (value.protocolVersion !== 1) throw new Error('Unsupported protocol version'); if (!isNonEmptyString(value.requestId)) throw new Error('requestId is required');
  if (!positiveInteger(value.smallBlind) || !positiveInteger(value.bigBlind) || value.bigBlind !== (value.smallBlind as number) * 2) throw new Error('Invalid blind configuration');
  if (!Number.isInteger(value.maxPlayers) || (value.maxPlayers as number) < 2 || (value.maxPlayers as number) > 9) throw new Error('Invalid maxPlayers'); if (!positiveInteger(value.startingStack)) throw new Error('Invalid startingStack');
  return { type: 'CREATE_TABLE', protocolVersion: 1, requestId: value.requestId, smallBlind: value.smallBlind as number, bigBlind: value.bigBlind as number, maxPlayers: value.maxPlayers as number, startingStack: value.startingStack as number };
}
export function parseClientJoinTableRequest(input: unknown): ClientJoinTableRequest {
  if (!input || typeof input !== 'object') throw new Error('Join table request must be an object'); const value = input as Record<string, unknown>;
  if (value.type !== 'JOIN_TABLE') throw new Error('Invalid join table request type'); if (value.protocolVersion !== 1) throw new Error('Unsupported protocol version'); if (!isNonEmptyString(value.requestId)) throw new Error('requestId is required'); if (!isNonEmptyString(value.tableId)) throw new Error('tableId is required');
  if (value.seat !== undefined && (!Number.isInteger(value.seat) || (value.seat as number) < 0 || (value.seat as number) > 8)) throw new Error('Invalid seat');
  return { type: 'JOIN_TABLE', protocolVersion: 1, requestId: value.requestId, tableId: value.tableId, ...(value.seat === undefined ? {} : { seat: value.seat as number }) };
}
