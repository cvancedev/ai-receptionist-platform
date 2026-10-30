import type { BusinessProfile } from "../../domain/business-profile";
import type { ContextPackage } from "../contracts/packages";
import { extractTimeTokens, WEEKDAYS, type BusinessHoursReference, type Weekday } from "./business-hours";

/**
 * Deterministic grounding validation for a model-drafted business answer.
 *
 * The model never releases customer text. It returns a proposal; this module
 * decides, from the application's own approved material, whether that text is
 * supported. Every check is a pure function of the context package and the
 * resolved hours, so the same proposal always produces the same verdict and no
 * check depends on the model's own claim that it was grounded.
 *
 * `authorizedText` is always safe to display: it is the model's text only when
 * support was established, and otherwise the application's own limitation
 * sentence.
 */
export const GROUNDED_ANSWER_VALIDATION_VERSION = "grounded-answer-validation/v1" as const;

/** Application-owned sentence used whenever an answer is not supported. */
export const GROUNDED_ANSWER_FALLBACK =
  "I can't confirm that from the business's approved information. A team member can follow up.";

export type GroundedAnswerFailure =
  | "KnowledgeGroundingFailure"
  | "UnsupportedClaim"
  | "HoursUnavailable"
  | "InvalidFieldType"
  | "RequiredFieldMissing"
  | "AnswerTooLong"
  | "InvalidBusinessScope"
  | "InactiveServiceReference"
  | "UnsupportedPromise";

export type GroundedAnswerVerdict = "supported" | "insufficient" | "rejected";

export interface GroundedAnswerValidation {
  readonly version: typeof GROUNDED_ANSWER_VALIDATION_VERSION;
  readonly verdict: GroundedAnswerVerdict;
  readonly failures: readonly GroundedAnswerFailure[];
  /** The model's text, present only when the verdict is `supported`. */
  readonly text: string | null;
  readonly sourceReferences: readonly string[];
  /** Always safe to display. */
  readonly authorizedText: string;
}

const MAXIMUM_ANSWER_CHARACTERS = 2_000;
const MAXIMUM_REFERENCES = 25;

const OPEN_PHRASE = /\b(?:we|the\s+team|the\s+office|the\s+business|it)\s+(?:is|are|'s|'re)\s+open\b|\bopen\s+(?:today|now|currently|on)\b/i;
const CLOSED_PHRASE = /\b(?:we|the\s+team|the\s+office|the\s+business|it)\s+(?:is|are|'s|'re)\s+closed\b|\bclosed\s+(?:today|now|currently|on)\b/i;
const HOLIDAY_CLAIM = /\b(?:holiday|holidays|christmas|thanksgiving|new\s+year|easter|july\s*4|independence\s+day|labor\s+day|memorial\s+day|december\s+25|january\s+1)\b/i;
const CALENDAR_DATE = /\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}\b/i;
const BUSINESS_NAME_CLAIM =
  /\b([A-Z][A-Za-z&'-]+(?:\s+[A-Z][A-Za-z&'-]+){0,3}\s+(?:Services|Service|Company|Co\.|LLC|Inc\.?|Group|Solutions))\b/;
const PROMISE_CLAIM = /\b(?:guarantee|guaranteed|promise|promised|confirmed\s+(?:appointment|booking|availability))\b/i;

export function validateGroundedAnswer(input: {
  readonly proposal: Readonly<Record<string, unknown>>;
  readonly contextPackage: ContextPackage;
  readonly businessHours: BusinessHoursReference;
  readonly businessProfile: BusinessProfile;
}): GroundedAnswerValidation {
  const { proposal, contextPackage, businessHours, businessProfile } = input;
  const failures = new Set<GroundedAnswerFailure>();

  const text = proposal.customerFacingText;
  const references = proposal.knowledgeSourceReferences;
  const insufficient = proposal.insufficientKnowledge;

  if (typeof text !== "string" || text.trim().length === 0) {
    failures.add("RequiredFieldMissing");
  } else if (text.length > MAXIMUM_ANSWER_CHARACTERS) {
    failures.add("AnswerTooLong");
  }
  if (!Array.isArray(references)
    || references.some((reference) => typeof reference !== "string")
    || references.length > MAXIMUM_REFERENCES) {
    failures.add("InvalidFieldType");
  }
  if (typeof insufficient !== "boolean") failures.add("InvalidFieldType");
  if ("limitationNote" in proposal && typeof proposal.limitationNote !== "string") {
    failures.add("InvalidFieldType");
  }

  const sourceReferences: readonly string[] = Array.isArray(references)
    ? references.filter((reference): reference is string => typeof reference === "string")
    : [];
  const excerptIds = new Set(contextPackage.approvedKnowledgeExcerpts.map((record) => record.id));
  const approvedIds = new Set(contextPackage.approvedKnowledge.map((record) => record.id));
  for (const reference of sourceReferences) {
    // A citation must name an approved record the application selected for this
    // request. Inactive, other-business, or unselected records are rejected.
    if (!excerptIds.has(reference) || !approvedIds.has(reference)) {
      failures.add("KnowledgeGroundingFailure");
    }
  }
  if (insufficient === false && sourceReferences.length === 0) {
    failures.add("KnowledgeGroundingFailure");
  }

  if (typeof text === "string" && text.trim().length > 0) {
    checkClaims({
      text,
      businessHours,
      businessProfile,
      approvedText: contextPackage.approvedKnowledgeExcerpts.map((record) => record.content),
      failures,
    });
  }

  const verdict: GroundedAnswerVerdict = failures.size > 0
    ? "rejected"
    : insufficient === true
      ? "insufficient"
      : "supported";

  return Object.freeze({
    version: GROUNDED_ANSWER_VALIDATION_VERSION,
    verdict,
    failures: Object.freeze([...failures]),
    text: verdict === "supported" && typeof text === "string" ? text.trim() : null,
    sourceReferences: Object.freeze([...sourceReferences]),
    authorizedText: verdict === "supported" && typeof text === "string"
      ? text.trim()
      : GROUNDED_ANSWER_FALLBACK,
  });
}

