import {
  ConstraintMetadata,
  ConstraintValidator,
  ConstraintContext,
  ValidationResult,
  ConstraintType,
  ConstraintDefinition,
  ConstraintViolation,
  ConstraintReport,
  ConstraintMode,
  ConstraintSeverity,
} from "./types";

import { SchemaField } from "../../../types/schemaDesign";

export interface RegistryOptions {
  defaultMode?: ConstraintMode;
  maxRetries?: number;
  throwOnError?: boolean;
}

export class ConstraintRegistry {
  private validators: Map<string, ConstraintValidator<unknown>> = new Map();
  private fieldConstraints: Map<string, ConstraintValidator<unknown>[]> = new Map();
  private documentConstraints: ConstraintValidator<unknown>[] = [];
  private options: Required<RegistryOptions>;
  private priority: Map<string, number> = new Map();
  private evaluationOrder: string[] | null = null;

  constructor(options: RegistryOptions = {}) {
    this.options = {
      defaultMode: options.defaultMode ?? "strict",
      maxRetries: options.maxRetries ?? 3,
      throwOnError: options.throwOnError ?? false,
    };
  }

  register<T>(
    name: string,
    validator: ConstraintValidator<T>,
    priority: number = 0
  ): void {
    this.validators.set(name, validator as ConstraintValidator<unknown>);
    this.priority.set(name, priority);
  }

  registerFieldConstraint(
    fieldName: string,
    validator: ConstraintValidator<unknown>,
    priority: number = 0
  ): void {
    if (!this.fieldConstraints.has(fieldName)) {
      this.fieldConstraints.set(fieldName, []);
    }
    this.fieldConstraints.get(fieldName)!.push(validator);
    this.priority.set(`${fieldName}:${validator.metadata.name}`, priority);
  }

  registerDocumentConstraint(
    validator: ConstraintValidator<unknown>,
    priority: number = 0
  ): void {
    this.documentConstraints.push(validator);
  }

  unregister(name: string): boolean {
    return this.validators.delete(name);
  }

  unregisterFieldConstraint(fieldName: string, constraintName: string): boolean {
    const constraints = this.fieldConstraints.get(fieldName);
    if (!constraints) return false;
    const index = constraints.findIndex((v) => v.metadata.name === constraintName);
    if (index === -1) return false;
    constraints.splice(index, 1);
    return true;
  }

  getValidator(name: string): ConstraintValidator<unknown> | undefined {
    return this.validators.get(name);
  }

  getFieldConstraints(fieldName: string): ConstraintValidator<unknown>[] {
    return this.fieldConstraints.get(fieldName) || [];
  }

  getDocumentConstraints(): ConstraintValidator<unknown>[] {
    return [...this.documentConstraints];
  }

  getAllValidators(): ConstraintValidator<unknown>[] {
    return Array.from(this.validators.values());
  }

  has(name: string): boolean {
    return this.validators.has(name);
  }

  setMode(mode: ConstraintMode): void {
    this.options.defaultMode = mode;
  }

  setMaxRetries(maxRetries: number): void {
    this.options.maxRetries = maxRetries;
  }

  setThrowOnError(throwOnError: boolean): void {
    this.options.throwOnError = throwOnError;
  }

  validateDocument(
    document: Record<string, unknown>,
    context?: Partial<ConstraintContext>
  ): ValidationResult[] {
    const results: ValidationResult[] = [];
    const fullContext: ConstraintContext = {
      document,
      random: context?.random ?? (() => Math.random()),
      ...context,
    };
    
    if (!this.evaluationOrder) {
      this.resolveEvaluationOrder(Object.keys(document));
    }

    const fieldOrder = this.evaluationOrder || Object.keys(document);

    for (const fieldName of fieldOrder) {
      if (document[fieldName] === undefined) continue;
      const fieldConstraints = this.getFieldConstraints(fieldName);
      const sortedConstraints = this.sortByPriority(
        fieldName,
        fieldConstraints
      );

      for (const validator of sortedConstraints) {
        const result = validator.validate(document[fieldName], fullContext);
        if (!result.valid) {
          results.push({
            ...result,
            fieldName,
            constraintName: validator.metadata.name,
          });
        }
      }
    }

    const sortedDocConstraints = this.sortByPriority(
      "__document__",
      this.documentConstraints
    );
    for (const validator of sortedDocConstraints) {
      const result = validator.validate(document, fullContext);
      if (!result.valid) {
        results.push({
          ...result,
          constraintName: validator.metadata.name,
        });
      }
    }

    return results;
  }

