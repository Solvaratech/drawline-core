import { z } from "zod";
import { SchemaCollection, SchemaRelationship, FieldType } from "../../types/schemaDesign";
import { parseSchemaInput } from "./generateData";

// ── Input schema ──────────────────────────────────────────────────────────────

export const ValidateSchemaInput = {
  schema: z
    .union([z.string(), z.array(z.any()), z.record(z.string(), z.any())])
    .describe("Schema to validate — same formats as generate_data"),
  relationships: z
    .array(z.any())
    .optional()
    .describe("Relationship definitions to include in validation"),
  strict: z
    .boolean()
    .optional()
    .default(false)
    .describe("Enable strict mode: warn on missing timestamps, nullable PKs, etc."),
};

// ── Validation rules ──────────────────────────────────────────────────────────

interface Issue {
  severity: "error" | "warning" | "info";
  collection?: string;
  field?: string;
  code: string;
  message: string;
}

const VALID_TYPES = new Set<FieldType>([
  "string","integer","number","boolean","date","object","array","reference",
  "null","undefined","objectid","binary","timestamp","long","decimal","float",
  "regex","symbol","map","set","uuid","json","geopoint","bytes","timestamptz",
]);

function validateCollections(
  collections: SchemaCollection[],
  strict: boolean
): Issue[] {
  const issues: Issue[] = [];
  const collectionIds = new Set(collections.map(c => c.id));
  const collectionNames = new Set(collections.map(c => c.name));

  for (const col of collections) {
    const fieldNames = new Set<string>();
    let pkCount = 0;

    // Empty collection
    if (!col.fields || col.fields.length === 0) {
      issues.push({
        severity: "error",
        collection: col.name,
        code: "NO_FIELDS",
        message: `Collection "${col.name}" has no fields`,
      });
      continue;
    }

    // Missing name
    if (!col.name || col.name.trim() === "") {
      issues.push({
        severity: "error",
        code: "MISSING_COLLECTION_NAME",
        message: "A collection is missing its name",
      });
    }

    // Name with spaces
    if (/\s/.test(col.name)) {
      issues.push({
        severity: "warning",
        collection: col.name,
        code: "COLLECTION_NAME_HAS_SPACES",
        message: `Collection name "${col.name}" contains spaces — use snake_case or camelCase`,
      });
    }

    for (const field of col.fields) {
      // Duplicate field names
      if (fieldNames.has(field.name)) {
        issues.push({
          severity: "error",
          collection: col.name,
          field: field.name,
          code: "DUPLICATE_FIELD_NAME",
          message: `Duplicate field name "${field.name}" in collection "${col.name}"`,
        });
      }
      fieldNames.add(field.name);

      // Missing field name
      if (!field.name || field.name.trim() === "") {
        issues.push({
          severity: "error",
          collection: col.name,
          code: "MISSING_FIELD_NAME",
          message: `A field in collection "${col.name}" is missing its name`,
        });
        continue;
      }

      // Invalid type
      if (!VALID_TYPES.has(field.type)) {
        issues.push({
          severity: "error",
          collection: col.name,
          field: field.name,
          code: "INVALID_FIELD_TYPE",
          message: `Field "${field.name}" has unknown type "${field.type}"`,
        });
      }

      // Primary key tracking
      if (field.isPrimaryKey) pkCount++;

      // FK references unknown collection
      if (field.isForeignKey && field.referencedCollectionId) {
        const refExists =
          collectionIds.has(field.referencedCollectionId) ||
          collectionNames.has(field.referencedCollectionId);
        if (!refExists) {
          issues.push({
            severity: "error",
            collection: col.name,
            field: field.name,
            code: "UNRESOLVED_FK_REFERENCE",
            message:
              `FK field "${field.name}" references unknown collection ` +
              `"${field.referencedCollectionId}"`,
          });
        }
      }

      // Enum on non-string
      if (
        field.constraints?.enum &&
        field.constraints.enum.length > 0 &&
        field.type !== "string"
      ) {
        issues.push({
          severity: "warning",
          collection: col.name,
          field: field.name,
          code: "ENUM_ON_NON_STRING",
          message: `Field "${field.name}" has enum values but type is "${field.type}", not "string"`,
        });
      }

      // Min/max constraints on string
      if (field.type === "string" && field.constraints?.min !== undefined) {
        issues.push({
          severity: "info",
          collection: col.name,
          field: field.name,
          code: "MIN_ON_STRING",
          message: `Use minLength instead of min for string field "${field.name}"`,
        });
      }

      // Array without arrayItemType
      if (field.type === "array" && !field.arrayItemType) {
        issues.push({
          severity: "warning",
          collection: col.name,
          field: field.name,
          code: "ARRAY_MISSING_ITEM_TYPE",
          message: `Array field "${field.name}" has no arrayItemType — defaulting to string`,
        });
      }

      // Object without objectFields
      if (field.type === "object" && (!field.objectFields || field.objectFields.length === 0)) {
        issues.push({
          severity: "warning",
          collection: col.name,
          field: field.name,
          code: "OBJECT_MISSING_FIELDS",
          message: `Object field "${field.name}" has no objectFields schema — will generate a generic shape`,
        });
      }

      // Strict mode extras
      if (strict) {
        // Field names with spaces
        if (/\s/.test(field.name)) {
          issues.push({
            severity: "warning",
            collection: col.name,
            field: field.name,
            code: "FIELD_NAME_HAS_SPACES",
            message: `Field "${field.name}" contains spaces`,
          });
        }

        // Required field with a null default
        if (field.required && field.defaultValue === null) {
          issues.push({
            severity: "warning",
            collection: col.name,
            field: field.name,
            code: "REQUIRED_FIELD_NULL_DEFAULT",
            message: `Required field "${field.name}" has a null default value`,
          });
        }
      }
    }

    // No primary key
    if (pkCount === 0) {
      issues.push({
        severity: "error",
        collection: col.name,
        code: "NO_PRIMARY_KEY",
        message: `Collection "${col.name}" has no primary key`,
      });
    }

    // Multiple primary keys (warn only if more than 2 — composites are valid)
    if (pkCount > 2) {
      issues.push({
        severity: "warning",
        collection: col.name,
        code: "MANY_PRIMARY_KEYS",
        message: `Collection "${col.name}" has ${pkCount} primary key fields — ensure this is intentional`,
      });
    }

    // Strict: missing timestamp fields
    if (strict) {
      const hasCreatedAt = col.fields.some(f =>
        ["created_at", "createdat", "createdAt"].includes(f.name)
      );
      const hasUpdatedAt = col.fields.some(f =>
        ["updated_at", "updatedat", "updatedAt"].includes(f.name)
      );

      if (!hasCreatedAt) {
        issues.push({
          severity: "info",
          collection: col.name,
          code: "MISSING_CREATED_AT",
          message: `Collection "${col.name}" has no created_at timestamp field`,
        });
      }
      if (!hasUpdatedAt) {
        issues.push({
          severity: "info",
          collection: col.name,
          code: "MISSING_UPDATED_AT",
          message: `Collection "${col.name}" has no updated_at timestamp field`,
        });
      }
    }
  }

  return issues;
}

