DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  FOR constraint_name IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'business_profile_versions'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%profile_document%status%lifecycle_status%'
  LOOP
    EXECUTE format(
      'ALTER TABLE business_profile_versions DROP CONSTRAINT %I',
      constraint_name
    );
  END LOOP;

  FOR constraint_name IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'knowledge_record_versions'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%record_document%lifecycleState%lifecycle_state%'
  LOOP
    EXECUTE format(
      'ALTER TABLE knowledge_record_versions DROP CONSTRAINT %I',
      constraint_name
    );
  END LOOP;
END $$;

CREATE TABLE IF NOT EXISTS business_profile_lifecycle_transitions (
  business_profile_id TEXT NOT NULL,
  business_profile_version INTEGER NOT NULL CHECK (business_profile_version > 0),
  expected_revision INTEGER NOT NULL CHECK (expected_revision >= 0),
  resulting_revision INTEGER NOT NULL CHECK (resulting_revision = expected_revision + 1),
  prior_lifecycle_status TEXT NOT NULL,
  resulting_lifecycle_status TEXT NOT NULL,
  request_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  authorization_decision_id TEXT NOT NULL,
  authorization_decision TEXT NOT NULL CHECK (authorization_decision = 'authorized'),
  audit_event_id TEXT NOT NULL,
  audit_operation TEXT NOT NULL,
  audit_subject TEXT NOT NULL CHECK (audit_subject = 'business-profile'),
  audit_reason TEXT NOT NULL,
  transitioned_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (business_profile_id, business_profile_version, resulting_revision),
  UNIQUE (business_profile_id, request_id),
  UNIQUE (business_profile_id, audit_event_id),
  FOREIGN KEY (business_profile_id, business_profile_version)
    REFERENCES business_profile_versions (business_profile_id, business_profile_version)
);

CREATE TABLE IF NOT EXISTS knowledge_record_lifecycle_transitions (
  business_profile_id TEXT NOT NULL,
  business_profile_version INTEGER NOT NULL CHECK (business_profile_version > 0),
  knowledge_record_id TEXT NOT NULL,
  knowledge_record_version INTEGER NOT NULL CHECK (knowledge_record_version > 0),
  expected_revision INTEGER NOT NULL CHECK (expected_revision >= 0),
  resulting_revision INTEGER NOT NULL CHECK (resulting_revision = expected_revision + 1),
  prior_lifecycle_state TEXT NOT NULL,
  resulting_lifecycle_state TEXT NOT NULL,
  request_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  authorization_decision_id TEXT NOT NULL,
  authorization_decision TEXT NOT NULL CHECK (authorization_decision = 'authorized'),
  audit_event_id TEXT NOT NULL,
  audit_operation TEXT NOT NULL,
  audit_subject TEXT NOT NULL CHECK (audit_subject = 'knowledge-record'),
  audit_reason TEXT NOT NULL,
  transitioned_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (
    business_profile_id,
    business_profile_version,
    knowledge_record_id,
    knowledge_record_version,
    resulting_revision
  ),
  UNIQUE (business_profile_id, request_id),
  UNIQUE (business_profile_id, audit_event_id),
  FOREIGN KEY (
    business_profile_id,
    business_profile_version,
    knowledge_record_id,
    knowledge_record_version
  ) REFERENCES knowledge_record_versions (
    business_profile_id,
    business_profile_version,
    knowledge_record_id,
    knowledge_record_version
  )
);

INSERT INTO app_schema_migrations (version, name)
VALUES (6, 'configuration_lifecycle_transitions')
ON CONFLICT (version) DO NOTHING;
