-- Telephone pilot persistence.
--
-- A call is stored as a whole snapshot with its turn count, so a carrier retry
-- can be recognised instead of replayed as a second dialogue turn. Summaries and
-- owner notifications are keyed by call so each is written exactly once.
--
-- Caller numbers are personal data. They live in the call snapshot because the
-- owner must call the customer back; operational log lines never print them.

create table if not exists telephone_calls (
  call_id text primary key,
  business_profile_id text not null,
  business_profile_version integer not null check (business_profile_version >= 1),
  conversation_id text not null,
  turn_count integer not null default 0 check (turn_count >= 0),
  state text not null check (state in (
    'greeting', 'in-dialogue', 'awaiting-confirmation',
    'completed', 'escalated', 'abandoned', 'failed'
  )),
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists telephone_calls_business_idx
  on telephone_calls (business_profile_id, created_at desc);

create table if not exists telephone_call_summaries (
  call_id text primary key references telephone_calls (call_id) on delete cascade,
  business_profile_id text not null,
  ended_at bigint not null check (ended_at >= 0),
  summary jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists telephone_call_summaries_business_idx
  on telephone_call_summaries (business_profile_id, ended_at desc);

create table if not exists telephone_owner_notifications (
  call_id text primary key references telephone_calls (call_id) on delete cascade,
  notification_id text not null unique,
  business_profile_id text not null,
  created_at_ms bigint not null check (created_at_ms >= 0),
  summary jsonb not null,
  delivered_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists telephone_owner_notifications_business_idx
  on telephone_owner_notifications (business_profile_id, created_at_ms desc);

create index if not exists telephone_owner_notifications_undelivered_idx
  on telephone_owner_notifications (created_at_ms)
  where delivered_at is null;
