# Customer Response Release

## Release Principle

A model-generated draft is not a customer response. Only an application-approved content identity may pass the Response Release Gate, and delivery occurs through a separate application-controlled channel integration.

## Release Checks

Release requires:

- correct business and conversation scope;
- compatible profile version and current state revision;
- approved task and valid Output Contract;
- customer-visible content only;
- no internal instructions, hidden policy, credentials, or implementation details;
- no unsupported promises, invented facts/services, or cross-business references;
- no prohibited sensitive data or unapproved actions;
- no contradiction with deterministic state;
- no unsafe escalation statement;
- no false claim that an operation completed;
- consistency with the final application decision and actual mutation result; and
- a passing duplicate-message guard.

Validation is repeated against release-time state when relevant. A valid draft can become stale before delivery.

## Grounding

For knowledge-grounded answers, every material business claim is supported by eligible included knowledge. Insufficient knowledge remains explicit, external model memory cannot fill gaps, and internal source provenance is retained without exposing restricted metadata to the customer.

## Application Modification

The application may select a validated draft, shorten it, remove unsupported optional wording, add approved structured information, or replace it with deterministic wording.

Modification cannot introduce a new action, promise, fact, service, policy, or grounding claim. Materially changed text is revalidated before release.

## Release Identity

A conceptual release record contains:

- `responseReleaseId`;
- `requestId` and proposal identity;
- `businessId` and `conversationId`;
- release-time `stateRevision`;
- release policy version;
- approved content identity;
- delivery status; and
- duplicate guard key.

The key prevents duplicate release after provider/network retry, repeated execution, duplicate callbacks, stale UI submission, or adapter redelivery.

## No Direct Provider Delivery

Providers, models, and adapters cannot send customer messages, select destinations/channels, or report delivery success. Delivery is a future application integration concern outside this milestone.

## Streaming

Streaming remains deferred. Partial output is untrusted and unreleased. A later architecture would need separate incremental safety, cancellation, consistency, finalization, and duplicate controls before any partial customer display.

## Failure Behavior

Unsafe, stale, ungrounded, contradictory, duplicate, or ambiguous content is rejected. The application uses deterministic wording, clarification, escalation, or safe stop without claiming a failed action occurred.

## Related Documents

- [Model Output Validation Architecture](MODEL_OUTPUT_VALIDATION_ARCHITECTURE.md)
- [Proposal Decision and Application](PROPOSAL_DECISION_AND_APPLICATION.md)
- [Output Failure and Audit](OUTPUT_FAILURE_AND_AUDIT.md)
