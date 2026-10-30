-- Stage B2.3.3: durable turn receipts and per-business usage accounting.
--
-- A receipt records only operational metadata for one committed turn. It never
-- stores conversation text, prompts, credentials, session tokens, handles, or raw
-- provider errors. The request digest identifies the exact request so a retry
-- with the same turn identifier can be replayed and a different body can be
-- refused without retaining the message itself.
--
-- Monetary values are integer micro-units of USD (1 USD = 1,000,000 micros).
-- Usage rows are created either as a pre-call reservation or as a settled
-- charge. B2.3.3 writes settled rows only; Stage B2.4 inserts a `reserved` row
-- before a paid provider request and settles it inside the turn commit.

CREATE TABLE IF NOT EXISTS receptionist_turn_receipts (
  business_profile_id text NOT NULL
    CHECK (char_length(business_profile_id) BETWEEN 1 AND 128),
  business_profile_version integer NOT NULL
    CHECK (business_profile_version > 0),
  conversation_id text NOT NULL
    CHECK (char_length(conversation_id) BETWEEN 1 AND 128),
  turn_id text NOT NULL
    CHECK (turn_id ~ '^[A-Za-z0-9_-]{8,64}$'),
  request_digest text NOT NULL
    CHECK (request_digest ~ '^[0-9a-f]{64}$'),
  turn_number integer NOT NULL
    CHECK (turn_number > 0),
  expected_revision integer NOT NULL
    CHECK (expected_revision >= 0),
  resulting_revision integer NOT NULL
    CHECK (resulting_revision >= expected_revision),
  outcome_code text NOT NULL
    CHECK (char_length(outcome_code) BETWEEN 1 AND 64),
  execution_mode text NOT NULL
    CHECK (execution_mode IN ('pilot')),
  provider_identifier text
    CHECK (
      provider_identifier IS NULL
      OR char_length(provider_identifier) BETWEEN 1 AND 128
    ),
  model_identifier text
    CHECK (
      model_identifier IS NULL
      OR char_length(model_identifier) BETWEEN 1 AND 128
    ),
  stage text NOT NULL
    CHECK (char_length(stage) BETWEEN 1 AND 64),
  readiness text NOT NULL
    CHECK (char_length(readiness) BETWEEN 1 AND 64),
  pending_field_id text
    CHECK (
      pending_field_id IS NULL
      OR char_length(pending_field_id) BETWEEN 1 AND 128
    ),
  handoff_available boolean NOT NULL,
  first_message_id integer NOT NULL
    CHECK (first_message_id > 0),
  last_message_id integer NOT NULL
    CHECK (last_message_id >= first_message_id),
  duration_ms integer NOT NULL
    CHECK (duration_ms >= 0 AND duration_ms <= 600000),
  created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (
    business_profile_id,
    business_profile_version,
    conversation_id,
    turn_id
  ),
  UNIQUE (
    business_profile_id,
    business_profile_version,
    conversation_id,
    turn_number
  )
);

CREATE INDEX IF NOT EXISTS receptionist_turn_receipts_audit_idx
  ON receptionist_turn_receipts (business_profile_id, created_at DESC);

CREATE TABLE IF NOT EXISTS receptionist_usage_events (
  business_profile_id text NOT NULL
    CHECK (char_length(business_profile_id) BETWEEN 1 AND 128),
  business_profile_version integer NOT NULL
    CHECK (business_profile_version > 0),
  conversation_id text NOT NULL
    CHECK (char_length(conversation_id) BETWEEN 1 AND 128),
  turn_id text NOT NULL
    CHECK (turn_id ~ '^[A-Za-z0-9_-]{8,64}$'),
  state text NOT NULL
    CHECK (state IN ('reserved', 'settled')),
  provider_identifier text
    CHECK (
      provider_identifier IS NULL
      OR char_length(provider_identifier) BETWEEN 1 AND 128
    ),
  model_identifier text
    CHECK (
      model_identifier IS NULL
      OR char_length(model_identifier) BETWEEN 1 AND 128
    ),
  input_tokens integer NOT NULL DEFAULT 0
    CHECK (input_tokens >= 0),
  output_tokens integer NOT NULL DEFAULT 0
    CHECK (output_tokens >= 0),
  reserved_cost_micros bigint
    CHECK (reserved_cost_micros IS NULL OR reserved_cost_micros >= 0),
  cost_micros bigint
    CHECK (cost_micros IS NULL OR cost_micros >= 0),
  currency text NOT NULL DEFAULT 'USD'
    CHECK (currency = 'USD'),
  created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  settled_at timestamp with time zone,
  PRIMARY KEY (
    business_profile_id,
    business_profile_version,
    conversation_id,
    turn_id
  ),
  CHECK (
    (state = 'reserved' AND reserved_cost_micros IS NOT NULL AND cost_micros IS NULL)
    OR (state = 'settled' AND cost_micros IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS receptionist_usage_events_budget_idx
  ON receptionist_usage_events (business_profile_id, created_at);

INSERT INTO app_schema_migrations (version, name)
VALUES (9, 'receptionist_turn_receipts')
ON CONFLICT (version) DO NOTHING;
