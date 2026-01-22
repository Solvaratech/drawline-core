import * as firebaseAdminModule from "firebase-admin";
import type * as adminTypes from "firebase-admin";
import { BaseAdapter, CollectionDetails } from "./BaseAdapter";
import { SchemaField } from "../../types/schemaDesign";
import { logger } from "../../utils";
import type { GeneratedDocument } from "../types";

const admin = (firebaseAdminModule as any).default || firebaseAdminModule;

export class FirestoreAdapter extends BaseAdapter {
	private app: adminTypes.app.App | null = null;
	private db: adminTypes.firestore.Firestore | null = null;
	private serviceAccount: Record<string, unknown>;

	constructor(
		encryptedServiceAccount: string,
		decryptFn: (encrypted: string) => string
	) {
		super();
		const decrypted = decryptFn(encryptedServiceAccount);
		this.serviceAccount = JSON.parse(decrypted);
	}

	async connect(): Promise<void> {
		if (this.db) return;

		try {
			const appName = `firestore-gen-${Date.now()}-${Math.random().toString(36).substring(7)}`;

			if (!admin?.credential?.cert) {
				throw new Error("Firebase Admin SDK not properly loaded");
			}

			if (!this.serviceAccount || typeof this.serviceAccount !== "object") {
				throw new Error("Invalid service account format");
			}

			this.app = admin.initializeApp(
				{
					credential: admin.credential.cert(
						this.serviceAccount as adminTypes.ServiceAccount
					),
				},
				appName
			);
			this.db = admin.firestore(this.app);

			if (!this.db) throw new Error("Database connection not initialized");
			await this.db.collection("_test").limit(1).get();
			logger.log("FirestoreAdapter", "Connected successfully");
		} catch (error) {
			throw new Error(
				`Failed to connect to Firestore: ${error instanceof Error ? error.message : String(error)}`
			);
		}
	}

	async disconnect(): Promise<void> {
		if (this.app) {
			await this.app.delete();
			this.app = null;
			this.db = null;
		}
	}

	async insertDocuments(
		collectionName: string,
		documents: GeneratedDocument[],
		_batchSize: number = 500,
		allowedReferenceFields?: Set<string>
	): Promise<(string | number)[]> {
		if (!this.db) throw new Error("Not connected to Firestore");
		if (documents.length === 0) return [];

		logger.log("FirestoreAdapter", `Inserting ${documents.length} documents into ${collectionName}`);

		const insertedIds: (string | number)[] = [];
		const bulkWriter = this.db.bulkWriter();

		bulkWriter.onWriteError((error) => {
			if (error.failedAttempts < 3) {
				return true;
			}
			return false;
		});

		try {
			for (const doc of documents) {
				const docPath = (doc.data as Record<string, unknown>)._path
					? `${(doc.data as Record<string, unknown>)._path}/${doc.id}`
					: `${collectionName}/${doc.id}`;

				const docRef = this.db.doc(docPath);

				const dataToWrite = { ...doc.data };
				delete (dataToWrite as Record<string, unknown>)._id;
				delete (dataToWrite as Record<string, unknown>)._path;

				const firestoreData = this.convertToFirestoreFormat(
					dataToWrite as Record<string, unknown>,
					allowedReferenceFields || new Set()
				);

				bulkWriter.set(docRef, firestoreData);
				insertedIds.push(doc.id || docRef.id);
			}

			await bulkWriter.close();
			logger.log("FirestoreAdapter", `Inserted ${insertedIds.length} documents`);

			return insertedIds;
		} catch (error) {
			logger.error("FirestoreAdapter", `Bulk insert error:`, error);
			throw error;
		}
	}

	private convertToFirestoreFormat(
		data: Record<string, unknown>,
		allowedReferenceFields: Set<string>
	): Record<string, unknown> {
		const converted: Record<string, unknown> = {};

		for (const [key, value] of Object.entries(data)) {
			const isAllowedReference = allowedReferenceFields.has(key);

			if (value === null || value === undefined) {
				converted[key] = null;
			} else if (value instanceof Date) {
				converted[key] = admin.firestore.Timestamp.fromDate(value);
			} else if (isAllowedReference) {
				converted[key] = this.convertToReference(value);
			} else if (Array.isArray(value)) {
				converted[key] = value.map((v) => {
					if (v instanceof Date) {
						return admin.firestore.Timestamp.fromDate(v);
					}
					return v;
				});
			} else {
				converted[key] = value;
			}
		}

		return converted;
	}

	/**
	 * Convert a value to DocumentReference if it's a valid path
	 */
	private convertToReference(value: unknown): unknown {
		if (typeof value === "string" && value.includes("/")) {
			return this.db!.doc(value);
		}

		if (Array.isArray(value)) {
			return value.map((v) => {
				if (typeof v === "string" && v.includes("/")) {
					return this.db!.doc(v);
				}
				return v;
			});
		}

		return value;
	}

	async clearCollection(collectionName: string): Promise<void> {
		if (!this.db) throw new Error("Not connected to Firestore");

		logger.log("FirestoreAdapter", `Clearing collection ${collectionName}`);
		const collectionRef = this.db.collection(collectionName);
		await this.db.recursiveDelete(collectionRef);
	}

	async validateReference(
		_collectionName: string,
		_fieldName: string,
		value: unknown
	): Promise<boolean> {
		if (!this.db) throw new Error("Not connected to Firestore");

		try {
			if (typeof value !== "string") return false;

			if (!value.includes("/") || value.split("/").length % 2 !== 0) {
				logger.warn("FirestoreAdapter", `Cannot validate reference without full path: ${value}`);
				return false;
			}

			const docRef = this.db.doc(value);
			const doc = await docRef.get();
			return doc.exists;
		} catch (error) {
			logger.error("FirestoreAdapter", `Validation error:`, error);
			return false;
		}
	}

	async getDocumentCount(collectionName: string): Promise<number> {
		if (!this.db) throw new Error("Not connected to Firestore");

		const collection = this.db.collection(collectionName);
		const snapshot = await collection.count().get();
		return snapshot.data().count;
	}

	async collectionExists(collectionName: string): Promise<boolean> {
		if (!this.db) throw new Error("Not connected to Firestore");

		try {
			const collection = this.db.collection(collectionName);
			const snapshot = await collection.limit(1).get();
			return !snapshot.empty;
		} catch {
			return false;
		}
	}

	async ensureCollection(_collectionName: string, _schema?: SchemaField[], skipForeignKeys?: boolean): Promise<void> {
		return;
	}

	async addForeignKeyConstraints(collectionName: string, schema: SchemaField[]): Promise<void> {
		// No-op for Firestore
	}

	async getCollectionDetails(_collectionName: string): Promise<CollectionDetails> {
		return { primaryKey: "_id", primaryKeyType: "string" };
	}

	async getCollectionSchema(_collectionName: string): Promise<SchemaField[]> {
		return [];
	}
}
