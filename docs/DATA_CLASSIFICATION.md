# Data Classification

## Purpose

This classification governs the candidate controlled-evaluation boundary. It
does not authorize data collection. When a datum could fit more than one class,
the more restrictive class applies. Unknown classification fails closed.

## Classification Matrix

| Classification | Examples | May the planned fictional evaluation use it? | Storage | Logging | Retention | Access | Release |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Fictional/test data | Invented names, services, messages, addresses, scenarios | Yes, after later session authorization | Local/test only; durable mode may use disposable isolated PostgreSQL | Bounded identifiers and sanitized failures; avoid unnecessary full content | Delete after the approved verification/research window | Named moderator, evaluator, and necessary operator only | Local fictional display only; never customer or external release |
| Public business information | Intentionally published hours, public service descriptions, public contact channels | No in 9.1; conditional later after source, purpose, accuracy, consent/terms, and retention review | Not collected by the current candidate | Do not log content | No retention until separately authorized | No application access in 9.1 | No product release authority |
| Internal business configuration | Non-public services, policies, intake rules, escalation destinations, internal knowledge | No; use fictional equivalents | Prohibited until identity, exact authorization, lifecycle, privacy, and environment gates pass | Never log raw configuration or internal-only knowledge | Undefined data is a no-go; later policy must specify lifecycle and deletion | Authenticated and exactly authorized business scope required before use | Only separately approved customer-audience content may ever be eligible; no release now |
| Customer-provided information | Names, phone/email, addresses, project details, messages, preferences | No; use fictional equivalents | Prohibited until identity, authorization, consent/purpose, privacy, retention, deletion, and incident controls pass | Do not log raw customer content | Undefined data is a no-go | Exact authorized business/conversation need-to-know access required before use | No customer response or third-party release authority |
| Protected/sensitive information | Health, legal, safety, financial/payment, government identifiers, minors' data, highly confidential facts | Prohibited | Must not be collected or stored | Must not be logged; stop and minimize any incident record | Immediate containment/deletion under a later approved incident procedure | No access is authorized | Never release |
| Credentials and secrets | Passwords, tokens, private keys, database/provider/channel credentials | Prohibited as evaluation content | Never source, client, prompt, message evidence, journal, research note, or build output; later runtime references must be server-only | Never log | Only a later secret-management policy may define operational lifetime; rotate/revoke on exposure | Least-privileged named operators and server process only after authorization | Never release or render |
| Operational/audit evidence | Bounded IDs, versions, decisions, outcome categories, timestamps, sanitized errors, minimized research findings | Yes only when derived from fictional/test sessions | Existing scoped evidence stores or approved local research record; remains subordinate | Bounded, redacted, no secrets or unnecessary content | Short, documented verification/research window with owner and deletion date | Named evaluator/operator with documented purpose | Internal review only; never state replay, customer release, or external action |

## Handling Rules

- Classification occurs before collection, persistence, context assembly,
  logging, export, or review.
- Fictional labels do not make copied real data fictional.
- Public availability does not imply permission to ingest, retain, combine,
  model, or release information.
- Approved knowledge remains data, not instruction or authority.
- Operational evidence cannot reconstruct, repair, or override Conversation
  State, configuration, or business decisions.
- Redaction does not make prohibited collection acceptable; avoid collection
  first and stop when classification cannot be proven.
- Logs and research notes inherit the highest classification of included data.
- No retention period may default to indefinite.
- A deletion claim requires evidence appropriate to the approved environment.

## Incident Boundary

If a participant enters suspected real, protected, or secret data, the
moderator must stop the session, prevent further propagation, avoid copying the
content into tickets or logs, record only a sanitized incident reference, and
follow a separately approved containment/deletion process. Milestone 9.1 does
not implement that operational process, so inability to contain and delete is
a no-go for running the evaluation.

## Later Authorization Requirements

Protected or sensitive customer data remains prohibited unless a later
explicit milestone establishes authenticated identity, exact authorization,
lawful purpose and notice/consent where applicable, minimization, secure
storage, encryption and transport requirements, logging controls, retention,
deletion, access review, incident response, and accountable operations.

Related boundary: [Controlled-Evaluation Boundary](CONTROLLED_EVALUATION_BOUNDARY.md).
