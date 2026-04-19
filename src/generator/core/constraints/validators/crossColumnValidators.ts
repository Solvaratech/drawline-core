import {
  ConstraintValidator,
  ConstraintContext,
  ValidationResult,
} from "../types";

export type ComparisonOperator = "eq" | "ne" | "gt" | "gte" | "lt" | "lte";

export interface CrossColumnValidatorOptions {
  sourceField: string;
  targetField: string;
  operator: ComparisonOperator;
}

function compareValues(a: number | string | Date, b: number | string | Date): number {
  if (a instanceof Date || b instanceof Date) {
    const dateA = a instanceof Date ? a.getTime() : new Date(a as string).getTime();
    const dateB = b instanceof Date ? b.getTime() : new Date(b as string).getTime();
    return dateA - dateB;
  }
  return Number(a) - Number(b);
}

export function createCrossColumnValidator(
  fieldName: string,
  options: CrossColumnValidatorOptions
): ConstraintValidator<unknown> {
  const { sourceField, targetField, operator } = options;

  return {
    metadata: {
      name: `${fieldName}:cross_column:${operator}`,
      type: "cross_column",
      severity: "error",
      description: `Field ${fieldName} must be ${operator} ${targetField}`,
    },
    validate(value: unknown, context: ConstraintContext): ValidationResult {
      if (!context.document) {
        return { valid: true };
      }

      const targetValue = context.document[targetField];
      if (targetValue === undefined || targetValue === null) {
        return { valid: true };
      }

      const comparison = compareValues(value as number | string | Date, targetValue as number | string | Date);
      let valid = false;

      switch (operator) {
        case "eq":
          valid = comparison === 0;
          break;
        case "ne":
          valid = comparison !== 0;
          break;
        case "gt":
          valid = comparison > 0;
          break;
        case "gte":
          valid = comparison >= 0;
          break;
        case "lt":
          valid = comparison < 0;
          break;
        case "lte":
          valid = comparison <= 0;
          break;
      }

      if (!valid) {
        return {
          valid: false,
          value,
          expected: `${operator} ${targetField} (${targetValue})`,
          actual: value,
          errorMessage: `${fieldName} (${value}) must be ${operator} ${targetField} (${targetValue})`,
          retryable: true,
        };
      }

      return { valid: true };
    },
  };
}

export interface SumOfValidatorOptions {
  targetFields: string[];
  sumField: string;
  tolerance?: number;
}

export function createSumOfValidator(
  fieldName: string,
  options: SumOfValidatorOptions
): ConstraintValidator<unknown> {
  const { targetFields, sumField, tolerance = 0 } = options;

  return {
    metadata: {
      name: `${fieldName}:sum_of`,
      type: "cross_column",
      severity: "error",
      description: `${fieldName} must equal sum of ${targetFields.join(" + ")}`,
    },
    validate(value: unknown, context: ConstraintContext): ValidationResult {
      if (!context.document) {
        return { valid: true };
      }

      const sum = targetFields.reduce((acc, field) => {
        const fieldValue = context.document![field];
        return acc + (typeof fieldValue === "number" ? fieldValue : 0);
      }, 0);

      const targetSum = typeof value === "number" ? value : 0;
      const diff = Math.abs(targetSum - sum);

      if (diff > tolerance) {
        return {
          valid: false,
          value: targetSum,
          expected: sum,
          actual: targetSum,
          errorMessage: `${fieldName} (${targetSum}) must equal sum of ${targetFields.join(" + ")} (${sum})`,
          retryable: true,
        };
      }

      return { valid: true };
    },
  };
}

export interface RatioOfValidatorOptions {
  numeratorField: string;
  denominatorField: string;
  targetRatio: number;
  tolerance?: number;
}

export function createRatioOfValidator(
  fieldName: string,
  options: RatioOfValidatorOptions
): ConstraintValidator<unknown> {
  const { numeratorField, denominatorField, targetRatio, tolerance = 0.01 } = options;

  return {
    metadata: {
      name: `${fieldName}:ratio_of`,
      type: "cross_column",
      severity: "error",
      description: `${fieldName} should be approximately ${targetRatio}x ratio of ${numeratorField}/${denominatorField}`,
    },
    validate(value: unknown, context: ConstraintContext): ValidationResult {
      if (!context.document) {
        return { valid: true };
      }

      const numerator = context.document[numeratorField] as number;
      const denominator = context.document[denominatorField] as number;

      if (typeof numerator !== "number" || typeof denominator !== "number" || denominator === 0) {
        return { valid: false, errorMessage: "Invalid numerator/denominator values" };
      }

      const actualRatio = numerator / denominator;
      const diff = Math.abs(actualRatio - targetRatio);

      if (diff > tolerance) {
        return {
          valid: false,
          value,
          expected: `~${targetRatio} (actual: ${actualRatio.toFixed(4)})`,
          actual: value,
          errorMessage: `${fieldName} ratio should be approximately ${targetRatio}, got ${actualRatio.toFixed(4)}`,
          retryable: true,
        };
      }

      return { valid: true };
    },
  };
}

