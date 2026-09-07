import { Deck, CryptoRandom, type RandomSource } from '../cards/deck.js';
import { buildPots } from '../pots/side-pots.js';
import { settle } from './settlement.js';
import type { Action, PlayerState, TableEvent, TableState } from './types.js';

export class PokerTable {
  readonly state: TableState;
  private deck: Deck | null = null;
  private handSequence = 0;
  private readonly random: RandomSource;

  constructor(
    tableId: string,
    smallBlind: number,
    bigBlind: number,
    maxPlayers = 9,
    random: RandomSource = new CryptoRandom(),
  ) {
    if (!tableId.trim()) throw new Error('Table id is required');
    if (maxPlayers < 2 || maxPlayers > 9 || !Number.isInteger(maxPlayers)) throw new Error('Texas Hold’em tables support 2-9 players');
    if (!Number.isInteger(smallBlind) || !Number.isInteger(bigBlind) || smallBlind <= 0 || bigBlind !== smallBlind * 2) throw new Error('Blinds must be positive integers with a 1:2 ratio');
    this.random = random;
    this.state = { tableId, handId: null, maxPlayers, players: [], dealerButton: -1, smallBlind, bigBlind, communityCards: [], street: 'WAITING', currentPlayerId: null, currentBet: 0, minRaise: bigBlind, pots: [], actionDeadline: null, winners: [], events: [] };
  }

  seatPlayer(playerId: string, seat: number, stack: number): void {
    if (this.state.street !== 'WAITING' && this.state.street !== 'HAND_COMPLETE') throw new Error('Cannot seat during a hand');
    if (!playerId.trim()) throw new Error('Player id is required');
    if (this.state.players.some((p) => p.playerId === playerId)) throw new Error('Player already seated');
    if (this.state.players.some((p) => p.seat === seat)) throw new Error('Seat occupied');
    if (!Number.isInteger(seat) || seat < 0 || seat >= this.state.maxPlayers || !Number.isInteger(stack) || stack < 0) throw new Error('Invalid seat or stack');
    this.state.players.push({ playerId, seat, stack, holeCards: [], currentBet: 0, totalContribution: 0, status: 'WAITING', hasActed: false, canRaise: true });
    this.state.players.sort((a, b) => a.seat - b.seat);
  }

  startHand(): void {
    if (this.state.street !== 'WAITING' && this.state.street !== 'HAND_COMPLETE') throw new Error('Hand already in progress');
    const funded = this.state.players.filter((p) => p.stack > 0).sort((a, b) => a.seat - b.seat);
    if (funded.length < 2) throw new Error('At least two funded players are required');
    this.handSequence += 1;
    this.state.handId = `${this.state.tableId}-${this.handSequence}`;
    this.state.street = 'PRE_FLOP'; this.state.communityCards = []; this.state.currentBet = 0; this.state.minRaise = this.state.bigBlind;
    this.state.pots = []; this.state.winners = []; this.state.actionDeadline = null; this.deck = Deck.standard().shuffle(this.random);
    this.state.dealerButton = this.nextFundedSeat(this.state.dealerButton);
    for (const player of this.state.players) { player.holeCards = []; player.currentBet = 0; player.totalContribution = 0; player.hasActed = false; player.canRaise = true; player.status = player.stack > 0 ? 'ACTIVE' : 'OUT'; }
    const active = this.activePlayers();
    const smallBlindPlayer = this.nextActive(this.state.dealerButton);
    const bigBlindPlayer = this.nextActive(smallBlindPlayer.seat);
    this.recordEvent({ type: 'HAND_CREATED' });
    this.postBlind(smallBlindPlayer, this.state.smallBlind); this.postBlind(bigBlindPlayer, this.state.bigBlind);
    this.recordEvent({ type: 'BLINDS_POSTED', playerId: smallBlindPlayer.playerId, amount: this.state.smallBlind });
    this.recordEvent({ type: 'BLINDS_POSTED', playerId: bigBlindPlayer.playerId, amount: this.state.bigBlind });
    this.dealHoleCards(active);
    this.recordEvent({ type: 'CARDS_DEALT' });
    this.state.currentBet = Math.max(...active.map((p) => p.currentBet));
    this.state.currentPlayerId = this.nextActionableId(bigBlindPlayer.seat);
    if (this.state.currentPlayerId === null) this.runoutToShowdown();
  }

