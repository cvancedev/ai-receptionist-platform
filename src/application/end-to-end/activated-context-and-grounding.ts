import { deepFreeze } from "../../ai/shared/immutable";
import type { ResolvedActivatedConfiguration } from "../../business-configuration/activated-configuration-resolver";
import type { ConversationState } from "../../domain/conversation-state";
import type { KnowledgeRecord } from "../../domain/knowledge-record";
import { validateBusinessProfile } from "../../validation/business-profile-validation";
import { validateConversationState } from "../../validation/conversation-state-validation";
import { validateKnowledge } from "../../validation/knowledge-validation";
import {
  ACTIVATED_CONTEXT_POLICY_VERSION,
  GROUNDED_OUTPUT_POLICY_VERSION,
  type EndToEndActivatedContext,
  type EndToEndActivatedKnowledge,
  type EndToEndCustomerMessage,
  type EndToEndGroundingValidationResult,
  type EndToEndKnowledgeReference,
} from "./contracts";

const CONTEXT_SIZE_LIMIT = 12_000;
const MAX_IDENTIFIER_LENGTH = 160;
const MAX_RESPONSE_LENGTH = 4_000;

export interface ActivatedContextAssemblyInput {
  readonly configuration: Readonly<ResolvedActivatedConfiguration>;
  readonly conversationState: Readonly<ConversationState>;
  readonly currentCustomerInput: Readonly<EndToEndCustomerMessage>;
  readonly effectiveAt: string;
}

export type ActivatedContextAssemblyResult =
  | { readonly status: "success"; readonly value: Readonly<EndToEndActivatedContext> }
  | {
      readonly status: "failure";
      readonly reason: "ScopeMismatch" | "ContextUnavailable";
      readonly errors: readonly string[];
    };

/**
 * Builds one bounded context from an already resolved activation and exact
 * durable conversation. It performs an independent fail-closed eligibility
 * check and grants no model, transition, persistence, or release authority.
 */
export class ActivatedContextAssembler {
  build(input: Readonly<ActivatedContextAssemblyInput>): ActivatedContextAssemblyResult {
    const scopeErrors = validateScope(input);
    if (scopeErrors.length > 0) {
      return failure("ScopeMismatch", "Activated conversation context scope is unavailable.");
    }
    if (!isValidTimestamp(input.effectiveAt)) {
      return failure("ContextUnavailable", "Activated conversation context is unavailable.");
    }

    const { configuration, conversationState, currentCustomerInput } = input;
    const profileValidation = validateBusinessProfile(
      structuredClone(configuration.businessProfile),
      {
        id: conversationState.businessProfileId,
        version: conversationState.businessProfileVersion,
      },
    );
    const stateValidation = validateConversationState(
      structuredClone(conversationState),
    );
    const knowledgeValidation = validateKnowledge(
      structuredClone(configuration.knowledge),
      conversationState.businessProfileId,
    );
    if (!profileValidation.valid || !stateValidation.valid || !knowledgeValidation.valid) {
      return failure("ContextUnavailable", "Activated conversation context is unavailable.");
    }
    if (
      !isValidTimestamp(configuration.activation.activatedAt)
      || !Number.isInteger(configuration.activation.activationRevision)
      || configuration.activation.activationRevision < 1
      || !isBoundedIdentifier(configuration.activation.requestId)
      || Date.parse(configuration.activation.activatedAt) > Date.parse(input.effectiveAt)
      || !configuration.knowledge.every((record) => isKnowledgeEligible(record, input.effectiveAt))
      || hasMaterialConflict(configuration.knowledge)
    ) {
      return failure("ContextUnavailable", "Activated conversation context is unavailable.");
    }

    const knowledge = configuration.knowledge.map((record) =>
      activatedKnowledge(
        record,
        configuration.businessProfile.version,
        configuration.activation.activationRevision,
        input.effectiveAt,
      ),
    );
    const contextWithoutBudget = {
      identity: {
        businessProfileId: conversationState.businessProfileId,
        businessProfileVersion: conversationState.businessProfileVersion,
        conversationId: conversationState.conversationId,
        stateRevision: conversationState.revision,
        activationRevision: configuration.activation.activationRevision,
      },
      effectiveAt: input.effectiveAt,
      businessProfile: structuredClone(configuration.businessProfile),
      conversationState: structuredClone(conversationState),
      currentCustomerInput: {
        ...structuredClone(currentCustomerInput),
        trust: "untrusted-customer-input" as const,
      },
      knowledge,
      provenance: {
        activationRequestId: configuration.activation.requestId,
        activatedAt: configuration.activation.activatedAt,
        contextPolicyVersion: ACTIVATED_CONTEXT_POLICY_VERSION as typeof ACTIVATED_CONTEXT_POLICY_VERSION,
        groundingPolicyVersion: GROUNDED_OUTPUT_POLICY_VERSION as typeof GROUNDED_OUTPUT_POLICY_VERSION,
      },
      authority: {
        assembledBy: "application" as const,
        providerExecutionAuthorized: false as const,
        stateMutationAuthorized: false as const,
        customerReleaseAuthorized: false as const,
      },
    };
    const estimatedSize = JSON.stringify(contextWithoutBudget).length;
    if (estimatedSize > CONTEXT_SIZE_LIMIT) {
      return failure("ContextUnavailable", "Activated conversation context exceeds its size limit.");
    }

    return deepFreeze({
      status: "success" as const,
      value: deepFreeze({
        ...contextWithoutBudget,
        budget: {
          sizeLimit: CONTEXT_SIZE_LIMIT,
          estimatedSize,
          withinLimit: true,
        },
      }),
    });
  }
}

