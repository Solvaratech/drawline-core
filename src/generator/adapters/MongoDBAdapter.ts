import { MongoClient, ObjectId } from "mongodb";
import { BaseAdapter, CollectionDetails } from "./BaseAdapter";
import { SchemaField } from "../../types/schemaDesign";
import { logger } from "../../utils";
import type { GeneratedDocument } from "../types";

export class MongoDBAdapter extends BaseAdapter {
	private client: MongoClient | null = null;
	private connectionString: string;
	private databaseName: string | null = null;

	constructor(connectionString: string, databaseName?: string) {
		super();
		this.connectionString = connectionString;
		this.databaseName = databaseName || null;
	}

	async connect(): Promise<void> {
		if (this.client) return;

		try {
			this.client = new MongoClient(this.connectionString, {
				serverSelectionTimeoutMS: 5000,
				socketTimeoutMS: 5000,
			});
			await this.client.connect();
			await this.client.db("admin").command({ ping: 1 });
			logger.log("MongoDBAdapter", "Connected successfully");
		} catch (error) {
			throw new Error(
				`Failed to connect to MongoDB: ${error instanceof Error ? error.message : String(error)}`
			);
		}
	}

	async disconnect(): Promise<void> {
		if (this.client) {
			await this.client.close();
			this.client = null;
		}
	}

	async insertDocuments(
		collectionName: string,
		documents: GeneratedDocument[],
		batchSize: number = 1000,
		allowedReferenceFields?: Set<string>,
		schema?: SchemaField[]
	): Promise<(string | number)[]> {
		if (!this.client) throw new Error("Not connected to MongoDB");
		if (!this.databaseName) {
			throw new Error("No database selected. Please select a database in connection settings.");
		}

		const db = this.client.db(this.databaseName);
		const collection = db.collection(collectionName);
		const insertedIds: (string | number)[] = [];

		if (documents.length === 0) return [];

		logger.log("MongoDBAdapter", `Inserting ${documents.length} documents into ${collectionName}`);

		// Cache ObjectId fields for faster lookup.
		const objectIdFields = new Set<string>();
		if (schema) {
			schema.forEach(field => {
				if (field.type === 'objectid') {
					objectIdFields.add(field.name);
				}
			});
		}

		for (let i = 0; i < documents.length; i += batchSize) {
			const batch = documents.slice(i, i + batchSize);

			const mongoDocs = batch.map((doc) => {
				const mongoDoc: Record<string, unknown> = { ...doc.data };

				// Handle _id
				if (doc.id) {
					if (typeof doc.id === "string" && this.isValidObjectId(doc.id)) {
						try {
							mongoDoc._id = new ObjectId(doc.id);
						} catch {
							mongoDoc._id = doc.id;
						}
					} else {
						mongoDoc._id = doc.id;
					}
				}

				// Remove 'id' if it wasn't explicitly in the schema
				const hasExplicitId = schema?.some(f => f.name === 'id');
				if (!hasExplicitId && 'id' in mongoDoc) {
					delete mongoDoc.id;
				}

				if (allowedReferenceFields && allowedReferenceFields.size > 0) {
					this.convertReferencesToObjectId(mongoDoc, allowedReferenceFields);
				}

				if (objectIdFields.size > 0) {
					objectIdFields.forEach(fieldName => {
						const value = mongoDoc[fieldName];
						if (typeof value === 'string' && ObjectId.isValid(value)) {
							mongoDoc[fieldName] = new ObjectId(value);
						} else if (Array.isArray(value)) {
							mongoDoc[fieldName] = value.map(v => {
								if (typeof v === 'string' && ObjectId.isValid(v)) {
									return new ObjectId(v);
								}
								return v;
							});
						}
					});
				}

				return mongoDoc;
			});

			try {
				const result = await collection.insertMany(mongoDocs, { ordered: false });

				for (const id of Object.values(result.insertedIds)) {
					insertedIds.push(id.toString());
				}

				logger.log("MongoDBAdapter", `Inserted ${result.insertedCount} documents`);
			} catch (error: unknown) {
				// Handle bulk write errors (like duplicate keys)
				if (this.isBulkWriteError(error)) {
					const insertedCount = error.result?.insertedCount || 0;
					if (error.result?.insertedIds) {
						for (const id of Object.values(error.result.insertedIds)) {
							insertedIds.push(String(id));
						}
					}
					logger.log("MongoDBAdapter", `Partial insert: ${insertedCount} documents`);
				} else {
					logger.error("MongoDBAdapter", `Insert error:`, error);
					throw error;
				}
			}
		}

		return insertedIds;
	}

