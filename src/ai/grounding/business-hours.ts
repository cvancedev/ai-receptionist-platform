import type { BusinessProfile } from "../../domain/business-profile";
import type { KnowledgeRecord } from "../../domain/knowledge-record";

/**
 * Deterministic business-hours reference for one instant.
 *
 * The application resolves the business's configured schedule and the current
 * day in the business's own time zone before any model work. The result is the
 * only hours information a model is ever shown, and the same value is used to
 * validate an answer afterwards, so an invented time, an unsupported closure, or
 * a schedule that cannot be read safely fails instead of being repeated to a
 * customer.
 *
 * Nothing here reads a clock: the caller supplies the instant, which keeps the
 * resolution reproducible in verification.
 */
export const BUSINESS_HOURS_CONTEXT_VERSION = "business-hours-context/v1" as const;

export const WEEKDAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

export type Weekday = (typeof WEEKDAYS)[number];

export type HoursUnavailableReason =
  | "missing-hours"
  | "invalid-time-zone"
  | "invalid-clock"
  | "ambiguous-schedule"
  | "empty-schedule";

export interface WeeklyHoursEntry {
  readonly day: Weekday;
  /** The configured text for that day, unmodified. */
  readonly schedule: string;
  readonly status: "open" | "closed";
  /** Canonical `H:MM AM/PM` tokens, `null` when the day is closed. */
  readonly opensAt: string | null;
  readonly closesAt: string | null;
}

export interface BusinessHoursContext {
  readonly status: "available";
  readonly version: typeof BUSINESS_HOURS_CONTEXT_VERSION;
  readonly timeZone: string;
  /** Local calendar date in the business time zone, `YYYY-MM-DD`. */
  readonly localDate: string;
  readonly weekday: Weekday;
  readonly todayStatus: "open" | "closed";
  readonly todaySchedule: string;
  readonly todayOpensAt: string | null;
  readonly todayClosesAt: string | null;
  readonly weekly: readonly WeeklyHoursEntry[];
  readonly openWeekdays: readonly Weekday[];
  readonly closedWeekdays: readonly Weekday[];
  /** Every canonical time token the approved schedule contains. */
  readonly approvedTimeTokens: readonly string[];
  /** Approved knowledge records that restate these hours. */
  readonly sourceKnowledgeIds: readonly string[];
  readonly asOfDate: string;
}

export interface BusinessHoursUnavailable {
  readonly status: "unavailable";
  readonly reason: HoursUnavailableReason;
  readonly timeZone: string | null;
}

export type BusinessHoursReference = BusinessHoursContext | BusinessHoursUnavailable;

const CLOSED_TEXT = /^closed$/i;
const HOURS_RANGE = /^(\d{1,2})(?::([0-5]\d))?\s*(am|pm)\s*(?:-|–|—|to)\s*(\d{1,2})(?::([0-5]\d))?\s*(am|pm)$/i;
const HOURS_RANGE_24 = /^([01]?\d|2[0-3]):([0-5]\d)\s*(?:-|–|—|to)\s*([01]?\d|2[0-3]):([0-5]\d)$/;
const MAXIMUM_SCHEDULE_LENGTH = 64;
const HOURS_CATEGORY = "hours";

const WEEKDAY_LABELS: Readonly<Record<Weekday, string>> = Object.freeze({
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
});

export function resolveBusinessHours(params: {
  readonly profile: BusinessProfile;
  readonly nowMs: number;
  readonly knowledge?: readonly KnowledgeRecord[];
}): BusinessHoursReference {
  const { profile, nowMs } = params;
  const timeZone = typeof profile?.hours?.timeZone === "string"
    ? profile.hours.timeZone
    : null;
  if (!timeZone) return Object.freeze({ status: "unavailable", reason: "missing-hours", timeZone: null } as const);
  if (!Number.isFinite(nowMs) || !Number.isInteger(nowMs) || nowMs < 0 || nowMs > Number.MAX_SAFE_INTEGER) {
    return Object.freeze({ status: "unavailable", reason: "invalid-clock", timeZone } as const);
  }

  const local = localCalendar(timeZone, nowMs);
  if (!local) {
    return Object.freeze({ status: "unavailable", reason: "invalid-time-zone", timeZone } as const);
  }

  const schedule = profile.hours.weeklySchedule;
  if (!schedule || typeof schedule !== "object" || Array.isArray(schedule)) {
    return Object.freeze({ status: "unavailable", reason: "missing-hours", timeZone } as const);
  }

  const weekly: WeeklyHoursEntry[] = [];
  for (const day of WEEKDAYS) {
    const raw = schedule[day];
    if (typeof raw !== "string" || raw.trim().length === 0) {
      // A schedule with a missing day is incomplete, and an incomplete schedule
      // cannot answer "are you open today" honestly.
      return Object.freeze({ status: "unavailable", reason: "missing-hours", timeZone } as const);
    }
    const parsed = parseScheduleEntry(raw);
    if (!parsed) {
      return Object.freeze({ status: "unavailable", reason: "ambiguous-schedule", timeZone } as const);
    }
    weekly.push(Object.freeze({ day, schedule: raw.trim(), ...parsed }));
  }
  if (weekly.every((entry) => entry.status === "closed")) {
    return Object.freeze({ status: "unavailable", reason: "empty-schedule", timeZone } as const);
  }

  const today = weekly.find((entry) => entry.day === local.weekday);
  if (!today) {
    return Object.freeze({ status: "unavailable", reason: "missing-hours", timeZone } as const);
  }

  const tokens = new Set<string>();
  for (const entry of weekly) {
    if (entry.opensAt) tokens.add(entry.opensAt);
    if (entry.closesAt) tokens.add(entry.closesAt);
  }

  const hoursKnowledge = (params.knowledge ?? []).filter((record) =>
    isHoursKnowledgeRecord(record, profile.id));
  for (const record of hoursKnowledge) {
    for (const token of extractTimeTokens(record.content)) tokens.add(token);
  }

  return Object.freeze({
    status: "available",
    version: BUSINESS_HOURS_CONTEXT_VERSION,
    timeZone,
    localDate: local.localDate,
    weekday: local.weekday,
    todayStatus: today.status,
    todaySchedule: today.schedule,
    todayOpensAt: today.opensAt,
    todayClosesAt: today.closesAt,
    weekly: Object.freeze(weekly),
    openWeekdays: Object.freeze(weekly.filter((entry) => entry.status === "open").map((entry) => entry.day)),
    closedWeekdays: Object.freeze(weekly.filter((entry) => entry.status === "closed").map((entry) => entry.day)),
    approvedTimeTokens: Object.freeze([...tokens].sort()),
    sourceKnowledgeIds: Object.freeze(hoursKnowledge.map((record) => record.id)),
    asOfDate: local.localDate,
  });
}

