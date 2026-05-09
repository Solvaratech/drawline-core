import { z } from "zod";
import { SchemaCollection, SchemaRelationship, DatabaseType } from "../../types/schemaDesign";
import { TestDataGeneratorService } from "../../generator/index";
import { parseSchemaInput } from "./generateData";

// ── Supported DB types for seeding ───────────────────────────────────────────
// (excludes firestore/dynamodb which need credentials objects, not strings)
const SEEDABLE_DB_TYPES = [
  "postgresql", "mysql", "sqlite", "mongodb",
] as const;
type SeedableDbType = typeof SEEDABLE_DB_TYPES[number];

// ── Input schema ──────────────────────────────────────────────────────────────

export const SeedDatabaseInput = {
  schema: z
    .union([z.string(), z.array(z.any()), z.record(z.string(), z.any())])
    .describe("Schema definition — same flexible format as generate_data"),
  db_type: z
    .enum(SEEDABLE_DB_TYPES)
    .describe("Database type: postgresql | mysql | sqlite | mongodb"),
  connection_string: z
    .string()
    .describe(
      "Connection string for the database.\n" +
      "• PostgreSQL: postgresql://user:pass@host:5432/dbname\n" +
      "• MySQL:      mysql://user:pass@host:3306/dbname\n" +
      "• SQLite:     /absolute/path/to/file.db  (or :memory:)\n" +
      "• MongoDB:    mongodb://user:pass@host:27017/dbname"
    ),
  counts: z
    .record(z.string(), z.number().int().min(1))
    .describe("Rows to insert per collection. E.g. { users: 500, orders: 2000 }"),
  relationships: z
    .array(z.any())
    .optional()
    .default([])
    .describe("Relationship definitions for FK population"),
  seed: z
    .union([z.number(), z.string()])
    .optional()
    .describe("Deterministic seed for reproducible data"),
  truncate_first: z
    .boolean()
    .optional()
    .default(false)
    .describe("Clear existing data before inserting (USE WITH CAUTION in production)"),
  batch_size: z
    .number()
    .int()
    .min(10)
    .max(5000)
    .optional()
    .default(500)
    .describe("Insert batch size — tune for throughput vs. memory"),
};

// ── Adapter factory ───────────────────────────────────────────────────────────

async function createAdapter(dbType: SeedableDbType, connectionString: string) {
  switch (dbType) {
    case "postgresql": {
      const { PostgresAdapter } = await import("../../generator/adapters/PostgresAdapter");
      return new PostgresAdapter(connectionString);
    }
    case "mysql": {
      const { MySQLAdapter } = await import("../../generator/adapters/MySQLAdapter");
      return new MySQLAdapter(connectionString);
    }
    case "sqlite": {
      const { SQLiteAdapter } = await import("../../generator/adapters/SQLiteAdapter");
      const adapter = new SQLiteAdapter();
      // Store the filename so connect() can use it
      (adapter as any)._mcpFilename = connectionString === ":memory:" ? ":memory:" : connectionString;
      const origConnect = adapter.connect.bind(adapter);
      adapter.connect = async () => origConnect({ filename: (adapter as any)._mcpFilename });
      return adapter;
    }
    case "mongodb": {
      const { MongoDBAdapter } = await import("../../generator/adapters/MongoDBAdapter");
      return new MongoDBAdapter(connectionString);
    }
    default:
      throw new Error(`Unsupported db_type: ${dbType}`);
  }
}

// ── Safety guard ──────────────────────────────────────────────────────────────

const PRODUCTION_PATTERNS = [
  /prod(uction)?[\.\-_]/i,
  /[\.\-_]prod(uction)?/i,
  /live[\.\-_]/i,
  /[\.\-_]live/i,
];

function looksLikeProduction(connStr: string): boolean {
  return PRODUCTION_PATTERNS.some(p => p.test(connStr));
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function handleSeedDatabase(args: {
  schema: string | unknown[] | Record<string, unknown>;
  db_type: SeedableDbType;
  connection_string: string;
  counts: Record<string, number>;
  relationships?: unknown[];
  seed?: number | string;
  truncate_first?: boolean;
  batch_size?: number;
}): Promise<string> {

  // Safety: refuse obvious production connections unless truncate is false
  if (args.truncate_first && looksLikeProduction(args.connection_string)) {
    throw new Error(
      "Safety guard: truncate_first=true was requested on a connection string that " +
      "looks like a production database. Rename the connection string or set " +
      "truncate_first=false to proceed."
    );
  }

  // Parse schema
  let collections: SchemaCollection[];
  try {
    collections = parseSchemaInput(args.schema);
  } catch (err) {
    throw new Error(`Schema parse error: ${err instanceof Error ? err.message : String(err)}`);
  }

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

  const relationships = (args.relationships ?? []) as SchemaRelationship[];
  const adapter = await createAdapter(args.db_type, args.connection_string);
  const service = new TestDataGeneratorService(adapter);

  const startTime = Date.now();

  const result = await service.generateAndPopulate(
    collections,
    relationships,
    {
      collections: Object.entries(args.counts).map(([collectionName, count]) => ({
        collectionName,
        count,
      })),
      relationships,
      seed: args.seed ?? Date.now(),
      batchSize: args.batch_size ?? 500,
    }
  );

  const elapsedMs = Date.now() - startTime;
  const tps = Math.round((result.totalDocumentsGenerated / elapsedMs) * 1000);

  return JSON.stringify({
    success: result.success,
    db_type: args.db_type,
    totalInserted: result.totalDocumentsGenerated,
    elapsedMs,
    throughput: `${tps} rows/sec`,
    collections: result.collections.map(c => ({
      name: c.collectionName,
      inserted: c.documentCount,
    })),
    errors: (result.errors?.length ?? 0) > 0 ? result.errors : undefined,
    warnings: (result.warnings?.length ?? 0) > 0 ? result.warnings : undefined,
  }, null, 2);
}
