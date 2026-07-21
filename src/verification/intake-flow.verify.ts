import type { BusinessProfile } from "../domain/business-profile";
import { DeterministicConversationEngine } from "../conversation/conversation-engine";
import { ConversationStateManager } from "../conversation/conversation-state-manager";
import { resolveIntakeFields } from "../conversation/intake-field-resolution";
import { selectNextIntakeQuestion } from "../conversation/intake-question-selector";
import { resolveService } from "../conversation/service-resolution";
import { fictionalBusinessProfile } from "../fixtures/business-profile";
import { DeterministicHandoffBuilder } from "../handoff/handoff-builder";
import { runDeterministicIntakeDemonstration } from "../prototype";
import { COMPLETION_STATES, CONVERSATION_STAGES, ESCALATION_STATES } from "../shared/constants";
import { validateBusinessProfile } from "../validation/business-profile-validation";

verifyProfileConfiguration();
verifyServiceResolution();
verifyFieldsQuestionsAndAnswers();
verifyReadinessCorrectionsAndHandoff();
verifyUnsupportedIsolationAndDeterminism();

function verifyProfileConfiguration() {
  assert(validateBusinessProfile(fictionalBusinessProfile).valid, "fixture profile is valid");
  assert(!validateBusinessProfile({ ...fictionalBusinessProfile, status: "draft" }).valid, "inactive profile fails closed");
  const duplicateService = { ...fictionalBusinessProfile, services: [fictionalBusinessProfile.services[0], fictionalBusinessProfile.services[0]] };
  assert(!validateBusinessProfile(duplicateService).valid, "duplicate service identifiers fail");
  const duplicateAlias = replaceFirstService({ aliases: ["project help", " Project   Help "] });
  assert(!validateBusinessProfile(duplicateAlias).valid, "normalized duplicate aliases fail");
  const unknownField = replaceFirstService({ requiredIntakeFieldIds: ["unknown-field"] });
  assert(!validateBusinessProfile(unknownField).valid, "unknown intake references fail");
  const missingQuestion: BusinessProfile = {
    ...fictionalBusinessProfile,
    intakeRequirements: fictionalBusinessProfile.intakeRequirements.map((field) =>
      field.id === "customer-name" ? { ...field, question: "" } : field,
    ),
  };
  assert(!validateBusinessProfile(missingQuestion).valid, "missing required question fails");
}

function verifyServiceResolution() {
  const { state } = createContext();
  assertResolved(resolveService(fictionalBusinessProfile, state, "home-project-consultation"), "exact identifier");
  assertResolved(resolveService(fictionalBusinessProfile, state, "Home Project Consultation"), "exact name");
  assertResolved(resolveService(fictionalBusinessProfile, state, "  PROJECT   HELP "), "normalized alias");
  assert(resolveService(fictionalBusinessProfile, state, "").status === "missing", "missing service input");
  assert(resolveService(fictionalBusinessProfile, state, "consultation").status === "ambiguous", "shared alias is ambiguous");
  assert(resolveService(fictionalBusinessProfile, state, "fictional roof replacement").status === "unsupported", "unsupported service stays unsupported");
  assert(resolveService(fictionalBusinessProfile, state, "inactive fixture service").status === "unsupported", "inactive service is ignored");
  assert(resolveService(fictionalBusinessProfile, { ...state, businessProfileId: "another-business" }, "project help").status === "blocked", "cross-profile resolution fails");
}

function verifyFieldsQuestionsAndAnswers() {
  const context = createContext();
  const engine = new DeterministicConversationEngine(fictionalBusinessProfile, context.manager, context.state.conversationId);
  const started = engine.initializeIntake("project help", "fictional-service-message");
  assert(started.serviceResolution.status === "resolved", "alias resolves during intake");
  const service = fictionalBusinessProfile.services[0];
  const fields = resolveIntakeFields(fictionalBusinessProfile, service, snapshot(context.manager));
  assert(Boolean(fields), "required fields load");
  assert(fields?.required.map((field) => field.id).join(",") === "customer-name,contact-method,project-description,service-location", "global and service fields load deterministically");
  assert(fields?.optional.some((field) => field.id === "preferred-date"), "optional field remains optional");
  const first = engine.selectAndMarkNextQuestion();
  assert(first.status === "selected" && first.field.id === "customer-name", "first required question selected");
  const secondSelection = engine.evaluate().nextQuestion;
  assert(secondSelection.status === "selected" && secondSelection.field.id === "contact-method", "asked question is not repeated");
  const invalid = engine.applyAnswer("contact-method", "", "fictional-empty-message");
  assert(invalid.readiness.status === "blocked", "invalid answer fails closed");
  assert(snapshot(context.manager).missingFields.includes("contact-method"), "invalid answer remains unresolved");
  engine.applyAnswer("customer-name", "Casey Example", "fictional-name-message");
  assert(!snapshot(context.manager).missingFields.includes("customer-name"), "valid answer becomes confirmed");
  const selected = selectNextIntakeQuestion(snapshot(context.manager), fields?.required ?? []);
  assert(selected.status === "selected" && selected.field.id !== "customer-name", "confirmed field is skipped");
  const conflict = engine.applyAnswer("customer-name", "Casey Different", "fictional-conflict-message");
  assert(conflict.stage === CONVERSATION_STAGES.CLARIFICATION, "conflicting required answer enters clarification");
  assert(conflict.readiness.status === "not-ready", "conflicting required answer blocks readiness");
}

