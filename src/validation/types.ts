export interface ValidationResult {
  valid: boolean;
  errors: readonly string[];
  warnings: readonly string[];
}

export function createPlaceholderValidationResult(): ValidationResult {
  return {
    valid: false,
    errors: ["Validation is not implemented."],
    warnings: [],
  };
}