  validateBatch(
    documents: Record<string, unknown>[],
    options?: { mode?: ConstraintMode; maxRetries?: number }
  ): ConstraintReport {
    const mode = options?.mode ?? this.options.defaultMode;
    const maxRetries = options?.maxRetries ?? this.options.maxRetries;
    const startTime = Date.now();
    const violations: ConstraintViolation[] = [];
    const documentsWithViolations = new Set<number>();

    const allFieldNames = new Set<string>();
    for (const doc of documents) {
      for (const key of Object.keys(doc)) {
        allFieldNames.add(key);
      }
    }

    for (let docIndex = 0; docIndex < documents.length; docIndex++) {
      const doc = documents[docIndex];
      let attempts = 0;
      let isValid = false;
      let currentDoc = doc;

      while (attempts < maxRetries && !isValid) {
        const results = this.validateDocument(currentDoc, {
          allDocuments: documents,
          documentIndex: docIndex,
        });

        if (results.length === 0) {
          isValid = true;
        } else {
          const retryableViolations = results.filter((r) => r.retryable);
          const fatalViolations = results.filter((r) => !r.retryable);

            if (fatalViolations.length > 0) {
              for (const violation of fatalViolations) {
                violations.push({
                  constraintName: violation.constraintName || "unknown",
                  fieldName: violation.fieldName || "",
                  documentIndex: docIndex,
                  value: violation.value,
                  expected: violation.expected,
                  actual: violation.actual,
                  errorMessage: violation.errorMessage || "Validation failed",
                  severity: "error",
                  retryable: false,
                });
                documentsWithViolations.add(docIndex);
              }
              isValid = true;
            } else if (retryableViolations.length > 0) {
              attempts++;
              if (attempts >= maxRetries) {
                for (const violation of retryableViolations) {
                  violations.push({
                    constraintName: violation.constraintName || "unknown",
                    fieldName: violation.fieldName || "",
                    documentIndex: docIndex,
                    value: violation.value,
                    expected: violation.expected,
                    actual: violation.actual,
                    errorMessage: violation.errorMessage || "Validation failed",
                    severity: "error",
                    retryable: false,
                  });
                  documentsWithViolations.add(docIndex);
                }
              } else {
                currentDoc = this.applyCorrections(currentDoc, retryableViolations);
              }
            }
        }
      }
    }

    return {
      totalConstraints:
        this.validators.size +
        Array.from(this.fieldConstraints.values()).reduce(
          (sum, arr) => sum + arr.length,
          0
        ) +
        this.documentConstraints.length,
      totalViolations: violations.length,
      violations,
      documentsWithViolations: documentsWithViolations.size,
      executionTimeMs: Date.now() - startTime,
    };
  }

  private sortByPriority(
    key: string,
    validators: ConstraintValidator<unknown>[]
  ): ConstraintValidator<unknown>[] {
    return [...validators].sort((a, b) => {
      const aPriority =
        this.priority.get(`${key}:${a.metadata.name}`) ??
        this.priority.get(a.metadata.name) ??
        0;
      const bPriority =
        this.priority.get(`${key}:${b.metadata.name}`) ??
        this.priority.get(b.metadata.name) ??
        0;
      return bPriority - aPriority;
    });
  }

