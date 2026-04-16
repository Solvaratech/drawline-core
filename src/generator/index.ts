import {
  SchemaCollection,
  SchemaField,
  SchemaRelationship,
  DatabaseType,
} from "../types/schemaDesign";
import { MongoDBAdapter } from "./adapters/MongoDBAdapter";
import { FirestoreAdapter } from "./adapters/FirestoreAdapter";
import { PostgresAdapter } from "./adapters/PostgresAdapter";
import { SQLiteAdapter } from "./adapters/SQLiteAdapter";
import { MySQLAdapter } from "./adapters/MySQLAdapter";
import { CSVExportAdapter } from "./adapters/CSVExportAdapter";
import { EphemeralAdapter } from "./adapters/EphemeralAdapter";
import { BaseAdapter } from "./adapters/BaseAdapter"; // Class
export { CSVExportAdapter } from "./adapters/CSVExportAdapter";
export { SQLiteAdapter } from "./adapters/SQLiteAdapter";
export { EphemeralAdapter } from "./adapters/EphemeralAdapter";
export { DependencyGraph } from "./core/DependencyGraph";
import { logger } from "../utils";
import type {
  TestDataConfig,
  GenerationResult,
  CollectionResult,
  GeneratedDocument,
} from "./types";
export * from "./types";

/**
 * Main service for generating relationship-correct test data.
 * Delegating to the appropriate Database Adapter.
 */
export class TestDataGeneratorService {
  private adapter: BaseAdapter;
  private collectionIdToName: Map<string, string> = new Map();

  constructor(adapter: BaseAdapter) {
    this.adapter = adapter;
  }

  static createAdapter(
    type: DatabaseType,
    encryptedCredentials: string,
    decryptFn: (encrypted: string) => string,
    databaseName?: string,
  ): BaseAdapter {
    switch (type) {
      case "mongodb": {
        const connectionString = decryptFn(encryptedCredentials);
        return new MongoDBAdapter(connectionString, databaseName);
      }
      case "postgresql": {
        const connectionString = decryptFn(encryptedCredentials);
        return new PostgresAdapter(connectionString, databaseName);
      }
      case "firestore":
        return new FirestoreAdapter(encryptedCredentials, decryptFn);
      case "sqlite":
        return new SQLiteAdapter();
      case "mysql":
        return new MySQLAdapter(decryptFn(encryptedCredentials));
      case "csv":
        return new CSVExportAdapter(decryptFn(encryptedCredentials));
      default:
        throw new Error(`Unsupported database type for generation: ${type}`);
    }
  }

  private getFullCollectionName(collection: SchemaCollection): string {
    const dbName = (collection as any).dbName;
    if (dbName) return dbName;

    const { schema, name, id } = collection;

    if (schema && schema !== "public") {
      return `${schema}.${name}`;
    }

    if (id?.includes(".")) {
      return id;
    }

    if (schema === "public") {
      return `public.${name}`;
    }

    return name;
  }

  async generateAndPopulate(
    collections: SchemaCollection[],
    relationships: SchemaRelationship[],
    config: TestDataConfig,
  ): Promise<GenerationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const collectionResults: CollectionResult[] = [];

    let connected = false;