/** Application-owned source validation for a future grounded response draft. */
export class EndToEndGroundingValidator {
  validate(
    candidateInput: unknown,
    context: Readonly<EndToEndActivatedContext>,
  ): EndToEndGroundingValidationResult {
    if (!isGroundedCandidate(candidateInput)) {
      return groundingFailure("InvalidCandidate", "Grounded response candidate is invalid.");
    }
    if (candidateInput.sourceReferences.length === 0) {
      return groundingFailure("GroundingRequired", "Grounded response requires an eligible source.");
    }
    const referenceKeys = candidateInput.sourceReferences.map(referenceKey);
    if (new Set(referenceKeys).size !== referenceKeys.length) {
      return groundingFailure("InvalidCandidate", "Duplicate grounding references are not allowed.");
    }
    if (!candidateInput.sourceReferences.every((reference) =>
      context.knowledge.some((record) => hasExactReference(record, reference)))) {
      return groundingFailure(
        "GroundingScopeMismatch",
        "Grounding is unavailable in the activated conversation context.",
      );
    }

    return deepFreeze({
      status: "success" as const,
      value: deepFreeze({
        candidateId: candidateInput.candidateId,
        content: candidateInput.content,
        sourceReferences: candidateInput.sourceReferences.map((reference) => ({ ...reference })),
        validationStatus: "validated",
        customerReleaseAuthorized: false,
      }),
    });
  }
}

function validateScope(input: Readonly<ActivatedContextAssemblyInput>): string[] {
  const { activation, businessProfile, knowledge } = input.configuration;
  const state = input.conversationState;
  const expected = {
    businessProfileId: state.businessProfileId,
    businessProfileVersion: state.businessProfileVersion,
  };
  if (
    businessProfile.id !== expected.businessProfileId
    || businessProfile.version !== expected.businessProfileVersion
    || activation.businessProfileId !== expected.businessProfileId
    || activation.businessProfileVersion !== expected.businessProfileVersion
    || input.currentCustomerInput.conversationId !== state.conversationId
    || activation.knowledge.length !== knowledge.length
  ) return ["scope"];
  const bindings = activation.knowledge.map((scope) =>
    `${scope.businessProfileId}:${scope.businessProfileVersion}:${scope.knowledgeRecordId}:${scope.knowledgeRecordVersion}`,
  );
  const records = knowledge.map((record) =>
    `${record.businessProfileId}:${businessProfile.version}:${record.id}:${record.version}`,
  );
  return new Set(bindings).size === bindings.length
    && new Set(records).size === records.length
    && bindings.every((binding) => records.includes(binding))
    && records.every((record) => bindings.includes(record))
    ? []
    : ["scope"];
}

function activatedKnowledge(
  record: Readonly<KnowledgeRecord>,
  businessProfileVersion: number,
  activationRevision: number,
  effectiveAt: string,
): EndToEndActivatedKnowledge {
  return {
    knowledgeRecordId: record.id,
    knowledgeRecordVersion: record.version,
    businessProfileId: record.businessProfileId,
    businessProfileVersion,
    title: record.title,
    category: record.category,
    content: record.content,
    lifecycleState: "active",
    audience: record.audience as "customer" | "both",
    source: record.source,
    effectiveDate: record.effectiveDate,
    activationRevision,
    contextPolicyVersion: ACTIVATED_CONTEXT_POLICY_VERSION,
    eligibility: {
      decision: "included",
      effectiveAt,
      policyVersion: ACTIVATED_CONTEXT_POLICY_VERSION,
    },
  };
}

