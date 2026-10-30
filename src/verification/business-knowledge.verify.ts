import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { BusinessProfile } from "../domain/business-profile";
import type { KnowledgeRecord } from "../domain/knowledge-record";
import { fictionalBusinessProfile } from "../fixtures/business-profile";
import { initializedConversationState } from "../fixtures/conversation";
import { fictionalKnowledgeRecords } from "../fixtures/knowledge";
import type { AiOperationIdentity } from "../ai/contracts/identities";
import type { ContextPackage } from "../ai/contracts/packages";
import { PrototypeContextPackageBuilder } from "../ai/context/context-package-builder";
import { PrototypePromptPackageComposer } from "../ai/prompts/prompt-package-composer";
import { renderProviderInstructions } from "../ai/prompts/provider-instruction-renderer";
import { AI_POLICY_VERSIONS } from "../ai/registries/policy-versions";
import { OutputContractRegistry } from "../ai/registries/output-contract-registry";
import { TaskRegistry } from "../ai/registries/task-registry";
import { detectBusinessInformationQuestion } from "../ai/grounding/business-question-router";
import {
  extractTimeTokens,
  resolveBusinessHours,
  type BusinessHoursReference,
} from "../ai/grounding/business-hours";
import {
  GROUNDED_ANSWER_FALLBACK,
  validateGroundedAnswer,
} from "../ai/grounding/grounded-answer-validation";
import { selectApprovedKnowledge } from "../ai/grounding/knowledge-selection";
import { createFakeProvider } from "../ai/providers/fake-local-provider";
import { AiDemoChatSession } from "../prototype-ui/ai-demo-chat-session";
import { ReceptionistConversationService } from "../server/conversation/receptionist-conversation-service";

const BUSINESS_A = fictionalBusinessProfile.id;
const BUSINESS_B = "second-fictional-business";
const CONVERSATION_ID = "fictional-conversation-hours-001";
/** Friday 30 October 2026, 10:00 in America/New_York (EDT). */
const FRIDAY = Date.UTC(2026, 9, 30, 14, 0, 0);
/** Saturday 31 October 2026, 11:00 in America/New_York (EDT). */
const SATURDAY = Date.UTC(2026, 9, 31, 15, 0, 0);

async function run(): Promise<void> {
  await verifyQuestionRouting();
  await verifyApprovedKnowledgeInclusion();
  await verifyExcludedKnowledge();
  await verifyCustomerOnlyVisibility();
  await verifyCrossBusinessIsolation();
  await verifyTimeZoneInterpretation();
  await verifyMissingOrAmbiguousHours();
  await verifyUnsupportedClaims();
  await verifyGroundingReferenceValidation();
  await verifyOfflineProviderExecution();
  await verifyNoExternalNetworkActivity();
  await verifyBrowserDemoStillWorks();
  console.log(
    "Stage B2.4B.1 business knowledge verification passed: approved knowledge inclusion, "
    + "customer-only visibility, inactive and future-dated exclusion, cross-business isolation, "
    + "business-time-zone day resolution, missing-hours fallback, unsupported-claim rejection, "
    + "grounding-reference validation, offline grounded answers, and no external network activity.",
  );
}

async function verifyQuestionRouting(): Promise<void> {
  const today = detectBusinessInformationQuestion("Hello, what time does your business close today?");
  assert(today.kind === "hours" && today.question.dayFocus === "today",
    "a closing-time question is recognised as a today question");
  const weekend = detectBusinessInformationQuestion("What are your weekend hours?");
  assert(weekend.kind === "hours" && weekend.question.dayFocus === "weekend",
    "a weekend question is recognised");
  const monday = detectBusinessInformationQuestion("What time do you open on Monday?");
  assert(monday.kind === "hours" && monday.question.weekday === "monday",
    "a named weekday is carried to the answer task");
  for (const message of [
    "I need project help.",
    "My basement is flooding right now.",
    "My name is Dana Example.",
    "Type confirm to approve the fictional intake.",
  ]) {
    assert(detectBusinessInformationQuestion(message).kind === "none",
      `"${message}" is not treated as a business-information question`);
  }
}

