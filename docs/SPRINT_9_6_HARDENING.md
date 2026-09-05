# Sprint 9.6 Hardening Evidence

## Decision and Scope

Milestone 9.6 is complete for the existing internal fictional MVP boundary.
This work hardens the certified Sprint 8 experience; it adds no product
workflow, provider, external action, customer release, production capability,
dependency, migration, or cache. Sprint 9.7 remains **Not Started** and
requires separate authorization.

## Reliability and Safe Failure

- Empty and greater-than-500-character submissions fail before message
  evidence or authoritative Conversation State can change.
- The session rejects an overlapping submission while an operation is in
  progress. The UI also disables submit, reset, mode controls, and message
  input during that operation. No automatic retry was added.
- The session owns the concurrency guard, so direct callers do not depend on
  React render timing for duplicate protection.
- Reset fails safely while processing. Completed, handoff, and projection-
  failure states continue to disable input and give a reset path.
- The durable activated browser boundary remains explicitly disconnected and
  never substitutes fixtures.
- Existing atomicity, stale-revision, duplicate-identity, unavailable-
  persistence, rollback, restart, and malformed provider-shaped-input proofs
  remain covered by the Sprint 8 and Sprint 9.4 regression suites.

## Accessibility and Usability

- The message input retains its programmatic label and now references visible
  length/fictional-data guidance plus operation status with `aria-describedby`.
- Submission state uses a polite status region and a visible `Submitting…`
  label. New message announcements are limited to additions.
- Native buttons, radio inputs, fieldset/legend grouping, headings, main,
  header, aside, sections, ordered lists, alerts, and current-step semantics
  remain intact. Static scanning finds no positive `tabindex` and no custom
  click-only control.
- Busy mode controls visibly communicate disabled state and use native
  `disabled` semantics. Existing focus-visible styling, 44-pixel minimum
  control heights, responsive grids, and reduced-motion override remain.
- Errors identify the safe next action without displaying internal details.
  Existing correction, confirmation, escalation, completion, and handoff
  wording remains unchanged.

## Performance and Bounds

Measurement preceded correction. Source review identified no fetch, provider,
telemetry, timer, polling, or additional client/server request. The interactive
boundary remains the existing `PrototypeChat` subtree. The concrete unbounded
cost was retained message state; it is now capped at 100 entries with stable,
monotonic identities. Input is capped at 500 characters before processing.

The documented Next.js 16 webpack production build completed in 6.8 seconds
and prerendered all ten static pages, including `/prototype`. The default
Turbopack build reached compilation but this managed Windows execution
environment denied its pooled Node worker spawn; this is an environment/tooling
limitation rather than an application diagnostic. No performance claim depends
on a new cache or stale business data.

## Error Sanitization and Privacy

Unknown exceptions and backend validation arrays are no longer copied into
the user-facing view. Projection failures render a fixed fail-closed message.
Public errors are limited to empty input, the disclosed input bound, overlap,
generic configured-rule rejection, safe failure, and reset guidance. The
focused verifier injects a canary into oversized input and proves it is neither
retained nor echoed.

No operational payload, stack trace, SQL/database detail, credential,
connection string, protected data, secret, raw provider output, or internal
implementation detail is intentionally rendered or logged.

## Manual Review Required

Automated and static checks cannot establish formal WCAG conformance. Before
any separately authorized participant evaluation, a human must review:

- full keyboard traversal, focus visibility, and focus order in supported
  browsers;
- screen-reader announcements and verbosity with at least one desktop and one
  mobile screen reader;
- contrast, forced-colors/high-contrast presentation, 200% and 400% zoom,
  text spacing, narrow reflow, and touch-target comfort;
- comprehension of fictional-data, correction, escalation, handoff, busy,
  disabled, and error wording with representative users;
- real-device responsiveness and layout stability.

No formal WCAG certification is claimed.

## Verification Contract

`npm run verify:sprint-9-6-hardening` proves the input and retained-state
bounds, pre-mutation invalid-input rejection, overlapping duplicate rejection,
stable bounded message keys, semantic/status requirements, reduced motion,
exact migrations 001-007, and absence of network, retry, provider, telemetry,
PostgreSQL, environment, timer, and debug paths in changed runtime sources.

Commit readiness additionally requires the Sprint 9.1-9.5 verifiers, relevant
Sprint 8 regressions, repository and security scans, non-incremental
TypeScript, ESLint, production build, dependency audits/tree validation,
Markdown-link verification, and `git diff --check` to pass.