    try {
      await this.adapter.connect();
      connected = true;

      await this.adapter.initialize(
        config,
        collections,
        relationships,
        config.seed,
      );

      this.collectionIdToName.clear();
      for (const col of collections) {
        this.collectionIdToName.set(col.id, this.getFullCollectionName(col));
      }

      const configCollectionNames = new Set(
        config.collections.map((c) => c.collectionName),
      );

      const filteredCollections = collections.filter((col) => {
        const fullName = this.collectionIdToName.get(col.id)!;
        return (
          configCollectionNames.has(col.name) ||
          configCollectionNames.has(fullName)
        );
      });

      const usedCollectionIds = new Set(filteredCollections.map((c) => c.id));

      const filteredRelationships = relationships.filter(
        (rel) =>
          usedCollectionIds.has(rel.fromCollectionId) ||
          usedCollectionIds.has(rel.toCollectionId),
      );

      // Dependency Analysis
      const generationOrder = await this.adapter.buildDependencyOrder(
        filteredCollections,
        filteredRelationships,
      );

      logger.log(
        "Generator",
        `Order: ${generationOrder
          .map((c) => this.collectionIdToName.get(c.id))
          .join(" -> ")}`,
      );

      // Clone schema (effective schema)
      const effectiveSchema = new Map<string, SchemaCollection>();
      for (const col of filteredCollections) {
        const fullName = this.collectionIdToName.get(col.id)!;
        effectiveSchema.set(fullName, JSON.parse(JSON.stringify(col)));
      }

      // Apply relationship metadata
      for (const rel of filteredRelationships) {
        // Handle composite FK
        if (!rel.fromField && rel.fromFields?.length) {
          // process composite — don't skip
          continue;
        }

        if (!rel.fromField) {
          warnings.push(`Relationship skipped: missing fromField...`);
          continue;
        }

        const sourceName = this.collectionIdToName.get(rel.fromCollectionId);
        const targetName = this.collectionIdToName.get(rel.toCollectionId);
        if (!sourceName || !targetName) continue;

        const sourceCol = effectiveSchema.get(sourceName);
        const targetCol = effectiveSchema.get(targetName);
        if (!sourceCol || !targetCol) continue;

        let field = sourceCol.fields.find((f) => f.name === rel.fromField);

        const targetPK =
          targetCol.fields.find((f) => f.isPrimaryKey) ||
          targetCol.fields.find((f) => f.name === "id");

        if (!field) {
          field = {
            id: rel.fromField,
            name: rel.fromField,
            type: targetPK?.type || "string",
            required: false,
          };
          sourceCol.fields.push(field);
        }

        field.isForeignKey = true;
        field.referencedCollectionId = rel.toCollectionId;
        field.foreignKeyTarget = rel.toField || targetPK?.name || "id";

        if (!targetPK) {
          warnings.push(
            `No primary key found on ${targetName}, defaulting to 'id'`,
          );
        }
      }

      // PHASE 1: Ensure Schema
      logger.log("Generator", "======= Phase 1: ensuring schema ====");

      for (const collection of generationOrder) {
        const fullName = this.collectionIdToName.get(collection.id)!;
        const schemaCol = effectiveSchema.get(fullName) || collection;

        const resolvedFields = schemaCol.fields.map((field) =>
          this.resolveForeignKeyField(field, effectiveSchema),
        );

        try {
          await this.adapter.ensureCollection(
            fullName,
            resolvedFields,
            true, // skipForeignKeys
          );
        } catch (err) {
          errors.push(
            `Schema Error ${fullName}: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        }
      }

      // PHASE 2: Generate & Insert
      logger.log("Generator", "<---> Phase 2: generating data ---=====");

      let totalGenerated = 0;
      const totalToGenerate = config.collections.reduce(
        (sum, c) => sum + c.count,
        0,
      );
      const overallStartTime = Date.now();
      let collectionStartTime = Date.now();
      let lastGeneratedCount = 0;

      for (const collection of generationOrder) {
        const fullName = this.collectionIdToName.get(collection.id)!;

        const colConfig = config.collections.find(
          (c) =>
            c.collectionName === collection.name ||
            c.collectionName === fullName,
        );
        if (!colConfig) continue;

        try {
          const schemaCol = effectiveSchema.get(fullName) || collection;

          const allowedReferenceFields = this.getAllowedReferenceFields(
            schemaCol,
            filteredRelationships,
            collection.id,
          );

          // Phase 2: High Engineering - Streaming Batch Output
          const docStream = this.adapter.generateStream(
            schemaCol,
            colConfig.count,
          );

          const ids = await this.adapter.writeBatchStream(
            fullName,
            docStream,
            config.batchSize,
            allowedReferenceFields,
            schemaCol.fields,
          );

          const collectionElapsed = Date.now() - collectionStartTime;
          const collectionTps = ids.length / (collectionElapsed / 1000);
          const overallElapsed = Date.now() - overallStartTime;
          const overallTps = (totalGenerated + ids.length) / (overallElapsed / 1000);
          const avgTps = totalGenerated > 0 ? totalGenerated / (overallElapsed / 1000) : 0;

          logger.log(
            "Generator",
            `Completed ${fullName}: ${ids.length} docs in ${(collectionElapsed / 1000).toFixed(2)}s (${collectionTps.toFixed(0)} TPS)`,
          );

          collectionResults.push({
            collectionName: fullName,
            generatedIds: ids,
            documentCount: ids.length,
            idType: ids.length
              ? typeof ids[0] === "number"
                ? "integer"
                : "string"
              : "string",
          });

          totalGenerated += ids.length;
          lastGeneratedCount = totalGenerated;

          if (config.onProgress) {
            await config.onProgress({
              collectionName: colConfig.collectionName,
              generatedCount: totalGenerated,
              totalCount: totalToGenerate,
              tps: Math.round(avgTps),
              elapsedMs: overallElapsed,
              estimatedRemainingMs: avgTps > 0 ? ((totalToGenerate - totalGenerated) / avgTps) * 1000 : undefined,
            });
          }

          collectionStartTime = Date.now();
        } catch (err) {
          const msg = `Error processing ${fullName}: ${
            err instanceof Error ? err.message : String(err)
          }`;
          logger.log("Generator", msg);
          errors.push(msg);

          collectionResults.push({
            collectionName: fullName,
            documentCount: 0,
            generatedIds: [],
            idType: "string",
          });
        }
      }

      // PHASE 3: Apply Constraints
      logger.log("Generator", "--- Phase 3333333: applying constraints ---");

      for (const collection of generationOrder) {
        const fullName = this.collectionIdToName.get(collection.id)!;
        const schemaCol = effectiveSchema.get(fullName) || collection;

        const resolvedFields = schemaCol.fields.map((field) =>
          this.resolveForeignKeyField(field, effectiveSchema),
        );

        try {
          await this.adapter.addForeignKeyConstraints(fullName, resolvedFields);
        } catch (err) {
          errors.push(
            `Constraint Error ${fullName}: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        }
      }
    } catch (err) {
      errors.push(
        `Fatal error: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      if (connected) {
        await this.adapter.disconnect();
      }
    }

    return {
      success: errors.length === 0,
      collections: collectionResults,
      errors,
      warnings,
      totalDocumentsGenerated: collectionResults.reduce(
        (sum, r) => sum + r.documentCount,
        0,
      ),
    };
  }

  /**
   * Resolves foreign key metadata:
   * - Converts referencedCollectionId from UUID -> full table name
   * - Auto-resolves target PK column if missing
   * - Preserves original field if not a foreign key
   */
  private resolveForeignKeyField(
    field: SchemaField,
    effectiveSchema: Map<string, SchemaCollection>,
  ): SchemaField {
    if (!field.isForeignKey || !field.referencedCollectionId) {
      return field;
    }

    const targetName = this.collectionIdToName.get(
      field.referencedCollectionId,
    );
    if (!targetName) {
      return field;
    }

    let foreignKeyTarget = field.foreignKeyTarget;

    if (!foreignKeyTarget) {
      const targetSchema = effectiveSchema.get(targetName);
      const pkField = targetSchema?.fields.find((f) => f.isPrimaryKey);
      foreignKeyTarget = pkField?.name || "id";
    }

    return {
      ...field,
      referencedCollectionId: targetName,
      foreignKeyTarget,
    };
  }

  /**
   * Computes allowed reference fields for insertion.
   * Includes:
   * - Explicit reference / FK fields in schema
   * - Relationship-defined fromFields
   */
  private getAllowedReferenceFields(
    schemaCol: SchemaCollection,
    relationships: SchemaRelationship[],
    collectionId: string,
  ): Set<string> {
    const allowed = new Set<string>();

    // Schema-defined reference fields
    for (const field of schemaCol.fields) {
      if (field.type === "reference" || field.isForeignKey) {
        allowed.add(field.name);
      }
    }

    // Relationship-defined outgoing references
    for (const rel of relationships) {
      if (rel.fromCollectionId === collectionId && rel.fromField) {
        allowed.add(rel.fromField);
      }
    }

    return allowed;
  }

  // Exposed for factory helpers or simple validation
  public setAdapter(adapter: BaseAdapter) {
    this.adapter = adapter;
  }
}