async function verifyApprovedKnowledgeInclusion(): Promise<void> {
  const built = buildContext(fictionalKnowledgeRecords, { businessHours: hoursAt(FRIDAY) });
  const packageValue = built.contextPackage;
  assert(packageValue.approvedKnowledgeExcerpts.length === fictionalKnowledgeRecords.length,
    "every approved knowledge record is selected for the active business");
  assert(packageValue.approvedKnowledge.every((reference) => reference.sensitivity === "customer"),
    "selected references are customer-facing");
  assert(packageValue.knowledgeSelection.includedIds.length
    === packageValue.approvedKnowledgeExcerpts.length,
  "the selection metadata matches the selected records");
  const hours = packageValue.approvedKnowledgeExcerpts.find((record) => record.id === "regular-hours");
  assert(hours !== undefined && hours.content.includes("8:00 AM-5:00 PM"),
    "the approved hours text is included in the package");
  assert(packageValue.businessHours !== null && packageValue.businessHours.status === "available",
    "the resolved hours are part of the package");

  const rendered = built.rendered.input;
  assert(rendered.includes("8:00 AM-5:00 PM"),
    "the rendered provider input carries the approved knowledge text");
  assert(rendered.includes("\"businessHours\""),
    "the rendered provider input carries the resolved business hours");
  assert(built.rendered.estimatedCharacters <= 24_000,
    "the rendered instructions stay within the provider character limit");
}

async function verifyExcludedKnowledge(): Promise<void> {
  const draft = { ...fictionalKnowledgeRecords[0], id: "draft-note", lifecycleState: "draft" as const };
  const staff = {
    ...fictionalKnowledgeRecords[1],
    id: "staff-runbook",
    audience: "staff" as const,
    content: "Internal fictional staff escalation runbook.",
  };
  const future = {
    ...fictionalKnowledgeRecords[2],
    id: "future-policy",
    effectiveDate: "2027-01-01",
  };
  const foreign = { ...fictionalKnowledgeRecords[0], id: "other-business-note", businessProfileId: BUSINESS_B };
  const oversized = {
    ...fictionalKnowledgeRecords[3],
    id: "oversized-note",
    content: "x".repeat(700),
  };
  const knowledge = [
    ...fictionalKnowledgeRecords,
    draft,
    staff,
    future,
    foreign,
    oversized,
    { ...fictionalKnowledgeRecords[0] },
  ];

  const selection = selectApprovedKnowledge({
    businessId: BUSINESS_A,
    knowledge,
    asOfDate: "2026-10-30",
  });
  const reasons = new Map(selection.excluded.map((entry) => [entry.id, entry.reason]));
  assert(reasons.get("draft-note") === "inactive", "a draft record is excluded as inactive");
  assert(reasons.get("staff-runbook") === "staff-only", "a staff record is excluded");
  assert(reasons.get("future-policy") === "future-effective-date",
    "a not-yet-effective record is excluded");
  assert(reasons.get("other-business-note") === "other-business",
    "another business's record is excluded");
  assert(reasons.get("oversized-note") === "over-limit",
    "a record beyond the content limit is excluded rather than truncated");
  assert(reasons.get("service-home-project-consultation") === "duplicate-id",
    "a duplicate identifier is excluded");
  const ids = selection.selected.map((record) => record.id);
  for (const excludedId of ["draft-note", "staff-runbook", "future-policy", "other-business-note", "oversized-note"]) {
    assert(!ids.includes(excludedId), `${excludedId} never reaches a model`);
  }
  assert(selection.totalCharacters <= selection.limits.totalCharacters,
    "the selection respects the total character budget");
}

