-- Stage B2.4A: explicit UTC billing-month accounting.
--
-- Usage rows are the only monetary records in the pilot. Before this migration
-- they were bucketed by `created_at` at read time, so a reservation created at
-- the end of a month and settled after the boundary landed in the earlier month
-- only by accident of the query window. `billing_month` makes the accounting
-- month explicit and shared by the reservation and its settlement.
--
-- Format is `YYYY-MM` in UTC. Existing rows are back-filled from `created_at`
-- once; no other column is rewritten and no row is deleted.
--
-- This is an application accounting field. It is not a provider billing period
-- and confers no provider-side spending limit.

ALTER TABLE receptionist_usage_events
  ADD COLUMN IF NOT EXISTS billing_month text;

UPDATE receptionist_usage_events
SET billing_month = to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM')
WHERE billing_month IS NULL;

ALTER TABLE receptionist_usage_events
  ALTER COLUMN billing_month SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'receptionist_usage_events_billing_month_check'
  ) THEN
    ALTER TABLE receptionist_usage_events
      ADD CONSTRAINT receptionist_usage_events_billing_month_check
      CHECK (billing_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS receptionist_usage_events_billing_month_idx
  ON receptionist_usage_events (business_profile_id, billing_month, state);

INSERT INTO app_schema_migrations (version, name)
VALUES (10, 'receptionist_billing_month')
ON CONFLICT (version) DO NOTHING;
