# @drawline/mcp — Drawline MCP Server

The Drawline MCP server exposes schema design and data generation as tools
callable by any MCP-compatible AI agent (Claude, Cursor, Windsurf, etc.).

## Tools

| Tool | Description |
|------|-------------|
| `generate_data` | Generate realistic synthetic rows from any schema — no DB required |
| `design_schema` | Turn an entity spec into a canonical schema (auto-adds PK, timestamps, FKs) |
| `validate_schema` | Lint a schema for errors and warnings |
| `diff_schemas` | Compare two schema versions; optionally emit DDL |
| `seed_database` | Insert generated data into PostgreSQL, MySQL, SQLite, or MongoDB |

---

## Installation — Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "drawline": {
      "command": "node",
      "args": ["/path/to/drawline-core/dist/mcp/server.js"]
    }
  }
}
```

Or use `tsx` for development (no build step):

```json
{
  "mcpServers": {
    "drawline": {
      "command": "npx",
      "args": ["tsx", "/path/to/drawline-core/src/mcp/server.ts"]
    }
  }
}
```

## Installation — Cursor

Add to `.cursor/mcp.json` in your project root:

```json
{
  "mcpServers": {
    "drawline": {
      "command": "node",
      "args": ["/path/to/drawline-core/dist/mcp/server.js"]
    }
  }
}
```

## Development

```bash
# Run directly (no build)
npm run mcp:dev

# Build then run
npm run build && npm run mcp
```

---

## Example prompts

Once connected, ask Claude or Cursor:

> "Design a schema for a multi-tenant SaaS with users, workspaces, projects and tasks"

> "Generate 500 rows of realistic user data with email, name, and signup date"

> "Validate this schema and tell me what's wrong"

> "Show me the DDL diff between these two schema versions"

> "Seed my local Postgres database at localhost:5432/mydb with 1000 users and 5000 orders"
