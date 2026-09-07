# Phase 1 — Multiplayer Server Readiness

## Purpose

Phase 1 is now structured so a future multiplayer server can sit around the poker engine without duplicating poker rules or trusting client state.

## Authority model

```text
Authenticated WebSocket connection
            |
            v
      Protocol validation
            |
            v
   Server identity binding
            |
            v
      Table command layer
            |
            v
       PokerTable engine
            |
            v
   Immutable network snapshot
            |
            +----> public table view
            |
            +----> private player view
```

The client may request an action, but it never supplies authoritative player identity, cards, stacks, turn state, pots, or settlement results.

## Client action contract

Every action request contains:

- protocol version
- unique `requestId`
- `tableId`
- `handId`
- action type
- optional wager amount
- optional expected sequence

The authenticated WebSocket/session identity supplies the player ID. A client-supplied player ID must not be accepted as an authority boundary.

## Concurrency and replay rules

The Phase 2 server must:

1. Serialize all commands for a table.
2. Assign a monotonically increasing table sequence to accepted state changes.
3. Reject a request whose `handId` is no longer current.
4. Optionally reject an `expectedSequence` that is stale before attempting the command.
5. Deduplicate `requestId` values within the server's replay window.
6. Never execute the same accepted action twice because of WebSocket retries.
7. Broadcast the resulting snapshot only after the engine mutation succeeds.

A Redis/distributed lock is not a substitute for per-table command serialization. The authoritative table actor must process one command at a time.

## Snapshot security

`toPublicSnapshot()` intentionally exposes only `holeCardCount`, never opponents' hole cards. `toPrivateSnapshot()` adds only the authenticated viewer's own hole cards.

The server must never broadcast the raw `TableState` object because it contains every player's hole cards.

## State ownership

The engine owns:

- cards and deck state
- betting legality
- current street
- turns
- pots
- showdown
- settlement
- chip movement

The multiplayer server will own:

- authenticated connection identity
- table membership
- connection lifecycle
- action timeouts
- reconnect/resume
- command serialization
- request deduplication
- sequence numbers
- broadcasting
- persistence of hand events/snapshots

The database must not become the live poker state machine. Persisted state is for recovery, audit, history, and analytics; the live table actor remains authoritative.

## Phase 2 server package boundary

The intended next package is:

```text
apps/game-server/
├── src/
│   ├── server.ts
│   ├── connections/
│   ├── tables/
│   │   ├── table-manager.ts
│   │   ├── table-actor.ts
│   │   └── command-queue.ts
│   ├── protocol/
│   └── timeouts/
└── tests/
```

It should depend on `@poker-night/poker-engine` and `@poker-night/game-types`, but the engine must not depend on the server.

## Phase 2 acceptance gates

Before calling the multiplayer server production-ready:

- duplicate WebSocket action cannot double-spend chips
- stale hand action is rejected
- stale sequence action is rejected
- wrong authenticated player cannot act for another seat
- two simultaneous actions are serialized deterministically
- reconnect receives the current snapshot
- timeout creates exactly one server-side action
- raw hole cards never leave the server except to their owner or an explicitly authorized showdown view
- every accepted action has an auditable request ID and sequence
- server restart/recovery cannot create or destroy chips

## Legal/product boundary

The current engine remains virtual-chip-only. This readiness layer does not add deposits, withdrawals, wagering, payment processing, or mechanisms to bypass jurisdictional restrictions.