function isKnowledgeEligible(record: Readonly<KnowledgeRecord>, effectiveAt: string): boolean {
  return record.lifecycleState === "active"
    && (record.audience === "customer" || record.audience === "both")
    && Date.parse(record.effectiveDate) <= Date.parse(effectiveAt);
}

function hasMaterialConflict(records: readonly Readonly<KnowledgeRecord>[]): boolean {
  const claims = new Map<string, string>();
  for (const record of records) {
    const identity = `${normalize(record.category)}:${normalize(record.title)}`;
    const content = normalize(record.content);
    const prior = claims.get(identity);
    if (prior !== undefined && prior !== content) return true;
    claims.set(identity, content);
  }
  return false;
}

function isGroundedCandidate(value: unknown): value is {
  readonly candidateId: string;
  readonly content: string;
  readonly sourceReferences: readonly EndToEndKnowledgeReference[];
} {
  if (!isPlainRecord(value) || !hasExactKeys(value, ["candidateId", "content", "sourceReferences"])) return false;
  return isBoundedIdentifier(value.candidateId)
    && typeof value.content === "string"
    && value.content === value.content.trim()
    && value.content.length > 0
    && value.content.length <= MAX_RESPONSE_LENGTH
    && Array.isArray(value.sourceReferences)
    && value.sourceReferences.every(isKnowledgeReference);
}

function isKnowledgeReference(value: unknown): value is EndToEndKnowledgeReference {
  return isPlainRecord(value)
    && hasExactKeys(value, [
      "knowledgeRecordId",
      "knowledgeRecordVersion",
      "source",
      "audience",
      "effectiveDate",
      "activationRevision",
      "contextPolicyVersion",
    ])
    && isBoundedIdentifier(value.knowledgeRecordId)
    && Number.isInteger(value.knowledgeRecordVersion)
    && Number(value.knowledgeRecordVersion) > 0
    && typeof value.source === "string"
    && value.source.trim().length > 0
    && (value.audience === "customer" || value.audience === "both")
    && isValidTimestamp(value.effectiveDate)
    && Number.isInteger(value.activationRevision)
    && Number(value.activationRevision) > 0
    && value.contextPolicyVersion === ACTIVATED_CONTEXT_POLICY_VERSION;
}

function hasExactReference(
  record: Readonly<EndToEndActivatedKnowledge>,
  reference: Readonly<EndToEndKnowledgeReference>,
): boolean {
  return record.knowledgeRecordId === reference.knowledgeRecordId
    && record.knowledgeRecordVersion === reference.knowledgeRecordVersion
    && record.source === reference.source
    && record.audience === reference.audience
    && record.effectiveDate === reference.effectiveDate
    && record.activationRevision === reference.activationRevision
    && record.contextPolicyVersion === reference.contextPolicyVersion;
}

function referenceKey(reference: Readonly<EndToEndKnowledgeReference>): string {
  return `${reference.knowledgeRecordId}:${reference.knowledgeRecordVersion}`;
}

function isValidTimestamp(value: unknown): value is string {
  return typeof value === "string" && value === value.trim() && value.length > 0 && !Number.isNaN(Date.parse(value));
}

function isBoundedIdentifier(value: unknown): value is string {
  return typeof value === "string" && value === value.trim() && value.length > 0 && value.length <= MAX_IDENTIFIER_LENGTH;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function hasExactKeys(value: Readonly<Record<string, unknown>>, expected: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.length && keys.every((key) => expected.includes(key));
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

function failure(
  reason: "ScopeMismatch" | "ContextUnavailable",
  error: string,
): Extract<ActivatedContextAssemblyResult, { readonly status: "failure" }> {
  return deepFreeze({ status: "failure", reason, errors: [error] });
}

function groundingFailure(
  reason: "InvalidCandidate" | "GroundingRequired" | "GroundingScopeMismatch",
  error: string,
): Extract<EndToEndGroundingValidationResult, { readonly status: "failure" }> {
  return deepFreeze({ status: "failure", reason, errors: [error] });
}
