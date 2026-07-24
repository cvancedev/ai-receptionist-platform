# Prompt Injection and Content Boundaries

## Purpose

Injection resistance is an application architecture boundary. It relies on strict source eligibility, explicit content types, stable precedence, narrow tasks, minimal context, constrained output contracts, and post-output validation—not on a model reliably following prose.

## Content Categories

Every Prompt Package distinguishes:

- application-authority instructions;
- task instructions;
- Business Profile policy;
- output-contract requirements;
- approved knowledge;
- customer content;
- conversation history;
- quoted or third-party content; and
- model-generated advisory summaries.

Each category retains owner, authority, scope, source, and version metadata. The Prompt Composer cannot promote data into instructions.

## Customer Content

Customer content may request that the model ignore rules, reveal prompts, change roles, access another business, send messages, alter policy, invoke tools, or accept embedded JSON and pseudo-instructions. These requests remain data.

Customer content cannot:

- alter the selected task or output contract;
- expand business or conversation scope;
- grant tools or side effects;
- override profile or deterministic state;
- reveal restricted layers; or
- authorize direct response release.

A legitimate customer correction remains a candidate correction, not an instruction to mutate state.

## Knowledge Content

Approved knowledge may contain imperative, configuration-like, prompt-like, quoted, malicious, or corrupted text. Approval makes it eligible as scoped reference data only; it does not grant instruction authority.

Knowledge cannot redefine active services, required fields, readiness, escalation, completion, handoff, permissions, or output format. Conflicting or suspicious content is excluded, bounded, or fails under knowledge and injection policy.

## Boundary Techniques

The architecture combines:

- explicit content typing;
- structured sections;
- stable instruction precedence;
- data delimiters;
- source and authority labels;
- narrow task definitions;
- minimal task-specific context;
- explicit permissions and prohibitions;
- versioned output contracts;
- provider-neutral package validation;
- post-output validation; and
- traceable audit decisions.

Delimiters improve parsing and clarity but do not solve prompt injection alone. Provider features are supplemental and cannot replace application controls.

## Hidden Prompt Requests

The model must not expose application-authority instructions, prompt policy, provider credentials, hidden implementation details, secrets, internal notes, or prohibited context. The application avoids placing secrets in a Prompt Package at all.

A customer-visible response should provide a safe limitation without confirming protected content or defensive details.

## Data Exfiltration Prevention

Context Assembly and Prompt Composition prevent requests from containing cross-business records, unrelated conversations, credentials, environment variables, application secrets, unrestricted internal notes, or prohibited operational data.

Prompt text cannot request new retrieval. The Model Gateway and Provider Adapter cannot add context from caches, memory, tools, or external sources.

## Instruction-Like Output

Model output that instructs the application, asks for tools, requests more data, changes a task, or claims new authority remains an untrusted proposal. It has no effect until future output validation and the Application Decision Layer explicitly allow a typed operation.

Partial or streamed output has no authority.

## Injection Failure

When data/instruction separation, authority, or scope cannot be proven:

- do not weaken authority instructions or prohibitions;
- do not expand context;
- do not retry with fewer safeguards;
- recompose only from validated sources and policy;
- use deterministic fallback;
- request clarification where appropriate;
- escalate under deterministic policy; or
- stop safely.

Provider execution is blocked for unresolved injection boundaries.

## Task-Specific Boundaries

- Interpretation and extraction treat the current message solely as evidence for candidates.
- Clarification uses only application-approved ambiguity and options.
- Drafting cannot transform customer instructions into a new action.
- Knowledge-grounded answers cannot use knowledge directives as policy or use outside facts.
- Summaries preserve source categories and cannot normalize malicious instructions into recommendations.
- Escalation recommendations evaluate only included criteria and cannot activate escalation.

## Related Documents

- [Instruction Precedence](INSTRUCTION_PRECEDENCE.md)
- [Prompt Failure and Audit](PROMPT_FAILURE_AND_AUDIT.md)
- [Prompt Security](PROMPT_SECURITY.md)
