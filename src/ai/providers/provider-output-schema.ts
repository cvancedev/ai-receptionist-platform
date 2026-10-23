import type { ContractFieldType } from "../contracts/catalog";

/**
 * Strict validation of provider output against the rendered application schema.
 *
 * This is a transport-boundary check, not the application validator. It can
 * only accept a JSON object that matches the schema the application rendered:
 * the same allowed and required fields, the same field types, the same string
 * and array limits, and the same proposal type. It performs no scope,
 * grounding, semantic, or authority reasoning; those remain application
 * decisions in `PrototypeProposalValidator`.
 *
 * Nothing here logs, stores, or returns the provider payload beyond the parsed
 * object needed by the caller.
 */
export const PROVIDER_OUTPUT_SCHEMA_VERSION = "provider-output-schema/v1" as const;

export const PROVIDER_OUTPUT_VIOLATIONS = [
  "SchemaUnreadable",
  "OutputNotJson",
  "DuplicateFieldName",
  "OutputNotObject",
  "DangerousFieldName",
  "OutputTooDeep",
  "ProposalTypeMismatch",
  "RequiredFieldMissing",
  "UnexpectedField",
  "InvalidFieldType",
  "StringLimitExceeded",
  "ArrayLimitExceeded",
] as const;

export type ProviderOutputViolation = (typeof PROVIDER_OUTPUT_VIOLATIONS)[number];

export type StrictJsonParseResult =
  | { readonly status: "parsed"; readonly value: unknown }
  | { readonly status: "duplicate-key" }
  | { readonly status: "invalid" };

export interface ProviderOutputSchema {
  readonly proposalType: string;
  readonly required: readonly string[];
  readonly allowed: readonly string[];
  readonly fieldTypes: Readonly<Record<string, ContractFieldType>>;
  readonly maxStringLength: number;
  readonly maxArrayLength: number;
}

export type ProviderOutputValidation =
  | {
      readonly status: "valid";
      readonly value: Readonly<Record<string, unknown>>;
    }
  | {
      readonly status: "invalid";
      readonly violations: readonly ProviderOutputViolation[];
    };

const CONTRACT_FIELD_TYPES: readonly ContractFieldType[] = [
  "string", "number", "boolean", "string_array", "record", "record_array",
];

const DANGEROUS_FIELD_NAMES = new Set(["__proto__", "prototype", "constructor"]);
const MAXIMUM_DEPTH = 8;
const MINIMUM_LIMIT = 1;
const MAXIMUM_LIMIT = 100_000;

export function validateProviderOutput(
  rawOutput: string,
  renderedSchema: string,
): ProviderOutputValidation {
  const schema = parseProviderOutputSchema(renderedSchema);
  if (!schema) return invalid(["SchemaUnreadable"]);

  const parsed = parseJsonWithoutDuplicateKeys(rawOutput);
  if (parsed.status === "duplicate-key") return invalid(["DuplicateFieldName"]);
  if (parsed.status !== "parsed") return invalid(["OutputNotJson"]);
  const output = parsed.value;
  if (!isPlainRecord(output)) return invalid(["OutputNotObject"]);
  if (containsDangerousFieldName(output)) return invalid(["DangerousFieldName"]);
  if (exceedsDepth(output, MAXIMUM_DEPTH)) return invalid(["OutputTooDeep"]);

  const violations: ProviderOutputViolation[] = [];
  const keys = Object.keys(output);
  const allowed = new Set(schema.allowed);
  const required = new Set(schema.required);

  if (output.proposalType !== schema.proposalType) {
    violations.push("ProposalTypeMismatch");
  }
  for (const field of schema.required) {
    if (!Object.prototype.hasOwnProperty.call(output, field)) {
      violations.push("RequiredFieldMissing");
    }
  }
  for (const field of keys) {
    if (!allowed.has(field)) {
      violations.push("UnexpectedField");
      continue;
    }
    const expectedType = schema.fieldTypes[field];
    if (!expectedType) {
      violations.push("InvalidFieldType");
      continue;
    }
    const value = output[field];
    if (!matchesType(value, expectedType)) {
      violations.push("InvalidFieldType");
      continue;
    }
    if (typeof value === "string" && value.length > schema.maxStringLength) {
      violations.push("StringLimitExceeded");
    }
    if (Array.isArray(value)) {
      if (value.length > schema.maxArrayLength) {
        violations.push("ArrayLimitExceeded");
      }
      if (value.some((item) => typeof item === "string" && item.length > schema.maxStringLength)) {
        violations.push("StringLimitExceeded");
      }
    }
  }

  // A required field that is also absent from `allowed` is a broken schema,
  // not a provider fault. Required fields are always allowed by the contract
  // registry, so refusing here keeps the boundary honest.
  for (const field of required) {
    if (!allowed.has(field)) {
      violations.push("SchemaUnreadable");
    }
  }

  return violations.length === 0
    ? { status: "valid", value: output }
    : { status: "invalid", violations: unique(violations) };
}

const MAXIMUM_JSON_DEPTH = 32;

