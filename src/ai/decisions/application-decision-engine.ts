import type { OutputContractDefinition } from "../contracts/catalog";
import type { ApplicationDecision, AiValidationResult } from "../contracts/results";
import { deepFreeze } from "../shared/immutable";

export class ApplicationDecisionEngine {
  decide(
    validation: AiValidationResult,
    contract: OutputContractDefinition | null,
  ): ApplicationDecision {
    const base = {
      reasons: validation.failures.length > 0 ? validation.failures : ["validation-passed"],
      acceptedFields: validation.acceptedFields,
      rejectedFields: validation.rejectedFields,
      stateMutationAuthorized: false as const,
      customerReleaseAuthorized: false as const,
    };
    if (validation.status === "cancelled") return deepFreeze({ decision: "cancelled", ...base });
    if (validation.status === "retryable") return deepFreeze({ decision: "retry_approved", ...base });
    if (validation.status === "repairable") return deepFreeze({ decision: "repair_required", ...base });
    if (validation.status === "valid") {
      const escalation = validation.proposal?.proposalType === "escalation_recommendation"
        && validation.proposal.recommended === true;
      return deepFreeze({ decision: escalation ? "escalation_recommended" : "accepted", ...base });
    }
    if (contract?.partialAcceptancePolicy === "independent_fields"
      && validation.acceptedFields.length > 0
      && validation.rejectedFields.length > 0
      && !containsNonPartialFailure(validation)) {
      return deepFreeze({ decision: "partially_accepted", ...base });
    }
    if (validation.failures.includes("RequiredFieldMissing")) {
      return deepFreeze({ decision: "clarification_required", ...base });
    }
    if (validation.failures.some((failure) =>
      failure === "InvalidBusinessScope" || failure === "InvalidConversationScope"
      || failure === "StateMutationAuthorityViolation" || failure === "CustomerReleaseAuthorityViolation")) {
      return deepFreeze({ decision: "safe_stop", ...base });
    }
    return deepFreeze({ decision: "rejected", ...base });
  }
}

function containsNonPartialFailure(validation: AiValidationResult): boolean {
  return validation.failures.some((failure) =>
    failure === "InvalidBusinessScope" || failure === "InvalidConversationScope"
    || failure === "ProfileVersionMismatch" || failure === "StateRevisionMismatch"
    || failure === "OutputContractMismatch" || failure === "ProhibitedOperation"
    || failure.endsWith("AuthorityViolation"));
}
