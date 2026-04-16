import { BaseAdapter } from "./BaseAdapter";
import { GeneratedDocument } from "../types";
import { SchemaField } from "../../types/schemaDesign";

export class NullAdapter extends BaseAdapter {
	public count = 0;

	async connect(): Promise<void> {}
	async disconnect(): Promise<void> {}

	async insertDocuments(
		collectionName: string,
		documents: GeneratedDocument[],
		batchSize?: number,
		allowedReferenceFields?: Set<string>,
		schema?: SchemaField[]
	): Promise<(string | number)[]> {
		this.count += documents.length;
		return documents.map(d => d.id);
	}

	async clearCollection(collectionName: string): Promise<void> {}
	async collectionExists(collectionName: string): Promise<boolean> { return true; }
	async ensureCollection(collectionName: string, schema?: SchemaField[], skipForeignKeys?: boolean): Promise<void> {}
	async getCollectionDetails(collectionName: string): Promise<any> {
		return { primaryKey: "id", primaryKeyType: "integer" };
	}
	async getDocumentCount(collectionName: string): Promise<number> { return this.count; }
	async validateReference(collectionName: string, fieldName: string, value: unknown): Promise<boolean> { return true; }
	async addForeignKeyConstraints(collectionName: string, schema: SchemaField[]): Promise<void> {}
}
