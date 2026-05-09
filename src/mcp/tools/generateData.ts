import { z } from "zod";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { InMemoryAdapter } from "../../generator/adapters/InMemoryAdapter";
import { TestDataGeneratorService } from "../../generator/index";
import { SchemaCollection, SchemaField, FieldType } from "../../types/schemaDesign";
import { convertSchemaToFields } from "../../utils/schemaConverter";

// ── Input schema ──────────────────────────────────────────────────────────────

export const GenerateDataInput = {
  schema: z
    .union([z.string(), z.array(z.any()), z.record(z.string(), z.any())])
    .describe(
      "Schema definition. Accepts three formats:\n" +
      "1) SchemaCollection[] — canonical drawline format\n" +
      "2) Object map: { collectionName: { fieldName: 'type' | fieldDef } }\n" +
      "3) JSON string of either format above"
    ),
  counts: z
    .record(z.string(), z.number().int().min(1))
    .describe("How many rows to generate per collection. E.g. { users: 100, orders: 500 }"),
  seed: z
    .union([z.number(), z.string()])
    .optional()
    .describe("Deterministic seed — same seed always produces identical data"),
  format: z
    .enum(["json", "csv", "sql_insert"])
    .default("json")
    .describe("Output format for generated rows"),
  download: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      "When true, saves the generated data to ~/Downloads as a .json / .csv / .sql file " +
      "and returns the file:// download path alongside the data preview"
    ),
};

// ── Output helpers ────────────────────────────────────────────────────────────

function toCSV(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(","),
    ...rows.map(row =>
      headers.map(h => {
        const v = row[h];
        if (v === null || v === undefined) return "";
        const s = typeof v === "object" ? JSON.stringify(v) : String(v);
        return s.includes(",") || s.includes('"') || s.includes("\n")
          ? `"${s.replace(/"/g, '""')}"`
          : s;
      }).join(",")
    ),
  ];
  return lines.join("\n");
}

function toSQLInsert(tableName: string, rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return `-- No rows for ${tableName}`;
  const cols = Object.keys(rows[0]);
  const escape = (v: unknown): string => {
    if (v === null || v === undefined) return "NULL";
    if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
    if (typeof v === "number") return String(v);
    if (v instanceof Date) return `'${v.toISOString()}'`;
    if (typeof v === "object") return `'${JSON.stringify(v).replace(/'/g, "''")}'`;
    return `'${String(v).replace(/'/g, "''")}'`;
  };
  const colList = cols.map(c => `"${c}"`).join(", ");
  const values = rows
    .map(row => `  (${cols.map(c => escape(row[c])).join(", ")})`)
    .join(",\n");
  return `INSERT INTO "${tableName}" (${colList}) VALUES\n${values};`;
}

// ── Schema normalisation ──────────────────────────────────────────────────────

const VALID_TYPES = new Set<FieldType>([
  "string","integer","number","boolean","date","object","array","reference",
  "null","undefined","objectid","binary","timestamp","long","decimal","float",
  "regex","symbol","map","set","uuid","json","geopoint","bytes","timestamptz",
]);

function normaliseType(raw: string): FieldType {
  const t = raw.toLowerCase().trim();
  const aliases: Record<string, FieldType> = {
    text: "string", varchar: "string", char: "string",
    int: "integer", bigint: "long", double: "number", real: "float",
    bool: "boolean",
    datetime: "timestamp", timestamptz: "timestamptz", time: "string",
    json: "json", jsonb: "json",
    uuid: "uuid", objectid: "objectid",
  };
  if (VALID_TYPES.has(t as FieldType)) return t as FieldType;
  // Return alias if known; otherwise preserve the raw token so validate_schema
  // can flag it as INVALID_FIELD_TYPE instead of silently coercing to "string".
  return aliases[t] ?? (t as FieldType);
}

/**
 * Parses the flexible `schema` input into canonical SchemaCollection[].
 */
export function parseSchemaInput(
  raw: string | unknown[] | Record<string, unknown>
): SchemaCollection[] {
  // 1. Deserialise JSON string
  let input: unknown = raw;
  if (typeof raw === "string") {
    try { input = JSON.parse(raw); } catch {
      throw new Error("schema must be valid JSON if passed as a string");
    }
  }

  // 2. Already an array — assume SchemaCollection[] or quick-field array
  if (Array.isArray(input)) {
    return (input as any[]).map((col: any, idx) => {
      if (!col.name) throw new Error(`Collection at index ${idx} is missing a 'name' field`);
      const fields: SchemaField[] = Array.isArray(col.fields)
        ? col.fields.map((f: any, fi: number) => ({
            id: f.id ?? `${col.name}-${f.name ?? fi}`,
            name: f.name ?? `field_${fi}`,
            type: normaliseType(f.type ?? "string"),
            required: f.required ?? false,
            isPrimaryKey: f.isPrimaryKey ?? false,
            isForeignKey: f.isForeignKey ?? false,
            referencedCollectionId: f.referencedCollectionId,
            foreignKeyTarget: f.foreignKeyTarget,
            constraints: f.constraints,
            defaultValue: f.defaultValue,
            arrayItemType: f.arrayItemType,
            objectFields: f.objectFields,
          } as SchemaField))
        : convertSchemaToFields(col.fields ?? {});

      return {
        id: col.id ?? col.name,
        name: col.name,
        fields,
        position: col.position ?? { x: 0, y: 0 },
        color: col.color,
      } as SchemaCollection;
    });
  }

  // 3. Object map: { collectionName: { fieldName: 'type' | fieldDef } }
  if (typeof input === "object" && input !== null) {
    return Object.entries(input as Record<string, unknown>).map(
      ([collectionName, fieldSpec]) => {
        let fields: SchemaField[];

        if (Array.isArray(fieldSpec)) {
          // already an array of field defs
          fields = convertSchemaToFields(fieldSpec as any);
        } else if (typeof fieldSpec === "object" && fieldSpec !== null) {
          fields = convertSchemaToFields(fieldSpec as any);
        } else {
          fields = [];
        }

        // Normalise types
        fields = fields.map(f => ({ ...f, type: normaliseType(f.type) }));

        return {
          id: collectionName,
          name: collectionName,
          fields,
          position: { x: 0, y: 0 },
        } as SchemaCollection;
      }
    );
  }

  throw new Error("Unrecognised schema format");
}

