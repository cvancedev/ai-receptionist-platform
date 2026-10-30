# Pilot Turn Durability and Usage Accounting (Stage B2.3.3)

## Purpose

Stage B2.3.3 makes a pilot turn safe to retry and durable to audit. It adds a
client-generated turn identifier, an immutable per-turn receipt, and per-business
usage accounting in PostgreSQL. It does **not** enable provider execution,
telephony, streaming, billing, or an operator interface.

Provider execution remains disabled. The only usage written in this stage is a
settled, zero-cost record for the offline simulated transport. No claim of a
working hard provider spending cap is made here; [Budget enforcement](#budget-enforcement)
describes exactly what is and is not enforced.

## Turn identity

Each pilot request carries a client-generated `turnId`:

- pattern `^[A-Za-z0-9_-]{8,64}$`;
- opaque, with no business, conversation, or user meaning;
- scoped by the authenticated session's business, profile version, and
  conversation; the client cannot choose any of those;
- required in `pilot` mode and generated locally in `demo` mode, where no durable
  replay exists.

The server derives a SHA-256 request digest over
`[business, profile version, conversation, turnId, normalized message]`. The
message itself is never written to the receipt.

| Situation | Result |
| --- | --- |
| Same `turnId`, same request | The recorded turn is replayed: same messages, turn number, decision, and revision, with `replayed: true`; no new messages, turns, or usage |
| Same `turnId`, different message | `409` with `turn_conflict`; no mutation |
| Same `turnId` from another session, business, or conversation | Independent scope; it cannot read or replay the other conversation's receipt |
| Stale revision or turn number | `409` with `conversation_conflict`; no mutation |
| Monthly cap reached | `402` with `budget_exhausted`; no mutation |
| Missing `turnId` in pilot mode | `400` |

Duplicate detection is advisory before engine work and authoritative inside the
commit transaction. PostgreSQL advisory locks serialize the same
`(business, version, conversation, turnId)` tuple, so two concurrent duplicates
produce exactly one committed turn and one replay.

## Durable receipts

`database/migrations/009_receptionist_turn_receipts.sql` adds:

- `receptionist_turn_receipts` — one immutable row per committed turn, keyed by
  `(business_profile_id, business_profile_version, conversation_id, turn_id)` with
  a unique `(…, turn_number)` guard. It records the request digest, expected and
  resulting revisions, outcome code, execution mode, provider/model identity,
  stage, readiness, pending field, handoff availability, the message-id range,
  duration, and timestamp.
- `receptionist_usage_events` — per-turn usage rows with `reserved`/`settled`
  state, provider/model, token counts, integer micro-unit costs, and `USD`
  currency. The primary key is the same scoped turn tuple, so a retry cannot
  charge twice.

Neither table stores conversation text, prompts, credentials, session tokens,
conversation handles, or raw provider errors. Replay reloads the recorded
message range from `receptionist_messages`, which is the existing durable
conversation record.

A receipt and its usage row are written in the same transaction as the state
snapshot, conversation metadata, and messages. Any failure rolls back all of
them; a partial receipt or orphaned usage charge is not observable.

## Monetary units

All amounts are integer micro-units of USD: `1 USD = 1,000,000 micros`. Integer
comparisons avoid floating-point drift. The default pilot cap is
`10,000,000` micros ($10.00) per business per UTC calendar month.

## Budget enforcement

What this stage enforces:

- each pilot business has a configured `monthlyBudgetMicros` (default $10, range
  $0–$1,000 in the configuration contract);
- the commit transaction serializes budget accounting per business with a
  transaction-scoped advisory lock, sums settled and reserved usage for the UTC
  month, excludes the current turn's own row, and refuses the commit when the
  new cost would exceed the cap;
- a refused commit writes no receipt, no usage, and no state change;
- retries cannot double-charge because the scoped turn tuple is the usage
  primary key.

What this stage does **not** enforce:

- a hard cap on provider-side spend. Provider execution is disabled, so all
  committed costs are zero. A check at commit time alone cannot stop a paid
  request that has already been made.

### Reservation and settlement (required for B2.4)

Stage B2.4 must enforce the cap *before* a paid provider request:

1. Compute a bounded worst-case cost estimate for the planned request.
2. Insert a `reserved` usage row (with `reserved_cost_micros`) in its own short
   transaction, under the same per-business advisory lock, and refuse to call the
   provider if `settled + reserved + estimate > cap`.
3. Make the provider call.
4. In the turn commit transaction, settle the reservation: the existing
   `ON CONFLICT … WHERE state = 'reserved'` path converts it to `settled` with the
   reported or estimated actual cost and token counts.
5. On provider failure, delete the `reserved` row (release) in a bounded cleanup
   step; a later retry may reserve again.
6. Reconcile stale `reserved` rows older than a bounded window at startup or on a
   low-frequency maintenance task, releasing them so a crash cannot strand the
   budget.

Until steps 1–6 are implemented and verified, the $10 figure is an accounting
bound, not a guaranteed provider spending limit.

## Schema readiness and migration procedure

Pilot composition reads the schema's highest applied migration. Missing,
unreadable, or older-than-10 schemas produce `pilot-unavailable`; the runtime is
not created and is never migrated during a request.

Apply migrations explicitly, with a least-privileged migration credential:

```powershell
$env:AI_RECEPTIONIST_PILOT_DATABASE_URL = "<server-side connection URL>"
# Optional, defaults to public:
$env:AI_RECEPTIONIST_PILOT_DATABASE_SCHEMA = "<schema>"
npm run migrate:pilot
```

The command prints only the resulting schema version. It uses the certified
migration runner, which verifies every migration's SHA-256 before applying and
refuses an incompatible history. Verification and disposable databases use the
restricted `ai_receptionist_verify` role; that role is not the production
migration identity.

Recommended database permissions for the runtime role: `SELECT`, `INSERT` on
`receptionist_turn_receipts` and `receptionist_usage_events`; no `UPDATE` or
`DELETE` on receipts; `UPDATE` on usage is limited to settling reservations. No
runtime role should own the schema or hold `CREATEDB`, `CREATEROLE`, or
`SUPERUSER`.

## Known limitations

- The rate limiter remains process-local; multiple instances need a shared
  limiter.
- The pilot supports one configured business profile per deployment.
- The in-memory adapter is a development/verification store. It trims message
  history; a replay whose recorded message range was trimmed fails closed rather
  than returning a partial result.
- Receipts and usage rows are retained indefinitely in this stage. A documented
  retention and archival policy is required before public launch.
- No operator HTTP surface reads receipts or usage yet; the durable queries exist
  for a later authorized milestone.
- Duration is wall-clock processing time and is operational metadata only.

## Verification

`npm run verify:pilot-turn-durability` covers retry replay, replay after restart,
concurrent identical and conflicting turns, identifier reuse with different
content, rollback, cross-business and cross-conversation isolation, atomic usage,
budget exhaustion, outdated schema, and demo compatibility. It runs against the
in-memory adapter; the live PostgreSQL suite
(`verify:postgresql-receptionist-persistence`) additionally exercises receipts,
usage, and restart recovery in a disposable database and schema.
