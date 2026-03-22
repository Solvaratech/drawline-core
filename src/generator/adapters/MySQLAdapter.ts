import mysql from 'mysql2/promise';
import { BaseAdapter } from './BaseAdapter';
import type { SchemaField } from '../../types';

export class MySQLAdapter extends BaseAdapter {
  private connection: mysql.Connection | null = null;

  async connect(config?: mysql.ConnectionOptions): Promise<void> {
    if (!config) throw new Error('Connection config is required');
    this.connection = await mysql.createConnection(config);
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

  async insertDocuments(collection: string, documents: any[]): Promise<(string | number)[]> {
    if (!this.connection) throw new Error('Not connected');
    const placeholders = documents.map(() => '(?)').join(', ');
    const values = documents.map((doc) => Object.values(doc));
    const query = `INSERT INTO ${collection} VALUES ${placeholders}`;
    const [result] = await this.connection.query(query, values);
    return [(result as mysql.OkPacket).insertId];
  }

  async ensureCollection(collectionName: string, schema?: SchemaField[], skipForeignKeys?: boolean): Promise<void> {
    if (!this.connection) throw new Error('Not connected');
    const schemaDefinition = schema
      ?.map((field) => `${field.name} ${field.type}`)
      .join(', ');
    if (schemaDefinition) {
      await this.connection.query(`CREATE TABLE IF NOT EXISTS ${collectionName} (${schemaDefinition})`);
    }
  }

  async clearCollection(collection: string): Promise<void> {
    if (!this.connection) throw new Error('Not connected');
    await this.connection.query(`DELETE FROM ${collection}`);
  }

  async collectionExists(collection: string): Promise<boolean> {
    if (!this.connection) throw new Error('Not connected');
    const [rows] = await this.connection.query(
      `SELECT COUNT(*) as count FROM information_schema.tables WHERE table_name = ?`,
      [collection]
    );
    return (rows as any[])[0].count > 0;
  }

  async getCollectionDetails(collection: string): Promise<any> {
    if (!this.connection) throw new Error('Not connected');
    const [rows] = await this.connection.query(`DESCRIBE ${collection}`);
    return rows;
  }

  async getDocumentCount(collection: string): Promise<number> {
    if (!this.connection) throw new Error('Not connected');
    const [rows] = await this.connection.query(`SELECT COUNT(*) as count FROM ${collection}`);
    return (rows as any[])[0].count;
  }

  async validateReference(collectionName: string, fieldName: string, value: unknown): Promise<boolean> {
    if (!this.connection) throw new Error('Not connected');
    const [rows] = await this.connection.query(
      `SELECT COUNT(*) as count FROM ${collectionName} WHERE ${fieldName} = ?`,
      [value]
    );
    return (rows as any[])[0].count > 0;
  }

  async addForeignKeyConstraints(): Promise<void> {
    // Implementation for adding foreign key constraints
    throw new Error('Method not implemented.');
  }
}