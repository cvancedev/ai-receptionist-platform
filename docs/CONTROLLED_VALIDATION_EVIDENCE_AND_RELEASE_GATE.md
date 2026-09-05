# Controlled Validation Evidence and Release Gate

## Purpose and Current Decision

Sprint 9.7 implements the evidence and recommendation framework for deciding
whether the existing internal fictional MVP may be considered for a later,
separately authorized controlled evaluation. The current deterministic decision
is **READY_FOR_CONTROLLED_EVALUATION** because every mandatory current evidence
item passed. All required manual accessibility/usability reviews and fresh live
PostgreSQL checks have genuine PASS evidence.

`READY_FOR_CONTROLLED_EVALUATION` would be a bounded recommendation only. It
does not authorize evaluation execution, external participants, production,
deployment, real customer or protected data, a customer response, a provider,
a channel, or an external action.

## Validation Evidence Model

Each immutable evidence entry contains a bounded scenario identifier, one
mandatory requirement, category, expected and observed outcome codes, result,
reason code, evaluator category, local/test environment, data classification,
up to four safe configuration/version identifiers, timestamp, manual-review
flag, observation category, and gate relevance.

Evidence is process-local and capped at 100 entries. Scenario and requirement
duplicates are rejected. Untrusted content is inspected only within a 64-node,
six-level bound and then discarded. Customer, protected, and provider content
classes are rejected. Credentials, secrets, connection strings, raw content,
provider output, exception text, stack traces, database internals, and freeform
observations are not fields in the retained model.

Every entry carries literal false state, replay, authorization, configuration,
release, deployment, protected-data, customer-response, and external-action
authority. Evidence cannot reconstruct or mutate Conversation State or change
configuration lifecycle.

## Mandatory Evidence

The gate requires exactly one current positive entry for each requirement:

- normal multi-turn conversation, correction, and handoff/escalation;
- invalid and oversized input, duplicate and overlapping submission;
- missing configuration, rejected operation, and projection/internal failure;
- restart/recovery, exact configuration pinning, and scope isolation;
- sanitized errors, protected-data denial, and external-action denial;
- accessibility review and usability review;
- runtime configuration, dependency security, and incident readiness.

Absence of a failure is never success. Missing mandatory evidence returns
`NOT_READY`. Entries older than seven days relative to the gate decision, or
dated in the future, block the recommendation until current evidence exists.

## Automated and Manual Evidence

Automated verifiers may supply evidence for deterministic scenarios and static
boundaries. Required accessibility and usability reviews must be supplied by
an internal manual reviewer with a `manual-pass` observed outcome. Pending or
automated substitutes return `NOT_READY`.

Keyboard navigation, 200% and 400% browser zoom/reflow, screen-reader behavior,
forced colors / Windows High Contrast, contrast/readability, text spacing,
real-device reflow, touch targets, and human comprehension/usability have all
manually passed. No WCAG certification is claimed.

## Release-Gate Algorithm and Results

The pure gate validates exact input shape and version, validates every frozen
evidence entry, rejects excess capacity, detects duplicate and contradictory
requirements, requires every mandatory item, enforces freshness and fictional
classification, checks failure/blocking results, requires real manual evidence,
and finally verifies expected and observed outcomes agree.

- `BLOCKED`: malformed, duplicate, contradictory, stale/future,
  unknown/mixed-classification, failed, or explicitly blocked evidence exists.
- `NOT_READY`: mandatory evidence is missing or required manual review remains
  pending.
- `READY_FOR_CONTROLLED_EVALUATION`: every mandatory current fictional item
  explicitly passed. This is only a recommendation for separate consideration.

Blocking reason codes cover critical/high security findings, isolation or
authorization failure, protected-data or secret exposure, state or pin
corruption, recovery/migration failure, unsafe fixture fallback, internal-data
leakage, accessibility/reliability/usability failure, runtime-configuration
failure, dependency vulnerability, unauthorized network/provider behavior,
and unresolved incidents.

The output is immutable, bounded, recommendation-only, and grants no execution,
production, protected-data, release, deployment, or action authority. Calling
the gate performs no mutation, release, publish, deploy, send, activation, or
external operation.

## Current Evidence Result

The deterministic gate evaluates the actual current evidence as
`READY_FOR_CONTROLLED_EVALUATION` with `mandatory-fictional-evidence-passed`. Fresh
live PostgreSQL restart/recovery evidence and completed manual reviews close the
previous gaps. This recommendation does not itself authorize or start an
evaluation and never authorizes production.
