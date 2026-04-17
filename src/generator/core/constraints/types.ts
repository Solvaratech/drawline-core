export type ConstraintSeverity = "error" | "warning" | "info";

export type ConstraintType =
  | "field_validation"
  | "cross_column"
  | "cross_table"
  | "temporal"
  | "conditional"
  | "aggregation";

export type ConstraintMode = "strict" | "warn" | "retry" | "skip";

export interface ConstraintMetadata {
  name: string;
  type: ConstraintType;
  description?: string;
  severity: ConstraintSeverity;
  errorMessage?: string;
}

export interface ConstraintContext {
  document: Record<string, unknown>;
  allDocuments?: Record<string, unknown>[];
  collectionName?: string;
  documentIndex?: number;
  random: () => number;
}

export interface ValidationResult {
  valid: boolean;
  constraintName?: string;
  fieldName?: string;
  value?: unknown;
  expected?: unknown;
  actual?: unknown;
  errorMessage?: string;
  retryable?: boolean;
}

export interface ConstraintValidator<T = unknown> {
  readonly metadata: ConstraintMetadata;
  validate(value: T, context: ConstraintContext): ValidationResult;
}

export interface FieldValidationConstraint extends ConstraintMetadata {
  type: "field_validation";
  apply: (value: unknown) => unknown;
  validate?: (value: unknown) => ValidationResult;
}

export interface CrossColumnConstraint extends ConstraintMetadata {
  type: "cross_column";
  sourceField: string;
  targetField: string;
  operator: "eq" | "ne" | "gt" | "gte" | "lt" | "lte" | "sum_of" | "ratio_of" | "percentage_of";
  value?: number | string;
  formula?: string;
}

export interface CrossTableConstraint extends ConstraintMetadata {
  type: "cross_table";
  targetCollection: string;
  relationshipField: string;
  aggregationType: "count" | "sum" | "avg" | "min" | "max";
  targetField: string;
  condition?: Record<string, unknown>;
}

export interface TemporalConstraint extends ConstraintMetadata {
  type: "temporal";
  field: string;
  comparisonField?: string;
  operator: "before" | "after" | "within_days" | "older_than";
  days?: number;
  referenceDate?: Date | string;
}

export interface ConditionalConstraint extends ConstraintMetadata {
  type: "conditional";
  condition: {
    field: string;
    operator: "eq" | "ne" | "gt" | "gte" | "lt" | "lte" | "exists" | "not_exists";
    value?: unknown;
  };
  thenConstraint: ConstraintDefinition;
  elseConstraint?: ConstraintDefinition;
}

export interface AggregationConstraint extends ConstraintMetadata {
  type: "aggregation";
  aggregationType: "sum" | "avg" | "min" | "max" | "count" | "stddev";
  field: string;
  groupByField?: string;
  having?: {
    operator: "eq" | "gt" | "gte" | "lt" | "lte" | "ne";
    value: number;
  };
}

export type ConstraintDefinition =
  | FieldValidationConstraint
  | CrossColumnConstraint
  | CrossTableConstraint
  | TemporalConstraint
  | ConditionalConstraint
  | AggregationConstraint;

export interface ConstraintViolation {
  constraintName: string;
  fieldName: string;
  documentId?: string | number;
  documentIndex?: number;
  value: unknown;
  expected?: unknown;
  actual?: unknown;
  errorMessage: string;
  severity: ConstraintSeverity;
  retryable: boolean;
}

export interface ConstraintReport {
  totalConstraints: number;
  totalViolations: number;
  violations: ConstraintViolation[];
  documentsWithViolations: number;
  executionTimeMs: number;
}
