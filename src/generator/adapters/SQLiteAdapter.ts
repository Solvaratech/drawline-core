import { BaseAdapter, CollectionDetails } from "./BaseAdapter";
import { GeneratedDocument } from "../types";
import { SchemaField } from "../../types/schemaDesign";
// @ts-ignore - types might not be installed yet during generation
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

export class SQLiteAdapter extends BaseAdapter {
	private db: Database.Database | null = null;
	private dbPath: string;

	constructor(dbPath: string) {
		super();
		this.dbPath = dbPath;
	}

	async connect(): Promise<void> {
		if (this.db) return;

		const dir = path.dirname(this.dbPath);
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true });
		}

		this.db = new Database(this.dbPath);
		this.db.pragma("journal_mode = WAL");
	}

	async disconnect(): Promise<void> {
		if (this.db) {
			this.db.close();
			this.db = null;
		}
	}

	async ensureCollection(
		collectionName: string,
		schema?: SchemaField[],
		skipForeignKeys?: boolean
	): Promise<void> {
		if (!this.db || !schema) return;

		const tableName = this.escapeId(collectionName);
		const columns = schema
			// We DO want to include foreign keys and references because they hold data (the ID of the referenced doc)
			// effectively acting as the column for that field.
			.filter((f) => {
				// Filter out reversed relationships (e.g. "users" having "posts" array if it's virtual)
				// usually 'reference' type implies a direct FK column.
				// If type is 'array' and it's a relationship, it might be a virtual reverse link.
				if (f.type === 'array' || (f.type as string) === 'list') {
					// Check if it's a Many-to-Many or One-to-Many virtual
					// For now, let's include it if it's not explicitly virtual? 
					// But arrays of references might be stored as JSON text, so that's fine too.
					return true;
				}
				return true;
			})
			.map((f) => {
				const name = this.escapeId(f.name);
				const type = this.getSqlType(f);
				let def = `${name} ${type}`;
				if (f.isPrimaryKey) {
					def += " PRIMARY KEY";
				}
				return def;
			});

		const hasUnderscoreId = schema.some(f => f.name === '_id');
		if (!hasUnderscoreId && !schema.some(f => f.isPrimaryKey) && !columns.some(c => c.toUpperCase().includes('PRIMARY KEY'))) {
			columns.unshift('"id" TEXT PRIMARY KEY');
		}

		const fkFields = schema.filter(f => f.isForeignKey);
		for (const fk of fkFields) {
			const name = this.escapeId(fk.name);
			// Check if already added (unlikely if loop above filtered)
			if (!columns.some(c => c.startsWith(`${name} `))) {
				// Use proper type based on field type for FK columns
				const type = this.getSqlType(fk);
				columns.push(`${name} ${type}`);
			}
		}

		const createSql = `CREATE TABLE IF NOT EXISTS ${tableName} (${columns.join(", ")});`;
		this.db.prepare(createSql).run();
	}

	async insertDocuments(
		collectionName: string,
		documents: GeneratedDocument[],
		batchSize?: number,
		allowedReferenceFields?: Set<string>,
		schema?: SchemaField[]
	): Promise<(string | number)[]> {
		if (!this.db || documents.length === 0) return [];

		const tableName = this.escapeId(collectionName);
		const ids: (string | number)[] = [];

		const insertTransaction = this.db.transaction((docs: GeneratedDocument[]) => {
			// Pre-calculate valid columns if schema provided
			let validColumns: Set<string> | null = null;
			if (schema) {
				validColumns = new Set(schema.map(f => f.name));

				// Handle implicit 'id' logic mirroring ensureCollection
				const hasUnderscoreId = schema.some(f => f.name === '_id');
				const hasPk = schema.some(f => f.isPrimaryKey);
				// If no PK and no _id, ensureCollection adds 'id'
				if (!hasUnderscoreId && !hasPk) {
					validColumns.add('id');
				}
				// Also add 'id' if schema explicitly has it (already in map) 
			}

			for (const doc of docs) {
				let keys = Object.keys(doc.data);

				// Filter keys if schema is available
				if (validColumns) {
					keys = keys.filter(k => validColumns!.has(k));
				}

				if (keys.length === 0) continue;

				const columns = keys.map((k) => this.escapeId(k)).join(", ");
				const placeholders = keys.map(() => "?").join(", ");
				const values = keys.map((k) => {
					const val = doc.data[k];
					if (val === undefined) return null;
					if (typeof val === "boolean") return val ? 1 : 0;
					if (typeof val === "object" && val !== null) {
						return JSON.stringify(val);
					}
					return val;
				});

				const stmt = this.db!.prepare(
					`INSERT OR REPLACE INTO ${tableName} (${columns}) VALUES (${placeholders})`
				);
				stmt.run(...values);
				ids.push(doc.id);
			}
		});

		insertTransaction(documents);
		return ids;
	}

	async clearCollection(collectionName: string): Promise<void> {
		if (!this.db) return;
		this.db.prepare(`DELETE FROM ${this.escapeId(collectionName)}`).run();
	}

	async collectionExists(collectionName: string): Promise<boolean> {
		if (!this.db) return false;
		const row = this.db
			.prepare(
				`SELECT name FROM sqlite_master WHERE type='table' AND name=?`
			)
			.get(collectionName);
		return !!row;
	}

	async getCollectionDetails(collectionName: string): Promise<CollectionDetails> {
		// Simplified for SQLite
		return {
			primaryKey: "id",
			primaryKeyType: "string",
		};
	}

	async getDocumentCount(collectionName: string): Promise<number> {
		if (!this.db) return 0;
		// Check if table exists first to avoid error
		const exists = await this.collectionExists(collectionName);
		if (!exists) return 0;

		const result = this.db
			.prepare(`SELECT COUNT(*) as count FROM ${this.escapeId(collectionName)}`)
			.get() as { count: number };
		return result.count;
	}

	async validateReference(
		collectionName: string,
		fieldName: string,
		value: unknown
	): Promise<boolean> {
		// TODO: Implement real FK validation if needed
		return true;
	}

	async addForeignKeyConstraints(
		collectionName: string,
		schema: SchemaField[]
	): Promise<void> {
		// SQLite handles FKs if PRAGMA foreign_keys = ON;
		// leaving as no-op for now to avoid strict constraint errors during prototyping
	}

	// Custom Methods for Stateful Mock API

	public getDocuments(collectionName: string, query: any = {}): GeneratedDocument[] {
		if (!this.db) return [];
		// Check if table exists first
		const exists = this.db
			.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`)
			.get(collectionName);
		if (!exists) return [];

		// Basic query construction
		let sql = `SELECT * FROM ${this.escapeId(collectionName)}`;
		const whereClauses: string[] = [];
		const params: any[] = [];

		// Simple strict equality filtering
		for (const [key, value] of Object.entries(query)) {
			if (value !== undefined && key !== 'limit' && key !== 'sort' && key !== 'page') {
				whereClauses.push(`${this.escapeId(key)} = ?`);
				params.push(value);
			}
		}

		if (whereClauses.length > 0) {
			sql += ` WHERE ${whereClauses.join(' AND ')}`;
		}


		if (query.limit) {
			sql += ` LIMIT ${parseInt(query.limit)}`;
		}

		if (query.skip || query.offset) {
			const skip = parseInt(query.skip || query.offset);
			if (!isNaN(skip)) {
				sql += ` OFFSET ${skip}`;
			}
		} else if (query.page && query.limit) {
			const page = parseInt(query.page);
			const limit = parseInt(query.limit);
			if (!isNaN(page) && !isNaN(limit) && page > 0) {
				const offset = (page - 1) * limit;
				sql += ` OFFSET ${offset}`;
			}
		}

		const rows = this.db.prepare(sql).all(...params) as any[];

		// Parse JSON fields if they look like JSON? 
		// Or just return as is. The user usually expects correct validation.
		// For now, return raw rows. 
		// We need to map back to GeneratedDocument format
		return rows.map((row) => ({
			id: row.id,
			data: this.parseRow(row),
		}));
	}

	public deleteDocument(collectionName: string, id: string | number, schema?: SchemaField[]): boolean {
		if (!this.db) return false;
		const pkName = this.escapeId(this.getPrimaryKeyName(schema));
		const info = this.db.prepare(`DELETE FROM ${this.escapeId(collectionName)} WHERE ${pkName} = ?`).run(id);
		return info.changes > 0;
	}

	public updateDocument(collectionName: string, id: string | number, data: any, schema?: SchemaField[]): boolean {
		if (!this.db) return false;

		const pk = this.getPrimaryKeyName(schema);
		let keys = Object.keys(data).filter(k => k !== pk && k !== 'id'); // Filter out PKs from set clause

		// Filter using schema if provided
		if (schema) {
			const validColumns = new Set(schema.map(f => f.name));
			keys = keys.filter(k => validColumns.has(k));
		}

		if (keys.length === 0) return false;

		const sets = keys.map(k => `${this.escapeId(k)} = ?`).join(', ');
		const values = keys.map(k => {
			const val = data[k];
			if (val === undefined) return null;
			if (typeof val === "boolean") return val ? 1 : 0;
			if (typeof val === "object" && val !== null) return JSON.stringify(val);
			return val;
		});
		values.push(id);

		const pkName = this.escapeId(pk);
		const info = this.db.prepare(`UPDATE ${this.escapeId(collectionName)} SET ${sets} WHERE ${pkName} = ?`).run(...values);
		return info.changes > 0;
	}

	private getPrimaryKeyName(schema?: SchemaField[]): string {
		if (!schema) return 'id';
		const pkField = schema.find(f => f.isPrimaryKey);
		if (pkField) return pkField.name;
		if (schema.some(f => f.name === '_id')) return '_id';
		return 'id';
	}

	private escapeId(id: string): string {
		return `"${id.replace(/"/g, '""')}"`;
	}

	private getSqlType(field: SchemaField): string {
		switch (field.type) {
			case "integer":
			case "long":
				return "INTEGER";
			case "number":
			case "float":
			case "decimal":
				return "REAL";
			case "boolean":
				return "INTEGER"; // 0 or 1
			case "json":
			case "array":
			// @ts-ignore - 'list' might not be in type definition yet but used in schema
			case "list":
			case "object":
			case "reference":
			case "uuid":
			case "objectid":
				return "TEXT";
			default:
				return "TEXT";
		}
	}

	private parseRow(row: any): any {
		// Try to unparse JSON fields if possible or leave them
		const newRow: any = { ...row };
		for (const k in newRow) {
			const val = newRow[k];
			if (typeof val === 'string' && (val.startsWith('{') || val.startsWith('['))) {
				try {
					newRow[k] = JSON.parse(val);
				} catch (e) {
					// ignore
				}
			}
		}
		return newRow;
	}
}