function checkClaims(input: {
  readonly text: string;
  readonly businessHours: BusinessHoursReference;
  readonly businessProfile: BusinessProfile;
  readonly approvedText: readonly string[];
  readonly failures: Set<GroundedAnswerFailure>;
}): void {
  const { text, businessHours, businessProfile, approvedText, failures } = input;

  const times = extractTimeTokens(text);

  if (businessHours.status === "unavailable") {
    // Without resolved hours no opening, closing, or open-state statement can be
    // supported, so anything of that shape is refused rather than repeated.
    if (times.length > 0 || OPEN_PHRASE.test(text) || CLOSED_PHRASE.test(text)) {
      failures.add("HoursUnavailable");
    }
  } else {
    const allowed = new Set(businessHours.approvedTimeTokens);
    if (times.some((token) => !allowed.has(token))) failures.add("UnsupportedClaim");

    // Each clause is judged on the days it itself names, so a sentence that
    // correctly lists open weekdays and closed weekend days is not mistaken for
    // a claim that a closed day is open.
    for (const clause of clauses(text)) {
      const days = daysNamedIn(clause);
      if (days.length === 0) continue;
      const entries = days
        .map((day) => businessHours.weekly.find((entry) => entry.day === day))
        .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
      if (entries.length === 0) continue;
      const clauseTimes = extractTimeTokens(clause);
      const allClosed = entries.every((entry) => entry.status === "closed");
      const allOpen = entries.every((entry) => entry.status === "open");
      // A closed day cannot have an opening time.
      if (clauseTimes.length > 0 && allClosed) failures.add("UnsupportedClaim");
      if (OPEN_PHRASE.test(clause) && allClosed) failures.add("UnsupportedClaim");
      if (CLOSED_PHRASE.test(clause) && allOpen) failures.add("UnsupportedClaim");
    }

    if (daysNamedIn(text).length === 0) {
      if (OPEN_PHRASE.test(text) && businessHours.todayStatus === "closed") {
        failures.add("UnsupportedClaim");
      }
      if (CLOSED_PHRASE.test(text) && businessHours.todayStatus === "open") {
        failures.add("UnsupportedClaim");
      }
      if (times.length > 0 && businessHours.todayStatus === "closed") {
        // Today is closed, so today's opening time cannot be quoted as "today".
        if (/\b(?:today|tonight|right\s+now|currently)\b/i.test(text)) {
          failures.add("UnsupportedClaim");
        }
      }
    }
  }

  const approvedCorpus = approvedText.join("\n").toLowerCase();
  for (const claim of [HOLIDAY_CLAIM.exec(text)?.[0], CALENDAR_DATE.exec(text)?.[0]]) {
    if (claim && !approvedCorpus.includes(claim.toLowerCase())) {
      // No holiday or calendar exception is configured, so none may be claimed.
      failures.add("UnsupportedClaim");
    }
  }

  const nameClaim = BUSINESS_NAME_CLAIM.exec(text)?.[1]?.trim();
  if (nameClaim && nameClaim.toLowerCase() !== businessProfile.businessName.toLowerCase()) {
    failures.add("InvalidBusinessScope");
  }

  for (const service of businessProfile.services) {
    if (service.status === "active") continue;
    if (new RegExp(`\\b${escapeRegExp(service.name)}\\b`, "i").test(text)) {
      failures.add("InactiveServiceReference");
    }
  }

  if (PROMISE_CLAIM.test(text)) failures.add("UnsupportedPromise");
}

function clauses(text: string): readonly string[] {
  return text
    .split(/[.;!?]|\band\b|\bbut\b|\bwhile\b/i)
    .map((clause) => clause.trim())
    .filter((clause) => clause.length > 0);
}

function daysNamedIn(clause: string): readonly Weekday[] {
  const named = WEEKDAYS.filter((day) => new RegExp(`\\b${day}\\b`, "i").test(clause));
  if (named.length > 0) return named;
  // A weekend statement is judged from the days it names.
  return /\bweekends?\b/i.test(clause) ? ["saturday", "sunday"] : [];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
