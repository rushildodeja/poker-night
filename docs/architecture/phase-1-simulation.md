# Phase 1 — Deterministic Simulation Harness

The poker engine now includes a deterministic, large-scale simulation harness used only as engineering test infrastructure.

## Purpose

The harness exercises the real `PokerTable` implementation with thousands of legal actions and verifies invariants after every action. It is not a product bot or AI player system.

## Determinism

`SeededRandom` provides deterministic choices for simulation policy decisions and is injected into `PokerTable` as a `RandomSource`.

Production gameplay still defaults to `CryptoRandom` for deck shuffling. The seeded PRNG must never be used for production card randomness.

## Invariants checked

After every action:

- player IDs and seats remain unique
- stacks, bets, and contributions remain non-negative integers
- an `ALL_IN` player has zero chips remaining
- no card is dealt twice
- no more than 52 cards exist in the table state
- every dealt player has exactly two hole cards
- community-card count matches the street
- stack total + hand contributions equals the initial chip total
- settled pots equal total contributions
- completed-hand payouts equal total contributions
- completed hands have no acting player

## Stress scenarios

The harness deterministically rotates through:

- balanced random play
- fold-heavy play
- all-in pressure
- short-stack pressure
- multi-side-pot pressure

These scenarios deliberately exercise difficult betting and settlement paths without adding any bot capability to the product.

## Reproduction

Every run has a seed. If a failure occurs, the error includes the hand number and seed so the same run can be replayed.

## Local commands

```bash
cd packages/poker-engine
npm test
npm run test:stress
npm run typecheck
```

`test:stress` runs 10,000 nine-player hands with invariant checks after every action.

## CI

A manual GitHub Actions workflow at `.github/workflows/simulation-stress.yml` runs the 10,000-hand gate after installing dependencies and typechecking the engine.
