import { describe, expect, it } from 'vitest';
import { runSimulation } from '../src/simulation/simulator.js';

describe('large-scale simulation gate', () => {
  it('completes 10,000 nine-player hands without invariant failures', () => {
    const result = runSimulation({
      hands: 10_000,
      players: 9,
      startingStack: 10_000,
      smallBlind: 50,
      seed: 0x51a7e123,
      stressScenarios: true,
    });

    expect(result.handsCompleted).toBe(10_000);
    expect(result.totalActions).toBeGreaterThan(10_000);
    expect(result.maxActionsInHand).toBeLessThan(2_000);
  }, 120_000);
});
