import { describe, expect, it } from 'vitest';
import { parseClientActionRequest } from '../src/validation.js';

describe('client action validation', () => {
  it('parses a valid request without trusting player identity', () => {
    const request = parseClientActionRequest({
      protocolVersion: 1,
      requestId: 'req-1',
      tableId: 'table-1',
      handId: 'table-1-3',
      action: 'RAISE',
      amount: 400,
      expectedSequence: 12,
      playerId: 'attacker',
    });

    expect(request).toEqual({
      protocolVersion: 1,
      requestId: 'req-1',
      tableId: 'table-1',
      handId: 'table-1-3',
      action: 'RAISE',
      amount: 400,
      expectedSequence: 12,
    });
    expect('playerId' in request).toBe(false);
  });

  it('rejects malformed requests', () => {
    expect(() => parseClientActionRequest(null)).toThrow();
    expect(() => parseClientActionRequest({ protocolVersion: 2 })).toThrow('Unsupported protocol version');
    expect(() => parseClientActionRequest({ protocolVersion: 1, requestId: 'x', tableId: 't', handId: 'h', action: 'HACK' })).toThrow('Invalid action');
    expect(() => parseClientActionRequest({ protocolVersion: 1, requestId: 'x', tableId: 't', handId: 'h', action: 'BET', amount: -1 })).toThrow('Invalid action amount');
  });
});
