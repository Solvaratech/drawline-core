# @solvaratech/drawline-core

**Mathematically Grounded, Engineering-Strong Database Seeding Engine**

Drawline Core is a production-grade TypeScript library for intelligent, deterministic test data generation across multiple database systems. It provides a unified interface for schema inference, relationship resolution, and referentially intact data seeding with strong mathematical guarantees on data consistency.

---

## Table of Contents

1. [Overview](#overview)
2. [Features Achieved](#features-achieved)
3. [Technical Architecture](#technical-architecture)
4. [Mathematical Foundations](#mathematical-foundations)
5. [Usage](#usage)
6. [Roadmap](#roadmap)
7. [Development](#development)

---

## Overview

Drawline addresses one of the most challenging problems in software engineering: generating realistic, referentially intact test data at scale across heterogeneous database systems. Traditional approaches rely on simple random generation or expensive database lookups to maintain foreign key integrity. Drawline uses a **mathematically derived deterministic generation protocol** that guarantees referential integrity without any database queries during generation.

### Core Problem Statement

Given:
- A database schema $S$ with collections $C = \{c_1, c_2, ..., c_n\}$
- Relationships $R = \{r_1, r_2, ..., r_m\}$ defining foreign key dependencies
- A generation seed $\sigma \in \mathbb{N}$

Generate documents $D_c = \{d_1, d_2, ..., d_k\}$ for each collection $c$ such that:
1. All foreign key references point to existing primary keys
2. The generation is fully deterministic: $G(\sigma, c, i) \rightarrow d_i$
3. No database queries are required during generation

---

## Features Achieved

### Multi-Database Adapter Architecture

Drawline implements a unified adapter pattern supporting **11+ database systems**:

| Adapter | Status | Key Features |
|---------|--------|-------------|
| PostgreSQL | ✅ Complete | Schema inference, FK constraints, serial types, composite PKs |
| MySQL | ✅ Complete | AUTO_INCREMENT, foreign keys, composite PKs |
| SQLite | ✅ Complete | Embedded testing, full FK support |
| MongoDB | ✅ Complete | ObjectId generation, document embedding |
| DynamoDB | ✅ Complete | Partition keys, sort keys, GSI support |
| Firestore | ✅ Complete | Collection groups, subcollections |
| Redis | ✅ Complete | Key-value, sets, sorted sets |
| SQL Server | ✅ Complete | Identity columns, stored procedures |
| InMemory | ✅ Complete | Mock adapter for testing |
| Ephemeral | ✅ Complete | Transient data for demos |
| Null | ✅ Complete | No-op adapter |
| CSV Export | ✅ Complete | Export to CSV files |

### Schema System

- **SchemaCollection**: Represents tables/collections with fields, constraints, and metadata
- **SchemaField**: Supports 20+ field types including composite keys
- **SchemaRelationship**: One-to-one, one-to-many, many-to-many with composite FK support
- **FieldConstraints**: min, max, minLength, maxLength, pattern, enum, unique, nullPercentage

### Field Inference Engine

Smart field generation based on semantic naming:

```typescript
// Score-based inference system
const rules = [
  { tokens: ['email'], score: 10, generator: f => f.internet.email() },
  { tokens: ['first', 'name'], score: 8, generator: f => f.person.firstName() },
  { tokens: ['created', 'at'], score: 10, generator: f => f.date.past().toISOString() },
  // ... 80+ rules implemented
];
```

Supports:
- Tokenization (camelCase, snake_case, PascalCase)
- Negative token filtering
- Score-based best-match selection
- Perfect-match bonuses
- Caching for performance

### Dependency Graph Engine

Mathematically sound topological sorting:

- **Strong vs Weak Dependencies**: Distinguishes required vs optional FKs
- **Cycle Detection**: DFS-based cycle detection with Tarjan's algorithm principles
- **Cycle Breaking**: Intelligent break-point selection prioritizing weak deps
- **Level Assignment**: BFS-based level propagation for parallel execution

### Constraint Engine

Cross-column dependency resolution:

- **ColumnDependencyGraph**: Topological sort of field dependencies
- **Binary Constraints**: minColumn, maxColumn, gtColumn, ltColumn
- **Temporal Constraints**: startDate, endDate for timestamps
- **Numeric Constraints**: min, max with automatic range adjustment
- **String Constraints**: minLength, maxLength, pattern, trim, case

### Deterministic ID Generation

Math-based ID generation eliminating database lookups:

```
ID(collection, index) = H(collection + index + sessionId + seed)

where H is SHA-256 truncated to specific format:
- UUID: 8-4-4-4-12 hex format
- ObjectId: 24-char hex string  
- Integer: index + startId + 1
```

This guarantees: $\forall c \in C, \forall i \in [1, n]: ID_c(i) = ID_{parent(c)}(i \mod |parent(c)|)$

### Composite Key Support

- **Composite Primary Keys**: Up to N fields per PK
- **Composite Foreign Keys**: Multi-column FK references
- **FK Chaining**: Resolves nested FK chains (A→B→C)
- **Cached Resolution**: Parent row caching for performance

### ORM Code Generation

Generates type-safe ORM code from schema:

| ORM | Status | Output |
|-----|--------|--------|
| Prisma | ✅ Complete | schema.prisma |
| TypeORM | ✅ Complete | entities/*.ts |
| Drizzle | ✅ Complete | schema.ts |
| Mongoose | ✅ Complete | schemas/*.ts |

### Schema Diff Engine

- **Full Sync Mode**: Destructive schema changes allowed
- **Additive Mode**: Safe migrations only
- **DDL Generation**: CREATE TABLE, ALTER TABLE, DROP TABLE
- **Type Migration**: Type widening detection
- **Foreign Key Resolution**: Constraint ordering

### CLI Tool

```
drawline init                    # Initialize project
drawline gen --schema --config   # Generate data
drawline validate               # Validate schema
drawline diff                   # Show schema changes
```

### Worker Pool

Parallel generation for large datasets:

- **Worker Threads**: Native Node.js worker_threads
- **Sharding**: Deterministic range-based sharding
- **Progress Callbacks**: Real-time progress reporting
- **Task Queue**: FIFO scheduling with backpressure

---

## Technical Architecture

### Core Data Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                    TestDataGeneratorService              │
├─────────────────────────────────────────────────────────────────────┤
│  1. initialize(config, collections, relationships)  │
│     ├── Preload metadata from target DB              │
│     ├── Build relationship map                      │
│     └── Initialize seeded RNG                      │
│                                                             │
│  2. buildDependencyOrder()                           │
│     ├── Build DAG from relationships                 │
│     ├── Detect and break cycles                       │
│     └── Return topological sort                    │
│                                                             │
│  3. generateAndPopulate()                           │
│     ├── For each collection in order:                │
│     │   ├── ensureCollection()                       │
│     │   ├── generateCollectionData()                 │
│     │   └── insertDocuments()                       │
│     └── Validate referential integrity               │
└─────────────────────────────────────────────────────────────────────┘
```

### Adapter Interface

```typescript
abstract class BaseAdapter {
  // Connection management
  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
  
  // Schema operations
  abstract collectionExists(name: string): Promise<boolean>;
  abstract ensureCollection(name: string, fields: SchemaField[]): Promise<void>;
  abstract getCollectionDetails(name: string): Promise<CollectionDetails>;
  abstract getCollectionSchema(name: string): Promise<SchemaField[]>;
  
  // Data operations
  abstract insertDocuments(
    collectionName: string, 
    documents: GeneratedDocument[]
  ): Promise<(string | number)[]>;
  
  abstract clearCollection(name: string): Promise<void>;
  abstract getDocumentCount(name: string): Promise<number>;
  
  // Validation
  abstract validateReference(
    collectionName: string, 
    fieldName: string, 
    value: unknown
  ): Promise<boolean>;
}
```

### Class Hierarchy

```
BaseAdapter
├── PostgresAdapter
├── MySQLAdapter
├── SQLiteAdapter
├── MongoDBAdapter
├── DynamoDBAdapter
├── FirestoreAdapter
├── RedisAdapter
├── SQLServerAdapter
├── InMemoryAdapter (for testing)
├── EphemeralAdapter (for demos)
├── NullAdapter (no-op)
└── CSVExportAdapter (export)
```

---

## Mathematical Foundations

### 1. Topological Sort for Generation Ordering

**Problem**: Given a DAG $G = (V, E)$ where $V = C$ and edges represent dependencies, find a linear ordering $\tau: V \rightarrow [1, |V|]$ such that $\forall (u, v) \in E: \tau(u) < \tau(v)$.

**Algorithm**: Kahn's algorithm with in-degree counting:

```
TOPOLOGICAL-SORT(G):
  Compute in-degree(v) for all v ∈ V
  Queue ← { v | in-degree(v) = 0 }
  result ← []
  
  while Queue not empty:
    v ← Queue.pop()
    result.append(v)
    for each edge (v, w):
      in-degree(w) ← in-degree(w) - 1
      if in-degree(w) = 0:
        Queue.push(w)
  
  return result
```

**Complexity**: $O(|V| + |E|)$

### 2. Deterministic ID Generation

**Theorem**: For any collections $A$ and $B$ with relationship $R: A \rightarrow B$, let $id_A(i)$ generate the ID for the $i$-th document in $A$. Then $id_B(j)$ generated for the $j$-th document in $B$ satisfies:

$$\forall i \in [1, |A|]: FK(i) = id_A(i) = id_B(i \mod |B|)$$

**Proof**: Using the deterministic hash:
$$id(c, i) = \text{hash}(\text{collection}_c \oplus i \oplus \sigma)_{constrained}$$

The FK resolution computes:
$$parentIndex = i \mod |parent|$$
$$FK(i) = id(parent, parentIndex)$$

By substitution:
$$FK(i) = \text{hash}(parent \oplus (i \mod |parent|) \oplus \sigma)$$
$$= id(parent, i \mod |parent|)$$

$\square$

### 3. Cycle Detection and Breaking

**Theorem**: Any finite directed graph can be made acyclic by removing at least one edge.

**Algorithm**: Modified DFS with cycle breaking:

```
DETECT-CYCLE(G):
  visited ← ∅
  recursionStack ← ∅
  
  DFS(v):
    visited.add(v)
    recursionStack.add(v)
    
    for each neighbor u of v:
      if u ∉ visited:
        if DFS(u) return true
      if u ∈ recursionStack:
        return CYCLE-DETECTED(v, u)
    
    recursionStack.delete(v)
    return false
  
  for each vertex v:
    if v ∉ visited:
      if DFS(v) return true
  
  return false
```

**Breaking Strategy**: When cycles detected, prioritize removing weak dependencies (non-required FKs) to preserve data integrity.

### 4. Field Inference Scoring

**Problem**: Given a field name $f$, select the best generator from a rule set $R$.

**Algorithm**: Score-based matching:

$$\text{score}(r, f) = r_{score} + \text{match}(r, f) - \text{noise}(r, f)$$

Where:
- $\text{match}(r, f) = 5$ if $|tokens(f)| = |tokens(r)|$ (perfect match)
- $\text{noise}(r, f) = 0.5 \times (|tokens(f)| - |tokens(r)|)$

Select $r^* = \text{argmax}_r \text{score}(r, f)$

### 5. Composite FK Resolution

For composite FKs $(f_1, ..., f_k) \rightarrow (p_1, ..., p_k)$:

1. Select parent row index $r = i \mod |parent|$
2. Retrieve cached parent row $P[r]$
3. For each component $f_j$:
   $$value[f_j] = P[r][p_j]$$

This ensures all FK components reference the same parent row.

### 6. Cross-Column Constraint Satisfaction

For constraints like $A > B$ where $B$ is generated first:

$$value[A] = \max(generated, value[B] + \delta)$$

Where $\delta$ is a small deterministic offset to maintain both uniqueness and constraint satisfaction.

---

## Usage

### Installation

```bash
npm install @solvaratech/drawline-core
```

### Basic Generation

```typescript
import { TestDataGeneratorService } from "@solvaratech/drawline-core/server";
import { PostgresAdapter } from "@solvaratech/drawline-core/generator/adapters/PostgresAdapter";

// 1. Configure adapter
const adapter = new PostgresAdapter({
  connectionString: "postgres://user:pass@localhost:5432/mydb"
});
await adapter.connect();

// 2. Initialize service
const service = new TestDataGeneratorService(adapter);

// 3. Define schema
const collections = [
  {
    id: "users",
    name: "users",
    fields: [
      { id: "id", name: "id", type: "uuid", isPrimaryKey: true },
      { id: "email", name: "email", type: "string", required: true },
      { id: "name", name: "name", type: "string" }
    ]
  },
  {
    id: "posts",
    name: "posts",
    fields: [
      { id: "id", name: "id", type: "uuid", isPrimaryKey: true },
      { id: "user_id", name: "user_id", type: "uuid", isForeignKey: true, 
        referencedCollectionId: "users" },
      { id: "title", name: "title", type: "string" }
    ]
  }
];

const relationships = [
  {
    id: "posts->users",
    fromCollectionId: "posts",
    toCollectionId: "users",
    type: "many-to-one",
    fromField: "user_id",
    toField: "id"
  }
];

// 4. Generate configuration
const config = {
  collections: [
    { collectionName: "users", count: 100 },
    { collectionName: "posts", count: 1000 }
  ],
  seed: 12345
};

// 5. Execute generation
const result = await service.generateAndPopulate(
  collections, 
  relationships, 
  config
);

console.log(`Generated ${result.totalDocumentsGenerated} documents`);
```

### Schema Diff and Migration

```typescript
import { computeSchemaDiff, generateDDL } from "@solvaratech/drawline-core/schema";

// Compare current schema with database
const diff = computeSchemaDiff(databaseSnapshot, newSchema, "additive");

// Generate migration SQL
const statements = generateDDL(diff);

for (const stmt of statements) {
  console.log(stmt.sql);
}
```

### ORM Code Generation

```typescript
import { PrismaGenerator } from "@solvaratech/drawline-core/generators/orm";

const generator = new PrismaGenerator();
const output = generator.generate(collections, relationships);

console.log(output.content); // Prisma schema.prisma content
```

---

## Roadmap

### Short Term (v0.2.0 - v0.3.0)

- [ ] **Enhanced Validation**: Post-generation integrity validation
- [ ] **Data masking**: Sensitive data identification and redaction
- [ ] **Incremental generation**: Delta seeding for existing databases
- [ ] **Distribution profiles**: Normal, exponential, power-law distributions
- [ ] **Relationship visualization**: Draw relationship graphs

### Medium Term (v0.4.0 - v0.5.0)

- [ ] **Web UI Dashboard**: Visual schema editor and generator interface
- [ ] **Data Templates**: Reusable generation templates
- [ ] **Export formats**: More export adapters (Excel, JSON Lines)
- [ ] **Audit logging**: Generation audit trail
- [ ] **CI/CD integration**: GitHub Actions, GitLab CI

### Long Term (v1.0.0)

- [ ] **GraphQL API**: REST/GraphQL API for remote generation
- [ ] **Multi-tenant**:隔离的多租户支持
- [ ] **Enterprise features**: SSO, RBAC, audit
- [ ] **Cloud dashboard**: SaaS management console
- [ ] **Plug-in system**: Third-party generator plugins

---

## Development

### Prerequisites

- Node.js 18+
- TypeScript 5.9+
- pnpm or npm

### Setup

```bash
npm install
npm run build
```

### Testing

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# UI
npm run test:ui

# CI (with coverage)
npm run test:ci
```

### Type Checking

```bash
npm run type-check
```

### CLI

```bash
npm run cli:build
npm link  # Link globally

drawline init
drawline gen --schema schema.json --config config.json
```

---

## API Reference

### Core Exports

```typescript
// Main exports
export * from "./types/schemaDesign";      // Schema types
export * from "./types/schemaDiff";       // Diff types
export * from "./utils/schemaConverter";  // Converters
export * from "./utils/errorMessages"; // Errors
export * from "./schema";              // Schema engine
export * from "./generators/orm";      // ORM generators

// Server exports
export * from "./connections";         // Database connections
export * from "./generator";         // Generation engine
```

### Key Interfaces

```typescript
interface SchemaCollection {
  id: string;
  name: string;
  fields: SchemaField[];
  schema?: string;
  dbName?: string;
  position?: { x: number; y: number };
}

interface SchemaField {
  id: string;
  name: string;
  type: FieldType;
  required?: boolean;
  isPrimaryKey?: boolean;
  isForeignKey?: boolean;
  isSerial?: boolean;
  compositePrimaryKeyIndex?: number;
  compositeKeyGroup?: string;
  referencedCollectionId?: string;
  foreignKeyTarget?: string;
  rawType?: string;
  arrayItemType?: string;
  defaultValue?: any;
  constraints?: FieldConstraints;
}

interface SchemaRelationship {
  id: string;
  fromCollectionId: string;
  toCollectionId: string;
  type: "one-to-one" | "one-to-many" | "many-to-many";
  fromField?: string;
  toField?: string;
  fromFields?: string[];
  toFields?: string[];
}

interface TestDataConfig {
  collections: CollectionConfig[];
  seed?: number | string;
  batchSize?: number;
  onProgress?: (progress: ProgressUpdate) => Promise<void>;
}
```

---

## License

MIT License. See LICENSE file for details.

---

## Contributing

See CONTRIBUTING.md for development guidelines.

---

## Support

- GitHub Issues: https://github.com/solvaratech/drawline-core/issues
- Documentation: https://drawline.app/docs