	private isValidObjectId(str: string): boolean {
		return ObjectId.isValid(str) && new ObjectId(str).toString() === str;
	}

	private isBulkWriteError(error: unknown): error is {
		code: number;
		result?: { insertedCount?: number; insertedIds?: Record<number, unknown> };
	} {
		return (
			typeof error === "object" &&
			error !== null &&
			"code" in error &&
			((error as { code: number }).code === 11000 ||
				(error as { name?: string }).name === "MongoBulkWriteError")
		);
	}

	private convertReferencesToObjectId(
		obj: Record<string, unknown>,
		allowedFields: Set<string>
	): void {
		for (const [key, value] of Object.entries(obj)) {
			if (!allowedFields.has(key)) continue;

			if (typeof value === "string" && this.isValidObjectId(value)) {
				obj[key] = new ObjectId(value);
			} else if (Array.isArray(value)) {
				obj[key] = value.map((v) => {
					if (typeof v === "string" && this.isValidObjectId(v)) {
						return new ObjectId(v);
					}
					return v;
				});
			}
		}
	}

	async clearCollection(collectionName: string): Promise<void> {
		if (!this.client) throw new Error("Not connected to MongoDB");
		if (!this.databaseName) {
			throw new Error("No database selected.");
		}

		const db = this.client.db(this.databaseName);
		const collection = db.collection(collectionName);
		const result = await collection.deleteMany({});
		logger.log("MongoDBAdapter", `Cleared ${result.deletedCount} documents from ${collectionName}`);
	}

	async validateReference(
		collectionName: string,
		_fieldName: string,
		value: unknown
	): Promise<boolean> {
		if (!this.client) throw new Error("Not connected to MongoDB");
		if (!this.databaseName) throw new Error("No database selected.");

		const db = this.client.db(this.databaseName);
		const collection = db.collection(collectionName);

		try {
			let queryValue: unknown = value;
			if (typeof value === "string" && this.isValidObjectId(value)) {
				queryValue = new ObjectId(value);
			}

			const count = await collection.countDocuments({ _id: queryValue as any });
			return count > 0;
		} catch (error) {
			logger.error("MongoDBAdapter", `Validation error:`, error);
			return false;
		}
	}

	async getDocumentCount(collectionName: string): Promise<number> {
		if (!this.client) throw new Error("Not connected to MongoDB");
		if (!this.databaseName) throw new Error("No database selected.");

		const db = this.client.db(this.databaseName);
		const collection = db.collection(collectionName);
		return collection.countDocuments();
	}

	async collectionExists(collectionName: string): Promise<boolean> {
		if (!this.client) throw new Error("Not connected to MongoDB");
		if (!this.databaseName) throw new Error("No database selected.");

		const db = this.client.db(this.databaseName);
		const collections = await db.listCollections({ name: collectionName }).toArray();
		return collections.length > 0;
	}

	async ensureCollection(collectionName: string, schema?: SchemaField[], skipForeignKeys?: boolean): Promise<void> {
		if (!this.client) throw new Error("Not connected to MongoDB");
		if (!this.databaseName) throw new Error("No database selected.");

		const db = this.client.db(this.databaseName);

		try {
			await db.createCollection(collectionName);
			logger.log("MongoDBAdapter", `Created collection ${collectionName}`);
		} catch (error) {
			if (!String(error).includes("already exists")) {
				throw error;
			}
		}
	}

	async addForeignKeyConstraints(collectionName: string, schema: SchemaField[]): Promise<void> {
		// No-op for MongoDB
	}

	async getCollectionDetails(_collectionName: string): Promise<CollectionDetails> {
		return { primaryKey: "_id", primaryKeyType: "string" };
	}

	async getCollectionSchema(_collectionName: string): Promise<SchemaField[]> {
		return [];
	}
}
