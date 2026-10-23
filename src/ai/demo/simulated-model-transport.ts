import type { BusinessProfile, ServiceDefinition } from "../../domain/business-profile";
import { fictionalBusinessProfile } from "../../fixtures/business-profile";
import type {
  OfflineTransport,
  OfflineTransportRequest,
  OfflineTransportResponse,
} from "../providers/transport-model-provider-adapter";

/**
 * Simulated, offline model transport.
 *
 * This is a deterministic stand-in for a real language model: it reads only the
 * rendered prompt (application-approved context and identity) and answers the
 * single approved task with a contract-shaped proposal. It performs no network
 * work, reads no environment or credential, uses no clock or randomness, and
 * carries no provider SDK. Its output remains untrusted: the application
 * validator and decision engine still decide everything.
 */
export const SIMULATED_TRANSPORT_ID = "simulated-model-transport/v1" as const;

interface SimulatedPrompt {
  readonly identity: Readonly<Record<string, unknown>>;
  readonly conversationState: {
    readonly askedQuestions?: readonly unknown[];
  };
  readonly currentCustomerInput: {
    readonly messageId?: unknown;
    readonly content?: unknown;
  };
}

export function createSimulatedModelTransport(
  profile: BusinessProfile = fictionalBusinessProfile,
): OfflineTransport {
  return async (request: OfflineTransportRequest): Promise<OfflineTransportResponse> => {
    const prompt = parsePrompt(request.input);
    const schema = parseSchema(request.schema);
    if (!prompt || !schema) {
      return failure("invalid-request");
    }

    const content = typeof prompt.currentCustomerInput.content === "string"
      ? prompt.currentCustomerInput.content
      : "";
    const messageId = typeof prompt.currentCustomerInput.messageId === "string"
      ? prompt.currentCustomerInput.messageId
      : "";

    const payload = schema.proposalType === "intent_interpretation"
      ? interpretIntent(content, messageId, profile)
      : schema.proposalType === "candidate_fact"
        ? extractCandidateFact(content, messageId, prompt, profile)
        : null;

    if (!payload) return failure("unsupported-proposal-type");

    const rawOutput = JSON.stringify({ ...prompt.identity, ...payload });
    return {
      status: "completed",
      rawOutput,
      usage: {
        inputUnits: Math.ceil((request.instructions.length + request.input.length) / 4),
        outputUnits: Math.ceil(rawOutput.length / 4),
      },
      finishReason: "stop",
      error: null,
    };
  };
}

function interpretIntent(
  content: string,
  messageId: string,
  profile: BusinessProfile,
): Readonly<Record<string, unknown>> {
  const resolution = resolveServiceMention(content, profile);
  return {
    candidateIntent: "service-inquiry",
    ...(resolution.serviceId ? { candidateServiceReference: resolution.serviceId } : {}),
    ambiguity: resolution.ambiguity,
    unsupportedRequest: resolution.unsupported,
    sourceMessageReference: messageId,
    customerObjective: truncate(content, 160),
  };
}

function extractCandidateFact(
  content: string,
  messageId: string,
  prompt: SimulatedPrompt,
  profile: BusinessProfile,
): Readonly<Record<string, unknown>> {
  const asked = prompt.conversationState.askedQuestions ?? [];
  const lastQuestion = asked.length > 0 ? asked[asked.length - 1] : null;
  const field = typeof lastQuestion === "string"
    ? fieldForQuestion(lastQuestion, profile)
    : undefined;
  return {
    fieldIdentifier: field?.id ?? "unresolved-field",
    candidateValue: truncate(content.trim(), 200),
    sourceMessageReference: messageId,
    uncertaintyClassification: "stated-by-customer",
  };
}

function fieldForQuestion(
  questionId: string,
  profile: BusinessProfile,
): (typeof profile.intakeRequirements)[number] | undefined {
  // The certified engine suffixes reopened questions (for example
  // "ask-service-location:correction:9"), so match on the base identifier.
  const base = questionId.split(":")[0];
  return profile.intakeRequirements.find(
    (requirement) => requirement.questionId === base,
  );
}

interface ServiceMention {
  readonly serviceId: string | null;
  readonly ambiguity: boolean;
  readonly unsupported: boolean;
}

function resolveServiceMention(
  content: string,
  profile: BusinessProfile,
): ServiceMention {
  const text = normalize(content);
  if (!text) return { serviceId: null, ambiguity: false, unsupported: true };

  const active = profile.services.filter((service) => service.status === "active");

  const exact = active.find(
    (service) => normalize(service.id) === text || normalize(service.name) === text,
  );
  if (exact) return { serviceId: exact.id, ambiguity: false, unsupported: false };

  const byAliasExact = active.filter(
    (service) => service.aliases.some((alias) => normalize(alias) === text),
  );
  if (byAliasExact.length === 1) {
    return { serviceId: byAliasExact[0].id, ambiguity: false, unsupported: false };
  }
  if (byAliasExact.length > 1) {
    return { serviceId: null, ambiguity: true, unsupported: false };
  }

  const byName = matchingServices(active, text, (service) => [service.name]);
  if (byName.length === 1) {
    return { serviceId: byName[0].id, ambiguity: false, unsupported: false };
  }
  if (byName.length > 1) return { serviceId: null, ambiguity: true, unsupported: false };

  const byAlias = matchingServices(active, text, (service) => service.aliases);
  if (byAlias.length === 1) {
    return { serviceId: byAlias[0].id, ambiguity: false, unsupported: false };
  }
  if (byAlias.length > 1) return { serviceId: null, ambiguity: true, unsupported: false };

  return { serviceId: null, ambiguity: false, unsupported: true };
}

function matchingServices(
  services: readonly ServiceDefinition[],
  text: string,
  phrases: (service: ServiceDefinition) => readonly string[],
): ServiceDefinition[] {
  return services.filter((service) =>
    phrases(service).some((phrase) => {
      const normalized = normalize(phrase);
      return normalized.length > 0 && text.includes(normalized);
    }));
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(value: string, maximum: number): string {
  return value.length > maximum ? value.slice(0, maximum) : value;
}

function parsePrompt(input: string): SimulatedPrompt | null {
  try {
    const parsed: unknown = JSON.parse(input);
    if (!isRecord(parsed) || !isRecord(parsed.identity)) return null;
    if (!isRecord(parsed.conversationState) || !isRecord(parsed.currentCustomerInput)) {
      return null;
    }
    return {
      identity: parsed.identity,
      conversationState: parsed.conversationState,
      currentCustomerInput: parsed.currentCustomerInput,
    };
  } catch {
    return null;
  }
}

function parseSchema(schema: string): { proposalType: string } | null {
  try {
    const parsed: unknown = JSON.parse(schema);
    if (!isRecord(parsed) || typeof parsed.proposalType !== "string") return null;
    return { proposalType: parsed.proposalType };
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function failure(category: string): OfflineTransportResponse {
  return {
    status: "failed",
    rawOutput: null,
    usage: { inputUnits: 0, outputUnits: 0 },
    finishReason: null,
    error: { category, message: "The simulated transport could not read the request." },
  };
}
