/**
 * Allowlisted provider pricing and conservative cost estimation (Stage B2.4A).
 *
 * Money is always an integer number of micro-units of USD (1 USD = 1,000,000).
 * No floating-point arithmetic is used for a monetary result.
 *
 * These are application estimates, not provider billing statements. Prices are a
 * dated snapshot read from official provider documentation and are explicitly
 * marked provisional: they must be re-verified before a real provider is
 * activated, and they confer no guaranteed or contractual rate. A provider-side
 * limit is separate from, and not implied by, this table.
 */
if (typeof window !== "undefined") {
  throw new Error("Provider pricing is server-only.");
}

export const BILLING_MONTH_PATTERN = /^[0-9]{4}-(0[1-9]|1[0-2])$/;
export const MICROS_PER_USD = 1_000_000;

/**
 * Safety margin applied on top of the token-budget estimate, in basis points.
 * 2,500 = 25%. It absorbs tokenizer differences between the application's
 * character-based budgets and the provider's token counts.
 */
export const ESTIMATE_SAFETY_MARGIN_BASIS_POINTS = 2_500;

/** Hard application ceilings, independent of any provider maximum. */
export const MAXIMUM_ESTIMATE_TOKENS = 200_000;
export const MAXIMUM_MICROS_PER_MILLION_TOKENS = 100_000_000;

export interface ProviderModelPricing {
  readonly providerIdentifier: string;
  /** Null for a provider that reports no model identity. */
  readonly modelIdentifier: string | null;
  /** Integer micro-units of USD per one million input tokens. */
  readonly inputMicrosPerMillionTokens: number;
  /** Integer micro-units of USD per one million output tokens. */
  readonly outputMicrosPerMillionTokens: number;
  /** Application-owned maximum input tokens billable for one turn. */
  readonly inputTokenBudget: number;
  /** Application-owned maximum output tokens billable for one turn. */
  readonly outputTokenBudget: number;
  /** True when the figures are a dated snapshot that must be re-verified. */
  readonly provisional: boolean;
  readonly priceSource: string;
  readonly verifiedOn: string;
}

/**
 * The only provider/model combinations the application will price. Anything
 * else resolves to null, which fails closed: an unknown provider has no budget
 * estimate and therefore cannot reserve spending.
 */
const PRICING: readonly ProviderModelPricing[] = Object.freeze([
  Object.freeze({
    providerIdentifier: "simulated-offline-model-transport/v1",
    modelIdentifier: null,
    inputMicrosPerMillionTokens: 0,
    outputMicrosPerMillionTokens: 0,
    inputTokenBudget: 0,
    outputTokenBudget: 0,
    provisional: false,
    priceSource: "Offline simulated transport: no provider and no charge.",
    verifiedOn: "2026-10-30",
  }),
  Object.freeze({
    providerIdentifier: "openai",
    modelIdentifier: "gpt-6-luna",
    inputMicrosPerMillionTokens: 100_000,
    outputMicrosPerMillionTokens: 500_000,
    inputTokenBudget: 4_000,
    outputTokenBudget: 512,
    provisional: true,
    priceSource: "https://developers.openai.com/api/docs/pricing",
    verifiedOn: "2026-10-30",
  }),
  Object.freeze({
    providerIdentifier: "anthropic",
    modelIdentifier: "claude-haiku-5-5",
    inputMicrosPerMillionTokens: 100_000,
    outputMicrosPerMillionTokens: 500_000,
    inputTokenBudget: 4_000,
    outputTokenBudget: 512,
    provisional: true,
    priceSource: "https://platform.claude.com/docs/en/about-claude/pricing",
    verifiedOn: "2026-10-30",
  }),
  Object.freeze({
    providerIdentifier: "google",
    modelIdentifier: "gemini-3.1-flash-lite",
    inputMicrosPerMillionTokens: 250_000,
    outputMicrosPerMillionTokens: 1_500_000,
    inputTokenBudget: 4_000,
    outputTokenBudget: 512,
    provisional: true,
    priceSource: "https://ai.google.dev/gemini-api/docs/pricing",
    verifiedOn: "2026-10-30",
  }),
]);

export interface EstimatedTurnCost {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly estimatedCostMicros: number;
}

export function listProviderPricing(): readonly ProviderModelPricing[] {
  return PRICING;
}

