import {
  ConstraintValidator,
  ConstraintContext,
  ValidationResult,
} from "../types";

export interface TemporalValidatorOptions {
  operator: "before" | "after" | "within_days" | "older_than";
  targetField?: string;
  referenceDate?: Date | string;
  value?: number; // Days or Years depending on operator
}

export function createTemporalValidator(
  fieldName: string,
  options: TemporalValidatorOptions
): ConstraintValidator<any> {
  const { operator, targetField, referenceDate, value: temporalValue } = options;

  return {
    metadata: {
      name: `${fieldName}:temporal:${operator}`,
      type: "temporal",
      severity: "error",
      description: `Field ${fieldName} must be ${operator}${
        targetField ? ` ${targetField}` : referenceDate ? ` ${referenceDate}` : ""
      }${temporalValue ? ` (${temporalValue})` : ""}`,
    },
    validate(value: any, context: ConstraintContext): ValidationResult {
      if (value === null || value === undefined) return { valid: true };

      const dateValue = new Date(value);
      if (isNaN(dateValue.getTime())) {
        return {
          valid: false,
          value,
          errorMessage: `${fieldName} must be a valid date`,
        };
      }

      let reference: Date;
      if (targetField && context.document) {
        const compValue = context.document[targetField];
        if (compValue === null || compValue === undefined) return { valid: true };
        reference = new Date(compValue as any);
        if (isNaN(reference.getTime())) return { valid: true };
      } else if (referenceDate) {
        reference = new Date(referenceDate);
      } else {
        reference = new Date(); // Default to now if nothing specified
      }

      let valid = true;
      let actualVal = dateValue.toISOString();
      let expectedVal = "";

      const diffMs = dateValue.getTime() - reference.getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);

      console.log(`Debug Temporal: op=${operator}, val=${dateValue.toISOString()}, ref=${reference.toISOString()}, diffDays=${diffDays}`);

      switch (operator) {
        case "before":
          valid = dateValue.getTime() < reference.getTime();
          expectedVal = `before ${reference.toISOString()}`;
          break;
        case "after":
          valid = dateValue.getTime() > reference.getTime();
          expectedVal = `after ${reference.toISOString()}`;
          break;
        case "within_days":
          if (temporalValue === undefined) return { valid: true };
          valid = Math.abs(diffDays) <= temporalValue;
          expectedVal = `within ${temporalValue} days of ${reference.toISOString()}`;
          break;
        case "older_than":
          if (temporalValue === undefined) return { valid: true };
          const ageDate = new Date(reference.getTime());
          ageDate.setFullYear(reference.getFullYear() - temporalValue);
          
          if (isNaN(ageDate.getTime())) {
            valid = true; // Fallback
            expectedVal = "valid date context";
          } else {
            valid = dateValue.getTime() <= ageDate.getTime();
            expectedVal = `older than ${temporalValue} years (before ${ageDate.toISOString()})`;
          }
          break;
      }

      if (!valid) {
        return {
          valid: false,
          value,
          expected: expectedVal,
          actual: actualVal,
          errorMessage: `${fieldName} (${actualVal}) failed temporal constraint ${operator} ${expectedVal}`,
          retryable: true,
        };
      }

      return { valid: true };
    },
  };
}
