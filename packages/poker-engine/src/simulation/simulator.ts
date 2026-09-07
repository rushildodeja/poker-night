import type { Action, PlayerState, TableState } from '../table/types.js';
import { PokerTable } from '../table/table.js';
import { SeededRandom } from './prng.js';
import { assertTableInvariant } from './invariants.js';

export type SimulationConfig = Readonly<{
  hands: number;
  players: number;
  startingStack?: number;
  smallBlind?: number;
  seed?: number;
  /** Enable additional stress scenarios at deterministic hand intervals. */
  stressScenarios?: boolean;
}>;

export type SimulationResult = Readonly<{
  seed: number;
  handsCompleted: number;
  totalActions: number;
  maxActionsInHand: number;
  scenarioCounts: Readonly<Record<string, number>>;
}>;

type Scenario = 'BALANCED' | 'FOLD_HEAVY' | 'ALL_IN_PRESSURE' | 'SHORT_STACKS' | 'MULTI_SIDE_POT';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function runSimulation(config: SimulationConfig): SimulationResult {
  validateConfig(config);

  const seed = config.seed ?? 0x504f4b45;
  const random = new SeededRandom(seed);
  const startingStack = config.startingStack ?? 10_000;
  const smallBlind = config.smallBlind ?? 50;
  const bigBlind = smallBlind * 2;
  const expectedChipTotal = config.players * startingStack;
  const scenarioCounts: Record<string, number> = {};
  let totalActions = 0;
  let maxActionsInHand = 0;
  let handsCompleted = 0;

  const table = new PokerTable(`simulation-${seed}`, smallBlind, bigBlind, config.players, random);
  for (let seat = 0; seat < config.players; seat += 1) {
    table.seatPlayer(`sim-${seat}`, seat, startingStack);
  }

  for (let hand = 0; hand < config.hands; hand += 1) {
    if (table.state.players.filter((p) => p.stack > 0).length < 2) {
      resetBustedPlayers(table.state.players, startingStack);
    }

    const scenario = selectScenario(hand, config.stressScenarios !== false);
    scenarioCounts[scenario] = (scenarioCounts[scenario] ?? 0) + 1;
    table.startHand();
    assertTableInvariant(table.state, expectedChipTotal);

    let actionsThisHand = 0;
    const actionLimit = 2_000;
    while (table.state.street !== 'HAND_COMPLETE') {
      assert(actionsThisHand < actionLimit, `Hand ${hand} exceeded ${actionLimit} actions; seed=${seed}`);
      const player = currentPlayer(table.state);
      const action = chooseAction(table.state, player, scenario, random);
      table.act(action);
      actionsThisHand += 1;
      totalActions += 1;
      assertTableInvariant(table.state, expectedChipTotal);
    }

    assert(table.state.communityCards.length === 5 || table.state.winners.every((winner) => winner.category === 'UNCONTESTED'), `Hand ${hand} ended without a complete board or uncontested win`);
    maxActionsInHand = Math.max(maxActionsInHand, actionsThisHand);
    handsCompleted += 1;
  }

  return { seed, handsCompleted, totalActions, maxActionsInHand, scenarioCounts };
}

function validateConfig(config: SimulationConfig): void {
  if (!Number.isInteger(config.hands) || config.hands <= 0) throw new Error('Simulation hands must be a positive integer');
  if (!Number.isInteger(config.players) || config.players < 2 || config.players > 9) throw new Error('Simulation players must be between 2 and 9');
  if (config.startingStack !== undefined && (!Number.isInteger(config.startingStack) || config.startingStack <= 0)) throw new Error('Starting stack must be a positive integer');
  if (config.smallBlind !== undefined && (!Number.isInteger(config.smallBlind) || config.smallBlind <= 0)) throw new Error('Small blind must be a positive integer');
  if (config.seed !== undefined && (!Number.isInteger(config.seed) || config.seed < 0 || config.seed > 0xffffffff)) throw new Error('Seed must be an unsigned 32-bit integer');
}

