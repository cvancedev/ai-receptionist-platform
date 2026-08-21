# Sprint 8 Failure, Security, and Recovery Evidence

## Result

Milestone 8.7 verifies the integrated fictional MVP's existing fail-closed and
restart boundaries. No production defect or missing authority control was
found. The milestone adds verification and documentation only; it does not add
product capability or perform Sprint 8 certification.

## Failure and Recovery Matrix

| Boundary | Verified failure or recovery | Executable evidence |
| --- | --- | --- |
| Turn input | Malformed, broad, empty, invalid-source, wrong-conversation, and over-4,000-character messages fail before activated configuration or persistence access | `verify:end-to-end-contracts` |
| Activated context | Wrong business, profile, conversation, activation revision, knowledge version/source/time, unbound, suspended, malformed, future, expired, staff-only, and contradictory context fails closed | `verify:activated-context-grounding` |
| Workflow | Malformed input, stale revision, wrong scope, invalid sequence, duplicate message/turn, unasked field, premature confirmation, and invalid completion transition cause no accepted mutation | `verify:deterministic-multi-turn-workflow` |
| Model boundary | Malformed, invalid-source, ungrounded, state-authority, release-authority, refusal, failure, and cancellation outcomes remain untrusted and cause no network, mutation, or release | `verify:provider-evaluation`, `verify:end-to-end-failure-security-recovery` |
| Durable turn | Atomic state/journal/message success; duplicate and stale no-op; message-write rollback; corrupt evidence rejection; exact provenance; cross-business isolation; fresh-adapter restart | `verify:durable-turn-restart` |
| Persistence | Database unavailable, duplicate initialization/execution, stale revision, failed state/journal/transaction/commit, malformed records, unsupported history, exact-scope non-disclosure, restart after success and rollback, and no request-time repair | `verify:persistence-recovery` and PostgreSQL store/coordinator suites |
| Configuration | Malformed versions, unavailable tables, activation corruption, deferred commit failure, active-pointer preservation, exact historical pin recovery, suspended ineligibility, no fixture fallback, and no repinning | `verify:business-configuration-recovery`, `verify:configuration-lifecycle-remediation`, and configuration PostgreSQL suites |
| Presentation | UI receives bounded read models, has no PostgreSQL/provider/credential access, cannot construct authoritative state, and grants no release | `verify:internal-fictional-mvp-experience`, `verify:end-to-end-failure-security-recovery` |

## Recovery Invariants

- The last committed Conversation State is authoritative after every failed or
  rolled-back write.
- The last committed activation and exact profile/knowledge pins remain
  authoritative after activation or recovery failure.
- Failed transactional turns append no partial execution journal or message
  evidence and do not consume a committed sequence.
- Restart reads and validates Conversation State directly. Journal and message
  evidence are separately decoded, subordinate, and never replayed to create,
  repair, or override state.
- Handoff remains derived from the validated recovered state and exact pinned
  Business Profile.
- Wrong business, profile, activation, knowledge, or conversation scope cannot
  disclose another scoped record's existence or data.
- Durable activated recovery never substitutes fixtures, a current profile, a
  nearest version, or silently repaired storage.

## Security Invariants

- Customer input and provider output remain untrusted data.
- Grounding requires exact activation-bound source references and cannot be
  established by provider confidence or fabricated citations.
- PostgreSQL and driver types remain confined to infrastructure.
- Raw SQL and driver errors are normalized to bounded application outcomes.
- Message evidence is append-only, bounded to 4,000 characters, exactly
  business/profile/conversation/activation scoped, and non-authoritative.
- Credentials, private keys, provider payloads, unrestricted prompts, and raw
  database records are not persisted or rendered.
- Customer release and external-action authority remain literal false or
  absent throughout the integrated path.
- No real provider, network call, authentication, communication channel,
  deployment behavior, or Sprint 8.8 certification capability exists.

## Scope

This evidence record is not Sprint 8 certification. Milestone 8.8 remains Not
Started and requires separate authorization.