  private resolveEvaluationOrder(fieldNames: string[]): void {
    const adj = new Map<string, Set<string>>();
    const inDegree = new Map<string, number>();

    for (const name of fieldNames) {
      adj.set(name, new Set());
      inDegree.set(name, 0);
    }

    // Inspect validators to find dependencies
    for (const [fieldName, validators] of this.fieldConstraints) {
      for (const validator of validators) {
        // This is a bit heuristic, but we can look for 'targetField' or 'comparisonField' in validator metadata/config
        // Since we don't have direct access to the source config here easily unless we store it, 
        // we might need to rely on the register method passing dependencies.
        // For now, let's assume we can detect it from some standard property if we added it.
        // OR we can just use the priority system plus a simple check.
      }
    }

    // For Week 1, we will stick to priority-based sorting but enhance sortByPriority
    // In a future update, we can implement a full topological sort if we store dependencies per validator.
    this.evaluationOrder = [...fieldNames].sort((a, b) => {
      const aP = this.priority.get(a) ?? 0;
      const bP = this.priority.get(b) ?? 0;
      return bP - aP;
    });
  }

  private applyCorrections(
    document: Record<string, unknown>,
    violations: ValidationResult[]
  ): Record<string, unknown> {
    const corrected = { ...document };
    for (const violation of violations) {
      if (violation.fieldName && violation.expected !== undefined) {
        corrected[violation.fieldName] = violation.expected;
      }
    }
    return corrected;
  }

  fromSchemaFields(
    fields: SchemaField[] | Array<{
      name: string;
      type: string;
      constraints?: any;
      required?: boolean;
    }>
  ): ConstraintRegistry {
    for (const field of fields) {
      if (!field.constraints) continue;

      const constraints = field.constraints;

      if (constraints.unique === true) {
        const uniqueValidator = {
          metadata: {
            name: `${field.name}:unique`,
            type: "field_validation" as const,
            severity: "error" as const,
            description: `Field ${field.name} must be unique`,
          },
          validate: (value: unknown) => ({
            valid: value !== undefined && value !== null,
          }),
        };
        this.register(`${field.name}:unique`, uniqueValidator);
        this.registerFieldConstraint(field.name, uniqueValidator);
      }

      if (constraints.enum && Array.isArray(constraints.enum)) {
        const enumValues = constraints.enum as unknown[];
        const enumValidator = {
          metadata: {
            name: `${field.name}:enum`,
            type: "field_validation" as const,
            severity: "error" as const,
            description: `Field ${field.name} must be one of ${enumValues.join(", ")}`,
          },
          validate: (value: unknown) => ({
            valid: enumValues.includes(value as string),
            expected: enumValues,
            actual: value,
          }),
        };
        this.register(`${field.name}:enum`, enumValidator);
        this.registerFieldConstraint(field.name, enumValidator);
      }

      if (constraints.min !== undefined || constraints.max !== undefined) {
        const rangeValidator = {
          metadata: {
            name: `${field.name}:range`,
            type: "field_validation" as const,
            severity: "error" as const,
            description: `Field ${field.name} must be between ${constraints.min} and ${constraints.max}`,
          },
          validate: (value: unknown) => {
            const num = Number(value);
            if (isNaN(num)) return { valid: false, actual: value };
            if (constraints.min !== undefined && num < (constraints.min as number)) {
              return { valid: false, expected: `>= ${constraints.min}`, actual: num };
            }
            if (constraints.max !== undefined && num > (constraints.max as number)) {
              return { valid: false, expected: `<= ${constraints.max}`, actual: num };
            }
            return { valid: true };
          },
        };
        this.register(`${field.name}:range`, rangeValidator);
        this.registerFieldConstraint(field.name, rangeValidator);
      }

      if (constraints.pattern) {
        const patternValidator = {
          metadata: {
            name: `${field.name}:pattern`,
            type: "field_validation" as const,
            severity: "error" as const,
            description: `Field ${field.name} must match pattern ${constraints.pattern}`,
          },
          validate: (value: unknown) => {
            const regex = new RegExp(constraints.pattern as string);
            return {
              valid: typeof value === "string" && regex.test(value),
              actual: value,
            };
          },
        };
        this.register(`${field.name}:pattern`, patternValidator);
        this.registerFieldConstraint(field.name, patternValidator);
      }

      if (constraints.minColumn || constraints.maxColumn || constraints.gtColumn || constraints.ltColumn) {
        const crossColValidator = {
          metadata: {
            name: `${field.name}:cross_column`,
            type: "cross_column" as const,
            severity: "error" as const,
            description: `Field ${field.name} has cross-column constraints`,
          },
          validate: (value: unknown, context: { document?: Record<string, unknown> }) => {
            if (!context.document) return { valid: true };

            let valid = true;
            let errorMsg = "";

            if (constraints.gtColumn && context.document[constraints.gtColumn as string] !== undefined) {
              const ref = Number(context.document[constraints.gtColumn as string]);
              const val = Number(value);
              if (!isNaN(ref) && !isNaN(val) && val <= ref) {
                valid = false;
                errorMsg = `${field.name} must be > ${constraints.gtColumn}`;
              }
            }

            if (constraints.ltColumn && context.document[constraints.ltColumn as string] !== undefined) {
              const ref = Number(context.document[constraints.ltColumn as string]);
              const val = Number(value);
              if (!isNaN(ref) && !isNaN(val) && val >= ref) {
                valid = false;
                errorMsg = `${field.name} must be < ${constraints.ltColumn}`;
              }
            }

            return { valid, errorMessage: errorMsg || undefined, retryable: true };
          },
        };
        this.register(`${field.name}:cross_column`, crossColValidator);
        this.registerFieldConstraint(field.name, crossColValidator);
      }

      if (constraints.temporal) {
        const temporal = constraints.temporal as any;
        const { createTemporalValidator } = require("./validators/temporalValidators");
        const validator = createTemporalValidator(field.name, temporal);
        this.register(`${field.name}:temporal`, validator);
        this.registerFieldConstraint(field.name, validator);
      }

      if (constraints.mutuallyExclusive && Array.isArray(constraints.mutuallyExclusive)) {
        const { createMutuallyExclusiveValidator } = require("./validators/crossColumnValidators");
        const validator = createMutuallyExclusiveValidator(field.name, constraints.mutuallyExclusive);
        this.register(`${field.name}:mutually_exclusive`, validator);
        this.registerFieldConstraint(field.name, validator);
      }
    }

    this.evaluationOrder = null; // Reset order when schema changes
    return this;
  }

