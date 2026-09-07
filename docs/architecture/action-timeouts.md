# Action Timeout Architecture

Poker Night uses a server-authoritative, durable action deadline.

## Rules

- The deadline lives inside the authoritative `PokerTableState.actionDeadline` and is included in every checkpoint.
- A successful player action advances the table sequence and persists the next deadline atomically with the resulting events and checkpoint.
- The game server owns the wall-clock timer; clients only display the deadline and never decide when a turn expires.
- Every timer is bound to `(tableId, handId, playerId, expectedSequence)`.
- The timeout request ID is deterministic: `timeout:<table>:<hand>:<sequence>:<player>`.
- Timeout execution goes through the same per-table command queue as normal player actions.
- Before acting, the runtime verifies the hand, sequence, current player, active status, and persisted deadline. Any mismatch makes the timer stale and harmless.
- On expiry, the default action is `CHECK` when the player is not facing a bet; otherwise it is `FOLD`.
- The resulting timeout mutation is persisted through the same atomic event+checkpoint transaction as a player action.
- After restart, the recovered checkpoint's deadline is scheduled again. If it is already expired, the timer fires immediately and the same stale-state checks prevent duplicate execution.

## Race safety

If a player acts at the same time that a timeout fires, both operations enter the table queue. Whichever mutation commits first advances the sequence. The other operation observes the changed sequence/current player and is rejected without changing the table.

If a timer fires twice, the first successful timeout advances the sequence and the second becomes stale. A deterministic timeout request ID additionally makes retries after persistence/restart idempotent.

## Lifecycle

```text
TABLE ACTION
   -> engine mutation
   -> compute next deadline
   -> persist events + checkpoint + deadline
   -> increment sequence
   -> arm one timer

SERVER RESTART
   -> load checkpoint
   -> restore table + deadline
   -> schedule timer from persisted deadline
   -> expiry enters table queue
   -> stale checks
   -> timeout action
   -> atomic persistence
   -> next deadline / hand completion
```

## Current scope

The current implementation uses an in-process timer per table. PostgreSQL is authoritative for the deadline and mutation state. Multi-instance timer ownership/leader coordination is a later deployment concern; it must be added before running multiple game-server instances so that only one instance owns timeout execution for a table.