function verifyReadinessCorrectionsAndHandoff() {
  const demonstration = runDeterministicIntakeDemonstration();
  assert(demonstration.successful.intake.readiness.status === "ready-for-handoff", "complete intake reaches handoff readiness");
  assert(demonstration.successful.handoff.status === "success", "validated handoff builds");
  assert(demonstration.correction.stage === CONVERSATION_STAGES.INTAKE, "correction returns to intake");
  assert(demonstration.correction.readiness.status === "not-ready", "correction revokes readiness");
  if (demonstration.successful.handoff.status === "success") {
    const summary = demonstration.successful.handoff.summary;
    assert(summary.corrections.length === 1, "handoff preserves corrections");
    assert(summary.confirmedFacts["service-location"] === "Maple Glen", "handoff uses current confirmed value");
    assert(!Object.values(summary.confirmedFacts).includes("project help"), "unconfirmed alias claim is not a confirmed fact");
    assert(summary.businessProfileVersion === fictionalBusinessProfile.version && summary.stateRevision > 0, "handoff includes traceability");
  }
}

function verifyUnsupportedIsolationAndDeterminism() {
  const first = runDeterministicIntakeDemonstration();
  const second = runDeterministicIntakeDemonstration();
  assert(first.unsupported.serviceResolution.status === "unsupported", "unsupported result is preserved");
  assert(first.unsupported.escalationStatus === ESCALATION_STATES.REQUIRED, "unsupported service activates configured escalation");
  assert(!first.unsupported.handoffAvailable, "unsupported service cannot complete handoff");
  const unsupportedContext = createContext();
  new DeterministicConversationEngine(fictionalBusinessProfile, unsupportedContext.manager, unsupportedContext.state.conversationId).initializeIntake("fictional unsupported work", "fictional-unsupported-source");
  assert(snapshot(unsupportedContext.manager).customerClaims.some((claim) => claim.field === "requested-service" && claim.value === "fictional unsupported work"), "unsupported claim remains preserved");
  assert(first.ambiguous.serviceResolution.status === "ambiguous" && first.ambiguous.stage === CONVERSATION_STAGES.CLARIFICATION, "ambiguous alias enters clarification");
  assert(JSON.stringify(first.successful.intake) === JSON.stringify(second.successful.intake), "same inputs produce equivalent intake results");

  const context = createContext();
  const wrongProfile = { ...fictionalBusinessProfile, id: "another-fictional-business" };
  assert(new DeterministicHandoffBuilder().build(wrongProfile, context.state).status === "failure", "cross-business handoff fails");
  const wrongVersion = { ...context.state, businessProfileVersion: 99 };
  assert(resolveService(fictionalBusinessProfile, wrongVersion, "project help").status === "blocked", "profile-version mismatch fails");
  assert(context.state.completionState === COMPLETION_STATES.NOT_READY, "model-independent fixture remains application-owned");
}

function createContext() {
  const manager = new ConversationStateManager();
  const initialized = manager.initialize({
    conversationId: "fictional-intake-verification",
    businessProfileId: fictionalBusinessProfile.id,
    businessProfileVersion: fictionalBusinessProfile.version,
    requiredFields: ["requested-service"],
    authorizedEscalationDestination: fictionalBusinessProfile.escalation.destination,
  });
  assert(initialized.status === "success", "verification context initializes");
  return { manager, state: initialized.state };
}

function snapshot(manager: ConversationStateManager) {
  const result = manager.snapshot({ conversationId: "fictional-intake-verification", businessProfileId: fictionalBusinessProfile.id, businessProfileVersion: fictionalBusinessProfile.version });
  assert(result.status === "success", "verification snapshot reads");
  return result.state;
}

function replaceFirstService(replacement: Partial<BusinessProfile["services"][number]>): BusinessProfile {
  return { ...fictionalBusinessProfile, services: [{ ...fictionalBusinessProfile.services[0], ...replacement }, ...fictionalBusinessProfile.services.slice(1)] };
}

function assertResolved(result: ReturnType<typeof resolveService>, label: string) {
  assert(result.status === "resolved", label);
}

function assert(condition: boolean, label: string): asserts condition {
  if (!condition) throw new Error(`Intake verification failed: ${label}`);
}
