import {
  ConstraintValidator,
  ConstraintContext,
  ValidationResult,
  ConstraintMetadata,
} from "../types";

export interface RangeValidatorOptions {
  min?: number;
  max?: number;
  inclusive?: boolean;
}

export function createRangeValidator(
  fieldName: string,
  options: RangeValidatorOptions
): ConstraintValidator<number> {
  const { min, max, inclusive = true } = options;

  return {
    metadata: {
      name: `${fieldName}:range`,
      type: "field_validation",
      severity: "error",
      description: `Field ${fieldName} must be ${inclusive ? "between" : "strictly between"} ${min} and ${max}`,
      errorMessage: `${fieldName} is out of range [${min}, ${max}]`,
    },
    validate(value: number, _context: ConstraintContext): ValidationResult {
      const num = Number(value);
      if (isNaN(num)) {
        return {
          valid: false,
          value,
          expected: `number in range [${min}, ${max}]`,
          actual: value,
          errorMessage: `${fieldName} must be a number`,
        };
      }

      const minOk = min !== undefined
        ? inclusive ? num >= min : num > min
        : true;
      const maxOk = max !== undefined
        ? inclusive ? num <= max : num < max
        : true;

      if (!minOk || !maxOk) {
        return {
          valid: false,
          value: num,
          expected: inclusive
            ? `${min !== undefined ? `>= ${min}` : ""} and ${max !== undefined ? `<= ${max}` : ""}`.trim()
            : `${min !== undefined ? `> ${min}` : ""} and ${max !== undefined ? `< ${max}` : ""}`.trim(),
          actual: num,
          errorMessage: this.metadata.errorMessage,
          retryable: true,
        };
      }

      return { valid: true };
    },
  };
}

export function createStringLengthValidator(
  fieldName: string,
  options: { minLength?: number; maxLength?: number }
): ConstraintValidator<string> {
  const { minLength, maxLength } = options;

  return {
    metadata: {
      name: `${fieldName}:length`,
      type: "field_validation",
      severity: "error",
      description: `Field ${fieldName} length must be ${minLength !== undefined ? `at least ${minLength}` : ""} ${maxLength !== undefined ? `at most ${maxLength}` : ""}`.trim(),
    },
    validate(value: string, _context: ConstraintContext): ValidationResult {
      if (typeof value !== "string") {
        return { valid: false, value, errorMessage: `${fieldName} must be a string` };
      }

      const len = value.length;
      const minOk = minLength !== undefined ? len >= minLength : true;
      const maxOk = maxLength !== undefined ? len <= maxLength : true;

      if (!minOk || !maxOk) {
        return {
          valid: false,
          value,
          expected: `length ${minLength !== undefined ? `>= ${minLength}` : ""} ${maxLength !== undefined ? `<= ${maxLength}` : ""}`.trim(),
          actual: len,
          errorMessage: `${fieldName} length ${len} is out of bounds [${minLength}, ${maxLength}]`,
          retryable: true,
        };
      }

      return { valid: true };
    },
  };
}

export function createPatternValidator(
  fieldName: string,
  pattern: string | RegExp
): ConstraintValidator<string> {
  const regex = typeof pattern === "string" ? new RegExp(pattern) : pattern;

  return {
    metadata: {
      name: `${fieldName}:pattern`,
      type: "field_validation",
      severity: "error",
      description: `Field ${fieldName} must match pattern ${regex}`,
    },
    validate(value: string, _context: ConstraintContext): ValidationResult {
      if (typeof value !== "string") {
        return { valid: false, value, errorMessage: `${fieldName} must be a string` };
      }

      const matches = regex.test(value);
      if (!matches) {
        return {
          valid: false,
          value,
          expected: `matching ${regex}`,
          actual: value.substring(0, 50),
          errorMessage: `${fieldName} does not match required pattern`,
          retryable: true,
        };
      }

      return { valid: true };
    },
  };
}

export function createEnumValidator<T extends string | number>(
  fieldName: string,
  allowedValues: T[]
): ConstraintValidator<T> {
  return {
    metadata: {
      name: `${fieldName}:enum`,
      type: "field_validation",
      severity: "error",
      description: `Field ${fieldName} must be one of: ${allowedValues.join(", ")}`,
    },
    validate(value: T, _context: ConstraintContext): ValidationResult {
      const isValid = allowedValues.includes(value);
      if (!isValid) {
        return {
          valid: false,
          value,
          expected: allowedValues,
          actual: value,
          errorMessage: `${fieldName} value "${value}" is not in allowed values`,
          retryable: false,
        };
      }
      return { valid: true };
    },
  };
}

export function createEmailValidator(fieldName: string): ConstraintValidator<string> {
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  return {
    metadata: {
      name: `${fieldName}:email`,
      type: "field_validation",
      severity: "error",
      description: `Field ${fieldName} must be a valid email address`,
    },
    validate(value: string, _context: ConstraintContext): ValidationResult {
      if (typeof value !== "string") {
        return { valid: false, value, errorMessage: `${fieldName} must be a string` };
      }

      if (!emailPattern.test(value)) {
        return {
          valid: false,
          value,
          expected: "valid email format",
          errorMessage: `${fieldName} is not a valid email address`,
          retryable: true,
        };
      }

      return { valid: true };
    },
  };
}

export function createUrlValidator(fieldName: string): ConstraintValidator<string> {
  const urlPattern = /^https?:\/\/[^\s/$.?#].[^\s]*$/i;

  return {
    metadata: {
      name: `${fieldName}:url`,
      type: "field_validation",
      severity: "error",
      description: `Field ${fieldName} must be a valid URL`,
    },
    validate(value: string, _context: ConstraintContext): ValidationResult {
      if (typeof value !== "string") {
        return { valid: false, value, errorMessage: `${fieldName} must be a string` };
      }

      if (!urlPattern.test(value)) {
        return {
          valid: false,
          value,
          expected: "valid URL format (http:// or https://)",
          errorMessage: `${fieldName} is not a valid URL`,
          retryable: true,
        };
      }

      return { valid: true };
    },
  };
}

export function createNullRateValidator(
  fieldName: string,
  maxNullRate: number
): ConstraintValidator<unknown> {
  return {
    metadata: {
      name: `${fieldName}:null_rate`,
      type: "field_validation",
      severity: "warning",
      description: `Field ${fieldName} null rate should not exceed ${(maxNullRate * 100).toFixed(0)}%`,
    },
    validate(value: unknown, context: ConstraintContext): ValidationResult {
      if (value === null || value === undefined) {
        const nullRate = context.random();
        if (nullRate > maxNullRate) {
          return {
            valid: false,
            value,
            expected: `null rate <= ${(maxNullRate * 100).toFixed(0)}%`,
            actual: "high null rate",
            errorMessage: `${fieldName} has excessive null values`,
            retryable: true,
          };
        }
      }
      return { valid: true };
    },
  };
}

export function createUniqueValidator<T>(
  fieldName: string,
  getAllValues: () => T[]
): ConstraintValidator<T> {
  return {
    metadata: {
      name: `${fieldName}:unique`,
      type: "field_validation",
      severity: "error",
      description: `Field ${fieldName} must contain unique values`,
    },
    validate(value: T, _context: ConstraintContext): ValidationResult {
      const allValues = getAllValues();
      const occurrences = allValues.filter((v) => v === value).length;

      if (occurrences > 1) {
        return {
          valid: false,
          value,
          expected: "unique value",
          actual: `value appears ${occurrences} times`,
          errorMessage: `${fieldName} value "${value}" is not unique`,
          retryable: false,
        };
      }
      return { valid: true };
    },
  };
}