  act(action: Action): void {
    const player = this.state.players.find((p) => p.playerId === action.playerId);
    const inBettingStreet = this.state.street === 'PRE_FLOP' || this.state.street === 'FLOP' || this.state.street === 'TURN' || this.state.street === 'RIVER';
    if (!player || player.status !== 'ACTIVE' || !inBettingStreet || this.state.currentPlayerId !== player.playerId) throw new Error('Not a legal acting player');
    const amount = action.amount ?? 0;
    switch (action.type) {
      case 'FOLD': player.status = 'FOLDED'; player.hasActed = true; player.canRaise = false; break;
      case 'CHECK': if (player.currentBet !== this.state.currentBet) throw new Error('Cannot check facing a bet'); player.hasActed = true; break;
      case 'CALL': { const toCall = this.state.currentBet - player.currentBet; if (toCall < 0) throw new Error('Invalid table bet state'); this.putChips(player, Math.min(toCall, player.stack)); player.hasActed = true; break; }
      case 'BET':
      case 'RAISE': this.raiseTo(player, amount); break;
      case 'ALL_IN': this.allIn(player); break;
      default: throw new Error('Unsupported action');
    }
    this.recordEvent({ type: 'PLAYER_ACTION', playerId: player.playerId, action: action.type, amount });
    this.advanceOrNext();
  }

  private raiseTo(player: PlayerState, target: number): void {
    if (!player.canRaise) throw new Error('Betting has not been reopened for this player');
    if (!Number.isInteger(target) || target <= player.currentBet) throw new Error('Invalid wager amount');
    if (target > player.currentBet + player.stack) throw new Error('Insufficient stack');
    const previousBet = this.state.currentBet;
    const raiseSize = target - previousBet;
    const isOpeningBet = previousBet === 0;
    const allIn = target === player.currentBet + player.stack;
    if (isOpeningBet && target < this.state.minRaise && !allIn) throw new Error('Bet is below minimum bet');
    if (!isOpeningBet && raiseSize < this.state.minRaise && !allIn) throw new Error('Raise is below minimum raise');
    const hadAlreadyActed = new Map(this.actionablePlayers().map((p) => [p.playerId, p.hasActed]));
    this.putChips(player, target - player.currentBet); player.hasActed = true;
    if (target > previousBet) this.state.currentBet = target;
    const fullRaise = raiseSize >= this.state.minRaise;
    if (fullRaise) { this.state.minRaise = raiseSize; for (const other of this.actionablePlayers()) { other.canRaise = true; if (other.playerId !== player.playerId) other.hasActed = false; } }
    else if (allIn && raiseSize > 0) for (const other of this.actionablePlayers()) if (hadAlreadyActed.get(other.playerId)) other.canRaise = false;
  }

  private allIn(player: PlayerState): void {
    if (player.stack <= 0) throw new Error('Player has no chips to move all-in');
    const previousBet = this.state.currentBet;
    const resultingBet = player.currentBet + player.stack;
    const raiseSize = resultingBet - previousBet;
    const hadAlreadyActed = new Map(this.actionablePlayers().map((p) => [p.playerId, p.hasActed]));
    this.putChips(player, player.stack); player.hasActed = true; player.canRaise = false;
    if (resultingBet > previousBet) {
      this.state.currentBet = resultingBet;
      if (raiseSize >= this.state.minRaise) { this.state.minRaise = raiseSize; for (const other of this.actionablePlayers()) { other.canRaise = true; if (other.playerId !== player.playerId) other.hasActed = false; } }
      else for (const other of this.actionablePlayers()) if (hadAlreadyActed.get(other.playerId)) other.canRaise = false;
    }
  }

  private putChips(player: PlayerState, amount: number): void {
    if (!Number.isInteger(amount) || amount < 0 || amount > player.stack) throw new Error('Invalid chip amount');
    player.stack -= amount; player.currentBet += amount; player.totalContribution += amount;
    if (player.stack === 0) player.status = 'ALL_IN';
  }

  private postBlind(player: PlayerState, blind: number): void { this.putChips(player, Math.min(blind, player.stack)); }

  private advanceOrNext(): void {
    if (this.livePlayers().length <= 1) { this.awardUncontested(); return; }
    const actionable = this.actionablePlayers();
    if (actionable.length === 0) { this.runoutToShowdown(); return; }
    const bettingRoundComplete = actionable.every((player) => player.hasActed && player.currentBet === this.state.currentBet);
    if (bettingRoundComplete) { this.dealNextStreet(); return; }
    this.state.currentPlayerId = this.nextActionableId(this.playerSeat(this.state.currentPlayerId));
    if (this.state.currentPlayerId === null) this.runoutToShowdown();
  }

