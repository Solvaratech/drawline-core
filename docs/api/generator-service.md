# TestDataGeneratorService

`TestDataGeneratorService` is the central class in Drawline Core. It manages the entire lifecycle of data generation, from database connection and schema creation to streaming data insertion.

## Constructor

```typescript
constructor(adapter: BaseAdapter)
```
Initializes the service with a specific database adapter.

## Static Methods

### `createAdapter()`
A factory method to create the appropriate adapter based on the database type.

```typescript
static createAdapter(
  type: DatabaseType,
  encryptedCredentials: string,
  decryptFn: (encrypted: string) => string,
  databaseName?: string
): BaseAdapter
```

- **type**: One of `mongodb`, `postgresql`, `mysql`, `sqlite`, `firestore`, `csv`, `dynamodb`, `sqlserver`, `redis`.
- **encryptedCredentials**: The connection string or credentials (usually encrypted).
- **decryptFn**: A callback function to decrypt the credentials.
- **databaseName**: Optional target database name.

## Instance Methods

### `generateAndPopulate()`
The main entry point for a full generation run. Executes all 3 phases (Schema, Data, Constraints).

```typescript
async generateAndPopulate(
  collections: SchemaCollection[],
  relationships: SchemaRelationship[],
  config: TestDataConfig
): Promise<GenerationResult>
```

- **Returns**: A `GenerationResult` object containing success status, generated record counts, and any errors/warnings.

### `generateCollectionWithRange()`
Generates data for a specific subset or range within a single collection. Useful for incremental updates.

```typescript
async generateCollectionWithRange(
  collection: SchemaCollection,
  rangeStart: number,
  count: number,
  config: TestDataConfig,
  relationships: SchemaRelationship[]
): Promise<GenerationResult>
```

## Configuration: `TestDataConfig`

| Property | Type | Description |
| :--- | :--- | :--- |
| `seed` | `number` | The integer seed for deterministic generation. |
| `batchSize` | `number` | Number of records to insert in a single batch (Default: 1000). |
| `collections` | `Array` | List of `{ collectionName: string, count: number }` to generate. |
| `onProgress` | `Function` | Optional callback to track generation progress (TPS, estimated time, etc.). |

## Internal Flow (The 3 Phases)

When you call `generateAndPopulate()`, the service performs:

1.  **Dependency Analysis**: Uses `DependencyGraph` to build the `generationOrder`.
2.  **Phase 1: Schema**: Calls `adapter.ensureCollection()` for every table in order.
3.  **Phase 2: Generation**: Calls `adapter.generateStream()` and `adapter.writeBatchStream()`.
    - Integrates `ConstraintRegistry` for real-time document validation and auto-correction.
4.  **Phase 3: Constraints**: Calls `adapter.addForeignKeyConstraints()` once data is loaded.

> [!TIP]
> Use the `onProgress` callback to provide real-time feedback to your users during long-running generation tasks.
