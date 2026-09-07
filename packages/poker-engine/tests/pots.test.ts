import { describe, expect, it } from 'vitest';
import { buildPots } from '../src/pots/side-pots.js';

describe('side pots',()=>{
  it('builds layered pots from unequal contributions',()=>{
    const pots=buildPots([
      {playerId:'a',amount:100,folded:false},
      {playerId:'b',amount:60,folded:false},
      {playerId:'c',amount:20,folded:true},
    ]);
    expect(pots).toEqual([
      {amount:60,eligiblePlayerIds:['a','b']},
      {amount:80,eligiblePlayerIds:['a','b']},
      {amount:40,eligiblePlayerIds:['a']},
    ]);
  });
});
