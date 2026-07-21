export interface ValidationResult {
  valid: boolean;
  errors: readonly string[];
  warnings: readonly string[];
}
