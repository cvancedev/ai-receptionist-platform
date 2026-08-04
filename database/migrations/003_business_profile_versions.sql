CREATE TABLE IF NOT EXISTS business_profile_versions (
  business_profile_id TEXT NOT NULL,
  business_profile_version INTEGER NOT NULL CHECK (business_profile_version > 0),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  lifecycle_status TEXT NOT NULL CHECK (lifecycle_status IN ('draft', 'incomplete', 'ready-for-review', 'active', 'suspended', 'archived')),
  record_format_version INTEGER NOT NULL CHECK (record_format_version > 0),
  profile_document JSONB NOT NULL CHECK (jsonb_typeof(profile_document) = 'object'),
  request_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  authorization_decision_id TEXT NOT NULL,
  authorization_decision TEXT NOT NULL CHECK (authorization_decision IN ('authorized', 'denied')),
  audit_event_id TEXT NOT NULL,
  audit_operation TEXT NOT NULL,
  audit_subject TEXT NOT NULL,
  audit_reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (business_profile_id, business_profile_version),
  UNIQUE (business_profile_id, request_id),
  UNIQUE (business_profile_id, audit_event_id),
  CHECK (profile_document ->> 'id' = business_profile_id),
  CHECK ((profile_document ->> 'version')::INTEGER = business_profile_version),
  CHECK (profile_document ->> 'status' = lifecycle_status)
);

INSERT INTO app_schema_migrations (version, name)
VALUES (3, 'business_profile_versions')
ON CONFLICT (version) DO NOTHING;
