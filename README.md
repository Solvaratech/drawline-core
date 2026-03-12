# @drawline/core

The core engine behind Drawline, responsible for database connection management, schema inference, and intelligent test data generation.

This package provides a unified interface to interact with multiple database types (PostgreSQL, MongoDB, Firestore) and perform complex operations like analyzing schema relationships and seeding databases with referentially intact data.

## Features

- **Multi-Database Support**: Unified adapter interface for PostgreSQL, MongoDB, Firestore, and a mock **InMemoryAdapter** for testing.
- **Schema Inference**: Automatically extracts collection structures, fields, types, and constraints.
- **Relationship Detection**: Heuristic-based detection of foreign key relationships between collections.
- **Smart Data Generator**: topologically sorts collections based on dependencies to generate data in the correct order, ensuring foreign key integrity.
- **Type-Safe Schemas**: Comprehensive TypeScript definitions for defining database schemas abstractly.
- **CLI Tool**: A powerful command-line interface for data generation, schema validation, and project initialization.

## Installation

```bash
npm install @drawline/core
```

## Core Architecture

The engine is built around a few key concepts:

### 1. Adapters (`BaseAdapter`)
The `BaseAdapter` abstract class defines the contract for all database interactions. Each supported database has a concrete implementation (e.g., `PostgresAdapter`, `MongoDBAdapter`) that handles the specifics of connection, querying, and insertion.

### 2. Schema Inference
The engine can inspect a live database to construct a platform-agnostic `SchemaDesign` object. This object represents the database structure in a way that Drawline's UI and generator can understand, normalizing types (e.g., mapping `varchar` and `String` to a unified `string` type).

### 3. Test Data Generator (`TestDataGeneratorService`)
This is the heart of the seeding functionality. When you request data generation, the service:
1.  **Analyzes Dependencies**: Builds a directed acyclic graph (DAG) of your collections based on defined relationships.
2.  **Determines Order**: Resolves the correct insertion order (e.g., create `Users` before `Posts`).
3.  **Generates Data**: Uses the schema constraints (types, enums, patterns) to create realistic mock data.
4.  **Enforces Integrity**: Ensures generated Foreign Keys match actual Primary Keys from previously generated parent records.

### Math-based Deterministic Generation

Drawline uses a sophisticated math-based approach to ensure data consistency without needing to "look up" records in a database.

*   **Deterministic IDs**: IDs are generated using a stable hash of `(Seed + Collection Name + Index)`.
*   **Referential Integrity**: When generating a child record (e.g., `Order #500` linked to `User`), the engine calculates *exactly* which User ID was generated for `User #5`, ensuring the Foreign Key matches the Primary Key of the parent, even if they were generated in parallel or different batches.
*   **Stateless**: The engine does not need to query the database to know that "User 5" exists; the math guarantees the IDs will match.

## Usage

### Connecting to a Database

Use the `createHandler` factory or `TestDataGeneratorService` to instantiate the correct adapter.

```typescript
import { createHandler, DatabaseType } from "@drawline/core/server";

const type: DatabaseType = "postgresql";
const credentials = "postgres://user:pass@localhost:5432/mydb";

const handler = createHandler(type, credentials);

await handler.connect();
const collections = await handler.getCollections();
console.log("Found collections:", collections);
await handler.disconnect();
```

### Generating Test Data

To generate data, you must provide a **Schema Definition** and a **Configuration**. This is typically constructed by the frontend, but here is how the engine expects it.

```typescript
import { TestDataGeneratorService, TestDataConfig } from "@drawline/core/server";

// 1. Initialize Service
const service = new TestDataGeneratorService(handler);

// 2. Define What to Generate (The Request)
const config: TestDataConfig = {
  collections: [
    { collectionName: "users", count: 10 },
    { collectionName: "posts", count: 50 } // Will depend on users
  ],
  batchSize: 100,
  seed: 12345 // Optional deterministic seed
};

// 3. Provide Schema & Relationships
// (Usually obtained from handler.inferSchema() or defined manually)
const result = await service.generateAndPopulate(
  mySchemaCollections, 
  mySchemaRelationships, 
  config
);

console.log(`Generated ${result.totalDocumentsGenerated} documents.`);
```

## API Reference: Request Structures

Since the core engine is often consumed by API endpoints or UI tools, understanding the data structures for Schemas and Relationships is critical.

### 1. SchemaCollection
Represents a single table or collection.

```typescript
interface SchemaCollection {
  id: string;          // Unique identifier (usually same as name)
  name: string;        // Table/Collection name in DB
  fields: SchemaField[];
  
  // Layout info (can be ignored for pure backend usage)
  position: { x: number; y: number };
  
  // Database specifics
  schema?: string;     // e.g., "public" for Latex
  dbName?: string;     // For Mongo
}
```

### 2. SchemaField
Defines a single column or field.

```typescript
interface SchemaField {
  id: string;
  name: string;
  type: FieldType;     // "string" | "integer" | "boolean" | "date" | ...
  required?: boolean;
  isPrimaryKey?: boolean;
  isForeignKey?: boolean;
  
  // Constraints for Generation
  constraints?: {
    min?: number;
    max?: number;
    pattern?: string;  // Regex
    enum?: string[];   // Allowed values
    unique?: boolean;
    email?: boolean;   // If inferred from name/type
  };
}
```

### 3. SchemaRelationship
Defines a link between two collections. The generator uses this to enforce referential integrity.

```typescript
interface SchemaRelationship {
  id: string;
  fromCollectionId: string; // The child table (e.g., "posts")
  toCollectionId: string;   // The parent table (e.g., "users")
  type: "one-to-many" | "one-to-one" | "many-to-many";
  
  // Single Field FK
  fromField?: string;        // FK column in child (e.g., "user_id")
  toField?: string;          // PK column in parent (e.g., "id")

  // Composite Key Support
  fromFields?: string[];     // e.g. ["order_id", "item_id"]
  toFields?: string[];
}
```

### 4. TestDataConfig
The configuration object that controls the generation process.

```typescript
interface TestDataConfig {
  // Which collections to populate and how many records
  collections: {
    collectionName: string;
    count: number;
    distribution?: "uniform" | "normal" | "exponential";
    relationshipConfig?: Record<string, {
        minReferences?: number;
        maxReferences?: number;
        distribution?: "uniform" | "weighted";
        averageReferences?: number;
    }>;
  }[];
  
  batchSize?: number;      // Insert batch size (default: 100)
  seed?: number;           // For reproducible runs
  
  // Callbacks
  onProgress?: (progress: { 
    collectionName: string; 
    generatedCount: number; 
    totalCount: number 
  }) => Promise<void>;
}
```

## CLI Tool

The package includes a CLI tool to interact with the engine.

### Installation

Link the CLI locally:
```bash
npm run cli:build
npm link
```

### Commands

- **`init`**: Create a sample `schema.json` and `drawline.config.json`.
  ```bash
  drawline init
  ```
- **`gen`**: Generate data based on schema and config.
  ```bash
  drawline gen --schema schema.json --config drawline.config.json --db in-memory
  ```
- **`validate`**: Validate a schema file.
  ```bash
  drawline validate --schema schema.json
  ```

## Development and Testing

### Testing Environment

We use **Vitest** for unit testing. The project includes an `InMemoryAdapter` that allows you to test relationship logic and data generation without a real database.

### Running Tests

```bash
npm test
```

To run tests in watch mode:
```bash
npm run test:watch
```

### Adding New Adapters

All new adapters must extend `BaseAdapter` and implement the abstract methods for connection management and document insertion. Reference `InMemoryAdapter.ts` for a simple starting point.

