import { DynamoDBClient, DescribeTableCommand, CreateTableCommand, DeleteTableCommand } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, ScanCommand, DeleteCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { BaseAdapter, CollectionDetails } from "./BaseAdapter";
import { SchemaField, SchemaCollection, SchemaRelationship } from "../../types/schemaDesign";
import { logger } from "../../utils";
import type { GeneratedDocument } from "../types";
import type { PutCommandInput, ScanCommandInput } from "@aws-sdk/lib-dynamodb";

interface DynamoDBCollectionDetails extends CollectionDetails {
  tableStatus?: string;
  keySchema?: Array<{ AttributeName: string; KeyType: string }>;
}

export class DynamoDBAdapter extends BaseAdapter {
  private client: DynamoDBClient | null = null;
  private docClient: DynamoDBDocumentClient | null = null;
  private connectionString: string;
  private tableNamePrefix: string;
  private region: string;
  private detailsCache: Map<string, DynamoDBCollectionDetails> = new Map();

  constructor(connectionString: string, tableNamePrefix?: string) {
    super();
    this.connectionString = connectionString;
    this.tableNamePrefix = tableNamePrefix || "drawline";
    
    try {
      const url = new URL(connectionString);
      this.region = url.hostname.split(".")[0] || "us-east-1";
    } catch {
      this.region = "us-east-1";
    }
  }

