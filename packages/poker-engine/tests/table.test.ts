import { describe, expect, it } from 'vitest';
import { PokerTable } from '../src/table/table.js';

describe('PokerTable',()=>{
  it('starts a real-player heads-up hand with two cards each',()=>{
    const table=new PokerTable('table-1',5,10,2);
    table.seatPlayer('alice',0,100);
    table.seatPlayer('bob',1,100);
    table.startHand();
    expect(table.state.street).toBe('PRE_FLOP');
    expect(table.state.players.every(p=>p.holeCards.length===2)).toBe(true);
    expect(table.state.players.reduce((n,p)=>n+p.currentBet,0)).toBe(15);
    expect(table.state.currentPlayerId).toBeTruthy();
  });

  it('rejects actions from the wrong player',()=>{
    const table=new PokerTable('table-2',5,10,2);
    table.seatPlayer('alice',0,100); table.seatPlayer('bob',1,100); table.startHand();
    const wrong=table.state.players.find(p=>p.playerId!==table.state.currentPlayerId)!;
    expect(()=>table.act({playerId:wrong.playerId,type:'FOLD'})).toThrow('Not a legal acting player');
  });
});
