CREATE TABLE IF NOT EXISTS configuration_activations (
  business_profile_id TEXT NOT NULL,
  activation_revision INTEGER NOT NULL CHECK (activation_revision > 0),
  request_id TEXT NOT NULL,
  request_fingerprint TEXT NOT NULL,
  business_profile_version INTEGER NOT NULL CHECK (business_profile_version > 0),
  expected_profile_revision INTEGER NOT NULL CHECK (expected_profile_revision >= 0),
  previous_profile_lifecycle_status TEXT NOT NULL CHECK (previous_profile_lifecycle_status = 'ready-for-review'),
  resulting_profile_lifecycle_status TEXT NOT NULL CHECK (resulting_profile_lifecycle_status = 'active'),
  expected_active_revision INTEGER NOT NULL CHECK (expected_active_revision >= 0),
  prior_activation_revision INTEGER CHECK (prior_activation_revision > 0),
  prior_business_profile_version INTEGER CHECK (prior_business_profile_version > 0),
  knowledge_selection JSONB NOT NULL CHECK (jsonb_typeof(knowledge_selection) = 'array'),
  record_format_version INTEGER NOT NULL CHECK (record_format_version > 0),
  actor_id TEXT NOT NULL,
  authorization_decision_id TEXT NOT NULL,
  authorization_decision TEXT NOT NULL CHECK (authorization_decision = 'authorized'),
  audit_event_id TEXT NOT NULL,
  audit_operation TEXT NOT NULL CHECK (audit_operation = 'activate'),
  audit_subject TEXT NOT NULL CHECK (audit_subject = 'business-profile'),
  audit_reason TEXT NOT NULL,
  eligibility_validated_at TIMESTAMPTZ NOT NULL,
  activated_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (business_profile_id, activation_revision),
  UNIQUE (business_profile_id, request_id),
  UNIQUE (business_profile_id, audit_event_id),
  UNIQUE (business_profile_id, activation_revision, business_profile_version),
  UNIQUE (business_profile_id, activation_revision, business_profile_version, request_id),
  FOREIGN KEY (business_profile_id, business_profile_version)
    REFERENCES business_profile_versions (business_profile_id, business_profile_version),
  FOREIGN KEY (
    business_profile_id,
    prior_activation_revision,
    prior_business_profile_version
  ) REFERENCES configuration_activations (
    business_profile_id,
    activation_revision,
    business_profile_version
  ),
  CHECK (
    (prior_activation_revision IS NULL AND prior_business_profile_version IS NULL)
    OR (prior_activation_revision IS NOT NULL AND prior_business_profile_version IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS configuration_activation_knowledge (
  business_profile_id TEXT NOT NULL,
  activation_revision INTEGER NOT NULL CHECK (activation_revision > 0),
  business_profile_version INTEGER NOT NULL CHECK (business_profile_version > 0),
  knowledge_record_id TEXT NOT NULL,
  knowledge_record_version INTEGER NOT NULL CHECK (knowledge_record_version > 0),
  expected_knowledge_revision INTEGER NOT NULL CHECK (expected_knowledge_revision >= 0),
  previous_lifecycle_state TEXT NOT NULL CHECK (previous_lifecycle_state = 'approved'),
  resulting_lifecycle_state TEXT NOT NULL CHECK (resulting_lifecycle_state = 'active'),
  PRIMARY KEY (
    business_profile_id,
    activation_revision,
    knowledge_record_id,
    knowledge_record_version
  ),
  FOREIGN KEY (
    business_profile_id,
    activation_revision,
    business_profile_version
  ) REFERENCES configuration_activations (
    business_profile_id,
    activation_revision,
    business_profile_version
  ),
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

CREATE TABLE IF NOT EXISTS active_configurations (
  business_profile_id TEXT PRIMARY KEY,
  activation_revision INTEGER NOT NULL CHECK (activation_revision > 0),
  business_profile_version INTEGER NOT NULL CHECK (business_profile_version > 0),
  request_id TEXT NOT NULL,
  record_format_version INTEGER NOT NULL CHECK (record_format_version > 0),
  activated_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (
    business_profile_id,
    activation_revision,
    business_profile_version,
    request_id
  ) REFERENCES configuration_activations (
    business_profile_id,
    activation_revision,
    business_profile_version,
    request_id
  )
);

INSERT INTO app_schema_migrations (version, name)
VALUES (5, 'configuration_activations')
ON CONFLICT (version) DO NOTHING;
