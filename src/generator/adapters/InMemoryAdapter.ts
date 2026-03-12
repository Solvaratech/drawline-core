import { BaseAdapter } from "./BaseAdapter";
import { GeneratedDocument, TestDataConfig } from "../types";
import { SchemaField } from "../../types/schemaDesign";

export class InMemoryAdapter extends BaseAdapter {
	public data: Map<string, any[]> = new Map();
	public collections: Map<string, SchemaField[]> = new Map();

	async connect(): Promise<void> {
		// No-op
	}

	async disconnect(): Promise<void> {
		// No-op
	}

	async insertDocuments(
		collectionName: string,
		documents: GeneratedDocument[],
		_batchSize?: number,
		_allowedReferenceFields?: Set<string>,
		_schema?: SchemaField[]
	): Promise<(string | number)[]> {
		if (!this.data.has(collectionName)) {
			this.data.set(collectionName, []);
		}
		const collection = this.data.get(collectionName)!;
		const ids: (string | number)[] = [];

		for (const doc of documents) {
			collection.push(doc.data);
			ids.push(doc.id);
		}

		return ids;
	}

	async clearCollection(collectionName: string): Promise<void> {
		this.data.set(collectionName, []);
	}

	async collectionExists(collectionName: string): Promise<boolean> {
		return this.collections.has(collectionName);
	}

	async ensureCollection(
		collectionName: string,
		schema?: SchemaField[],
		_skipForeignKeys?: boolean
	): Promise<void> {
		this.collections.set(collectionName, schema || []);
		if (!this.data.has(collectionName)) {
			this.data.set(collectionName, []);
		}
	}

	async getCollectionDetails(collectionName: string): Promise<any> {
		const schema = this.collections.get(collectionName);
		const pk = schema?.find(f => f.isPrimaryKey)?.name || "id";
		return {
			primaryKey: pk,
			primaryKeyType: "string"
		};
	}

	async getDocumentCount(collectionName: string): Promise<number> {
		return this.data.get(collectionName)?.length || 0;
	}

	async validateReference(
		collectionName: string,
		fieldName: string,
		value: unknown
	): Promise<boolean> {
		const collection = this.data.get(collectionName);
		if (!collection) return false;
		return collection.some(doc => doc[fieldName] === value);
	}

	async addForeignKeyConstraints(
		_collectionName: string,
		_schema: SchemaField[]
	): Promise<void> {
		// No-op for in-memory
	}

	// Helper for testing
	getData(collectionName: string) {
		return this.data.get(collectionName) || [];
	}
}
