# Reconnect / Resume Protocol

## Goals

A dropped WebSocket must not create a second game state. The authoritative table remains in `TableRuntime` and PostgreSQL. A reconnecting authenticated player receives the current private snapshot for the active hand.

## Connection lifecycle

1. Server authenticates the connection.
2. Server creates a short-lived pending session and sends `SESSION_READY`.
3. The client may immediately act, which activates the pending session, or send `RESUME` with the previous session ID.
4. `RESUME` is accepted only when the session exists, is within the five-minute reconnect window, and belongs to the authenticated player.
5. Resuming a session replaces its previous WebSocket connection. The old socket is closed and cannot later detach the new connection.
6. The server returns `RESUME_ACCEPTED` with the current sequence and `staleClient` flag.
7. The server immediately sends a private authoritative `TABLE_SNAPSHOT`.

## Stale clients

The client supplies its last observed sequence. If it differs from the server sequence, `staleClient` is true and the client must replace local table state with the received snapshot. The server does not trust client state to reconstruct gameplay.

## Active hands

The table checkpoint contains the full authoritative table state and remaining deck. Recovery therefore preserves the hand ID, hole cards, community cards, stacks, current actor, pots and action deadline. A reconnect during an active hand resumes against that recovered state.

## Private information

`TABLE_SNAPSHOT` is projected per recipient. Public player snapshots expose only `holeCardCount`; the reconnecting player's `ownHoleCards` are included only for that authenticated player.

## Session durability boundary

Sessions are intentionally in-memory at this stage. The five-minute session window survives ordinary WebSocket drops, but not a game-server process restart. After a process restart, the authenticated player receives a new session and can still recover the table from PostgreSQL. Durable login/session identity will be added with the production authentication layer.

## Security boundary

The current `x-player-id` identity adapter is development-only. Production must replace it with verified authentication/JWT/session credentials. A client-supplied `playerId` is never accepted as game identity.
