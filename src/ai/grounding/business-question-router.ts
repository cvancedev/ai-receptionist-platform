/**
 * Deterministic detection of a business-information question.
 *
 * The application decides whether a customer message asks about approved
 * business information (currently business hours) and which day the question is
 * about. The model never selects a task, a source, or a day: it only answers the
 * single approved question it is given.
 *
 * Detection is deliberately conservative. A message that does not clearly ask
 * about hours keeps the existing interpretation path, so nothing that works
 * today is re-routed.
 */
export const BUSINESS_QUESTION_ROUTER_VERSION = "business-question-router/v1" as const;

export type BusinessQuestionDayFocus =
  | "today"
  | "weekend"
  | "weekday-named"
  | "unspecified";

export interface BusinessInformationQuestion {
  readonly kind: "hours";
  readonly dayFocus: BusinessQuestionDayFocus;
  /** The specific weekday named by the customer, when one is present. */
  readonly weekday: string | null;
}

export type BusinessQuestionRouting =
  | { readonly kind: "hours"; readonly question: BusinessInformationQuestion }
  | { readonly kind: "none" };

const HOURS_NOUN = /\b(?:hours?|opening\s+time|closing\s+time|open\s+and\s+close)\b/i;
const OPEN_OR_CLOSE_VERB = /\b(?:open|opens|opening|close|closes|closing|closed)\b/i;
const QUESTION_OR_TIME = /\b(?:what|when|which|how|are|is|do|does|until|till|today|tonight|now|time)\b/i;
const TODAY = /\b(?:today|tonight|right\s+now|currently|this\s+evening|this\s+morning)\b/i;
const WEEKEND = /\b(?:weekend|saturday|sunday)\b/i;
const WEEKDAY_NAMES: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bmonday\b/i, "monday"],
  [/\btuesday\b/i, "tuesday"],
  [/\bwednesday\b/i, "wednesday"],
  [/\bthursday\b/i, "thursday"],
  [/\bfriday\b/i, "friday"],
  [/\bsaturday\b/i, "saturday"],
  [/\bsunday\b/i, "sunday"],
];

export function detectBusinessInformationQuestion(message: string): BusinessQuestionRouting {
  if (typeof message !== "string") return { kind: "none" };
  const text = message.trim();
  if (text.length === 0) return { kind: "none" };

  const mentionsHours = HOURS_NOUN.test(text);
  const mentionsOpenState = OPEN_OR_CLOSE_VERB.test(text);
  if (!mentionsHours && !mentionsOpenState) return { kind: "none" };
  // "Closed because of the flooding" is a condition report, not an hours
  // question, so a bare mention still needs a question or time marker.
  if (!QUESTION_OR_TIME.test(text) && !mentionsHours) return { kind: "none" };

  const weekday = WEEKDAY_NAMES.find(([pattern]) => pattern.test(text))?.[1] ?? null;
  const dayFocus: BusinessQuestionDayFocus = TODAY.test(text)
    ? "today"
    : WEEKEND.test(text)
      ? "weekend"
      : weekday
        ? "weekday-named"
        : "unspecified";

  return {
    kind: "hours",
    question: Object.freeze({ kind: "hours", dayFocus, weekday }),
  };
}
