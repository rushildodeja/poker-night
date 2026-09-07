# Phase 1 — Poker Engine

## Goal
A framework-independent, server-authoritative Texas Hold'em engine for 2–9 real players using virtual chips.

## Invariants
- The server is the sole authority for cards, turns, betting and settlement.
- Clients submit actions; they never submit game state.
- Production randomness must use a cryptographically secure source.
- No bots or simulated players exist in this phase.
- Hand history/event logging will be attached before multiplayer production use.

## Implemented
- 52-card deck and secure shuffle abstraction
- 5-card evaluation and best-of-7 evaluation
- Hold'em streets and blinds
- Check, bet, call, raise, fold and all-in validation
- Main/side-pot construction
- Showdown settlement and split-pot handling
- Table state machine foundation
- Unit tests for evaluator, side pots and table startup

## Next
Phase 2 will wrap this engine in a Node.js WebSocket game server with authenticated real players, authoritative action handling, reconnection and event broadcasting.