/**
 * Parses JSON only if no object in the document repeats a member name.
 *
 * `JSON.parse` silently keeps the last duplicate, so a provider could send a
 * harmless-looking first value and a different effective value. This scanner
 * walks the document structurally (no regular expressions and no dependency)
 * and decodes member names before comparing them, so `"ambiguity"` and
 * `"\u0061mbiguity"` are correctly recognized as the same key. It also rejects
 * malformed JSON, excessive nesting, and trailing content. Values are
 * produced by `JSON.parse` only after the document passes the scan.
 */
export function parseJsonWithoutDuplicateKeys(text: string): StrictJsonParseResult {
  if (typeof text !== "string" || text.length === 0) return { status: "invalid" };
  try {
    scanDocument(text);
  } catch (error) {
    return {
      status: error instanceof DuplicateJsonKeyError ? "duplicate-key" : "invalid",
    };
  }
  try {
    return { status: "parsed", value: JSON.parse(text) };
  } catch {
    return { status: "invalid" };
  }
}

class DuplicateJsonKeyError extends Error {}
class InvalidJsonError extends Error {}

function scanDocument(text: string): void {
  let index = 0;
  const length = text.length;

  function fail(): never {
    throw new InvalidJsonError();
  }

  function duplicate(): never {
    throw new DuplicateJsonKeyError();
  }

  function skipWhitespace(): void {
    while (index < length) {
      const code = text.charCodeAt(index);
      if (code === 0x20 || code === 0x09 || code === 0x0a || code === 0x0d) {
        index += 1;
      } else {
        break;
      }
    }
  }

  function parseString(): string {
    if (text.charCodeAt(index) !== 0x22) return fail();
    index += 1;
    let value = "";
    while (index < length) {
      const code = text.charCodeAt(index);
      if (code === 0x22) {
        index += 1;
        return value;
      }
      if (code === 0x5c) {
        index += 1;
        if (index >= length) fail();
        const escape = text.charCodeAt(index);
        if (escape === 0x22) {
          value += "\"";
          index += 1;
        } else if (escape === 0x5c) {
          value += "\\";
          index += 1;
        } else if (escape === 0x2f) {
          value += "/";
          index += 1;
        } else if (escape === 0x62) {
          value += "\b";
          index += 1;
        } else if (escape === 0x66) {
          value += "\f";
          index += 1;
        } else if (escape === 0x6e) {
          value += "\n";
          index += 1;
        } else if (escape === 0x72) {
          value += "\r";
          index += 1;
        } else if (escape === 0x74) {
          value += "\t";
          index += 1;
        } else if (escape === 0x75) {
          if (index + 4 >= length) fail();
          let codeUnit = 0;
          for (let offset = 1; offset <= 4; offset += 1) {
            const digit = hexadecimalDigit(text.charCodeAt(index + offset));
            if (digit < 0) fail();
            codeUnit = codeUnit * 16 + digit;
          }
          value += String.fromCharCode(codeUnit);
          index += 5;
        } else {
          fail();
        }
        continue;
      }
      if (code < 0x20) fail();
      value += text[index];
      index += 1;
    }
    return fail();
  }

  function parseNumber(): void {
    if (text.charCodeAt(index) === 0x2d) index += 1;
    if (index >= length) fail();
    const first = text.charCodeAt(index);
    if (first === 0x30) {
      index += 1;
    } else if (isDigit(first) && first !== 0x30) {
      index += 1;
      while (index < length && isDigit(text.charCodeAt(index))) index += 1;
    } else {
      fail();
    }
    if (index < length && text.charCodeAt(index) === 0x2e) {
      index += 1;
      if (index >= length || !isDigit(text.charCodeAt(index))) fail();
      while (index < length && isDigit(text.charCodeAt(index))) index += 1;
    }
    if (index < length) {
      const marker = text.charCodeAt(index);
      if (marker === 0x65 || marker === 0x45) {
        index += 1;
        if (index < length) {
          const sign = text.charCodeAt(index);
          if (sign === 0x2b || sign === 0x2d) index += 1;
        }
        if (index >= length || !isDigit(text.charCodeAt(index))) fail();
        while (index < length && isDigit(text.charCodeAt(index))) index += 1;
      }
    }
  }

  function parseLiteral(literal: string): void {
    if (!text.startsWith(literal, index)) fail();
    index += literal.length;
  }

  function parseValue(depth: number): void {
    skipWhitespace();
    if (index >= length || depth > MAXIMUM_JSON_DEPTH) fail();
    const code = text.charCodeAt(index);
    if (code === 0x7b) {
      parseObject(depth + 1);
    } else if (code === 0x5b) {
      parseArray(depth + 1);
    } else if (code === 0x22) {
      parseString();
    } else if (code === 0x74) {
      parseLiteral("true");
    } else if (code === 0x66) {
      parseLiteral("false");
    } else if (code === 0x6e) {
      parseLiteral("null");
    } else if (code === 0x2d || isDigit(code)) {
      parseNumber();
    } else {
      fail();
    }
  }

  function parseObject(depth: number): void {
    index += 1;
    const keys = new Set<string>();
    skipWhitespace();
    if (index < length && text.charCodeAt(index) === 0x7d) {
      index += 1;
      return;
    }
    for (;;) {
      skipWhitespace();
      if (index >= length || text.charCodeAt(index) !== 0x22) fail();
      const key = parseString();
      if (keys.has(key)) duplicate();
      keys.add(key);
      skipWhitespace();
      if (index >= length || text.charCodeAt(index) !== 0x3a) fail();
      index += 1;
      parseValue(depth);
      skipWhitespace();
      if (index >= length) fail();
      const separator = text.charCodeAt(index);
      if (separator === 0x2c) {
        index += 1;
        continue;
      }
      if (separator === 0x7d) {
        index += 1;
        return;
      }
      fail();
    }
  }

  function parseArray(depth: number): void {
    index += 1;
    skipWhitespace();
    if (index < length && text.charCodeAt(index) === 0x5d) {
      index += 1;
      return;
    }
    for (;;) {
      parseValue(depth);
      skipWhitespace();
      if (index >= length) fail();
      const separator = text.charCodeAt(index);
      if (separator === 0x2c) {
        index += 1;
        continue;
      }
      if (separator === 0x5d) {
        index += 1;
        return;
      }
      fail();
    }
  }

  skipWhitespace();
  parseValue(0);
  skipWhitespace();
  if (index !== length) fail();
}

