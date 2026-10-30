# Business Knowledge and Grounding

Stage B2.4B.1 lets the receptionist answer a customer's business question from
approved business information instead of only interpreting service requests. It
runs entirely offline: the same simulated and fake local transports are used,
provider network execution stays disabled, and no paid service, credential, or
telephony provider is involved.

## What the application decides, and what the model may do

| Decision | Owner |
| --- | --- |
| Whether the message asks about business information | application (`detectBusinessInformationQuestion`) |
| Which approved task runs | application (`selectAiDemoTask`) |
| Which knowledge records a model may see | application (`selectApprovedKnowledge`) |
| Which day the answer is about, and today's schedule | application (`resolveBusinessHours`) |
| The output shape and its limits | application (output contract) |
| Whether the answer is supported by approved material | application (`validateGroundedAnswer`) |
| The text a customer sees | application (verified text or its own limitation sentence) |
| Any state change, escalation, handoff, or completion | application (deterministic engine) |

The model receives the resolved business hours and the text of selected approved
knowledge records, and returns one contract-shaped proposal. It never selects a
task, a knowledge source, or a day, and it cannot release text: `runAiDemoTurn`
runs the grounding check and puts an `authorizedText` on the result, which is the
model's validated text or `GROUNDED_ANSWER_FALLBACK`.

## Knowledge selection rules

`src/ai/grounding/knowledge-selection.ts` applies these rules in order and
records a reason for every rejection:

1. **Usable record.** A record missing required fields, or with an invalid
   version, is excluded as `invalid-record`.
2. **Business scope.** `businessProfileId` must equal the authenticated
   business. Another business's record is excluded as `other-business`.
3. **Lifecycle.** Only `lifecycleState: "active"` is eligible; anything else is
   `inactive`.
4. **Audience.** Only `customer` or `both` is eligible. Staff-only records are
   `staff-only` and never reach a model or a customer.
5. **Effective date.** With a business-local day available, a record whose
   `effectiveDate` is later than that day is `future-effective-date`.
6. **Duplicates.** A repeated identifier is `duplicate-id`.
7. **Limits.** At most 8 records, 600 characters per record, and 3,000
   characters in total. A record that does not fit is excluded as `over-limit`
   rather than truncated, because a partial record could appear to support a
   claim its source does not make.

Selection order is deterministic: hours first, then service descriptions,
policies, appointment expectations, then category and identifier. The selected
records are carried in the context package as `approvedKnowledgeExcerpts`, and
the identifiers alone remain in `approvedKnowledge`, which the existing proposal
validator already uses to reject an unapproved citation.

## Business hours handling

`src/ai/grounding/business-hours.ts` resolves the profile's schedule for one
instant:

- The day and date are computed **in the business's configured IANA time zone**
  with `Intl.DateTimeFormat`, never from the server's local time. A 20:00 UTC
  instant on 30 October is already Saturday 31 October in Tokyo.
- Each weekly entry is parsed into canonical `H:MM AM/PM` tokens. `Closed` is
  recognised. Anything else (for example `Call to confirm`), a missing day, an
  all-closed week, an empty time zone, or an unknown time zone makes the hours
  **unavailable** with a reason, and no hours answer is supported.
- The same resolution produces `approvedTimeTokens` and `sourceKnowledgeIds`,
  which ground the answer and validate it afterwards.
- No holiday, exception, or seasonal calendar exists in the profile, so none can
  be claimed. A holiday or calendar-date claim is rejected unless the token
  appears in the approved knowledge text.

The instant is supplied by the caller (`businessHoursNowMs`, or the `now`
option on the service and demo session), so verification is reproducible and no
module reads a clock on its own.

## Grounding validation

`src/ai/grounding/grounded-answer-validation.ts` runs after the schema and
proposal validators accept a proposal, and only on application-approved
material. It returns `supported`, `insufficient`, or `rejected`:

- **Citations.** Every identifier in `knowledgeSourceReferences` must be a record
  the application selected for this request. Unknown, inactive, foreign, or
  unselected identifiers are `KnowledgeGroundingFailure`. A claim with no
  citation is also a failure.
- **Times.** Every time-of-day token in the text must appear in the approved
  schedule or approved hours text. An invented opening or closing time is
  `UnsupportedClaim`.
- **Days.** A day named in the text must come from the schedule. Opening times
  are refused on a closed day, "open" is refused when every named day (or today)
  is closed, and "closed" is refused when every named day (or today) is open.
- **Dates and holidays.** A holiday or calendar-date claim is refused unless the
  approved text contains it.
- **Business identity.** A different business name is `InvalidBusinessScope`.
- **Services.** An inactive service named in the text is
  `InactiveServiceReference`.
- **Promises.** `guarantee`, `promise`, and confirmed-booking phrasing is
  `UnsupportedPromise`. The existing validator independently refuses state
  mutation, release, escalation, completion, confirmation, correction, and tool
  fields.

`authorizedText` is the verified text only for `supported`; otherwise it is the
application's own sentence:

> I can't confirm that from the business's approved information. A team member can follow up.

This is why a hallucinating model is safe: the fake provider's
`grounding-unsupported-time` mode returns a plausible answer with 7:00 AM and
11:00 PM, and the customer receives the limitation sentence instead.

## Runtime behaviour

- Answering a business question is a `"answered"` decision. It changes no
  conversation state, revision, pending question, or handoff, so a customer can
  ask about hours mid-intake and then continue with the pending question.
- The browser demonstration (`AiDemoChatSession`) and the server-side
  `ReceptionistConversationService` share the same pipeline, so the offline demo
  now also answers hours questions from approved material.
- Provider network execution remains `disabled`; the transports are in-process
  and the verification proves no `fetch`, HTTP client, or socket module is
  reachable from the knowledge path.

## Known limitations

- Only business hours are routed as business information. Services, policies,
  service area, and payment questions still follow the interpretation path.
- The claim scanner is rule-based: it refuses an answer it cannot prove. A
  correct but unusually worded answer (for example one that states a range in
  24-hour form or paraphrases a day) may be replaced by the limitation sentence.
  That is the intended failure direction.
- "Open now" is judged from the configured schedule only; there is no holiday,
  exception, or time-of-day evaluation of the current instant against
  `opensAt`/`closesAt`.
- The grounding check validates text, not intent: it cannot detect a misleading
  answer built entirely from approved tokens.
- Knowledge is selected per request from the in-process configuration; the
  activated-configuration store is not yet the source for the pilot runtime.

## Requirements before real AI activation

1. Point knowledge selection at the activated business configuration rather than
   the bundled fixture, with the same scope, lifecycle, audience, and
   effective-date rules.
2. Re-verify provider pricing and complete the B2.4A reservation/settlement
   activation steps before any paid call.
3. Add a holiday and exception calendar to the profile, with the same
   fail-closed resolution, before promising closed-day accuracy.
4. Extend the grounded task to services, policies, and service area, one task
   per question family, so each has its own contract and claim checks.
5. Keep the release rule unchanged: the application, never the provider,
   decides what a customer sees.