  private getClientConfig() {
    try {
      const url = new URL(this.connectionString);
      const endpoint = url.origin;
      return {
        region: this.region,
        endpoint,
        tls: url.protocol === "https:",
        credentials: {
          accessKeyId: url.username || process.env.AWS_ACCESS_KEY_ID || "local",
          secretAccessKey: url.password || process.env.AWS_SECRET_ACCESS_KEY || "local",
        },
      };
    } catch {
      return {
        region: this.region,
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID || "local",
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "local",
        },
      };
    }
  }

  async connect(): Promise<void> {
    if (this.client) return;

    const config = this.getClientConfig();

    try {
      this.client = new DynamoDBClient(config);
      this.docClient = DynamoDBDocumentClient.from(this.client, {
        marshallOptions: {
          removeUndefinedValues: true,
        },
      });
      
      logger.log("DynamoDBAdapter", "Connected successfully");
    } catch (error) {
      throw new Error(`Failed to connect to DynamoDB: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      this.client = null;
      this.docClient = null;
    }
    this.detailsCache.clear();
  }

  async insertDocuments(
    collectionName: string,
    documents: GeneratedDocument[],
    batchSize: number = 25,
    allowedReferenceFields?: Set<string>,
    schema?: SchemaField[]
  ): Promise<(string | number)[]> {
    if (!this.docClient) throw new Error("Not connected to DynamoDB");
    if (documents.length === 0) return [];

    const tableName = `${this.tableNamePrefix}_${collectionName}`;
    const insertedIds: (string | number)[] = [];

    logger.log("DynamoDBAdapter", `Inserting ${documents.length} items into ${tableName}`);

    for (let i = 0; i < documents.length; i += batchSize) {
      const batch = documents.slice(i, i + batchSize);
      
      for (const doc of batch) {
        try {
          const item: Record<string, unknown> = { ...doc.data };
          
          if (doc.id !== undefined && doc.id !== null) {
            item._id = doc.id;
          }
          
          const input: PutCommandInput = {
            TableName: tableName,
            Item: item as Record<string, any>,
          };
          
          await this.docClient.send(new PutCommand(input));
          
          if (doc.id !== undefined && doc.id !== null) {
            insertedIds.push(doc.id);
          }
        } catch (error) {
          logger.error("DynamoDBAdapter", `Insert failed for doc:`, error);
        }
      }
    }

    logger.log("DynamoDBAdapter", `Inserted ${insertedIds.length} items`);
    return insertedIds;
  }

  async clearCollection(collectionName: string): Promise<void> {
    if (!this.docClient) throw new Error("Not connected to DynamoDB");

    const tableName = `${this.tableNamePrefix}_${collectionName}`;

    try {
      let lastEvaluatedKey: Record<string, any> | undefined;
      
      do {
        const scanParams: ScanCommandInput = {
          TableName: tableName,
          ExclusiveStartKey: lastEvaluatedKey,
        };
        
        const result = await this.docClient.send(new ScanCommand(scanParams));
        
        if (result.Items && result.Items.length > 0) {
          for (const item of result.Items) {
            const key: Record<string, any> = {};
            if (item._id) {
              key._id = item._id;
            } else {
              const keys = Object.keys(item).slice(0, 2);
              for (const k of keys) {
                key[k] = item[k];
              }
            }
            
            await this.docClient.send(new DeleteCommand({
              TableName: tableName,
              Key: key,
            }));
          }
        }
        
        lastEvaluatedKey = result.LastEvaluatedKey;
      } while (lastEvaluatedKey);
      
      logger.log("DynamoDBAdapter", `Cleared table ${tableName}`);
    } catch (error) {
      logger.error("DynamoDBAdapter", `Failed to clear table:`, error);
    }
  }

  async collectionExists(collectionName: string): Promise<boolean> {
    if (!this.client) throw new Error("Not connected to DynamoDB");

    const tableName = `${this.tableNamePrefix}_${collectionName}`;

    try {
      await this.client.send(new DescribeTableCommand({ TableName: tableName }));
      return true;
    } catch {
      return false;
    }
  }

  async ensureCollection(
    collectionName: string,
    schema?: SchemaField[],
    skipForeignKeys?: boolean
  ): Promise<void> {
    if (!this.client) throw new Error("Not connected to DynamoDB");

    const tableName = `${this.tableNamePrefix}_${collectionName}`;

    try {
      await this.client.send(new DescribeTableCommand({ TableName: tableName }));
      logger.log("DynamoDBAdapter", `Table ${tableName} already exists`);
      return;
    } catch {
    }

    const pkField = schema?.find(f => f.isPrimaryKey);
    const keySchema: Array<{ AttributeName: string; KeyType: "HASH" | "RANGE" }> = [
      { AttributeName: pkField?.name || "_id", KeyType: "HASH" },
    ];
    
    const attributeDefinitions: Array<{ AttributeName: string; AttributeType: "S" | "N" | "B" }> = [
      { AttributeName: pkField?.name || "_id", AttributeType: "S" },
    ];

    const sortKeyField = schema?.find(f => f.compositePrimaryKeyIndex === 1);
    if (sortKeyField) {
      keySchema.push({ AttributeName: sortKeyField.name, KeyType: "RANGE" });
      attributeDefinitions.push({
        AttributeName: sortKeyField.name,
        AttributeType: "S",
      });
    }

    const createParams = {
      TableName: tableName,
      KeySchema: keySchema,
      AttributeDefinitions: attributeDefinitions,
      BillingMode: "PAY_PER_REQUEST" as const,
    };

    try {
      await this.client.send(new CreateTableCommand(createParams));
      logger.log("DynamoDBAdapter", `Created table ${tableName}`);
    } catch (error) {
      logger.error("DynamoDBAdapter", `Failed to create table:`, error);
      throw error;
    }
  }

  private getDynamoDBType(type: string): "S" | "N" | "B" {
    const typeMap: Record<string, "S" | "N" | "B"> = {
      string: "S",
      integer: "N",
      number: "N",
      boolean: "S",
      date: "S",
      uuid: "S",
      objectid: "S",
      json: "S",
    };
    return typeMap[type] || "S";
  }

  async getCollectionDetails(collectionName: string): Promise<CollectionDetails> {
    if (this.detailsCache.has(collectionName)) {
      return this.detailsCache.get(collectionName)!;
    }

    if (!this.client) throw new Error("Not connected to DynamoDB");

    const tableName = `${this.tableNamePrefix}_${collectionName}`;

    try {
      const result = await this.client.send(new DescribeTableCommand({ TableName: tableName }));
      const table = result.Table;
      
      if (!table) {
        return { primaryKey: "_id", primaryKeyType: "string" };
      }

      const keySchema = table.KeySchema || [];
      const hashKey = keySchema.find(k => k.KeyType === "HASH");
      const rangeKey = keySchema.find(k => k.KeyType === "RANGE");

      const details: DynamoDBCollectionDetails = {
        primaryKey: hashKey?.AttributeName || "_id",
        primaryKeyType: "string",
        tableStatus: table.TableStatus,
        keySchema: keySchema as any,
      };

      if (rangeKey) {
        details.isCompositePK = true;
        details.primaryKeys = [hashKey?.AttributeName || "_id", rangeKey.AttributeName || "_sk"];
        details.primaryKeyTypes = ["string", "string"];
      }

      this.detailsCache.set(collectionName, details);
      return details;
    } catch {
      return { primaryKey: "_id", primaryKeyType: "string" };
    }
  }

  async getDocumentCount(collectionName: string): Promise<number> {
    if (!this.docClient) throw new Error("Not connected to DynamoDB");

    const tableName = `${this.tableNamePrefix}_${collectionName}`;

    try {
      const result = await this.docClient.send(new ScanCommand({
        TableName: tableName,
        Select: "COUNT",
      }));
      
      return result.Count || 0;
    } catch (error) {
      logger.error("DynamoDBAdapter", `Failed to get count:`, error);
      return 0;
    }
  }

  async validateReference(
    collectionName: string,
    fieldName: string,
    value: unknown
  ): Promise<boolean> {
    if (!this.docClient) throw new Error("Not connected to DynamoDB");

    const tableName = `${this.tableNamePrefix}_${collectionName}`;

    try {
      const details = await this.getCollectionDetails(collectionName);
      const pk = details.primaryKey || "_id";
      
      const result = await this.docClient.send(new ScanCommand({
        TableName: tableName,
        FilterExpression: `${pk} = :value`,
        ExpressionAttributeValues: {
          ":value": value,
        },
        Limit: 1,
      }));
      
      return (result.Count || 0) > 0;
    } catch {
      return false;
    }
  }

  async addForeignKeyConstraints(
    collectionName: string,
    schema: SchemaField[]
  ): Promise<void> {
    logger.log("DynamoDBAdapter", "Foreign key constraints not applicable to DynamoDB");
  }

  async buildDependencyOrder(
    collections: SchemaCollection[],
    relationships: SchemaRelationship[]
  ): Promise<SchemaCollection[]> {
    return collections;
  }

  async getCollectionSchema(collectionName: string): Promise<SchemaField[]> {
    return [];
  }
}
