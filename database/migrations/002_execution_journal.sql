CREATE TABLE IF NOT EXISTS execution_journal_entries (
  journal_entry_id text NOT NULL,
  sequence integer NOT NULL
    CHECK (sequence > 0),
  execution_id text NOT NULL,
  request_id text NOT NULL,
  trace_id text NOT NULL,
  proposal_id text,
  task_identifier text NOT NULL,
  transition_id text,
  conversation_id text NOT NULL,
  business_profile_id text NOT NULL,
  business_profile_version integer NOT NULL
    CHECK (business_profile_version > 0),
  expected_state_revision integer NOT NULL
    CHECK (expected_state_revision >= 0),
  previous_state_revision integer
    CHECK (previous_state_revision IS NULL OR previous_state_revision >= 0),
  resulting_state_revision integer
    CHECK (resulting_state_revision IS NULL OR resulting_state_revision >= 0),
  outcome text NOT NULL,
  reason text NOT NULL,
  execution_timestamp text NOT NULL,
  execution_metadata jsonb NOT NULL
    CHECK (jsonb_typeof(execution_metadata) = 'object'),
  journal_schema_version integer NOT NULL
    CHECK (journal_schema_version > 0),
  journal_source text NOT NULL,
  journal_recorded_at text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (
    business_profile_id,
    business_profile_version,
    conversation_id,
    journal_entry_id
  ),
  UNIQUE (
    business_profile_id,
    business_profile_version,
    conversation_id,
    sequence
  )
);

INSERT INTO app_schema_migrations (version, name)
VALUES (2, 'execution_journal')
ON CONFLICT (version) DO NOTHING;