async function verifyCustomerOnlyVisibility(): Promise<void> {
  const staffOnly = {
    ...fictionalKnowledgeRecords[1],
    id: "internal-only-note",
    audience: "staff" as const,
    content: "Internal fictional note that must never reach a customer.",
  };
  const built = buildContext(
    [...fictionalKnowledgeRecords, staffOnly],
    { businessHours: hoursAt(FRIDAY) },
  );
  const serializedPackage = JSON.stringify(built.contextPackage);
  assert(!serializedPackage.includes("must never reach a customer"),
    "staff-only knowledge text is absent from the context package");
  assert(!built.rendered.input.includes("must never reach a customer"),
    "staff-only knowledge text is absent from the provider input");
}

async function verifyCrossBusinessIsolation(): Promise<void> {
  const foreign = {
    ...fictionalKnowledgeRecords[1],
    id: "other-business-regular-hours",
    businessProfileId: BUSINESS_B,
    content: "The second fictional business is available Saturday 9:00 AM-1:00 PM.",
  };
  const built = buildContext([...fictionalKnowledgeRecords, foreign], {
    businessHours: hoursAt(FRIDAY),
  });
  assert(!JSON.stringify(built.contextPackage).includes("9:00 AM-1:00 PM"),
    "another business's hours text never enters this business's package");

  const foreignCitation = validateGroundedAnswer({
    proposal: groundedProposal({
      customerFacingText: "The second fictional business is open on Saturday.",
      knowledgeSourceReferences: ["other-business-regular-hours"],
      insufficientKnowledge: false,
    }),
    contextPackage: built.contextPackage,
    businessHours: hoursAt(FRIDAY),
    businessProfile: fictionalBusinessProfile,
  });
  assert(foreignCitation.verdict === "rejected"
    && foreignCitation.failures.includes("KnowledgeGroundingFailure"),
  "a citation of another business's knowledge is rejected");
  assert(foreignCitation.authorizedText === GROUNDED_ANSWER_FALLBACK,
    "a rejected answer releases the application's limitation sentence instead");
}

async function verifyTimeZoneInterpretation(): Promise<void> {
  const friday = resolveBusinessHours({ profile: fictionalBusinessProfile, nowMs: FRIDAY });
  assert(friday.status === "available", "the configured hours resolve");
  if (friday.status !== "available") return;
  assert(friday.weekday === "friday" && friday.localDate === "2026-10-30",
    "the current day is resolved in the business time zone, not the server's");
  assert(friday.todayStatus === "open" && friday.todayClosesAt === "5:00 PM",
    "Friday's approved closing time is 5:00 PM");
  assert(friday.closedWeekdays.join(",") === "saturday,sunday",
    "the closed days come from the configured schedule");
  assert(friday.approvedTimeTokens.includes("8:00 AM") && friday.approvedTimeTokens.includes("5:00 PM"),
    "the approved time tokens come from the schedule and the approved hours text");

  const saturday = resolveBusinessHours({ profile: fictionalBusinessProfile, nowMs: SATURDAY });
  assert(saturday.status === "available" && saturday.weekday === "saturday",
    "an instant late in the UTC day still resolves to the business-local day");
  if (saturday.status !== "available") return;

  // 20:00 UTC on 30 October is already 31 October in Tokyo, so a server-local
  // calculation would name the wrong day.
  const tokyo: BusinessProfile = {
    ...fictionalBusinessProfile,
    hours: { timeZone: "Asia/Tokyo", weeklySchedule: { ...fictionalBusinessProfile.hours.weeklySchedule } },
  };
  const tokyoHours = resolveBusinessHours({
    profile: tokyo,
    nowMs: Date.UTC(2026, 9, 30, 20, 0, 0),
  });
  assert(tokyoHours.status === "available" && tokyoHours.localDate === "2026-10-31"
    && tokyoHours.weekday === "saturday",
  "the business's own time zone determines the day");
  assert(extractTimeTokens("open 8:00 AM until 5:00 PM").join(",") === "5:00 PM,8:00 AM",
    "time tokens are extracted deterministically");
}