  private dealNextStreet(): void {
    if (!this.deck) throw new Error('No deck');
    for (const player of this.state.players) { if (player.status === 'ACTIVE') { player.hasActed = false; player.canRaise = true; } player.currentBet = 0; }
    this.state.currentBet = 0; this.state.minRaise = this.state.bigBlind;
    if (this.state.street === 'PRE_FLOP') { this.deck.draw(1); this.state.communityCards.push(...this.deck.draw(3)); this.state.street = 'FLOP'; this.recordEvent({ type: 'FLOP_DEALT' }); }
    else if (this.state.street === 'FLOP') { this.deck.draw(1); this.state.communityCards.push(...this.deck.draw(1)); this.state.street = 'TURN'; this.recordEvent({ type: 'TURN_DEALT' }); }
    else if (this.state.street === 'TURN') { this.deck.draw(1); this.state.communityCards.push(...this.deck.draw(1)); this.state.street = 'RIVER'; this.recordEvent({ type: 'RIVER_DEALT' }); }
    else if (this.state.street === 'RIVER') { this.state.street = 'SHOWDOWN'; this.state.currentPlayerId = null; this.showdownAndSettle(); return; }
    else throw new Error('Cannot deal the next street from the current state');
    this.state.currentPlayerId = this.nextActionableId(this.state.dealerButton);
  }

  private runoutToShowdown(): void {
    while (this.state.street !== 'RIVER' && this.state.street !== 'SHOWDOWN') this.dealNextStreet();
    if (this.state.street === 'RIVER') this.dealNextStreet();
    if (this.state.street === 'SHOWDOWN') this.showdownAndSettle();
  }

  private showdownAndSettle(): void {
    this.state.street = 'SHOWDOWN'; this.state.currentPlayerId = null; this.state.pots = this.buildCurrentPots(); this.recordEvent({ type: 'SHOWDOWN' });
    this.state.street = 'SETTLEMENT';
    const winners = settle(this.state.players, this.state.communityCards, this.state.dealerButton); this.state.winners = winners;
    for (const winner of winners) { const player = this.state.players.find((p) => p.playerId === winner.playerId); if (player) player.stack += winner.amount; }
    this.recordEvent({ type: 'POT_SETTLED' }); this.state.street = 'HAND_COMPLETE'; this.state.currentPlayerId = null; this.recordEvent({ type: 'HAND_COMPLETED' });
  }

  private awardUncontested(): void {
    const winner = this.livePlayers()[0]; if (!winner) throw new Error('Cannot settle a hand without a live player');
    this.state.pots = this.buildCurrentPots(); const amount = this.state.players.reduce((sum, player) => sum + player.totalContribution, 0);
    winner.stack += amount; this.state.winners = [{ playerId: winner.playerId, amount, category: 'UNCONTESTED' }]; this.state.street = 'SETTLEMENT'; this.state.currentPlayerId = null;
    this.recordEvent({ type: 'POT_SETTLED', playerId: winner.playerId, amount }); this.state.street = 'HAND_COMPLETE'; this.recordEvent({ type: 'HAND_COMPLETED', playerId: winner.playerId, amount });
  }

  private buildCurrentPots(): TableState['pots'] { return buildPots(this.state.players.map((player) => ({ playerId: player.playerId, amount: player.totalContribution, folded: player.status === 'FOLDED' }))); }

  private dealHoleCards(players: PlayerState[]): void {
    if (!this.deck) throw new Error('No deck');
    const ordered = [...players].sort((a, b) => a.seat - b.seat);
    const first = this.nextActive(this.state.dealerButton);
    const start = ordered.findIndex((player) => player.playerId === first.playerId);
    if (start < 0) throw new Error('Unable to determine dealing order');
    for (let round = 0; round < 2; round += 1) for (let offset = 0; offset < ordered.length; offset += 1) ordered[(start + offset) % ordered.length]!.holeCards.push(...this.deck.draw(1));
  }

  private activePlayers(): PlayerState[] { return this.state.players.filter((p) => p.status !== 'OUT' && p.status !== 'FOLDED'); }
  private livePlayers(): PlayerState[] { return this.activePlayers(); }
  private actionablePlayers(): PlayerState[] { return this.state.players.filter((p) => p.status === 'ACTIVE'); }
  private nextFundedSeat(seat: number): number { const seats = this.state.players.filter((p) => p.stack > 0).map((p) => p.seat).sort((a, b) => a - b); return seats.find((candidate) => candidate > seat) ?? seats[0]!; }
  private nextActive(seat: number): PlayerState { const players = this.activePlayers().sort((a, b) => a.seat - b.seat); return players.find((p) => p.seat > seat) ?? players[0]!; }
  private nextActionableId(seat: number): string | null { const players = this.actionablePlayers().sort((a, b) => a.seat - b.seat); if (!players.length) return null; return (players.find((p) => p.seat > seat) ?? players[0]!).playerId; }
  private playerSeat(playerId: string | null): number { if (!playerId) return this.state.dealerButton; return this.state.players.find((p) => p.playerId === playerId)?.seat ?? this.state.dealerButton; }
  private recordEvent(event: Omit<TableEvent, 'handId' | 'timestamp'>): void { if (!this.state.handId) return; this.state.events.push({ ...event, handId: this.state.handId, timestamp: Date.now() }); }
}