function validateRelationships(
  rels: SchemaRelationship[],
  collections: SchemaCollection[]
): Issue[] {
  const issues: Issue[] = [];
  const collectionIds = new Set(collections.map(c => c.id));
  const seenRelIds = new Set<string>();

  for (const rel of rels) {
    // Duplicate relationship IDs
    if (seenRelIds.has(rel.id)) {
      issues.push({
        severity: "error",
        code: "DUPLICATE_RELATIONSHIP_ID",
        message: `Relationship ID "${rel.id}" is duplicated`,
      });
    }
    seenRelIds.add(rel.id);

    // Unknown collections
    if (!collectionIds.has(rel.fromCollectionId)) {
      issues.push({
        severity: "error",
        code: "RELATIONSHIP_UNKNOWN_FROM",
        message: `Relationship references unknown fromCollectionId "${rel.fromCollectionId}"`,
      });
    }
    if (!collectionIds.has(rel.toCollectionId)) {
      issues.push({
        severity: "error",
        code: "RELATIONSHIP_UNKNOWN_TO",
        message: `Relationship references unknown toCollectionId "${rel.toCollectionId}"`,
      });
    }

    // Self-referential (allowed, just note it)
    if (rel.fromCollectionId === rel.toCollectionId) {
      issues.push({
        severity: "info",
        code: "SELF_REFERENTIAL_RELATIONSHIP",
        message: `Relationship "${rel.id}" is self-referential on "${rel.fromCollectionId}"`,
      });
    }
  }

  return issues;
}

// ── Main handler ──────────────────────────────────────────────────────────────

export function handleValidateSchema(args: {
  schema: string | unknown[] | Record<string, unknown>;
  relationships?: unknown[];
  strict?: boolean;
}): string {
  let collections: SchemaCollection[];
  try {
    collections = parseSchemaInput(args.schema);
  } catch (err) {
    return JSON.stringify({
      valid: false,
      issues: [{
        severity: "error",
        code: "SCHEMA_PARSE_ERROR",
        message: `Failed to parse schema: ${err instanceof Error ? err.message : String(err)}`,
      }],
    }, null, 2);
  }

  const collectionIssues = validateCollections(collections, args.strict ?? false);

  let relationshipIssues: Issue[] = [];
  if (args.relationships && args.relationships.length > 0) {
    relationshipIssues = validateRelationships(
      args.relationships as SchemaRelationship[],
      collections
    );
  }

  const allIssues = [...collectionIssues, ...relationshipIssues];
  const errors = allIssues.filter(i => i.severity === "error");
  const warnings = allIssues.filter(i => i.severity === "warning");
  const infos = allIssues.filter(i => i.severity === "info");

  const valid = errors.length === 0;

  return JSON.stringify({
    valid,
    summary: {
      collections: collections.length,
      totalFields: collections.reduce((s, c) => s + c.fields.length, 0),
      errors: errors.length,
      warnings: warnings.length,
      info: infos.length,
    },
    issues: allIssues,
  }, null, 2);
}
