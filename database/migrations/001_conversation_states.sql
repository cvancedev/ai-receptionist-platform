CREATE TABLE IF NOT EXISTS conversation_states (
  business_profile_id text NOT NULL,
  business_profile_version integer NOT NULL
    CHECK (business_profile_version > 0),
  conversation_id text NOT NULL,
  revision integer NOT NULL
    CHECK (revision >= 0),
  state_format_version integer NOT NULL
    CHECK (state_format_version > 0),
  state_document jsonb NOT NULL
    CHECK (jsonb_typeof(state_document) = 'object'),
  created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (
    business_profile_id,
    business_profile_version,
    conversation_id
  ),
  CHECK (state_document ->> 'businessProfileId' = business_profile_id),
  CHECK (
    (state_document ->> 'businessProfileVersion')::integer
      = business_profile_version
  ),
  CHECK (state_document ->> 'conversationId' = conversation_id),
  CHECK ((state_document ->> 'revision')::integer = revision)
);

CREATE TABLE IF NOT EXISTS app_schema_migrations (
  version integer PRIMARY KEY,
  name text NOT NULL UNIQUE,
  applied_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO app_schema_migrations (version, name)
VALUES (1, 'conversation_states')
ON CONFLICT (version) DO NOTHING;