async function verifyMissingOrAmbiguousHours(): Promise<void> {
  const noZone: BusinessProfile = {
    ...fictionalBusinessProfile,
    hours: { timeZone: "", weeklySchedule: { ...fictionalBusinessProfile.hours.weeklySchedule } },
  };
  const unknownZone: BusinessProfile = {
    ...fictionalBusinessProfile,
    hours: { timeZone: "Mars/Olympus", weeklySchedule: { ...fictionalBusinessProfile.hours.weeklySchedule } },
  };
  const ambiguous: BusinessProfile = {
    ...fictionalBusinessProfile,
    hours: {
      timeZone: "America/New_York",
      weeklySchedule: { ...fictionalBusinessProfile.hours.weeklySchedule, monday: "Call to confirm" },
    },
  };
  const incomplete: BusinessProfile = {
    ...fictionalBusinessProfile,
    hours: {
      timeZone: "America/New_York",
      weeklySchedule: { monday: "8:00 AM-5:00 PM", tuesday: "8:00 AM-5:00 PM" },
    },
  };
  for (const [label, profile, reason] of [
    ["a missing time zone", noZone, "missing-hours"],
    ["an unknown time zone", unknownZone, "invalid-time-zone"],
    ["an unreadable schedule entry", ambiguous, "ambiguous-schedule"],
    ["an incomplete weekly schedule", incomplete, "missing-hours"],
  ] as const) {
    const resolved = resolveBusinessHours({ profile, nowMs: FRIDAY });
    assert(resolved.status === "unavailable" && resolved.reason === reason,
      `${label} fails closed as ${reason}`);
  }

  const unavailable = resolveBusinessHours({ profile: ambiguous, nowMs: FRIDAY });
  const built = buildContext(fictionalKnowledgeRecords, { businessHours: unavailable });
  const invented = validateGroundedAnswer({
    proposal: groundedProposal({
      customerFacingText: "Friendly Home Services is open today from 10:00 AM to 6:00 PM.",
      knowledgeSourceReferences: ["regular-hours"],
      insufficientKnowledge: false,
    }),
    contextPackage: built.contextPackage,
    businessHours: unavailable,
    businessProfile: fictionalBusinessProfile,
  });
  assert(invented.verdict === "rejected", "no hours answer is supported when hours are unreadable");
  assert(invented.authorizedText === GROUNDED_ANSWER_FALLBACK,
    "an unreadable schedule produces the limitation sentence, not the model's times");
}

