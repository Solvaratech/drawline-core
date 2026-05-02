# Database Adapters

Drawline Core is designed with a pluggable adapter architecture. This allows the core generation logic to remain database-agnostic while still supporting the unique requirements of different storage engines.

## The `BaseAdapter` Interface

All adapters must extend the `BaseAdapter` abstract class. This interface defines the contract that the `TestDataGeneratorService` uses to interact with the database.

### Core Lifecycle Methods

- `connect()`: Establishes a connection to the database.
- `disconnect()`: Closes the connection.
- `initialize(config, collections, relationships, seed)`: Sets up the internal state of the adapter.
- `ensureCollection(name, fields, skipForeignKeys)`: Phase 1 method. Creates the table/collection if it doesn't exist.
- `addForeignKeyConstraints(name, fields)`: Phase 3 method. Applies constraints after data is loaded.

### Generation Methods

- `generateStream(collection, count, rangeStart?)`: Returns an `AsyncGenerator` that produces document objects.
- `writeBatchStream(name, stream, batchSize, allowedRefFields, fields)`: Phase 2 method. Consumes the document stream and performs batch inserts.

## Supported Adapters

### SQL Adapters
- **PostgresAdapter**: Supports schemas, sequences, and standard foreign key constraints.
- **MySQLAdapter**: Optimized for MySQL/MariaDB syntax.
- **SQLiteAdapter**: Ideal for local testing and lightweight demos.
- **SQLServerAdapter**: Support for T-SQL syntax and constraints.

### NoSQL & Document Adapters
- **MongoDBAdapter**: Handles BSON types and ObjectIDs.
- **FirestoreAdapter**: Support for Google Cloud Firestore collections and documents.
- **DynamoDBAdapter**: Support for AWS DynamoDB tables and batch writes.

### Specialty Adapters
- **RedisAdapter**: Maps generated documents to Redis hashes or JSON keys.
- **CSVExportAdapter**: Instead of inserting into a DB, it streams the generated data into CSV files.
- **EphemeralAdapter**: Stores data in memory. Perfect for unit tests.

## Custom Adapter Implementation

If you need to support a custom database, you can extend `BaseAdapter`:

```typescript
import { BaseAdapter, GeneratedDocument } from "@solvaratech/drawline-core";

class MyCustomAdapter extends BaseAdapter {
  async connect() { /* ... */ }
  async ensureCollection(name, fields) { /* ... */ }
  
  async *generateStream(collection, count) {
    for (let i = 0; i < count; i++) {
      yield { id: i, data: { /* ... */ } };
    }
  }

  async writeBatchStream(name, stream, batchSize) {
    for await (const batch of this.toBatches(stream, batchSize)) {
      await this.myDb.insert(name, batch);
    }
  }
}
```

> [!NOTE]
> When implementing `writeBatchStream`, ensure you handle foreign key references correctly by using the `allowedRefFields` set to identify which fields should be treated as links to other generated entities.
