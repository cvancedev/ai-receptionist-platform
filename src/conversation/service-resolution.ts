import type { BusinessProfile } from "../domain/business-profile";
import type { ConversationState } from "../domain/conversation-state";
import type { ServiceResolutionResult } from "../domain/intake";
import { validateBusinessProfile } from "../validation/business-profile-validation";
import { validateConversationState } from "../validation/conversation-state-validation";

export function resolveService(
  profile: BusinessProfile,
  state: ConversationState,
  input: string | null | undefined,
): ServiceResolutionResult {
  const profileValidation = validateBusinessProfile(profile, {
    id: state.businessProfileId,
    version: state.businessProfileVersion,
  });
  const stateValidation = validateConversationState(state, {
    conversationId: state.conversationId,
    businessProfileId: profile.id,
    businessProfileVersion: profile.version,
  });
  const errors = [...profileValidation.errors, ...stateValidation.errors];
  if (errors.length) return { status: "blocked", candidates: [], errors };
  const normalized = normalizeServiceInput(input ?? "");
  if (!normalized) return { status: "missing", candidates: [], reason: "No service information was provided." };
  const services = profile.services.filter((service) => service.status === "active");
  const id = services.find((service) => normalizeServiceInput(service.id) === normalized);
  if (id) return { status: "resolved", service: id, matchedBy: "id", evidence: normalized };
  const name = services.find((service) => normalizeServiceInput(service.name) === normalized);
  if (name) return { status: "resolved", service: name, matchedBy: "name", evidence: normalized };
  const aliases = services.filter((service) => service.aliases.some((alias) => normalizeServiceInput(alias) === normalized));
  if (aliases.length === 1) return { status: "resolved", service: aliases[0], matchedBy: "alias", evidence: normalized };
  if (aliases.length > 1) return { status: "ambiguous", candidates: aliases, reason: "The approved alias matches multiple active services." };
  return { status: "unsupported", candidates: [], reason: "No active configured service matches the supplied value." };
}

export function normalizeServiceInput(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}