// ── Main handler ──────────────────────────────────────────────────────────────

// ── File export ───────────────────────────────────────────────────────────────

const FORMAT_EXT: Record<string, string> = {
  json: "json",
  csv: "csv",
  sql_insert: "sql",
};

function saveToDownloads(content: string, baseName: string, format: string): string {
  const ext = FORMAT_EXT[format] ?? "txt";
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const fileName = `drawline-${baseName}-${timestamp}.${ext}`;
  const downloadsDir = path.join(os.homedir(), "Downloads");

  // Fallback to OS temp dir if ~/Downloads doesn't exist
  const dir = fs.existsSync(downloadsDir) ? downloadsDir : os.tmpdir();
  const filePath = path.join(dir, fileName);
  fs.writeFileSync(filePath, content, "utf8");
  return filePath;
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function handleGenerateData(args: {
  schema: string | unknown[] | Record<string, unknown>;
  counts: Record<string, number>;
  seed?: number | string;
  format?: "json" | "csv" | "sql_insert";
  download?: boolean;
}): Promise<string> {
  const format = args.format ?? "json";

  // Parse schema
  let collections: SchemaCollection[];
  try {
    collections = parseSchemaInput(args.schema);
  } catch (err) {
    throw new Error(`Schema parse error: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (collections.length === 0) throw new Error("Schema contains no collections");

  // Validate counts reference known collections
  const collectionNames = new Set(collections.map(c => c.name));
  for (const name of Object.keys(args.counts)) {
    if (!collectionNames.has(name)) {
      throw new Error(
        `counts references unknown collection "${name}". ` +
        `Known: ${[...collectionNames].join(", ")}`
      );
    }
  }

  const adapter = new InMemoryAdapter();
  const service = new TestDataGeneratorService(adapter);

  const result = await service.generateAndPopulate(
    collections,
    [],   // no relationships for MCP tool (keep simple)
    {
      collections: Object.entries(args.counts).map(([collectionName, count]) => ({
        collectionName,
        count,
      })),
      relationships: [],
      seed: args.seed ?? Date.now(),
      batchSize: 500,
    }
  );

  if (!result.success && (result.errors?.length ?? 0) > 0) {
    throw new Error(`Generation failed: ${result.errors!.join("; ")}`);
  }

  // Build output
  const output: Record<string, unknown> = {};

  for (const collectionResult of result.collections) {
    const rows = adapter.getData(collectionResult.collectionName);

    if (format === "csv") {
      output[collectionResult.collectionName] = toCSV(rows as Record<string, unknown>[]);
    } else if (format === "sql_insert") {
      output[collectionResult.collectionName] = toSQLInsert(
        collectionResult.collectionName,
        rows as Record<string, unknown>[]
      );
    } else {
      output[collectionResult.collectionName] = rows;
    }
  }

  const summary = result.collections
    .map(c => `${c.collectionName}: ${c.documentCount} rows`)
    .join(", ");

  const download = args.download ?? false;

  // ── Serialise full payload ────────────────────────────────────────────────
  let fileContent: string;

  if (format === "json") {
    fileContent = JSON.stringify({
      success: true,
      summary,
      totalRows: result.totalDocumentsGenerated,
      data: output,
    }, null, 2);
  } else {
    // CSV / SQL — one block per collection, separated by headers
    const parts: string[] = [];
    for (const [name, content] of Object.entries(output)) {
      parts.push(`-- ${name} --\n${content}`);
    }
    fileContent = parts.join("\n\n");
  }

  // ── Optionally write to ~/Downloads ──────────────────────────────────────
  if (download) {
    const collectionLabel = result.collections.map(c => c.collectionName).join("-");
    const filePath = saveToDownloads(fileContent, collectionLabel, format);
    const fileUrl  = `file://${filePath}`;

    // Return a compact preview (first 20 rows of first collection) + the link
    const previewCollection = result.collections[0]?.collectionName;
    const previewRows = previewCollection
      ? (adapter.getData(previewCollection) as Record<string, unknown>[]).slice(0, 5)
      : [];

    return JSON.stringify({
      success: true,
      summary,
      totalRows: result.totalDocumentsGenerated,
      format,
      download: {
        path: filePath,
        url: fileUrl,
        sizeBytes: Buffer.byteLength(fileContent, "utf8"),
      },
      preview: { collection: previewCollection, rows: previewRows },
    }, null, 2);
  }

  // ── In-memory response (no file) ─────────────────────────────────────────
  if (format === "json") {
    return fileContent;
  }

  // For CSV / SQL return with a header line
  return `Generated ${result.totalDocumentsGenerated} rows (${summary})\n\n${fileContent}`;
}