export function weekdayLabel(day: Weekday): string {
  return WEEKDAY_LABELS[day];
}

/** Every canonical time-of-day token in a piece of text. */
export function extractTimeTokens(text: string): string[] {
  const tokens = new Set<string>();
  for (const match of text.matchAll(/\b(\d{1,2})(?::([0-5]\d))?\s*(a\.?m\.?|p\.?m\.?)\b/gi)) {
    const canonical = canonicalFromTwelveHour(match[1], match[2], match[3]);
    if (canonical) tokens.add(canonical);
  }
  for (const match of text.matchAll(/\b([01]?\d|2[0-3]):([0-5]\d)\b(?!\s*(?:a\.?m\.?|p\.?m\.?))/gi)) {
    const canonical = canonicalFromTwentyFourHour(match[1], match[2]);
    if (canonical) tokens.add(canonical);
  }
  return [...tokens].sort();
}

function parseScheduleEntry(raw: string): {
  status: "open" | "closed";
  opensAt: string | null;
  closesAt: string | null;
} | null {
  const value = raw.trim();
  if (value.length > MAXIMUM_SCHEDULE_LENGTH) return null;
  if (CLOSED_TEXT.test(value)) return { status: "closed", opensAt: null, closesAt: null };

  const twelve = HOURS_RANGE.exec(value);
  if (twelve) {
    const opensAt = canonicalFromTwelveHour(twelve[1], twelve[2], twelve[3]);
    const closesAt = canonicalFromTwelveHour(twelve[4], twelve[5], twelve[6]);
    if (!opensAt || !closesAt || opensAt === closesAt) return null;
    return { status: "open", opensAt, closesAt };
  }

  const twentyFour = HOURS_RANGE_24.exec(value);
  if (twentyFour) {
    const opensAt = canonicalFromTwentyFourHour(twentyFour[1], twentyFour[2]);
    const closesAt = canonicalFromTwentyFourHour(twentyFour[3], twentyFour[4]);
    if (!opensAt || !closesAt || opensAt === closesAt) return null;
    return { status: "open", opensAt, closesAt };
  }
  return null;
}

function canonicalFromTwelveHour(
  hourText: string | undefined,
  minuteText: string | undefined,
  meridiemText: string | undefined,
): string | null {
  if (!hourText || !meridiemText) return null;
  const hour = Number(hourText);
  if (!Number.isInteger(hour) || hour < 1 || hour > 12) return null;
  const minute = minuteText ? Number(minuteText) : 0;
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) return null;
  return `${hour}:${String(minute).padStart(2, "0")} ${meridiemText.replace(/\./g, "").toUpperCase()}`;
}

function canonicalFromTwentyFourHour(
  hourText: string | undefined,
  minuteText: string | undefined,
): string | null {
  if (!hourText || !minuteText) return null;
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null;
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) return null;
  const meridiem = hour < 12 ? "AM" : "PM";
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}:${String(minute).padStart(2, "0")} ${meridiem}`;
}

function localCalendar(
  timeZone: string,
  nowMs: number,
): { readonly localDate: string; readonly weekday: Weekday } | null {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "long",
    });
    const parts = formatter.formatToParts(new Date(nowMs));
    const year = parts.find((part) => part.type === "year")?.value;
    const month = parts.find((part) => part.type === "month")?.value;
    const day = parts.find((part) => part.type === "day")?.value;
    const weekdayText = parts.find((part) => part.type === "weekday")?.value;
    const weekday = WEEKDAYS.find(
      (candidate) => WEEKDAY_LABELS[candidate] === weekdayText,
    );
    if (!year || !month || !day || !weekday) return null;
    if (!/^\d{4}$/.test(year) || !/^\d{2}$/.test(month) || !/^\d{2}$/.test(day)) return null;
    return { localDate: `${year}-${month}-${day}`, weekday };
  } catch {
    // An unknown IANA zone makes the local day unknowable, so it is unavailable.
    return null;
  }
}

export function isHoursKnowledgeRecord(
  record: KnowledgeRecord,
  businessId: string,
): boolean {
  return record.businessProfileId === businessId && record.category === HOURS_CATEGORY;
}