function isDigit(code: number): boolean {
  return code >= 0x30 && code <= 0x39;
}

function hexadecimalDigit(code: number): number {
  if (code >= 0x30 && code <= 0x39) return code - 0x30;
  if (code >= 0x41 && code <= 0x46) return code - 0x41 + 10;
  if (code >= 0x61 && code <= 0x66) return code - 0x61 + 10;
  return -1;
}

export function parseProviderOutputSchema(renderedSchema: string): ProviderOutputSchema | null {
  if (typeof renderedSchema !== "string" || renderedSchema.length === 0) return null;
  let candidate: unknown;
  try {
    candidate = JSON.parse(renderedSchema);
  } catch {
    return null;
  }
  if (!isPlainRecord(candidate)) return null;
  if (candidate.type !== "object" || typeof candidate.proposalType !== "string"
    || candidate.proposalType.length === 0) {
    return null;
  }

  const required = stringArray(candidate.required);
  const allowed = stringArray(candidate.allowed);
  if (!required || !allowed) return null;
  if (!required.every((field) => allowed.includes(field))) return null;

  if (!isPlainRecord(candidate.fieldTypes) || !isPlainRecord(candidate.limits)) return null;
  const fieldTypes: Record<string, ContractFieldType> = {};
  for (const [field, type] of Object.entries(candidate.fieldTypes)) {
    if (!allowed.includes(field)) return null;
    if (typeof type !== "string" || !CONTRACT_FIELD_TYPES.includes(type as ContractFieldType)) {
      return null;
    }
    fieldTypes[field] = type as ContractFieldType;
  }
  for (const field of allowed) {
    if (!Object.prototype.hasOwnProperty.call(fieldTypes, field)) return null;
  }

  const maxStringLength = boundedInteger(candidate.limits.maxStringLength);
  const maxArrayLength = boundedInteger(candidate.limits.maxArrayLength);
  if (maxStringLength === null || maxArrayLength === null) return null;
  if (candidate.extraFieldPolicy !== undefined && candidate.extraFieldPolicy !== "reject") {
    return null;
  }

  return {
    proposalType: candidate.proposalType,
    required,
    allowed,
    fieldTypes,
    maxStringLength,
    maxArrayLength,
  };
}

function matchesType(value: unknown, expected: ContractFieldType): boolean {
  switch (expected) {
    case "string": return typeof value === "string";
    case "number": return typeof value === "number" && Number.isFinite(value);
    case "boolean": return typeof value === "boolean";
    case "string_array": return Array.isArray(value) && value.every((item) => typeof item === "string");
    case "record": return isPlainRecord(value);
    case "record_array": return Array.isArray(value) && value.every(isPlainRecord);
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function containsDangerousFieldName(value: unknown): boolean {
  if (value === null || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(containsDangerousFieldName);
  return Object.entries(value as Record<string, unknown>).some(
    ([key, child]) => DANGEROUS_FIELD_NAMES.has(key) || containsDangerousFieldName(child),
  );
}

function exceedsDepth(value: unknown, remaining: number): boolean {
  if (remaining < 0) return true;
  if (value === null || typeof value !== "object") return false;
  return Object.values(value as Record<string, unknown>)
    .some((child) => exceedsDepth(child, remaining - 1));
}

function stringArray(value: unknown): readonly string[] | null {
  if (!Array.isArray(value)) return null;
  if (!value.every((item) => typeof item === "string" && item.length > 0)) return null;
  return [...new Set(value)];
}

function boundedInteger(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  if (value < MINIMUM_LIMIT || value > MAXIMUM_LIMIT) return null;
  return value;
}

function invalid(violations: readonly ProviderOutputViolation[]): ProviderOutputValidation {
  return { status: "invalid", violations: unique(violations) };
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}