async function verifyUnsupportedClaims(): Promise<void> {
  const hours = hoursAt(FRIDAY);
  const built = buildContext(fictionalKnowledgeRecords, { businessHours: hours });
  const check = (proposal: Readonly<Record<string, unknown>>, businessHours = hours) =>
    validateGroundedAnswer({
      proposal: groundedProposal(proposal),
      contextPackage: built.contextPackage,
      businessHours,
      businessProfile: fictionalBusinessProfile,
    });

  const supported = check({
    customerFacingText: "Friendly Home Services is open today from 8:00 AM to 5:00 PM.",
    knowledgeSourceReferences: ["regular-hours"],
    insufficientKnowledge: false,
  });
  assert(supported.verdict === "supported", "an answer copied from approved hours is supported");
  assert(supported.text === "Friendly Home Services is open today from 8:00 AM to 5:00 PM.",
    "a supported answer keeps the model's verified wording");

  const inventedClose = check({
    customerFacingText: "Friendly Home Services is open today from 8:00 AM to 6:00 PM.",
    knowledgeSourceReferences: ["regular-hours"],
    insufficientKnowledge: false,
  });
  assert(inventedClose.verdict === "rejected" && inventedClose.failures.includes("UnsupportedClaim"),
    "an invented closing time is rejected");

  const holiday = check({
    customerFacingText: "The business is closed today for Thanksgiving.",
    knowledgeSourceReferences: ["regular-hours"],
    insufficientKnowledge: false,
  });
  assert(holiday.verdict === "rejected" && holiday.failures.includes("UnsupportedClaim"),
    "an unsupported holiday closure is rejected");

  const wrongBusiness = check({
    customerFacingText: "Acme Home Services is open today from 8:00 AM to 5:00 PM.",
    knowledgeSourceReferences: ["regular-hours"],
    insufficientKnowledge: false,
  });
  assert(wrongBusiness.verdict === "rejected" && wrongBusiness.failures.includes("InvalidBusinessScope"),
    "a claim about a different business is rejected");

  const inactiveService = check({
    customerFacingText: "The Inactive Fixture Service is available today from 8:00 AM to 5:00 PM.",
    knowledgeSourceReferences: ["regular-hours"],
    insufficientKnowledge: false,
  });
  assert(inactiveService.verdict === "rejected"
    && inactiveService.failures.includes("InactiveServiceReference"),
  "an inactive service is never presented as available");

  const closedDayClaim = check({
    customerFacingText: "Friendly Home Services is open on Saturday from 8:00 AM to 5:00 PM.",
    knowledgeSourceReferences: ["regular-hours"],
    insufficientKnowledge: false,
  });
  assert(closedDayClaim.verdict === "rejected" && closedDayClaim.failures.includes("UnsupportedClaim"),
    "opening times are rejected on a day the schedule closes");

  const openWhenClosed = validateGroundedAnswer({
    proposal: groundedProposal({
      customerFacingText: "Friendly Home Services is open today from 8:00 AM to 5:00 PM.",
      knowledgeSourceReferences: ["regular-hours"],
      insufficientKnowledge: false,
    }),
    contextPackage: built.contextPackage,
    businessHours: hoursAt(SATURDAY),
    businessProfile: fictionalBusinessProfile,
  });
  assert(openWhenClosed.verdict === "rejected",
    "a statement that today is open is rejected when today is closed");

  const promise = check({
    customerFacingText: "Friendly Home Services is open today from 8:00 AM to 5:00 PM, guaranteed.",
    knowledgeSourceReferences: ["regular-hours"],
    insufficientKnowledge: false,
  });
  assert(promise.verdict === "rejected" && promise.failures.includes("UnsupportedPromise"),
    "an unsupported promise is rejected");
}

async function verifyGroundingReferenceValidation(): Promise<void> {
  const hours = hoursAt(FRIDAY);
  const built = buildContext(fictionalKnowledgeRecords, { businessHours: hours });
  const validate = (proposal: Readonly<Record<string, unknown>>) => validateGroundedAnswer({
    proposal: groundedProposal(proposal),
    contextPackage: built.contextPackage,
    businessHours: hours,
    businessProfile: fictionalBusinessProfile,
  });

  const unknownReference = validate({
    customerFacingText: "The business is open today.",
    knowledgeSourceReferences: ["knowledge-that-does-not-exist"],
    insufficientKnowledge: false,
  });
  assert(unknownReference.verdict === "rejected"
    && unknownReference.failures.includes("KnowledgeGroundingFailure"),
  "a citation of an unknown record is rejected");

  const noCitations = validate({
    customerFacingText: "The business is open today from 8:00 AM to 5:00 PM.",
    knowledgeSourceReferences: [],
    insufficientKnowledge: false,
  });
  assert(noCitations.verdict === "rejected"
    && noCitations.failures.includes("KnowledgeGroundingFailure"),
  "a grounded claim without a citation is rejected");

  const insufficient = validate({
    customerFacingText: "I cannot confirm the hours from the approved information available to me.",
    knowledgeSourceReferences: [],
    insufficientKnowledge: true,
  });
  assert(insufficient.verdict === "insufficient",
    "an honest insufficiency is recorded as insufficient rather than unsupported");
  assert(insufficient.authorizedText === GROUNDED_ANSWER_FALLBACK,
    "the application, not the model, words the limitation");

  const wrongShape = validate({ customerFacingText: 42, knowledgeSourceReferences: [], insufficientKnowledge: false });
  assert(wrongShape.verdict === "rejected" && wrongShape.failures.includes("RequiredFieldMissing"),
    "a malformed answer is rejected");
}

