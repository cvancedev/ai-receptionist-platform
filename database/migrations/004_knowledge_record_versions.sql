CREATE TABLE IF NOT EXISTS knowledge_record_versions (
  business_profile_id TEXT NOT NULL,
  business_profile_version INTEGER NOT NULL CHECK (business_profile_version > 0),
  knowledge_record_id TEXT NOT NULL,
  knowledge_record_version INTEGER NOT NULL CHECK (knowledge_record_version > 0),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  lifecycle_state TEXT NOT NULL CHECK (lifecycle_state IN ('draft', 'under-review', 'approved', 'active', 'expired', 'superseded', 'suspended', 'archived', 'rejected')),
  audience TEXT NOT NULL CHECK (audience IN ('customer', 'staff', 'both')),
  source_identity TEXT NOT NULL CHECK (length(btrim(source_identity)) > 0),
  effective_date TEXT NOT NULL CHECK (length(btrim(effective_date)) > 0),
  record_format_version INTEGER NOT NULL CHECK (record_format_version > 0),
  record_document JSONB NOT NULL CHECK (jsonb_typeof(record_document) = 'object'),
  request_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  authorization_decision_id TEXT NOT NULL,
  authorization_decision TEXT NOT NULL CHECK (authorization_decision IN ('authorized', 'denied')),
  audit_event_id TEXT NOT NULL,
  audit_operation TEXT NOT NULL,
  audit_subject TEXT NOT NULL,
  audit_reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (business_profile_id, business_profile_version, knowledge_record_id, knowledge_record_version),
  UNIQUE (business_profile_id, request_id),
  UNIQUE (business_profile_id, audit_event_id),
  FOREIGN KEY (business_profile_id, business_profile_version)
    REFERENCES business_profile_versions (business_profile_id, business_profile_version),
  CHECK (record_document ->> 'businessProfileId' = business_profile_id),
  CHECK (record_document ->> 'id' = knowledge_record_id),
  CHECK ((record_document ->> 'version')::INTEGER = knowledge_record_version),
  CHECK (record_document ->> 'lifecycleState' = lifecycle_state),
  CHECK (record_document ->> 'audience' = audience),
  CHECK (record_document ->> 'source' = source_identity),
  CHECK (record_document ->> 'effectiveDate' = effective_date)
);

INSERT INTO app_schema_migrations (version, name)
VALUES (4, 'knowledge_record_versions')
ON CONFLICT (version) DO NOTHING;
