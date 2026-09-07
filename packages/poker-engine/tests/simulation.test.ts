import { describe, expect, it } from 'vitest';
import { runSimulation } from '../src/simulation/simulator.js';

describe('large-scale poker simulation', () => {
  it('completes a deterministic 9-player stress run', () => {
    const first = runSimulation({ hands: 500, players: 9, seed: 0xdecafbad, stressScenarios: true });
    const second = runSimulation({ hands: 500, players: 9, seed: 0xdecafbad, stressScenarios: true });

    expect(first).toEqual(second);
    expect(first.handsCompleted).toBe(500);
    expect(first.totalActions).toBeGreaterThan(500);
    expect(first.maxActionsInHand).toBeLessThan(2_000);
    expect(Object.keys(first.scenarioCounts)).toEqual(
      expect.arrayContaining(['BALANCED', 'FOLD_HEAVY', 'ALL_IN_PRESSURE', 'SHORT_STACKS', 'MULTI_SIDE_POT']),
    );
  });

  it('runs the production table with a reproducible seed', () => {
    const result = runSimulation({ hands: 100, players: 2, seed: 123456789, stressScenarios: false });
    expect(result.handsCompleted).toBe(100);
    expect(result.totalActions).toBeGreaterThan(0);
  });
});
