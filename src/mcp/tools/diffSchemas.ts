import { z } from "zod";
import { SchemaCollection, SchemaField } from "../../types/schemaDesign";
import { parseSchemaInput } from "./generateData";

// ── Input schema ──────────────────────────────────────────────────────────────

export const DiffSchemasInput = {
  before: z
    .union([z.string(), z.array(z.any()), z.record(z.string(), z.any())])
    .describe("The original schema — same flexible format as generate_data"),
  after: z
    .union([z.string(), z.array(z.any()), z.record(z.string(), z.any())])
    .describe("The updated schema to compare against"),
  output_format: z
    .enum(["summary", "detailed", "ddl"])
    .optional()
    .default("detailed")
    .describe(
      "summary = one-liner per change; " +
      "detailed = full field-level diff; " +
      "ddl = PostgreSQL ALTER TABLE statements"
    ),
};

// ── Diff types ────────────────────────────────────────────────────────────────

type FieldChange =
  | { kind: "added";   field: SchemaField }
  | { kind: "removed"; field: SchemaField }
  | { kind: "modified"; before: SchemaField; after: SchemaField; changedProps: string[] };

type CollectionChange =
  | { kind: "added";   collection: SchemaCollection }
  | { kind: "removed"; collection: SchemaCollection }
  | { kind: "modified"; name: string; fieldChanges: FieldChange[] };

// ── Field comparison ──────────────────────────────────────────────────────────

function changedProps(a: SchemaField, b: SchemaField): string[] {
  const props: Array<keyof SchemaField> = [
    "type", "required", "isPrimaryKey", "isForeignKey",
    "referencedCollectionId", "foreignKeyTarget",
    "arrayItemType", "defaultValue", "nullable",
  ];
  return props.filter(p => JSON.stringify(a[p]) !== JSON.stringify(b[p]));
}

function diffFields(
  beforeFields: SchemaField[],
  afterFields: SchemaField[]
): FieldChange[] {
  const changes: FieldChange[] = [];

  const beforeMap = new Map(beforeFields.map(f => [f.name, f]));
  const afterMap  = new Map(afterFields.map(f => [f.name, f]));

  for (const [name, bf] of beforeMap) {
    const af = afterMap.get(name);
    if (!af) {
      changes.push({ kind: "removed", field: bf });
    } else {
      const diffs = changedProps(bf, af);
      if (diffs.length > 0) {
        changes.push({ kind: "modified", before: bf, after: af, changedProps: diffs });
      }
    }
  }

  for (const [name, af] of afterMap) {
    if (!beforeMap.has(name)) {
      changes.push({ kind: "added", field: af });
    }
  }

  return changes;
}

// ── DDL generation ────────────────────────────────────────────────────────────

function fieldTypeToPostgres(type: string, maxLength?: number): string {
  switch (type) {
    case "string":   return maxLength ? `VARCHAR(${maxLength})` : "TEXT";
    case "integer":  return "INTEGER";
    case "long":     return "BIGINT";
    case "number":
    case "float":
    case "decimal":  return "NUMERIC";
    case "boolean":  return "BOOLEAN";
    case "date":     return "DATE";
    case "timestamp":
    case "timestamptz": return "TIMESTAMPTZ";
    case "uuid":     return "UUID";
    case "json":
    case "object":   return "JSONB";
    default:         return "TEXT";
  }
}

function fieldToColumnDDL(f: SchemaField): string {
  const typeSql = fieldTypeToPostgres(f.type, f.constraints?.maxLength);
  const notNull = f.required ? " NOT NULL" : "";
  const dflt = f.defaultValue !== undefined && f.defaultValue !== null
    ? ` DEFAULT '${f.defaultValue}'`
    : "";
  return `"${f.name}" ${typeSql}${notNull}${dflt}`;
}

function generateDDL(changes: CollectionChange[]): string {
  const stmts: string[] = [];

  for (const change of changes) {
    if (change.kind === "added") {
      const cols = change.collection.fields.map(f => `  ${fieldToColumnDDL(f)}`).join(",\n");
      stmts.push(`CREATE TABLE "${change.collection.name}" (\n${cols}\n);`);
    } else if (change.kind === "removed") {
      stmts.push(`DROP TABLE IF EXISTS "${change.collection.name}";`);
    } else {
      for (const fc of change.fieldChanges) {
        if (fc.kind === "added") {
          stmts.push(
            `ALTER TABLE "${change.name}" ADD COLUMN ${fieldToColumnDDL(fc.field)};`
          );
        } else if (fc.kind === "removed") {
          stmts.push(
            `ALTER TABLE "${change.name}" DROP COLUMN IF EXISTS "${fc.field.name}";`
          );
        } else {
          // Modified: generate SET DATA TYPE / SET NOT NULL / DROP NOT NULL / etc.
          for (const prop of fc.changedProps) {
            if (prop === "type") {
              const newType = fieldTypeToPostgres(fc.after.type, fc.after.constraints?.maxLength);
              stmts.push(
                `ALTER TABLE "${change.name}" ALTER COLUMN "${fc.after.name}" SET DATA TYPE ${newType} USING "${fc.after.name}"::${newType};`
              );
            } else if (prop === "required") {
              stmts.push(
                fc.after.required
                  ? `ALTER TABLE "${change.name}" ALTER COLUMN "${fc.after.name}" SET NOT NULL;`
                  : `ALTER TABLE "${change.name}" ALTER COLUMN "${fc.after.name}" DROP NOT NULL;`
              );
            } else if (prop === "defaultValue") {
              stmts.push(
                fc.after.defaultValue !== undefined && fc.after.defaultValue !== null
                  ? `ALTER TABLE "${change.name}" ALTER COLUMN "${fc.after.name}" SET DEFAULT '${fc.after.defaultValue}';`
                  : `ALTER TABLE "${change.name}" ALTER COLUMN "${fc.after.name}" DROP DEFAULT;`
              );
            }
          }
        }
      }
    }
  }

  return stmts.length > 0 ? stmts.join("\n\n") : "-- No changes detected";
}

