#!/usr/bin/env node
/**
 * @drawline/mcp — Drawline MCP Server
 *
 * Exposes Drawline's schema design + data generation engine as MCP tools,
 * making it callable from Claude, Cursor, Windsurf, and any MCP-compatible agent.
 *
 * Transport: stdio (default for Claude Desktop / Cursor / Windsurf)
 *
 * Tools:
 *   generate_data     — Generate synthetic rows from any schema (in-memory, no DB needed)
 *   design_schema     — Create a canonical schema from a structured entity spec
 *   validate_schema   — Lint a schema for errors and warnings
 *   diff_schemas      — Compare two schema versions; optionally emit DDL
 *   seed_database     — Insert generated data into a real database
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { GenerateDataInput,    handleGenerateData    } from "./tools/generateData.js";
import { DesignSchemaInput,    handleDesignSchema    } from "./tools/designSchema.js";
import { ValidateSchemaInput,  handleValidateSchema  } from "./tools/validateSchema.js";
import { DiffSchemasInput,     handleDiffSchemas     } from "./tools/diffSchemas.js";
import { SeedDatabaseInput,    handleSeedDatabase    } from "./tools/seedDatabase.js";
import { VisualizeSchemaInput, handleVisualizeSchema } from "./tools/visualizeSchema.js";

// ─────────────────────────────────────────────────────────────────────────────
// Server bootstrap
// ─────────────────────────────────────────────────────────────────────────────

const server = new McpServer({
  name: "drawline",
  version: "0.2.1",
});

// ─────────────────────────────────────────────────────────────────────────────
// Tool: generate_data
// ─────────────────────────────────────────────────────────────────────────────

server.tool(
  "generate_data",
  `Generate realistic synthetic data from a schema definition.
No database connection required — data is generated in-memory and returned as JSON, CSV, or SQL INSERT statements.

Accepts three schema formats:
  1. SchemaCollection[] (canonical drawline format)
  2. Object map: { "users": { "email": "string", "name": "string" } }
  3. JSON string of either format

Set format to "json" | "csv" | "sql_insert" to choose the output format.
Set download: true to save the file to ~/Downloads and receive a file:// download path.

Returns generated rows grouped by collection name.`,
  GenerateDataInput,
  async (args) => {
    try {
      const result = await handleGenerateData(args as any);
      return { content: [{ type: "text", text: result }] };
    } catch (err) {
      return {
        content: [{
          type: "text",
          text: `Error: ${err instanceof Error ? err.message : String(err)}`,
        }],
        isError: true,
      };
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// Tool: design_schema
// ─────────────────────────────────────────────────────────────────────────────

server.tool(
  "design_schema",
  `Create a canonical drawline schema from a structured entity specification.

Automatically:
  • Adds a primary key (uuid for SQL, objectid for MongoDB) if absent
  • Adds created_at / updated_at timestamp fields if absent
  • Injects FK fields from relationship definitions
  • Normalises field types (e.g. "text" → "string", "int" → "integer")
  • Returns the schema in the format accepted by generate_data and seed_database

Use this tool to turn a high-level entity list into a fully-specified schema ready for data generation or migration.`,
  DesignSchemaInput,
  (args) => {
    try {
      const result = handleDesignSchema(args as any);
      return { content: [{ type: "text", text: result }] };
    } catch (err) {
      return {
        content: [{
          type: "text",
          text: `Error: ${err instanceof Error ? err.message : String(err)}`,
        }],
        isError: true,
      };
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// Tool: validate_schema
// ─────────────────────────────────────────────────────────────────────────────

server.tool(
  "validate_schema",
  `Lint a drawline schema and return a structured report of errors and warnings.

Checks:
  • Every collection has exactly one primary key
  • No duplicate field names within a collection
  • All field types are valid drawline FieldTypes
  • Foreign key references point to existing collections
  • Enum constraints are only on string fields
  • Array fields have an arrayItemType
  • Object fields have objectFields defined

With strict=true, additionally checks for:
  • Missing created_at / updated_at fields
  • Required fields with null defaults
  • Field and collection names containing spaces`,
  ValidateSchemaInput,
  (args) => {
    try {
      const result = handleValidateSchema(args as any);
      return { content: [{ type: "text", text: result }] };
    } catch (err) {
      return {
        content: [{
          type: "text",
          text: `Error: ${err instanceof Error ? err.message : String(err)}`,
        }],
        isError: true,
      };
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// Tool: diff_schemas
// ─────────────────────────────────────────────────────────────────────────────

server.tool(
  "diff_schemas",
  `Compare two schema versions and return what changed.

Output formats:
  • summary  — one line per change (good for quick reviews)
  • detailed — structured JSON with full before/after details (default)
  • ddl      — PostgreSQL ALTER TABLE / CREATE TABLE / DROP TABLE statements

Detects:
  • Added / removed collections
  • Added / removed fields
  • Modified field properties (type, required, defaultValue, FK targets)`,
  DiffSchemasInput,
  (args) => {
    try {
      const result = handleDiffSchemas(args as any);
      return { content: [{ type: "text", text: result }] };
    } catch (err) {
      return {
        content: [{
          type: "text",
          text: `Error: ${err instanceof Error ? err.message : String(err)}`,
        }],
        isError: true,
      };
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// Tool: seed_database
// ─────────────────────────────────────────────────────────────────────────────

server.tool(
  "seed_database",
  `Generate and insert synthetic data directly into a real database.

Supported databases: PostgreSQL, MySQL, SQLite, MongoDB.

Steps performed:
  1. Parse and validate the schema
  2. Ensure tables / collections exist (CREATE IF NOT EXISTS)
  3. Generate the requested number of rows with referential integrity
  4. Insert in batches for performance
  5. Apply foreign key constraints (SQL databases)

Safety: refuses to truncate if the connection string matches production naming patterns.

Returns a summary with row counts, elapsed time, and throughput.`,
  SeedDatabaseInput,
  async (args) => {
    try {
      const result = await handleSeedDatabase(args as any);
      return { content: [{ type: "text", text: result }] };
    } catch (err) {
      return {
        content: [{
          type: "text",
          text: `Error: ${err instanceof Error ? err.message : String(err)}`,
        }],
        isError: true,
      };
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// Tool: visualize_schema
// ─────────────────────────────────────────────────────────────────────────────

server.tool(
  "visualize_schema",
  `Render a schema as a Mermaid ER diagram — displays as a visual diagram directly in Claude Desktop and other Mermaid-compatible clients.

Shows every table with its fields and types, marks PK/FK columns, and draws relationship arrows between tables.

Accepts the same flexible schema formats as generate_data:
  1. SchemaCollection[] (canonical drawline format)
  2. Object map: { "users": { "email": "string" } }
  3. JSON string of either format

Optionally pass relationships to draw labelled arrows between tables.`,
  VisualizeSchemaInput,
  (args) => {
    try {
      const result = handleVisualizeSchema(args as any);
      return { content: [{ type: "text", text: result }] };
    } catch (err) {
      return {
        content: [{
          type: "text",
          text: `Error: ${err instanceof Error ? err.message : String(err)}`,
        }],
        isError: true,
      };
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// Start
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // MCP servers communicate over stdio — no console.log here
}

main().catch(err => {
  process.stderr.write(`Drawline MCP server failed to start: ${err}\n`);
  process.exit(1);
});