async function verifyOfflineProviderExecution(): Promise<void> {
  const fake = createFakeProvider({ mode: "success" });
  const service = new ReceptionistConversationService([businessA()], {
    transport: fake.transport,
    now: () => FRIDAY,
  });
  const handle = service.begin(BUSINESS_A, CONVERSATION_ID);
  assert(handle !== null, "the conversation is created");
  if (handle === null) return;

  const outcome = await service.submit({
    handle,
    message: "Hello, what time does your business close today?",
  });
  assert(outcome.status === "ok", "the hours question is served");
  if (outcome.status !== "ok") return;
  assert(outcome.decision === "answered", "a business answer is reported as answered");
  const answer = outcome.messages[outcome.messages.length - 1];
  assert(answer !== undefined && answer.role === "assistant", "the answer is an assistant message");
  assert(answer !== undefined && answer.text.includes("5:00 PM"),
    "the answer states the approved closing time");
  assert(answer !== undefined && !extractTimeTokens(answer.text).includes("6:00 PM"),
    "the answer invents no additional time");
  assert(outcome.conversation.revision === 0 && outcome.conversation.stage === "initialized",
    "answering a question changes no conversation state");
  assert(fake.invocationCount() === 1, "the provider was invoked once, locally");

  const weekend = await service.submit({ handle, message: "What are your weekend hours?" });
  assert(weekend.status === "ok" && weekend.decision === "answered", "the weekend question is served");
  if (weekend.status === "ok") {
    const text = weekend.messages[weekend.messages.length - 1]?.text ?? "";
    assert(text.includes("closed"), "the weekend answer reports the configured closure");
    assert(extractTimeTokens(text).length === 0, "a closed weekend states no opening time");
  }

  const monday = await service.submit({ handle, message: "What time do you open on Monday?" });
  assert(monday.status === "ok" && monday.decision === "answered", "the weekday question is served");
  if (monday.status === "ok") {
    const text = monday.messages[monday.messages.length - 1]?.text ?? "";
    assert(text.includes("8:00 AM") && text.includes("5:00 PM"),
      "the named weekday answer uses approved times");
    assert(!text.includes("today"), "a named weekday is not answered as today");
  }

  const generic = await service.submit({ handle, message: "What time do you open?" });
  assert(generic.status === "ok" && generic.decision === "answered",
    "an unspecified-day question is served from the weekly schedule");
  if (generic.status === "ok") {
    const text = generic.messages[generic.messages.length - 1]?.text ?? "";
    assert(text.includes("8:00 AM") && text.includes("5:00 PM"),
      "the weekly answer uses approved times");
    const approved = hoursAt(FRIDAY);
    const allowed = approved.status === "available" ? approved.approvedTimeTokens : [];
    assert(extractTimeTokens(text).every((token) => allowed.includes(token)),
      "the weekly answer states no time the schedule does not contain");
  }

  const openWhenClosed = new ReceptionistConversationService([businessA()], {
    transport: fake.transport,
    now: () => SATURDAY,
  });
  const saturdayHandle = openWhenClosed.begin(BUSINESS_A, `${CONVERSATION_ID}-sat`);
  assert(saturdayHandle !== null, "a second conversation is created");
  if (saturdayHandle !== null) {
    const result = await openWhenClosed.submit({ handle: saturdayHandle, message: "Are you open today?" });
    assert(result.status === "ok" && result.decision === "answered", "the closed-day question is served");
    if (result.status === "ok") {
      const text = result.messages[result.messages.length - 1]?.text ?? "";
      assert(text.includes("closed today"), "the answer reports the configured closure for today");
    }
  }

  const hallucinating = createFakeProvider({ mode: "grounding-unsupported-time" });
  const guarded = new ReceptionistConversationService([businessA()], {
    transport: hallucinating.transport,
    now: () => FRIDAY,
  });
  const guardedHandle = guarded.begin(BUSINESS_A, `${CONVERSATION_ID}-guard`);
  assert(guardedHandle !== null, "the guarded conversation is created");
  if (guardedHandle !== null) {
    const result = await guarded.submit({ handle: guardedHandle, message: "What time do you close today?" });
    assert(result.status === "ok", "a bad answer fails safely rather than failing the turn");
    if (result.status === "ok") {
      const text = result.messages[result.messages.length - 1]?.text ?? "";
      assert(text === GROUNDED_ANSWER_FALLBACK,
        "an answer with unapproved times is replaced by the application's limitation sentence");
      assert(!text.includes("7:00 AM") && !text.includes("11:00 PM"),
        "the rejected text is never released");
    }
  }

  const foreignSource = createFakeProvider({ mode: "grounding-foreign-source" });
  const cited = new ReceptionistConversationService([businessA()], {
    transport: foreignSource.transport,
    now: () => FRIDAY,
  });
  const citedHandle = cited.begin(BUSINESS_A, `${CONVERSATION_ID}-cite`);
  assert(citedHandle !== null, "the citation probe conversation is created");
  if (citedHandle !== null) {
    const result = await cited.submit({ handle: citedHandle, message: "What are your hours today?" });
    assert(result.status === "ok" && result.decision === "answered", "the citation probe is served");
    if (result.status === "ok") {
      const text = result.messages[result.messages.length - 1]?.text ?? "";
      assert(text === GROUNDED_ANSWER_FALLBACK, "a foreign citation is replaced by the limitation sentence");
    }
  }
}

