create table if not exists public.poker_table_checkpoints (
  table_id text primary key,
  sequence bigint not null check (sequence >= 0),
  hand_id text not null,
  checkpoint jsonb not null,
  saved_at timestamptz not null default now()
);

create table if not exists public.poker_table_events (
  table_id text not null,
  sequence bigint not null check (sequence > 0),
  event_index integer not null check (event_index >= 0),
  hand_id text not null,
  event jsonb not null,
  request_id text not null,
  saved_at timestamptz not null default now(),
  primary key (table_id, sequence, event_index),
  unique (table_id, request_id)
);

create index if not exists poker_table_events_table_sequence_idx
  on public.poker_table_events (table_id, sequence);

alter table public.poker_table_checkpoints enable row level security;
alter table public.poker_table_events enable row level security;

comment on table public.poker_table_checkpoints is 'Durable authoritative checkpoint for server-owned Poker Night table state.';
comment on table public.poker_table_events is 'Append-only authoritative event log for server-owned Poker Night table mutations.';