// ── Main handler ──────────────────────────────────────────────────────────────

export function handleDiffSchemas(args: {
  before: string | unknown[] | Record<string, unknown>;
  after: string | unknown[] | Record<string, unknown>;
  output_format?: "summary" | "detailed" | "ddl";
}): string {
  const format = args.output_format ?? "detailed";

  let beforeCols: SchemaCollection[];
  let afterCols: SchemaCollection[];

  try { beforeCols = parseSchemaInput(args.before); }
  catch (e) { throw new Error(`"before" parse error: ${e instanceof Error ? e.message : e}`); }

  try { afterCols = parseSchemaInput(args.after); }
  catch (e) { throw new Error(`"after" parse error: ${e instanceof Error ? e.message : e}`); }

  const beforeMap = new Map(beforeCols.map(c => [c.name, c]));
  const afterMap  = new Map(afterCols.map(c => [c.name, c]));

  const changes: CollectionChange[] = [];

  for (const [name, bc] of beforeMap) {
    const ac = afterMap.get(name);
    if (!ac) {
      changes.push({ kind: "removed", collection: bc });
    } else {
      const fieldChanges = diffFields(bc.fields, ac.fields);
      if (fieldChanges.length > 0) {
        changes.push({ kind: "modified", name, fieldChanges });
      }
    }
  }

  for (const [name, ac] of afterMap) {
    if (!beforeMap.has(name)) {
      changes.push({ kind: "added", collection: ac });
    }
  }

  const totalChanges = changes.reduce((s, c) => {
    if (c.kind === "added" || c.kind === "removed") return s + 1;
    return s + c.fieldChanges.length;
  }, 0);

  if (format === "ddl") {
    const ddl = generateDDL(changes);
    return `-- Drawline schema diff DDL (${totalChanges} change${totalChanges !== 1 ? "s" : ""})\n\n${ddl}`;
  }

  if (format === "summary") {
    if (changes.length === 0) return "No changes detected between the two schemas.";
    const lines: string[] = [`${totalChanges} change(s) detected:\n`];
    for (const c of changes) {
      if (c.kind === "added")   lines.push(`  + collection "${c.collection.name}" added`);
      if (c.kind === "removed") lines.push(`  - collection "${c.collection.name}" removed`);
      if (c.kind === "modified") {
        for (const fc of c.fieldChanges) {
          if (fc.kind === "added")    lines.push(`  + ${c.name}.${fc.field.name} (added)`);
          if (fc.kind === "removed")  lines.push(`  - ${c.name}.${fc.field.name} (removed)`);
          if (fc.kind === "modified") lines.push(`  ~ ${c.name}.${fc.before.name} (${fc.changedProps.join(", ")} changed)`);
        }
      }
    }
    return lines.join("\n");
  }

  // detailed (default)
  if (changes.length === 0) {
    return JSON.stringify({ changes: [], totalChanges: 0, message: "Schemas are identical" }, null, 2);
  }

  const output = changes.map(c => {
    if (c.kind === "added") {
      return {
        kind: "collection_added",
        collection: c.collection.name,
        fieldCount: c.collection.fields.length,
        fields: c.collection.fields.map(f => f.name),
      };
    }
    if (c.kind === "removed") {
      return {
        kind: "collection_removed",
        collection: c.collection.name,
      };
    }
    return {
      kind: "collection_modified",
      collection: c.name,
      fieldChanges: c.fieldChanges.map(fc => {
        if (fc.kind === "added")   return { kind: "field_added",   field: fc.field.name, type: fc.field.type };
        if (fc.kind === "removed") return { kind: "field_removed", field: fc.field.name };
        return {
          kind: "field_modified",
          field: fc.before.name,
          changes: fc.changedProps.map(p => ({
            property: p,
            before: (fc.before as any)[p],
            after: (fc.after as any)[p],
          })),
        };
      }),
    };
  });

  return JSON.stringify({ totalChanges, changes: output }, null, 2);
}