async function verifyNoExternalNetworkActivity(): Promise<void> {
  const sources = [
    "src/ai/grounding/business-hours.ts",
    "src/ai/grounding/knowledge-selection.ts",
    "src/ai/grounding/business-question-router.ts",
    "src/ai/grounding/grounded-answer-validation.ts",
    "src/ai/demo/simulated-model-transport.ts",
    "src/ai/demo/ai-demo-turn.ts",
    "src/ai/providers/fake-local-provider.ts",
    "src/server/conversation/receptionist-conversation-service.ts",
  ];
  for (const source of sources) {
    const text = readFileSync(join(process.cwd(), source), "utf8");
    assert(!/from\s+"node:(?:http|https|net|dns|tls|dgram)"/.test(text),
      `${source} opens no network capability`);
    assert(!/from\s+"undici"|require\("undici"\)/.test(text),
      `${source} carries no HTTP client`);
    assert(!/http-model-transport/.test(text),
      `${source} does not import the provider HTTP transport`);
    assert(!/\bfetch\s*\(/.test(text), `${source} performs no fetch call`);
  }

  const originalFetch = globalThis.fetch;
  let attempted = 0;
  globalThis.fetch = (() => {
    attempted += 1;
    throw new Error("network access is disabled in verification");
  }) as typeof globalThis.fetch;
  try {
    const fake = createFakeProvider({ mode: "success" });
    const service = new ReceptionistConversationService([businessA()], {
      transport: fake.transport,
      now: () => FRIDAY,
    });
    const handle = service.begin(BUSINESS_A, `${CONVERSATION_ID}-offline`);
    assert(handle !== null, "the offline conversation is created");
    if (handle !== null) {
      const result = await service.submit({ handle, message: "How late are you open today?" });
      assert(result.status === "ok" && result.decision === "answered",
        "a grounded answer is produced while the network is unavailable");
    }
    assert(attempted === 0, "no outbound request was attempted");
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function verifyBrowserDemoStillWorks(): Promise<void> {
  const session = new AiDemoChatSession({ now: () => FRIDAY });
  const first = await session.submit("I need project help.");
  const firstTranscript = first.messages.map((message) => message.text).join("\n");
  assert(firstTranscript.includes("Home Project Consultation"),
    "the existing simulated service request still resolves");
  assert(first.decision.revisionAfter !== null && first.decision.revisionAfter > 0,
    "the deterministic engine still applies the accepted interpretation");

  const second = await session.submit("What time does your business close today?");
  const hoursAnswer = second.messages.map((message) => message.text).join("\n");
  assert(hoursAnswer.includes("5:00 PM"),
    "the browser demonstration answers an hours question from approved hours");
  assert(second.turns === 2, "the demonstration still counts turns");
  assert(second.decision.revisionAfter === second.decision.revisionBefore,
    "answering an information question changes no conversation state");

  const third = await session.submit("My name is Dana Example.");
  assert(third.messages.length > second.messages.length,
    "the demonstration continues to answer after an information question");
  assert(third.decision.taskIdentifier === "candidate_fact_extraction",
    "the intake flow resumes after the information question");
}

function hoursAt(nowMs: number): BusinessHoursReference {
  return resolveBusinessHours({ profile: fictionalBusinessProfile, nowMs });
}

function groundedProposal(
  proposal: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  return { proposalType: "knowledge_grounded_answer", ...proposal };
}

function buildContext(
  knowledge: readonly KnowledgeRecord[],
  options: { readonly businessHours?: BusinessHoursReference | null } = {},
): {
  readonly contextPackage: ContextPackage;
  readonly rendered: { readonly input: string; readonly estimatedCharacters: number };
} {
  const taskResult = new TaskRegistry().resolve("knowledge_grounded_answer", 1);
  assert(taskResult.status === "success", "the knowledge task resolves");
  if (taskResult.status !== "success") throw new Error("unreachable");
  const task = taskResult.value;
  const contractResult = new OutputContractRegistry().resolve(task.compatibleOutputContract, 1);
  assert(contractResult.status === "success", "the knowledge contract resolves");
  if (contractResult.status !== "success") throw new Error("unreachable");
  const contract = contractResult.value;

  const state = { ...initializedConversationState, conversationId: CONVERSATION_ID };
  const identity: AiOperationIdentity = {
    requestId: "verification-request-hours",
    traceId: "verification-trace-hours",
    businessId: fictionalBusinessProfile.id,
    conversationId: CONVERSATION_ID,
    profileVersion: fictionalBusinessProfile.version,
    stateRevision: state.revision,
    taskIdentifier: task.identifier,
    taskVersion: task.version,
  };
  const contextResult = new PrototypeContextPackageBuilder().build({
    identity,
    contextPackageId: "verification-context-hours",
    businessIdentity: {
      id: fictionalBusinessProfile.id,
      displayName: fictionalBusinessProfile.businessName,
    },
    businessProfile: fictionalBusinessProfile,
    conversationState: state,
    task,
    knowledge,
    businessHours: options.businessHours ?? null,
    conversationEntries: [],
    currentCustomerInput: {
      messageId: "verification-message-hours",
      conversationId: CONVERSATION_ID,
      source: "customer",
      sequence: 1,
      content: "Hello, what time does your business close today?",
    },
    policyVersions: AI_POLICY_VERSIONS,
  });
  assert(contextResult.status === "success", "the context package builds");
  if (contextResult.status !== "success") throw new Error("unreachable");

  const promptResult = new PrototypePromptPackageComposer().compose({
    promptPackageId: "verification-prompt-hours",
    task,
    contextPackage: contextResult.value,
    outputContract: contract,
    policyVersions: AI_POLICY_VERSIONS,
  });
  assert(promptResult.status === "success", "the prompt package composes");
  if (promptResult.status !== "success") throw new Error("unreachable");

  const renderResult = renderProviderInstructions({
    promptPackage: promptResult.value,
    task,
    outputContract: contract,
    contextPackage: contextResult.value,
  });
  assert(renderResult.status === "success", "the provider instructions render");
  if (renderResult.status !== "success") throw new Error("unreachable");

  return {
    contextPackage: contextResult.value,
    rendered: {
      input: renderResult.value.input,
      estimatedCharacters: renderResult.value.estimatedCharacters,
    },
  };
}

function businessA() {
  return { profile: fictionalBusinessProfile, knowledge: fictionalKnowledgeRecords };
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Stage B2.4B.1 business knowledge verification failed: ${message}.`);
  }
}

run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Business knowledge verification failed.");
  process.exitCode = 1;
});
