# Phase 3 — Table Lifecycle

## Scope

Phase 3 introduces the server-owned lifecycle around a poker table without changing in-hand poker rules.

## Leave semantics

A player may leave only while the table is `WAITING` or `HAND_COMPLETE`. The server rejects `LEAVE_TABLE` during an active hand. This prevents removing a player whose chips are already committed to a live pot and keeps settlement deterministic.

A network disconnect is not treated as an explicit leave. The player's authenticated session remains resumable, and the existing action-timeout system continues to protect the table if the disconnected player is the current actor. Disconnect grace/removal after hand completion is the next lifecycle increment.

## Persistence

Leaving produces a `PLAYER_LEFT` event and a checkpoint mutation. The event uses an empty `handId` when no hand exists yet; this keeps the existing durable schema backward compatible while retaining an auditable lifecycle record.

## Invariants

- A player cannot be seated twice.
- A seat can only be occupied once.
- A player cannot leave during a hand.
- A non-seated player cannot leave.
- Leave mutations are serialized through the table command queue.
- Leave request IDs are idempotent through the existing runtime request-deduplication path.
- Failed leave validation does not mutate table state.
- Client identity is taken from the authenticated connection, not the request payload.

## Next lifecycle increment

Implement disconnect grace, post-hand automatic removal of disconnected players, and empty-table expiration as a separate change so the failure/recovery behavior remains independently testable.
