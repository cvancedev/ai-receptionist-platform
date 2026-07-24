# AI Prototype Verification

## Command

```powershell
npm.cmd run verify:ai-foundation
```

The command compiles the existing `src` tree through `tsconfig.prototype.json` and executes `src/verification/ai-foundation.verify.ts`. It adds no testing dependency and does not replace or weaken `verify:prototype`.

## Registry and Package Coverage

- all eight allowlisted tasks resolve with compatible contracts and all eight allowlisted proposal types have contracts;
- unknown identifiers and unsupported versions fail;
- incompatible contracts fail;
- Context and Prompt Packages build from fictional fixtures;
- invalid Context and Prompt scope fails;
- policy references contain no production prompt prose; and
- package snapshots and nested structures are immutable and clone authoritative inputs; and
- prompt-injection-like customer text remains context data and is not promoted into Prompt Package policy fields.

## Parsing and Validation Coverage

- one plain JSON object succeeds;
- empty, malformed, oversized, deeply nested, array, trailing-prose, and dangerous-key output fails;
- missing required fields, invalid field types, and unexpected fields fail;
- valid intent and fact proposals pass;
- unknown proposal types and action-like extra fields fail;
- business, conversation, profile, and state mismatches fail;
- unknown fields, inactive services, invalid message references, and ungrounded knowledge fail;
- escalation, completion, mutation, and customer-release authority claims fail.

## Provider and Decision Coverage

- deterministic completed results normalize and validate;
- refusal remains rejected;
- incomplete and failed results are bounded retry candidates;
- cancellation remains cancelled;
- valid escalation remains a recommendation only;
- contract-supported independent fields can be partially accepted by the decision classifier; and
- missing fields, unsafe authority, and duplicates follow explicit decisions.

## Duplicate Coverage

The first stable proposal identity is recorded. Reprocessing it through the same orchestrator produces `DuplicateProposalProcessing` and no accepted decision.

State-operation and response-release attempt guards are also verified independently without implementing mutation or delivery.

## Invariants

Verification proves:

- no authoritative state mutation;
- no customer response release;
- no network access;
- no provider credentials or environment variables;
- no real provider/model/SDK;
- no production prompt content;
- no persistence;
- deterministic equivalent results for identical fixtures at task, context, prompt, provider, normalization, parser, validator, duplicate-guard, decision, and final-snapshot stages;
- immutable inputs remain unchanged; and
- result snapshots are frozen.

All fixtures are fictional and reuse the certified Sprint 3 Business Profile, conversation, and approved knowledge fixture boundary.

## Existing Certification

The full existing command remains mandatory:

```powershell
npm.cmd run verify:prototype
```

This confirms the AI foundation has not changed deterministic intake, `/prototype`, state management, escalation, completion, or handoff behavior.

## Related Documents

- [AI Integration Prototype Foundation](AI_INTEGRATION_PROTOTYPE_FOUNDATION.md)
- [AI Prototype Contracts](AI_PROTOTYPE_CONTRACTS.md)
- [Sprint 3 Certification](SPRINT_3_CERTIFICATION.md)
- [Sprint 4 Certification](certification/SPRINT4_CERTIFICATION.md)
