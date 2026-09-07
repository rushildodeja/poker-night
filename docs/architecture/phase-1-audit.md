# Phase 1 Engine Audit

## Scope

This audit covers the framework-independent Texas Hold'em engine before it is used by the real-time multiplayer server.

### Hardened areas

- 52-card deck integrity and secure randomness abstraction
- 5-card hand evaluation and best-of-7 evaluation
- ace-low straights and kicker comparison
- main-pot and side-pot construction
- folded-player eligibility
- deterministic split-pot odd-chip allocation
- server-side action validation
- all-in players excluded from future action
- minimum-bet and minimum-raise validation
- short all-in re-opening rules
- betting-round reset and street transitions
- uncontested fold settlement
- chip-conservation invariants
- hand event history
- input validation for seats, stacks, blinds, and contributions

## Betting invariants

1. A player can act only when `currentPlayerId` matches their player id and they are `ACTIVE`.
2. `ALL_IN`, `FOLDED`, and `OUT` players are never selected as the next actor.
3. A normal full raise reopens raising for all remaining active players.
4. A short all-in raise does not reopen raising for players who already acted and are not otherwise facing a full raise.
5. Players who have not yet acted retain their ability to raise after a short all-in.
6. A call never removes a player's future right to raise if action returns to them later in the same round.
7. A betting street ends only when all remaining actionable players have acted and matched the current wager.

## Settlement invariants

1. Settlement never mutates player stacks or contributions directly.
2. The table applies settlement payouts exactly once.
3. Folded contributions remain in pot amounts but folded players are ineligible to win.
4. Every contribution layer is represented in exactly one pot.
5. Tied pots split evenly, with an odd chip assigned deterministically clockwise from the dealer button.
6. Total chips before and after a completed hand are conserved.

## Test matrix

| Area | Coverage |
| --- | --- |
| Deck | 52 unique cards, impossible draws, deterministic injected RNG |
| Evaluator | all hand categories, wheel, kickers, two-pair ordering, ties, best-of-seven, board-only hand |
| Pots | unequal stacks, folded dead money, invalid contributions, duplicate players |
| Table | seating, blinds, wrong actor rejection, fold settlement, all-in actor handling, short all-in re-opening, chip conservation |
| Settlement | tied pot, odd chip, non-mutating settlement |

## Production gate before Phase 2

The engine is not considered production-ready until:

- TypeScript typecheck passes.
- The full Vitest suite passes.
- A large randomized hand simulation passes chip-conservation assertions.
- Main-pot and multi-side-pot scenarios pass randomized settlement checks.
- A deterministic replay fixture can reproduce every hand event sequence.
- CI is green on the public repository.

## Known infrastructure dependency

GitHub Actions is currently blocked by an account-level GitHub billing authorization issue unrelated to the repository code. Local execution remains the source of truth until GitHub Support clears the account restriction.
