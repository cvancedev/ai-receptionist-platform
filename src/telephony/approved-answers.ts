import type { KnowledgeRecord } from "../domain/knowledge-record";

/**
 * Deterministic answering from approved business knowledge.
 *
 * The receptionist answers a caller's factual question only from a record the
 * business marked active and customer-facing, and it speaks the record's own
 * words. There is no model in this path, so there is nothing to hallucinate: if
 * no record matches strongly enough, the question is reported as unanswered and
 * the caller is told a person will follow up.
 *
 * Business hours are deliberately excluded here. The certified conversation
 * engine already answers hours from the approved schedule with its own grounding
 * checks, and duplicating that would create a second, weaker authority.
 */
export const APPROVED_ANSWER_VERSION = "approved-answer/v1" as const;

export interface ApprovedAnswer {
  readonly text: string;
  readonly sources: readonly string[];
  readonly recordId: string;
}

/** Spoken answers are capped so a long record does not become a monologue. */
const MAXIMUM_SPOKEN_ANSWER = 420;
/** A match must be more than incidental shared words. */
const MINIMUM_SCORE = 5;

const STOPWORDS: ReadonlySet<string> = new Set([
  "about", "after", "again", "also", "and", "any", "are", "can", "could", "does",
  "did", "for", "from", "have", "how", "into", "just", "much", "not", "our",
  "please", "should", "that", "the", "their", "them", "then", "there", "these",
  "they", "this", "was", "what", "when", "where", "which", "who", "why", "will",
  "with", "would", "you", "your", "yours", "tell", "know", "need", "want",
]);

const QUESTION_OPENER = /^(?:what|when|where|who|whom|whose|why|how|do|does|did|can|could|will|would|is|are|am|should|shall|may|might|have|has)\b/i;
const QUESTION_PHRASE = /\b(?:do you|can you|could you|are you|is there|how much|how long|how often|what about)\b/i;

/**
 * True when the utterance is asking for information rather than describing a
 * problem. A caller saying "my water heater is broken" must reach intake, not a
 * knowledge lookup, so a plain statement is never treated as a question.
 */
export function looksLikeQuestion(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0) return false;
  if (trimmed.endsWith("?")) return true;
  return QUESTION_OPENER.test(trimmed) || QUESTION_PHRASE.test(trimmed);
}

export function answerFromApprovedKnowledge(input: {
  readonly question: string;
  readonly knowledge: readonly KnowledgeRecord[];
  readonly businessProfileId: string;
}): ApprovedAnswer | null {
  const question = input.question;
  if (typeof question !== "string" || question.trim().length === 0) return null;
  if (!looksLikeQuestion(question)) return null;

  const terms = tokenize(question);
  if (terms.size === 0) return null;

  let best: { record: KnowledgeRecord; score: number } | null = null;
  for (const record of input.knowledge) {
    if (record.businessProfileId !== input.businessProfileId) continue;
    if (record.lifecycleState !== "active") continue;
    if (record.audience !== "customer" && record.audience !== "both") continue;
    // Hours answers stay with the certified grounding path.
    if (record.category === "hours") continue;

    const titleTerms = tokenize(record.title);
    const contentTerms = tokenize(record.content);
    let score = 0;
    for (const term of terms) {
      if (titleTerms.has(term)) score += 3;
      else if (contentTerms.has(term)) score += 1;
    }
    if (score === 0) continue;
    if (best === null || score > best.score) best = { record, score };
  }

  if (best === null || best.score < MINIMUM_SCORE) return null;

  return Object.freeze({
    text: speakable(best.record.content),
    sources: Object.freeze([best.record.id]),
    recordId: best.record.id,
  });
}

/** Cut a record to whole sentences that fit a spoken turn. */
function speakable(content: string): string {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (normalized.length <= MAXIMUM_SPOKEN_ANSWER) return normalized;
  const sentences = normalized.split(/(?<=[.!?])\s+/);
  let output = "";
  for (const sentence of sentences) {
    if (`${output} ${sentence}`.trim().length > MAXIMUM_SPOKEN_ANSWER) break;
    output = `${output} ${sentence}`.trim();
  }
  return output.length > 0 ? output : `${normalized.slice(0, MAXIMUM_SPOKEN_ANSWER - 1)}…`;
}

function tokenize(value: string): Set<string> {
  const terms = new Set<string>();
  for (const raw of value.toLowerCase().split(/[^a-z0-9$]+/)) {
    if (raw.length < 3) continue;
    if (STOPWORDS.has(raw)) continue;
    terms.add(raw);
  }
  return terms;
}
