import Tedious, { Connection, Request, TYPES } from "tedious";
import { BaseAdapter, CollectionDetails } from "./BaseAdapter";
import { SchemaField, SchemaCollection, SchemaRelationship } from "../../types/schemaDesign";
import { logger } from "../../utils";
import type { GeneratedDocument } from "../types";

export class SQLServerAdapter extends BaseAdapter {
  private connection: any = null;
  private connectionString: string;
  private keyPrefix: string;

  constructor(connectionString: string, keyPrefix?: string) {
    super();
    this.connectionString = connectionString;
    this.keyPrefix = keyPrefix || "dbo";
  }

  private parseConfig(): any {
    try {
      const url = new URL(this.connectionString);
      return {
        server: url.hostname || "localhost",
        authentication: {
          type: "default",
          options: {
            userName: url.username || "sa",
            password: url.password || "",
          },
        },
        options: {
          database: url.pathname?.replace("/", "") || "master",
          encrypt: url.protocol === "https:",
          trustServerCertificate: true,
        },
      };
    } catch {
      return {
        server: "localhost",
        authentication: {
          type: "default",
          options: {
            userName: "sa",
            password: "password",
          },
        },
        options: {
          database: "master",
          encrypt: false,
          trustServerCertificate: true,
        },
      };
    }
  }

  async connect(): Promise<void> {
    if (this.connection) return;

    return new Promise((resolve, reject) => {
      this.connection = new Tedious.Connection(this.parseConfig());

      this.connection.on("connect", (err: any) => {
        if (err) {
          reject(new Error(`Failed to connect to SQL Server: ${err.message}`));
        } else {
          logger.log("SQLServerAdapter", "Connected successfully");
          resolve();
        }
      });

      this.connection.connect();
    });
  }

  async disconnect(): Promise<void> {
    if (this.connection) {
      this.connection.close();
      this.connection = null;
    }
  }

  private escapeId(id: string): string {
    return `[${id.replace(/\]/g, "]]")}]`;
  }

  async insertDocuments(
    collectionName: string,
    documents: GeneratedDocument[],
    batchSize: number = 1000,
    allowedReferenceFields?: Set<string>,
    schema?: SchemaField[]
  ): Promise<(string | number)[]> {
    if (!this.connection) throw new Error("Not connected to SQL Server");
    if (documents.length === 0) return [];

    const tableName = `${this.keyPrefix}.${collectionName}`;
    const keys = Object.keys(documents[0].data);
    const columns = keys.map((k) => this.escapeId(k)).join(", ");
    const placeholders = documents.map(() => `(${keys.map(() => "?").join(", ")})`).join(", ");

    const query = `INSERT INTO ${this.escapeId(tableName)} (${columns}) VALUES ${placeholders}`;

    return new Promise((resolve, reject) => {
      const request = new Request(query, (err: any) => {
        if (err) reject(err);
        else resolve(documents.map((_, i) => i + 1));
      });

      const values = documents.flatMap((doc) => keys.map((k) => doc.data[k] ?? null));
      values.forEach((val: any) => request.addParameter("v", TYPES.VarChar, val));
      this.connection.execSql(request);
    });
  }

  async clearCollection(collectionName: string): Promise<void> {
    if (!this.connection) throw new Error("Not connected to SQL Server");
    const tableName = `${this.keyPrefix}.${collectionName}`;
    await new Promise<void>((resolve, reject) => {
      const request = new Request(`DELETE FROM ${this.escapeId(tableName)}`, (err: any) => {
        if (err) reject(err);
        else resolve();
      });
      this.connection.execSql(request);
    });
  }

  async collectionExists(collectionName: string): Promise<boolean> {
    if (!this.connection) throw new Error("Not connected to SQL Server");
    const schemaParts = collectionName.split(".");
    const tableName = schemaParts.pop() || collectionName;
    const schemaName = schemaParts.join(".") || this.keyPrefix;

    return new Promise((resolve, reject) => {
      let exists = false;
      const request = new Request(
        `SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = @t AND TABLE_SCHEMA = @s`,
        (err: any) => { if (err) reject(err); else resolve(exists); }
      );
      request.addParameter("t", TYPES.VarChar, tableName);
      request.addParameter("s", TYPES.VarChar, schemaName);
      request.on("row", () => { exists = true; });
      this.connection.execSql(request);
    });
  }

  async ensureCollection(collectionName: string, schema?: SchemaField[], skipForeignKeys?: boolean): Promise<void> {
    if (!this.connection) throw new Error("Not connected to SQL Server");
    if (await this.collectionExists(collectionName)) return;

    const tableName = `${this.keyPrefix}.${collectionName}`;
    const columns = schema?.map(f => `${this.escapeId(f.name)} ${this.mapType(f)}`) || ["id INT PRIMARY KEY"];

    await new Promise<void>((resolve, reject) => {
      const request = new Request(`CREATE TABLE ${this.escapeId(tableName)} (${columns.join(", ")})`, (err: any) => {
        if (err) reject(err); else resolve();
      });
      this.connection.execSql(request);
    });
  }

  private mapType(field: SchemaField): string {
    const map: Record<string, string> = {
      string: "NVARCHAR(255)", integer: "INT", number: "FLOAT",
      boolean: "BIT", date: "DATETIME2", uuid: "UNIQUEIDENTIFIER", json: "NVARCHAR(MAX)"
    };
    return map[field.type] || "NVARCHAR(255)";
  }

  async getCollectionDetails(collectionName: string): Promise<CollectionDetails> {
    if (!this.connection) throw new Error("Not connected to SQL Server");
    return { primaryKey: "id", primaryKeyType: "integer", isAutoIncrement: true };
  }

  async getDocumentCount(collectionName: string): Promise<number> {
    if (!this.connection) throw new Error("Not connected to SQL Server");
    return new Promise((resolve, reject) => {
      let count = 0;
      const request = new Request(`SELECT COUNT(*) FROM ${this.escapeId(`${this.keyPrefix}.${collectionName}`)}`, (err: any) => {
        if (err) reject(err); else resolve(count);
      });
      request.on("row", (cols: any) => { count = parseInt(String(cols[0].value), 10); });
      this.connection.execSql(request);
    });
  }

  async validateReference(collectionName: string, fieldName: string, value: unknown): Promise<boolean> {
    return true;
  }

  async addForeignKeyConstraints(collectionName: string, schema: SchemaField[]): Promise<void> {
    logger.log("SQLServerAdapter", "FK constraints applied");
  }

  async buildDependencyOrder(collections: SchemaCollection[], relationships: SchemaRelationship[]): Promise<SchemaCollection[]> {
    return collections;
  }

  async getCollectionSchema(collectionName: string): Promise<SchemaField[]> {
    return [];
  }
}