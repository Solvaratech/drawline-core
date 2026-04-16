import Redis from "ioredis";
import { BaseAdapter, CollectionDetails } from "./BaseAdapter";
import { SchemaField, SchemaCollection, SchemaRelationship } from "../../types/schemaDesign";
import { logger } from "../../utils";
import type { GeneratedDocument } from "../types";

export class RedisAdapter extends BaseAdapter {
  private client: Redis | null = null;
  private connectionString: string;
  private keyPrefix: string;

  constructor(connectionString: string, keyPrefix?: string) {
    super();
    this.connectionString = connectionString;
    this.keyPrefix = keyPrefix || "drawline";
  }

  async connect(): Promise<void> {
    if (this.client) return;

    try {
      this.client = new Redis(this.connectionString);
      await this.client.ping();
      logger.log("RedisAdapter", "Connected successfully");
    } catch (error) {
      throw new Error(`Failed to connect to Redis: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.client = null;
    }
  }

  private getKey(collectionName: string, id: string | number): string {
    return `${this.keyPrefix}:${collectionName}:${id}`;
  }

  async insertDocuments(
    collectionName: string,
    documents: GeneratedDocument[],
    batchSize: number = 100,
    allowedReferenceFields?: Set<string>,
    schema?: SchemaField[]
  ): Promise<(string | number)[]> {
    if (!this.client) throw new Error("Not connected to Redis");
    if (documents.length === 0) return [];

    const insertedIds: (string | number)[] = [];
    const pipeline = this.client.pipeline();

    for (const doc of documents) {
      const key = this.getKey(collectionName, doc.id);
      pipeline.hset(key, doc.data);
      
      if (doc.id !== undefined && doc.id !== null) {
        insertedIds.push(doc.id);
      }
    }

    await pipeline.exec();
    logger.log("RedisAdapter", `Inserted ${documents.length} items into ${collectionName}`);
    return insertedIds;
  }

  async clearCollection(collectionName: string): Promise<void> {
    if (!this.client) throw new Error("Not connected to Redis");

    const pattern = `${this.keyPrefix}:${collectionName}:*`;
    const keys = await this.client.keys(pattern);

    if (keys.length > 0) {
      await this.client.del(...keys);
    }

    logger.log("RedisAdapter", `Cleared ${keys.length} items from ${collectionName}`);
  }

  async collectionExists(collectionName: string): Promise<boolean> {
    if (!this.client) throw new Error("Not connected to Redis");

    const pattern = `${this.keyPrefix}:${collectionName}:*`;
    const keys = await this.client.keys(pattern);
    return keys.length > 0;
  }

  async ensureCollection(collectionName: string, schema?: SchemaField[], skipForeignKeys?: boolean): Promise<void> {
    logger.log("RedisAdapter", `Using collection: ${collectionName}`);
  }

  async getCollectionDetails(collectionName: string): Promise<CollectionDetails> {
    if (!this.client) throw new Error("Not connected to Redis");

    const pattern = `${this.keyPrefix}:${collectionName}:*`;
    const keys = await this.client.keys(pattern);

    return {
      primaryKey: "id",
      primaryKeyType: "string",
      startId: keys.length > 0 ? keys.length : 0,
    };
  }

  async getDocumentCount(collectionName: string): Promise<number> {
    if (!this.client) throw new Error("Not connected to Redis");

    const pattern = `${this.keyPrefix}:${collectionName}:*`;
    const keys = await this.client.keys(pattern);
    return keys.length;
  }

  async validateReference(collectionName: string, fieldName: string, value: unknown): Promise<boolean> {
    if (!this.client) throw new Error("Not connected to Redis");

    const pattern = `${this.keyPrefix}:${collectionName}:*`;
    const keys = await this.client.keys(pattern);

    for (const key of keys) {
      const fieldValue = await this.client.hget(key, fieldName);
      if (fieldValue === String(value)) {
        return true;
      }
    }

    return false;
  }

  async addForeignKeyConstraints(collectionName: string, schema: SchemaField[]): Promise<void> {
    logger.log("RedisAdapter", "Foreign key constraints not applicable");
  }

  async buildDependencyOrder(collections: SchemaCollection[], relationships: SchemaRelationship[]): Promise<SchemaCollection[]> {
    return collections;
  }

  async getCollectionSchema(collectionName: string): Promise<SchemaField[]> {
    return [];
  }
}