function selectScenario(hand: number, enabled: boolean): Scenario {
  if (!enabled) return 'BALANCED';
  if (hand % 31 === 0) return 'MULTI_SIDE_POT';
  if (hand % 17 === 0) return 'ALL_IN_PRESSURE';
  if (hand % 11 === 0) return 'SHORT_STACKS';
  if (hand % 7 === 0) return 'FOLD_HEAVY';
  return 'BALANCED';
}

function currentPlayer(state: TableState): PlayerState {
  if (!state.currentPlayerId) throw new Error(`Missing current player in ${state.street}`);
  const player = state.players.find((candidate) => candidate.playerId === state.currentPlayerId);
  if (!player) throw new Error(`Current player ${state.currentPlayerId} not found`);
  return player;
}

function chooseAction(state: TableState, player: PlayerState, scenario: Scenario, random: SeededRandom): Action {
  const toCall = Math.max(0, state.currentBet - player.currentBet);
  const remainingAfterCall = player.stack - toCall;
  const canCall = toCall <= player.stack;
  const maxTarget = player.currentBet + player.stack;
  const minRaiseTarget = state.currentBet === 0 ? state.minRaise : state.currentBet + state.minRaise;
  const canFullRaise = player.canRaise && maxTarget >= minRaiseTarget;
  const canShortAllIn = player.stack > 0 && maxTarget > state.currentBet;

  if (scenario === 'ALL_IN_PRESSURE' && player.stack > 0 && random.nextInt(100) < 55) {
    return { playerId: player.playerId, type: 'ALL_IN' };
  }

  if (scenario === 'MULTI_SIDE_POT' && player.stack > 0) {
    // Periodically create staggered all-ins. The random threshold keeps the
    // scenario legal while producing many unequal contribution layers.
    if (player.stack <= state.bigBlind * 8 || random.nextInt(100) < 28) {
      return { playerId: player.playerId, type: 'ALL_IN' };
    }
  }

  if (scenario === 'SHORT_STACKS' && player.stack <= state.bigBlind * 6 && player.stack > 0) {
    if (canShortAllIn && random.nextInt(100) < 75) return { playerId: player.playerId, type: 'ALL_IN' };
  }

  const roll = random.nextInt(100);

  if (toCall === 0) {
    if (canFullRaise && roll < 25) {
      return { playerId: player.playerId, type: 'BET', amount: chooseRaiseTarget(state, player, minRaiseTarget, maxTarget, random) };
    }
    if (roll < 3 && player.stack > 0) return { playerId: player.playerId, type: 'ALL_IN' };
    return { playerId: player.playerId, type: 'CHECK' };
  }

  if (roll < 8) return { playerId: player.playerId, type: 'FOLD' };
  if (roll < 55 && canCall) return { playerId: player.playerId, type: 'CALL' };
  if (canFullRaise && roll < 88) {
    return { playerId: player.playerId, type: 'RAISE', amount: chooseRaiseTarget(state, player, minRaiseTarget, maxTarget, random) };
  }
  if (canShortAllIn) return { playerId: player.playerId, type: 'ALL_IN' };
  if (canCall) return { playerId: player.playerId, type: 'CALL' };
  return { playerId: player.playerId, type: 'FOLD' };
}

function chooseRaiseTarget(
  state: TableState,
  player: PlayerState,
  minimumTarget: number,
  maximumTarget: number,
  random: SeededRandom,
): number {
  if (maximumTarget <= minimumTarget) return maximumTarget;
  const span = maximumTarget - minimumTarget;
  const multiplier = 1 + random.nextInt(3);
  const target = minimumTarget + Math.floor((span * multiplier) / 5);
  return Math.min(maximumTarget, Math.max(minimumTarget, target));
}

function resetBustedPlayers(players: PlayerState[], startingStack: number): void {
  for (const player of players) {
    if (player.stack === 0) player.stack = startingStack;
  }
}
