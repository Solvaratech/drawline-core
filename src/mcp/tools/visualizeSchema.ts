import { z } from "zod";
import { SchemaCollection, SchemaRelationship } from "../../types/schemaDesign";
import { parseSchemaInput } from "./generateData";

// ── Input schema ──────────────────────────────────────────────────────────────

export const VisualizeSchemaInput = {
  schema: z
    .union([z.string(), z.array(z.any()), z.record(z.string(), z.any())])
    .describe("Schema to visualize — same flexible format as generate_data"),
  relationships: z
    .array(z.any())
    .optional()
    .default([])
    .describe("Relationship definitions for drawing FK arrows"),
  title: z
    .string()
    .optional()
    .describe("Optional diagram title"),
};

// ── Mermaid type mapping ──────────────────────────────────────────────────────

function toMermaidType(type: string): string {
  switch (type) {
    case "uuid":        return "UUID";
    case "objectid":    return "ObjectId";
    case "string":      return "VARCHAR";
    case "integer":     return "INT";
    case "long":        return "BIGINT";
    case "number":
    case "float":
    case "decimal":     return "DECIMAL";
    case "boolean":     return "BOOLEAN";
    case "date":        return "DATE";
    case "timestamp":
    case "timestamptz": return "TIMESTAMP";
    case "json":
    case "object":      return "JSONB";
    case "array":       return "ARRAY";
    case "geopoint":    return "POINT";
    default:            return type.toUpperCase();
  }
}

// ── Relationship arrow notation ───────────────────────────────────────────────

function toMermaidRelation(type: string): string {
  switch (type) {
    case "one-to-one":   return "||--||";
    case "one-to-many":  return "||--o{";
    case "many-to-one":  return "}o--||";
    case "many-to-many": return "}o--o{";
    default:             return "||--o{";
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────

export function handleVisualizeSchema(args: {
  schema: string | unknown[] | Record<string, unknown>;
  relationships?: unknown[];
  title?: string;
}): string {
  let collections: SchemaCollection[];
  try {
    collections = parseSchemaInput(args.schema);
  } catch (err) {
    throw new Error(`Schema parse error: ${err instanceof Error ? err.message : String(err)}`);
  }

  const relationships = (args.relationships ?? []) as SchemaRelationship[];

  // ── Build erDiagram ───────────────────────────────────────────────────────
  const lines: string[] = ["erDiagram"];

  for (const col of collections) {
    // Sanitise name: Mermaid entity names can't have hyphens
    const entity = col.name.toUpperCase().replace(/[^A-Z0-9_]/g, "_");
    lines.push(`  ${entity} {`);

    for (const field of col.fields) {
      const mType  = toMermaidType(field.type);
      const name   = field.name;
      const pk     = field.isPrimaryKey ? " PK" : "";
      const fk     = field.isForeignKey ? " FK" : "";
      const marker = pk || fk;

      // Mermaid ER field: type name "comment?"
      const enumHint = field.constraints?.enum
        ? ` "${field.constraints.enum.slice(0, 3).join("|")}${field.constraints.enum.length > 3 ? "…" : ""}"`
        : "";

      lines.push(`    ${mType} ${name}${marker}${enumHint}`);
    }

    lines.push("  }");
  }

  // ── Explicit relationships ────────────────────────────────────────────────
  const drawn = new Set<string>();

  for (const rel of relationships) {
    const from = (rel.fromCollectionId as string)?.toUpperCase().replace(/[^A-Z0-9_]/g, "_");
    const to   = (rel.toCollectionId   as string)?.toUpperCase().replace(/[^A-Z0-9_]/g, "_");
    if (!from || !to) continue;
    const key = `${from}-${to}`;
    if (drawn.has(key)) continue;
    drawn.add(key);
    const arrow = toMermaidRelation(rel.type);
    const label = (rel.fromField as string) ?? "references";
    lines.push(`  ${from} ${arrow} ${to} : "${label}"`);
  }

  // ── FK-inferred relationships (fallback when no explicit rels) ────────────
  if (relationships.length === 0) {
    const colNames = new Set(collections.map(c => c.name));
    for (const col of collections) {
      for (const field of col.fields) {
        if (!field.isForeignKey || !field.referencedCollectionId) continue;
        const refName = field.referencedCollectionId;
        if (!colNames.has(refName)) continue;
        const from = col.name.toUpperCase().replace(/[^A-Z0-9_]/g, "_");
        const to   = refName.toUpperCase().replace(/[^A-Z0-9_]/g, "_");
        const key  = `${from}-${to}`;
        if (drawn.has(key)) continue;
        drawn.add(key);
        lines.push(`  ${from} }o--|| ${to} : "${field.name}"`);
      }
    }
  }

  const diagram = lines.join("\n");

  const titleLine = args.title ? `## ${args.title}\n\n` : "";
  const stats = `${collections.length} table${collections.length !== 1 ? "s" : ""}, ${collections.reduce((s, c) => s + c.fields.length, 0)} fields`;

  return `${titleLine}\`\`\`mermaid\n${diagram}\n\`\`\`\n\n*${stats}*`;
}
