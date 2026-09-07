# Phase 2 — Authoritative Game Server

## Scope

The game server is the real-time transport and orchestration layer around the existing poker engine. It must not duplicate poker rules.

## Current implementation

- WebSocket transport using `ws`.
- Development authentication adapter via `x-player-id` (not production authentication).
- In-memory table registry.
- One runtime per table.
- Authenticated player identity is injected into commands; client payload cannot impersonate another player.
- Runtime request IDs prevent duplicate command application.
- Hand IDs reject stale hands.
- Sequence numbers provide optimistic concurrency protection.
- Public/private snapshot projection prevents opponent hole-card leakage.
- Server broadcasts private snapshots to each seated player.

## Authority model

```text
Client → WebSocket → validation → authenticated command → TableRuntime → PokerTable
                                                               ↓
                                                         state transition
                                                               ↓
                                                   private snapshots
```

`PokerTable` remains authoritative for cards, betting, turns, pots, showdown and settlement.

## Explicit non-production pieces

The current server intentionally uses an in-memory registry and a development header-based identity adapter. Before production, these must be replaced with durable table state/recovery, verified authentication, reconnect/session handling, rate limits, structured observability, and deployment-specific WebSocket infrastructure.

No real-money wallet, deposit, withdrawal, payment, or bypass mechanism is part of this server.

## Next server milestones

1. Connection/session lifecycle and reconnect tokens.
2. Per-table serialized command queue.
3. Action deadlines and server-side timeout actions.
4. Durable hand/event persistence and replay.
5. Redis-backed coordination when multiple server instances are introduced.
6. Authenticated lobby/table membership.
7. Load and WebSocket soak tests.
8. Production deployment topology.