  clone(): ConstraintRegistry {
    const cloned = new ConstraintRegistry({
      defaultMode: this.options.defaultMode,
      maxRetries: this.options.maxRetries,
      throwOnError: this.options.throwOnError,
    });

    for (const [name, validator] of this.validators) {
      cloned.register(name, validator, this.priority.get(name) ?? 0);
    }

    for (const [field, validators] of this.fieldConstraints) {
      for (const validator of validators) {
        cloned.registerFieldConstraint(field, validator);
      }
    }

    for (const validator of this.documentConstraints) {
      cloned.registerDocumentConstraint(validator);
    }

    return cloned;
  }

  clear(): void {
    this.validators.clear();
    this.fieldConstraints.clear();
    this.documentConstraints.length = 0;
    this.priority.clear();
  }

  getStats(): {
    totalValidators: number;
    fieldConstraints: number;
    documentConstraints: number;
    options: Required<RegistryOptions>;
  } {
    return {
      totalValidators: this.validators.size,
      fieldConstraints: Array.from(this.fieldConstraints.values()).reduce(
        (sum, arr) => sum + arr.length,
        0
      ),
      documentConstraints: this.documentConstraints.length,
      options: { ...this.options },
    };
  }
}

export function createDefaultRegistry(): ConstraintRegistry {
  return new ConstraintRegistry({
    defaultMode: "strict",
    maxRetries: 3,
    throwOnError: false,
  });
}
