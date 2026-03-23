import Database from 'better-sqlite3';
import { BaseAdapter, CollectionDetails } from './BaseAdapter';
import type { SchemaField } from '../../types/schemaDesign';

export class SQLiteAdapter extends BaseAdapter {
  private db: Database.Database | null = null;

  // SQLite uses double quotes for schema identifiers
  private escapeIdentifier(id: string): string {
    return '"' + id.replace(/"/g, '""') + '"';
  }

  async connect(config?: { filename?: string }): Promise<void> {
    const filename = config?.filename || ':memory:';
    try {
      this.db = new Database(filename);
    } catch (error: any) {
      throw new Error(`Failed to connect to SQLite: ${error.message}`);
    }
  }

  async disconnect(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  async getCollections(): Promise<string[]> {
    if (!this.db) throw new Error("Not connected to SQLite");
    const stmt = this.db.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name NOT LIKE 'sqlite_%'
    `);
    const rows = stmt.all() as { name: string }[];
    return rows.map((row) => row.name);
  }

  async collectionExists(collection: string): Promise<boolean> {
    if (!this.db) throw new Error("Not connected to SQLite");
    const stmt = this.db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name = ?`);
    const row = stmt.get(collection);
    return !!row;
  }

  async getDocumentCount(collection: string): Promise<number> {
    if (!this.db) throw new Error("Not connected to SQLite");
    if (!(await this.collectionExists(collection))) {
      throw new Error("Table does not exist");
    }

    const escapedCollection = this.escapeIdentifier(collection);
    const stmt = this.db.prepare(`SELECT COUNT(*) as count FROM ${escapedCollection}`);
    const result = stmt.get() as { count: number };
    return result.count;
  }

  async insertDocuments(
    collectionName: string,
    documents: Record<string, any>[],
    batchSize?: number,
    allowedReferenceFields?: Set<string>,
    schema?: SchemaField[],
  ): Promise<(string | number)[]> {
    if (!this.db) throw new Error("Not connected to SQLite");
    if (!documents || documents.length === 0) return [];
    if (!(await this.collectionExists(collectionName))) {
      throw new Error("Table does not exist");
    }

    const escapedCollection = this.escapeIdentifier(collectionName);
    const keys = Object.keys(documents[0]);
    const columns = keys.map(this.escapeIdentifier).join(", ");
    const placeholders = keys.map(() => "?").join(", ");
    
    // Use a transaction for bulk inserts ensuring speed & safety
    const insertMany = this.db.transaction((docs: Record<string, any>[]) => {
      const stmt = this.db!.prepare(`INSERT INTO ${escapedCollection} (${columns}) VALUES (${placeholders})`);
      const ids: (string | number)[] = [];
      for (const doc of docs) {
        const values = keys.map(k => doc[k]);
        const info = stmt.run(values);
        ids.push(Number(info.lastInsertRowid));
      }
      return ids;
    });

    try {
      return insertMany(documents);
    } catch (error: any) {
      throw new Error(`Failed to insert documents: ${error.message}`);
    }
  }

  async ensureCollection(collectionName: string, schema: SchemaField[]): Promise<void> {
    if (!this.db) throw new Error("Not connected to SQLite");

    const escapedCollectionName = this.escapeIdentifier(collectionName);
    const columns = schema.map((field) => {
      const escapedField = this.escapeIdentifier(field.name);
      
      // Map generic types to SQLite types
      let type = "TEXT";
      if (field.rawType) {
        type = field.rawType;
      } else if (field.type === "number") {
        type = "REAL";
      } else if (field.type === "boolean") {
        type = "INTEGER"; // SQLite uses 0/1 for booleans
      }

      const constraints = [
        field.isPrimaryKey ? "PRIMARY KEY" : "",
        field.required ? "NOT NULL" : "",
        field.defaultValue !== undefined ? `DEFAULT '${String(field.defaultValue).replace(/'/g, "''")}'` : "",
      ].filter(Boolean).join(" ");
      
      return `${escapedField} ${type} ${constraints}`;
    });

    const fkConstraints: string[] = [];
    
    // Single foreign keys
    const singleFKs = schema.filter(f => f.isForeignKey && f.referencedCollectionId && !f.compositeKeyGroup);
    for (const field of singleFKs) {
      const escapedField = this.escapeIdentifier(field.name);
      const escapedRefTable = this.escapeIdentifier(field.referencedCollectionId!);
      const escapedRefField = this.escapeIdentifier(field.foreignKeyTarget || 'id');
      fkConstraints.push(`FOREIGN KEY (${escapedField}) REFERENCES ${escapedRefTable} (${escapedRefField})`);
    }

    // Composite foreign keys
    const compositeFKGroups = new Map<string, SchemaField[]>();
    schema.filter(f => f.isForeignKey && f.referencedCollectionId && f.compositeKeyGroup).forEach(field => {
      if (!compositeFKGroups.has(field.compositeKeyGroup!)) {
        compositeFKGroups.set(field.compositeKeyGroup!, []);
      }
      compositeFKGroups.get(field.compositeKeyGroup!)!.push(field);
    });

    // Generate constraints for composite groups
    for (const fields of compositeFKGroups.values()) {
      const escapedLocalFields = fields.map(f => this.escapeIdentifier(f.name)).join(', ');
      const escapedRefTable = this.escapeIdentifier(fields[0].referencedCollectionId!);
      const escapedRefFields = fields.map(f => this.escapeIdentifier(f.foreignKeyTarget || 'id')).join(', ');
      fkConstraints.push(`FOREIGN KEY (${escapedLocalFields}) REFERENCES ${escapedRefTable} (${escapedRefFields})`);
    }

    // Combine standard columns and constraint definitions
    const allDefs = [...columns, ...fkConstraints].join(", ");

    const query = `CREATE TABLE IF NOT EXISTS ${escapedCollectionName} (${allDefs})`;
    this.db.exec(query);
  }

  async clearCollection(collection: string): Promise<void> {
    if (!this.db) throw new Error("Not connected to SQLite");
    const escapedCollection = this.escapeIdentifier(collection);
    try {
      this.db.exec(`DELETE FROM ${escapedCollection}`);
    } catch (error: any) {
      if (!error.message.includes("no such table")) {
        throw error;
      }
    }
  }

  async getCollectionDetails(collection: string): Promise<CollectionDetails> {
    if (!this.db) throw new Error("Not connected to SQLite");
    if (!(await this.collectionExists(collection))) {
      throw new Error("Table does not exist");
    }

    const escapedCollection = this.escapeIdentifier(collection);
    const stmt = this.db.prepare(`PRAGMA table_info(${escapedCollection})`);
    const rows = stmt.all() as any[];

    const pkRows = rows.filter((r) => r.pk > 0).sort((a, b) => a.pk - b.pk);

    if (pkRows.length === 0) {
      return {
        primaryKey: "id",
        primaryKeyType: "string",
        isCompositePK: false
      };
    }

    if (pkRows.length === 1) {
      const typeStr = pkRows[0].type.toLowerCase();
      let type: "string" | "integer" | "number" | "uuid" = "string";
      if (typeStr.includes("int")) type = "integer";
      else if (typeStr.includes("real") || typeStr.includes("numeric")) type = "number";

      return {
        primaryKey: pkRows[0].name,
        primaryKeyType: type,
        isCompositePK: false
      };
    }

    return {
      primaryKeys: pkRows.map(r => r.name),
      primaryKeyTypes: pkRows.map(r => {
        const typeStr = r.type.toLowerCase();
        if (typeStr.includes("int")) return "integer";
        if (typeStr.includes("real") || typeStr.includes("numeric")) return "number";
        return "string";
      }),
      isCompositePK: true
    };
  }

  async getCollectionSchema(collection: string): Promise<SchemaField[]> {
    if (!this.db) throw new Error("Not connected to SQLite");
    if (!(await this.collectionExists(collection))) {
      throw new Error("Table does not exist");
    }

    const escapedCollection = this.escapeIdentifier(collection);
    const stmt = this.db.prepare(`PRAGMA table_info(${escapedCollection})`);
    const rows = stmt.all() as any[];

    return rows.map((row) => ({
      id: row.name,
      name: row.name,
      type: "string", 
      rawType: row.type,
      nullable: row.notnull === 0,
      defaultValue: row.dflt_value,
      isPrimaryKey: row.pk > 0,
    }));
  }

  async validateReference(collectionName: string, fieldName: string, value: unknown): Promise<boolean> {
    if (!this.db) throw new Error("Not connected to SQLite");
    const escapedCollectionName = this.escapeIdentifier(collectionName);
    const escapedFieldName = this.escapeIdentifier(fieldName);
    
    // Fall back safely if table doesn't exist yet
    if (!(await this.collectionExists(collectionName))) return false;

    const stmt = this.db.prepare(
      `SELECT COUNT(*) as count FROM ${escapedCollectionName} WHERE ${escapedFieldName} = ?`
    );
    const result = stmt.get(value) as { count: number };
    return result.count > 0;
  }

  async addForeignKeyConstraints(collectionName: string, schema: SchemaField[]): Promise<void> {
    // SQLite does not support ALTER TABLE ADD CONSTRAINT for foreign keys.
    // Therefore, in SQLiteAdapter, foreign keys are defined inline during table creation
    // within ensureCollection(). This method safely no-ops.
  }
}