export function resolveProviderPricing(
  providerIdentifier: unknown,
  modelIdentifier: unknown,
): ProviderModelPricing | null {
  if (typeof providerIdentifier !== "string") return null;
  if (modelIdentifier !== null && typeof modelIdentifier !== "string") return null;
  const match = PRICING.find((entry) =>
    entry.providerIdentifier === providerIdentifier
    && entry.modelIdentifier === (modelIdentifier ?? null));
  return match ? Object.freeze({ ...match }) : null;
}

/**
 * Worst-case cost for one turn from the application's token budgets.
 *
 * The result is deliberately conservative: it prices the full input and output
 * budgets plus the safety margin, not the expected usage. It is still an
 * estimate. If a provider reports higher usage than reserved, settlement records
 * the higher amount and the turn commit re-checks the monthly cap; an amount
 * already spent cannot be recovered.
 */
export function estimateTurnCost(pricing: ProviderModelPricing): EstimatedTurnCost | null {
  if (!isPricing(pricing)) return null;
  const inputTokens = pricing.inputTokenBudget;
  const outputTokens = pricing.outputTokenBudget;
  const inputCost = microsForTokens(inputTokens, pricing.inputMicrosPerMillionTokens);
  const outputCost = microsForTokens(outputTokens, pricing.outputMicrosPerMillionTokens);
  if (inputCost === null || outputCost === null) return null;
  const base = inputCost + outputCost;
  const withMargin = Math.ceil(base * (10_000 + ESTIMATE_SAFETY_MARGIN_BASIS_POINTS) / 10_000);
  if (!Number.isSafeInteger(withMargin) || withMargin < 0) return null;
  return Object.freeze({
    inputTokens,
    outputTokens,
    estimatedCostMicros: withMargin,
  });
}

/** Cost of an actually reported usage, in integer micro-units. */
export function actualCostMicros(
  pricing: ProviderModelPricing,
  inputTokens: unknown,
  outputTokens: unknown,
): number | null {
  if (!isPricing(pricing)) return null;
  if (!isBoundedTokens(inputTokens) || !isBoundedTokens(outputTokens)) return null;
  const inputCost = microsForTokens(inputTokens, pricing.inputMicrosPerMillionTokens);
  const outputCost = microsForTokens(outputTokens, pricing.outputMicrosPerMillionTokens);
  if (inputCost === null || outputCost === null) return null;
  const total = inputCost + outputCost;
  return Number.isSafeInteger(total) ? total : null;
}

export function utcBillingMonth(epochMs: number): string | null {
  if (typeof epochMs !== "number" || !Number.isFinite(epochMs)) return null;
  const date = new Date(epochMs);
  if (Number.isNaN(date.getTime())) return null;
  const month = `${date.getUTCMonth() + 1}`.padStart(2, "0");
  return `${date.getUTCFullYear()}-${month}`;
}

export function isBillingMonth(value: unknown): value is string {
  return typeof value === "string" && BILLING_MONTH_PATTERN.test(value);
}

function microsForTokens(tokens: number, microsPerMillionTokens: number): number | null {
  if (!isBoundedTokens(tokens) || !isBoundedPrice(microsPerMillionTokens)) return null;
  const product = tokens * microsPerMillionTokens;
  if (!Number.isSafeInteger(product)) return null;
  return Math.ceil(product / 1_000_000);
}

function isPricing(value: ProviderModelPricing): boolean {
  if (!value || typeof value !== "object") return false;
  if (typeof value.providerIdentifier !== "string" || value.providerIdentifier.length === 0) return false;
  if (value.modelIdentifier !== null && typeof value.modelIdentifier !== "string") return false;
  return isBoundedPrice(value.inputMicrosPerMillionTokens)
    && isBoundedPrice(value.outputMicrosPerMillionTokens)
    && isBoundedTokens(value.inputTokenBudget)
    && isBoundedTokens(value.outputTokenBudget);
}

function isBoundedTokens(value: unknown): value is number {
  return typeof value === "number"
    && Number.isInteger(value)
    && value >= 0
    && value <= MAXIMUM_ESTIMATE_TOKENS;
}

function isBoundedPrice(value: unknown): value is number {
  return typeof value === "number"
    && Number.isInteger(value)
    && value >= 0
    && value <= MAXIMUM_MICROS_PER_MILLION_TOKENS;
}
