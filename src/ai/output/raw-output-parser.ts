import type { OperationResult } from "../contracts/results";
import { parseJsonWithoutDuplicateKeys } from "../providers/provider-output-schema";
import { deepFreeze } from "../shared/immutable";

export class BoundedRawOutputParser {
  constructor(private readonly maxLength = 20_000, private readonly maxDepth = 8) {}

  parse(rawOutput: unknown): OperationResult<Readonly<Record<string, unknown>>> {
    if (typeof rawOutput !== "string" || rawOutput.length === 0 || rawOutput.length > this.maxLength) {
      return { status: "failure", failures: ["RawOutputMalformed"] };
    }
    const strict = parseJsonWithoutDuplicateKeys(rawOutput);
    if (strict.status !== "parsed") {
      return { status: "failure", failures: ["RawOutputMalformed"] };
    }
    const parsed = strict.value;
    if (!isPlainRecord(parsed) || exceedsDepth(parsed, this.maxDepth) || hasDangerousKeys(parsed)) {
      return { status: "failure", failures: ["RawOutputMalformed"] };
    }
    return { status: "success", value: deepFreeze(parsed) };
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.getPrototypeOf(value) === Object.prototype;
}

function exceedsDepth(value: unknown, remaining: number): boolean {
  if (remaining < 0) return true;
  if (value === null || typeof value !== "object") return false;
  return Object.values(value as Record<string, unknown>)
    .some((child) => exceedsDepth(child, remaining - 1));
}

function hasDangerousKeys(value: unknown): boolean {
  if (value === null || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(hasDangerousKeys);
  const entries = Object.entries(value as Record<string, unknown>);
  return entries.some(([key, child]) =>
    key === "__proto__" || key === "prototype" || key === "constructor" || hasDangerousKeys(child));
}
