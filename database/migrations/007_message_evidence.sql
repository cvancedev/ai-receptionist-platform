CREATE TABLE IF NOT EXISTS conversation_message_evidence (
  business_profile_id text NOT NULL,
  business_profile_version integer NOT NULL CHECK (business_profile_version > 0),
  conversation_id text NOT NULL,
  activation_revision integer NOT NULL CHECK (activation_revision > 0),
  message_id text NOT NULL,
  turn_id text NOT NULL,
  sequence integer NOT NULL CHECK (sequence > 0),
  source text NOT NULL CHECK (source = 'customer'),
  content text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 4000),
  resulting_state_revision integer NOT NULL CHECK (resulting_state_revision >= 0),
  recorded_at text NOT NULL CHECK (char_length(recorded_at) BETWEEN 1 AND 80),
  evidence_schema_version integer NOT NULL CHECK (evidence_schema_version = 1),
  created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (business_profile_id, business_profile_version, conversation_id, message_id),
  UNIQUE (business_profile_id, business_profile_version, conversation_id, turn_id),
  UNIQUE (business_profile_id, business_profile_version, conversation_id, sequence),
  FOREIGN KEY (business_profile_id, business_profile_version, conversation_id)
    REFERENCES conversation_states (business_profile_id, business_profile_version, conversation_id)
    ON DELETE RESTRICT
);

CREATE INDEX conversation_message_evidence_scope_order
  ON conversation_message_evidence (
    business_profile_id, business_profile_version, conversation_id, sequence
  );

INSERT INTO app_schema_migrations (version, name)
VALUES (7, 'message_evidence')
ON CONFLICT (version) DO NOTHING;
