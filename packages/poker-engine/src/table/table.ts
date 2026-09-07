import { randomUUID } from 'node:crypto';
import { Deck } from '../cards/deck.js';
import { buildPots } from '../pots/side-pots.js';
import type { Action, PlayerState, Street, TableState } from './types.js';

export class PokerTable {
  readonly state: TableState;
  private deck: Deck | null = null;

  constructor(tableId: string, smallBlind: number, bigBlind: number, maxPlayers = 9) {
    if (maxPlayers < 2 || maxPlayers > 9) throw new Error('Texas Hold’em tables support 2-9 players');
    if (smallBlind <= 0 || bigBlind !== smallBlind * 2) throw new Error('Blinds must be positive and 1:2');
    this.state = { tableId, handId: null, maxPlayers, players: [], dealerButton: -1, smallBlind, bigBlind,
      communityCards: [], street: 'WAITING', currentPlayerId: null, currentBet: 0, minRaise: bigBlind,
      pots: [], actionDeadline: null };
  }

  seatPlayer(playerId: string, seat: number, stack: number): void {
    if (this.state.street !== 'WAITING' && this.state.street !== 'HAND_COMPLETE') throw new Error('Cannot seat during a hand');
    if (this.state.players.some(p => p.playerId === playerId)) throw new Error('Player already seated');
    if (this.state.players.some(p => p.seat === seat)) throw new Error('Seat occupied');
    if (seat < 0 || seat >= this.state.maxPlayers || stack < 0) throw new Error('Invalid seat or stack');
    this.state.players.push({ playerId, seat, stack, holeCards: [], currentBet: 0, totalContribution: 0, status: 'WAITING', hasActed: false });
  }

  startHand(): void {
    const players = this.state.players.filter(p => p.stack > 0).sort((a,b)=>a.seat-b.seat);
    if (players.length < 2) throw new Error('At least two funded players are required');
    this.state.handId = randomUUID(); this.state.street = 'PRE_FLOP'; this.state.communityCards = [];
    this.state.currentBet = this.state.bigBlind; this.state.minRaise = this.state.bigBlind;
    this.deck = Deck.standard().shuffle();
    this.state.dealerButton = this.nextSeat(this.state.dealerButton);
    for (const p of this.state.players) { p.holeCards=[]; p.currentBet=0; p.totalContribution=0; p.hasActed=false; p.status=p.stack>0?'ACTIVE':'OUT'; }
    const active = this.activePlayers();
    const sb = active.length === 2 ? this.nextActive(this.state.dealerButton) : this.nextActive(this.state.dealerButton);
    const bb = this.nextActive(sb);
    this.postBlind(sb, this.state.smallBlind); this.postBlind(bb, this.state.bigBlind);
    for (const p of active) p.holeCards.push(...this.deck.draw(2));
    this.state.currentPlayerId = this.nextActiveId(bb);
  }

  act(action: Action): void {
    const p = this.state.players.find(x=>x.playerId===action.playerId);
    if (!p || p.status !== 'ACTIVE' || this.state.currentPlayerId !== p.playerId) throw new Error('Not a legal acting player');
    const amount = action.amount ?? 0;
    if (action.type === 'FOLD') p.status='FOLDED';
    else if (action.type === 'CHECK') { if (this.state.currentBet !== p.currentBet) throw new Error('Cannot check facing a bet'); }
    else if (action.type === 'CALL') this.putChips(p, Math.min(this.state.currentBet-p.currentBet, p.stack));
    else if (action.type === 'BET' || action.type === 'RAISE') this.raiseTo(p, amount);
    else if (action.type === 'ALL_IN') this.putChips(p, p.stack);
    else throw new Error('Unsupported action');
    p.hasActed=true;
    if (this.activePlayers().filter(x=>x.status==='ACTIVE').length <= 1) { this.state.street='SHOWDOWN'; return; }
    this.advanceOrNext();
  }

  private raiseTo(p: PlayerState, target: number): void {
    if (target <= this.state.currentBet) throw new Error('Raise must exceed current bet');
    const raiseSize = target - this.state.currentBet;
    if (raiseSize < this.state.minRaise && target < p.currentBet + p.stack) throw new Error('Raise is below minimum raise');
    this.putChips(p, target-p.currentBet); this.state.minRaise=raiseSize; this.state.currentBet=Math.max(this.state.currentBet,target);
  }

  private putChips(p: PlayerState, amount: number): void {
    if (!Number.isInteger(amount) || amount < 0 || amount > p.stack) throw new Error('Invalid chip amount');
    p.stack-=amount; p.currentBet+=amount; p.totalContribution+=amount;
    if (p.stack===0) p.status='ALL_IN';
    this.state.currentBet=Math.max(this.state.currentBet,p.currentBet);
  }

  private postBlind(p: PlayerState, blind: number): void { this.putChips(p, Math.min(blind,p.stack)); }

  private advanceOrNext(): void {
    const contenders=this.state.players.filter(p=>p.status==='ACTIVE');
    const live=contenders.length;
    const needAction=contenders.some(p=>!p.hasActed || p.currentBet<this.state.currentBet);
    if (live > 0 && !needAction) { this.dealStreet(); return; }
    this.state.currentPlayerId=this.nextActiveId(this.state.currentPlayerId!);
  }

  private dealStreet(): void {
    if (!this.deck) throw new Error('No deck');
    for (const p of this.state.players) p.hasActed=false;
    if (this.state.street==='PRE_FLOP') { this.deck.draw(1); this.state.communityCards.push(...this.deck.draw(3)); this.state.street='FLOP'; }
    else if (this.state.street==='FLOP') { this.deck.draw(1); this.state.communityCards.push(...this.deck.draw(1)); this.state.street='TURN'; }
    else if (this.state.street==='TURN') { this.deck.draw(1); this.state.communityCards.push(...this.deck.draw(1)); this.state.street='RIVER'; }
    else { this.state.street='SHOWDOWN'; return; }
    this.state.currentBet=0; this.state.minRaise=this.state.bigBlind;
    for (const p of this.state.players) p.currentBet=0;
    this.state.currentPlayerId=this.nextActiveId(this.state.dealerButton);
  }

  private activePlayers(): PlayerState[] { return this.state.players.filter(p=>p.status!=='OUT' && p.status!=='FOLDED'); }
  private nextSeat(seat: number): number { const seats=this.state.players.filter(p=>p.stack>0).map(p=>p.seat).sort((a,b)=>a-b); return seats.find(s=>s>seat) ?? seats[0]!; }
  private nextActiveId(from: number): string { return this.nextActive(from).playerId; }
  private nextActive(from: number): PlayerState { const ps=this.activePlayers().sort((a,b)=>a.seat-b.seat); const found=ps.find(p=>p.seat>from); return found ?? ps[0]!; }
}
