import mysql from 'mysql2/promise';
import { BaseAdapter, CollectionDetails } from './BaseAdapter';
import type { SchemaField } from '../../types/schemaDesign';

interface LocalCollectionDetails {
  fields: {
    name: string;
    type: string;
    nullable: boolean;
    default: any;
    key: string;
  }[];
}

export class MySQLAdapter extends BaseAdapter {
  private connection: mysql.Connection | null = null;
  private config: mysql.ConnectionOptions | string;

  constructor(config: mysql.ConnectionOptions | string) {
    super();
    this.config = config;
  }

  private escapeIdentifier(id: string): string {
    const escaped = '`' + id.replace(/`/g, '``') + '`';
    console.log("escapeIdentifier:", { id, escaped });
    return escaped;
  }

  async connect(config?: mysql.ConnectionOptions): Promise<void> {
    const finalConfig = config || this.config;
    if (!finalConfig) throw new Error('Connection config is required');
    try {
      this.connection = await mysql.createConnection(finalConfig as any);
      console.log("Connection established successfully.");
    } catch (error) {
      console.error("Error in connect:", error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.connection) {
      await this.connection.end();
      this.connection = null;
    }
  }

  async getCollections(): Promise<string[]> {
    if (!this.connection) throw new Error('Not connected');
    const [rows] = await this.connection.query('SHOW TABLES');
    return (rows as any[]).map((row) => Object.values(row)[0] as string);
  }

  async collectionExists(collection: string): Promise<boolean> {
    if (!this.connection) {
      throw new Error("Not connected to MySQL");
    }

    try {
      const [rows] = await this.connection.query(
        "SELECT TABLE_NAME FROM information_schema.tables WHERE TABLE_NAME = ? AND TABLE_SCHEMA = DATABASE()",
        [collection]
      );
      return (rows as any[]).length > 0;
    } catch (error: any) {
      if (error.message.includes("ER_NO_SUCH_TABLE")) {
        return false;
      }
      throw new Error(`Failed to check table existence: ${error.message}`);
    }
  }

  async getDocumentCount(collection: string): Promise<number> {
    if (!this.connection) {
      throw new Error("Not connected to MySQL");
    }

    if (!(await this.collectionExists(collection))) {
      throw new Error("ER_NO_SUCH_TABLE: Table does not exist");
    }

    const escapedCollection = this.escapeIdentifier(collection);
    const [rows] = await this.connection.query(
      `SELECT COUNT(*) as count FROM ${escapedCollection}`
    );
    return (rows as any[])[0]?.count || 0;
  }

  async insertDocuments(
    collectionName: string,
    documents: Record<string, any>[],
    batchSize?: number,
    allowedReferenceFields?: Set<string>,
    schema?: SchemaField[],
  ): Promise<(string | number)[]> {
    if (!this.connection) throw new Error("Not connected to MySQL");

    if (!documents || documents.length === 0) {
      return [];
    }

    if (!(await this.collectionExists(collectionName))) {
      throw new Error("ER_NO_SUCH_TABLE: Table does not exist");
    }

    const escapedCollection = this.escapeIdentifier(collectionName);

    try {
      const keys = Object.keys(documents[0]);
      const columns = keys.map(this.escapeIdentifier).join(", ");
      const placeholders = documents.map(() => `(${keys.map(() => "?").join(", ")})`).join(", ");
      const values = documents.flatMap((doc) => keys.map(k => doc[k]));

      const query = `INSERT INTO ${escapedCollection} (${columns}) VALUES ${placeholders}`;
      const [result] = await this.connection.query(query, values);
      
      const insertId = (result as any).insertId;
      if (insertId !== undefined) {
        return documents.map((_, index) => insertId + index); 
      }
      return documents.map((_, index) => index + 1); // Fallback
    } catch (error: any) {
      if (error.message && error.message.includes("ER_NO_SUCH_TABLE")) {
        throw new Error("ER_NO_SUCH_TABLE: Table does not exist");
      }
      throw new Error(`Failed to insert documents: ${error.message}`);
    }
  }

  async ensureCollection(collectionName: string, schema: SchemaField[]): Promise<void> {
    if (!this.connection) throw new Error("Not connected to MySQL");

    const escapedCollectionName = this.escapeIdentifier(collectionName);
    const columns = schema.map((field) => {
      const escapedField = this.escapeIdentifier(field.name);
      const type = field.rawType || "VARCHAR(255)";
      const constraints = [
        field.isPrimaryKey ? "PRIMARY KEY" : "",
        field.required ? "NOT NULL" : "",
        field.defaultValue !== undefined ? `DEFAULT '${String(field.defaultValue).replace(/'/g, "''")}'` : "",
      ].filter(Boolean).join(" ");
      return `${escapedField} ${type} ${constraints}`;
    }).join(", ");

    const query = `CREATE TABLE IF NOT EXISTS ${escapedCollectionName} (${columns})`;
    await this.connection.query(query);
  }

  async clearCollection(collection: string): Promise<void> {
    if (!this.connection) throw new Error("Not connected to MySQL");

    const escapedCollection = this.escapeIdentifier(collection);
    const query = `DELETE FROM ${escapedCollection}`;
    await this.connection.query(query);
  }

  async getCollectionDetails(collection: string): Promise<CollectionDetails> {
    if (!this.connection) throw new Error("Not connected to MySQL");

    if (!(await this.collectionExists(collection))) {
      throw new Error("ER_NO_SUCH_TABLE: Table does not exist");
    }

    const escapedCollection = this.escapeIdentifier(collection);
    const query = `DESCRIBE ${escapedCollection}`;
    const [rows] = await this.connection.query(query);

    const resultRows = rows as any[];
    const pkRows = resultRows.filter((r) => r.Key === "PRI");

    if (pkRows.length === 0) {
      return {
        primaryKey: "id",
        primaryKeyType: "string",
        isCompositePK: false
      };
    }

    if (pkRows.length === 1) {
      const typeStr = pkRows[0].Type.toLowerCase();
      let type: "string" | "integer" | "number" | "uuid" = "string";
      if (typeStr.includes("int")) type = "integer";
      else if (typeStr.includes("decimal") || typeStr.includes("float") || typeStr.includes("double")) type = "number";

      return {
        primaryKey: pkRows[0].Field,
        primaryKeyType: type,
        isCompositePK: false
      };
    }

    return {
      primaryKeys: pkRows.map(r => r.Field),
      primaryKeyTypes: pkRows.map(r => {
        const typeStr = r.Type.toLowerCase();
        if (typeStr.includes("int")) return "integer";
        if (typeStr.includes("decimal") || typeStr.includes("float") || typeStr.includes("double")) return "number";
        return "string";
      }),
      isCompositePK: true
    };
  }

  async getCollectionSchema(collection: string): Promise<SchemaField[]> {
    if (!this.connection) throw new Error("Not connected to MySQL");

    const escapedCollection = this.escapeIdentifier(collection);
    const query = `DESCRIBE ${escapedCollection}`;
    const [rows] = await this.connection.query(query);

    return (rows as any[]).map((row: any) => ({
      id: row.Field,
      name: row.Field,
      type: "string", // Default to string for now
      rawType: row.Type,
      nullable: row.Null === "YES",
      defaultValue: row.Default,
      isPrimaryKey: row.Key === "PRI",
    }));
  }

  async validateReference(collectionName: string, fieldName: string, value: unknown): Promise<boolean> {
    if (!this.connection) throw new Error('Not connected');
    const escapedCollectionName = this.escapeIdentifier(collectionName);
    const escapedFieldName = this.escapeIdentifier(fieldName);
    const [rows] = await this.connection.query(
      `SELECT COUNT(*) as count FROM ${escapedCollectionName} WHERE ${escapedFieldName} = ?`,
      [value]
    );
    return (rows as any[])[0].count > 0;
  }

  async addForeignKeyConstraints(collectionName: string, schema: SchemaField[]): Promise<void> {
    if (!this.connection) throw new Error("Not connected to MySQL");

    const fkFields = schema.filter(
      (f) => f.isForeignKey && f.referencedCollectionId
    );
    if (fkFields.length === 0) return;

    const compositeFKGroups = new Map<string, SchemaField[]>();
    const singleFKFields: SchemaField[] = [];

    fkFields.forEach((field) => {
      if (field.compositeKeyGroup) {
        if (!compositeFKGroups.has(field.compositeKeyGroup)) {
          compositeFKGroups.set(field.compositeKeyGroup, []);
        }
        compositeFKGroups.get(field.compositeKeyGroup)!.push(field);
      } else {
        singleFKFields.push(field);
      }
    });

    for (const field of singleFKFields) {
      const escapedCollectionName = this.escapeIdentifier(collectionName);
      const escapedFieldName = this.escapeIdentifier(field.name);
      const escapedRefTable = this.escapeIdentifier(field.referencedCollectionId!);
      const escapedRefColumn = this.escapeIdentifier(field.foreignKeyTarget || "id");
      const constraintName = this.escapeIdentifier(`fk_${collectionName}_${field.name}`);

      const query = `
        ALTER TABLE ${escapedCollectionName}
        ADD CONSTRAINT ${constraintName}
        FOREIGN KEY (${escapedFieldName})
        REFERENCES ${escapedRefTable} (${escapedRefColumn})
        ON DELETE SET NULL;
      `;
      await this.connection.query(query);
    }

    for (const [groupName, fields] of compositeFKGroups) {
      const escapedCollectionName = this.escapeIdentifier(collectionName);
      const escapedRefTable = this.escapeIdentifier(fields[0].referencedCollectionId!);
      const localCols = fields.map((f) => this.escapeIdentifier(f.name)).join(", ");
      const remoteCols = fields
        .map((f) => this.escapeIdentifier(f.foreignKeyTarget || "id"))
        .join(", ");
      const constraintName = this.escapeIdentifier(`fk_${collectionName}_${groupName}`);

      const query = `
        ALTER TABLE ${escapedCollectionName}
        ADD CONSTRAINT ${constraintName}
        FOREIGN KEY (${localCols})
        REFERENCES ${escapedRefTable} (${remoteCols})
        ON DELETE SET NULL;
      `;
      await this.connection.query(query);
    }
  }
}