export interface PercentageOfValidatorOptions {
  partField: string;
  wholeField: string;
  targetPercentage: number;
  tolerance?: number;
}

export function createPercentageOfValidator(
  fieldName: string,
  options: PercentageOfValidatorOptions
): ConstraintValidator<unknown> {
  const { partField, wholeField, targetPercentage, tolerance = 1 } = options;

  return {
    metadata: {
      name: `${fieldName}:percentage_of`,
      type: "cross_column",
      severity: "error",
      description: `${fieldName} should be ${targetPercentage}% of ${wholeField} (part: ${partField})`,
    },
    validate(value: unknown, context: ConstraintContext): ValidationResult {
      if (!context.document) {
        return { valid: true };
      }

      const part = context.document[partField] as number;
      const whole = context.document[wholeField] as number;

      if (typeof part !== "number" || typeof whole !== "number" || whole === 0) {
        return { valid: false, errorMessage: "Invalid part/whole values" };
      }

      const actualPercentage = (part / whole) * 100;
      const diff = Math.abs(actualPercentage - targetPercentage);

      if (diff > tolerance) {
        return {
          valid: false,
          value,
          expected: `${targetPercentage}% (actual: ${actualPercentage.toFixed(2)}%)`,
          actual: value,
          errorMessage: `${fieldName} should be ${targetPercentage}% of ${wholeField}, got ${actualPercentage.toFixed(2)}%`,
          retryable: true,
        };
      }

      return { valid: true };
    },
  };
}

export interface ConditionalValidatorOptions {
  conditionField: string;
  conditionOperator: "eq" | "ne" | "gt" | "gte" | "lt" | "lte" | "exists" | "not_exists";
  conditionValue?: unknown;
  thenField: string;
  thenConstraint: (value: unknown) => ValidationResult;
  elseConstraint?: (value: unknown) => ValidationResult;
}

export function createConditionalValidator(
  fieldName: string,
  options: ConditionalValidatorOptions
): ConstraintValidator<unknown> {
  const {
    conditionField,
    conditionOperator,
    conditionValue,
    thenField,
    thenConstraint,
    elseConstraint,
  } = options;

  return {
    metadata: {
      name: `${fieldName}:conditional`,
      type: "conditional",
      severity: "error",
      description: `${fieldName} has conditional constraint based on ${conditionField}`,
    },
    validate(value: unknown, context: ConstraintContext): ValidationResult {
      if (!context.document) {
        return { valid: true };
      }

      const conditionValueInDoc = context.document[conditionField];
      let conditionMet = false;

      switch (conditionOperator) {
        case "exists":
          conditionMet = conditionValueInDoc !== undefined && conditionValueInDoc !== null;
          break;
        case "not_exists":
          conditionMet = conditionValueInDoc === undefined || conditionValueInDoc === null;
          break;
        case "eq":
          conditionMet = conditionValueInDoc === conditionValue;
          break;
        case "ne":
          conditionMet = conditionValueInDoc !== conditionValue;
          break;
        case "gt":
          conditionMet = Number(conditionValueInDoc) > Number(conditionValue);
          break;
        case "gte":
          conditionMet = Number(conditionValueInDoc) >= Number(conditionValue);
          break;
        case "lt":
          conditionMet = Number(conditionValueInDoc) < Number(conditionValue);
          break;
        case "lte":
          conditionMet = Number(conditionValueInDoc) <= Number(conditionValue);
          break;
      }

      if (conditionMet) {
        const targetValue = context.document[thenField];
        return thenConstraint(targetValue);
      } else if (elseConstraint) {
        return elseConstraint(value);
      }

      return { valid: true };
    },
  };
}

export function createMutuallyExclusiveValidator(
  fieldName: string,
  otherFields: string[]
): ConstraintValidator<unknown> {
  return {
    metadata: {
      name: `${fieldName}:mutually_exclusive`,
      type: "cross_column",
      severity: "error",
      description: `${fieldName} is mutually exclusive with [${otherFields.join(", ")}]`,
    },
    validate(value: unknown, context: ConstraintContext): ValidationResult {
      if (!context.document) return { valid: true };

      const isSet = value !== undefined && value !== null;
      if (!isSet) return { valid: true };

      const conflicts = otherFields.filter(
        (f) => f !== fieldName && context.document![f] !== undefined && context.document![f] !== null
      );

      if (conflicts.length > 0) {
        return {
          valid: false,
          value,
          expected: "only one field should be set",
          actual: `conflicts with ${conflicts.join(", ")}`,
          errorMessage: `${fieldName} cannot be set when [${conflicts.join(
            ", "
          )}] are also set`,
          retryable: true,
        };
      }

      return { valid: true };
    },
  };
}
