CREATE TABLE IF NOT EXISTS receptionist_conversations (
  business_profile_id text NOT NULL,
  business_profile_version integer NOT NULL
    CHECK (business_profile_version > 0),
  conversation_id text NOT NULL,
  handle_hash text NOT NULL
    CHECK (handle_hash ~ '^[0-9a-f]{64}$'),
  pending_field_id text,
  handoff_available boolean NOT NULL DEFAULT false,
  turn_number integer NOT NULL DEFAULT 0
    CHECK (turn_number >= 0),
  next_message_id integer NOT NULL DEFAULT 1
    CHECK (next_message_id > 0),
  created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (
    business_profile_id,
    business_profile_version,
    conversation_id
  ),
  UNIQUE (handle_hash)
);

CREATE TABLE IF NOT EXISTS receptionist_messages (
  business_profile_id text NOT NULL,
  business_profile_version integer NOT NULL
    CHECK (business_profile_version > 0),
  conversation_id text NOT NULL,
  message_id integer NOT NULL
    CHECK (message_id > 0),
  role text NOT NULL
    CHECK (role IN ('customer', 'assistant')),
  content text NOT NULL
    CHECK (char_length(content) > 0 AND char_length(content) <= 4000),
  created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (
    business_profile_id,
    business_profile_version,
    conversation_id,
    message_id
  )
);

CREATE TABLE IF NOT EXISTS receptionist_sessions (
  token_hash text PRIMARY KEY
    CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  csrf_token_hash text NOT NULL
    CHECK (csrf_token_hash ~ '^[0-9a-f]{64}$'),
  session_key text NOT NULL,
  business_profile_id text NOT NULL,
  business_profile_version integer NOT NULL
    CHECK (business_profile_version > 0),
  conversation_id text NOT NULL,
  conversation_handle_hash text
    CHECK (
      conversation_handle_hash IS NULL
      OR conversation_handle_hash ~ '^[0-9a-f]{64}$'
    ),
  actor_id text NOT NULL,
  created_at timestamp with time zone NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  revoked_at timestamp with time zone,
  CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS receptionist_sessions_expiry_idx
  ON receptionist_sessions (expires_at);

INSERT INTO app_schema_migrations (version, name)
VALUES (8, 'receptionist_persistence')
ON CONFLICT (version) DO NOTHING;
