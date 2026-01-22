// TODO - enable firebase in drawline app & add comments
import * as firebaseAdminModule from "firebase-admin";
import type * as adminTypes from "firebase-admin";
import { decrypt } from "./utils";

// Handle ESM/CommonJS interop - firebase-admin exports as default in CommonJS
const admin = (firebaseAdminModule as any).default || firebaseAdminModule;
type admin = typeof admin;

/**
 * Normalizes Firestore data into standard JS types.
 * Converts Timestamps to Dates, handles nested objects/arrays.
 */
function normalizeFirestoreData(data: any): any {
	if (data === null || data === undefined) {
		return data;
	}

	// Duck-typing to check for Firestore Timestamp.
	if (data && typeof data === 'object' && typeof data.toDate === 'function') {
		return data.toDate();
	}

	if (typeof data === 'object') {
		if (Array.isArray(data)) {
			return data.map(normalizeFirestoreData);
		}

		if (data.constructor === Object) {
			const normalized: Record<string, any> = {};
			for (const [key, value] of Object.entries(data)) {
				normalized[key] = normalizeFirestoreData(value);
			}
			return normalized;
		}
	}

	return data;
}

/**
 * Manages Firestore connections.
 */
export class FirestoreHandler {
	private app: adminTypes.app.App | null = null;
	private db: adminTypes.firestore.Firestore | null = null;
	private serviceAccount: Record<string, unknown>;

	constructor(encryptedServiceAccount: string) {
		const decrypted = decrypt(encryptedServiceAccount);
		this.serviceAccount = JSON.parse(decrypted);
	}

	async connect(): Promise<void> {
		try {
			const appName = `firestore-${Date.now()}-${Math.random().toString(36).substring(7)}`;

			if (!admin || !admin.credential || !admin.credential.cert) {
				const debugInfo = {
					adminExists: !!admin,
					adminType: typeof admin,
					hasCredential: !!(admin && admin.credential),
					hasCert: !!(admin && admin.credential && admin.credential.cert),
					adminKeys: admin ? Object.keys(admin).slice(0, 10) : []
				};
				throw new Error(`Firebase Admin SDK not properly loaded: ${JSON.stringify(debugInfo)}`);
			}

			if (!this.serviceAccount || typeof this.serviceAccount !== 'object') {
				throw new Error("Invalid service account format");
			}

			this.app = admin.initializeApp({
				credential: admin.credential.cert(this.serviceAccount as adminTypes.ServiceAccount),
			}, appName);
			this.db = admin.firestore(this.app);

			if (!this.db) {
				throw new Error("Database connection not initialized");
			}
			await this.db.collection("_test").limit(1).get();
		} catch (error) {
			throw new Error(`Failed to connect to Firestore: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	async disconnect(): Promise<void> {
		if (this.app) {
			await this.app.delete();
			this.app = null;
			this.db = null;
		}
	}

	async getCollections(): Promise<string[]> {
		if (!this.db) throw new Error("Not connected to Firestore");

		const collections = await this.db.listCollections();
		return collections.map((c) => c.id);
	}

	async getCollectionStats(collectionName: string): Promise<{
		documentCount: number;
		estimatedSize: number;
	}> {
		if (!this.db) throw new Error("Not connected to Firestore");

		const collection = this.db.collection(collectionName);
		const snapshot = await collection.count().get();

		const documentCount = snapshot.data().count;
		const estimatedSize = documentCount * 1024;

		return {
			documentCount,
			estimatedSize,
		};
	}

	async getDocuments(
		collectionName: string,
		filter: Record<string, unknown> = {},
		skip: number = 0,
		limit: number = 50
	): Promise<unknown[]> {
		if (!this.db) throw new Error("Not connected to Firestore");

		let query: adminTypes.firestore.Query = this.db.collection(collectionName);

		Object.entries(filter).forEach(([key, value]) => {
			query = query.where(key, "==", value);
		});

		const snapshot = await query.offset(skip).limit(limit).get();

		return snapshot.docs.map((doc) => ({
			id: doc.id,
			...normalizeFirestoreData(doc.data()),
		}));
	}


	private _inferSchemaFromDocs(docs: any[]): { fields: Record<string, unknown>; subcollections: Record<string, string[]> } {
		const schema: Record<string, { typeCounts: Map<string, number>; samples: unknown[] }> = {};

		docs.forEach(doc => {
			const data = normalizeFirestoreData(doc.data());
			Object.entries(data).forEach(([key, value]) => {
				if (!schema[key]) schema[key] = { typeCounts: new Map(), samples: [] };

				let type = "unknown";
				if (value === null) type = "null";
				else if (value === undefined) type = "undefined";
				else if (typeof value === "object") {
					if (value && typeof (value as any).toDate === 'function') {
						type = "timestamp";
					} else if (value && typeof (value as any).latitude === 'number' && typeof (value as any).longitude === 'number') {
						type = "geopoint";
					} else if (value && typeof (value as any).path === 'string' && typeof (value as any).parent === 'object') {
						type = "reference";
					} else if (value && value.constructor && value.constructor.name === "Bytes") {
						type = "bytes";
					} else if (Array.isArray(value)) {
						type = "array";
						let itemTypes = new Set<string>();
						value.forEach(v => {
							if (typeof v === 'string') itemTypes.add('string');
							else if (typeof v === 'number') itemTypes.add('number');
							else if (typeof v === 'boolean') itemTypes.add('boolean');
							else if (v && typeof (v as any).toDate === 'function') itemTypes.add('timestamp');
							else if (v && typeof (v as any).path === 'string') itemTypes.add('reference');
							else itemTypes.add('object');
						});

						if (itemTypes.size === 1) {
							type = `array[${itemTypes.values().next().value}]`;
						} else if (itemTypes.size > 1) {
							type = "array[mixed]";
						} else {
							type = "array[unknown]";
						}

					} else if (value instanceof Date) {
						type = "timestamp";
					} else {
						type = "object";
					}
				} else {
					type = typeof value;
					if (type === "number" && Number.isInteger(value)) type = "integer";
				}

				const counts = schema[key].typeCounts;
				counts.set(type, (counts.get(type) || 0) + 1);
				if (schema[key].samples.length < 5) schema[key].samples.push(value);
			});
		});

		const resolvedSchema: Record<string, unknown> = {};
		Object.entries(schema).forEach(([key, data]) => {
			let dominantType = "string";
			let maxCount = 0;
			let totalCount = 0;
			let nullCount = 0;

			data.typeCounts.forEach((count, type) => {
				totalCount += count;
				if (type === "null" || type === "undefined") {
					nullCount += count;
				} else if (count > maxCount) {
					maxCount = count;
					dominantType = type;
				}
			});

			let finalType = dominantType;
			let itemsType: string | undefined = undefined;

			if (dominantType.startsWith("array[")) {
				itemsType = dominantType.substring(6, dominantType.length - 1);
				finalType = "array";
			}

			if (maxCount === 0) finalType = "unknown";

			const fieldSchema: any = {
				type: finalType,
				nullable: nullCount > 0,
				sampleCount: maxCount
			};
			if (finalType === "array" && itemsType) {
				fieldSchema.items = itemsType;
			}

			resolvedSchema[key] = fieldSchema;
		});

		return { fields: resolvedSchema, subcollections: {} };
	}

	async inferSchema(collectionName: string, sampleSize: number = 100): Promise<Record<string, unknown>> {
		if (!this.db) throw new Error("Not connected to Firestore");

		const collection = this.db.collection(collectionName);

		const snapshot = await collection.limit(sampleSize).get();

		if (snapshot.empty) {
			return {};
		}

		const { fields } = this._inferSchemaFromDocs(snapshot.docs);

		const subcollectionsMap: Record<string, string[]> = {};
		const docsToCheck = snapshot.docs.slice(0, Math.min(10, snapshot.docs.length));

		for (const doc of docsToCheck) {
			try {
				const docSubcollections = await doc.ref.listCollections();
				docSubcollections.forEach((subcol) => {
					if (!subcollectionsMap[subcol.id]) {
						subcollectionsMap[subcol.id] = [];
					}
					subcollectionsMap[subcol.id].push(doc.id);
				});
			} catch (error) {
				// Ignore errors
			}
		}

		const result = { ...fields };
		if (Object.keys(subcollectionsMap).length > 0) {
			(result as any)._subcollections = Object.keys(subcollectionsMap);
			(result as any)._subcollectionsInfo = subcollectionsMap;
		}

		return result;
	}

	async inferSubcollectionSchema(
		parentCollection: string,
		documentId: string,
		subcollectionName: string,
		sampleSize: number = 100
	): Promise<Record<string, unknown>> {
		if (!this.db) throw new Error("Not connected to Firestore");

		const docRef = this.db.collection(parentCollection).doc(documentId);
		const subcollection = docRef.collection(subcollectionName);
		const snapshot = await subcollection.limit(sampleSize).get();

		if (snapshot.empty) {
			return {};
		}

		const { fields } = this._inferSchemaFromDocs(snapshot.docs);

		const subcollectionsMap: Record<string, string[]> = {};
		const docsToCheck = snapshot.docs.slice(0, Math.min(10, snapshot.docs.length));

		for (const doc of docsToCheck) {
			try {
				const docSubcollections = await doc.ref.listCollections();
				docSubcollections.forEach((subcol) => {
					if (!subcollectionsMap[subcol.id]) {
						subcollectionsMap[subcol.id] = [];
					}
					subcollectionsMap[subcol.id].push(doc.id);
				});
			} catch (error) {
				// Ignore
			}
		}

		const result = { ...fields };
		if (Object.keys(subcollectionsMap).length > 0) {
			(result as any)._subcollections = Object.keys(subcollectionsMap);
			(result as any)._subcollectionsInfo = subcollectionsMap;
		}

		return result;
	}

	async deleteCollection(collectionName: string): Promise<void> {
		if (!this.db) throw new Error("Not connected to Firestore");

		const collection = this.db.collection(collectionName);
		const batchSize = 100;

		const deleteQueryBatch = async () => {
			const snapshot = await collection.limit(batchSize).get();

			if (snapshot.size === 0) {
				return 0;
			}

			const batch = this.db!.batch();
			snapshot.docs.forEach((doc) => {
				batch.delete(doc.ref);
			});
			await batch.commit();

			return snapshot.size;
		};

		let deletedCount = 0;
		do {
			deletedCount = await deleteQueryBatch();
		} while (deletedCount > 0);
	}

	async createCollection(collectionName: string): Promise<void> {
		if (!this.db) throw new Error("Not connected to Firestore");

		await this.db.collection(collectionName).doc("drawline_placeholder").set({
			_placeholder: true,
			_created: new Date(),
			_description: "This placeholder document was created by Drawline to initialize the collection. You can delete it after adding your own documents.",
		});
	}

	async renameCollection(oldName: string, newName: string): Promise<void> {
		if (!this.db) throw new Error("Not connected to Firestore");

		const oldCollection = this.db.collection(oldName);
		const newCollection = this.db.collection(newName);
		const batchSize = 500;

		const copyBatch = async () => {
			const snapshot = await oldCollection.limit(batchSize).get();

			if (snapshot.size === 0) {
				return 0;
			}

			const batch = this.db!.batch();
			snapshot.docs.forEach((doc) => {
				const newDocRef = newCollection.doc(doc.id);
				batch.set(newDocRef, doc.data());
			});
			await batch.commit();

			return snapshot.size;
		};

		let copiedCount = 0;
		do {
			copiedCount = await copyBatch();
		} while (copiedCount > 0);
		await this.deleteCollection(oldName);
	}

	async detectRelationships(collections: string[]): Promise<import("./types").DatabaseRelationship[]> {
		if (!this.db) throw new Error("Not connected to Firestore");

		const relationships: import("./types").DatabaseRelationship[] = [];

		for (const collectionName of collections) {
			const collection = this.db.collection(collectionName);
			const snapshot = await collection.limit(50).get();

			if (snapshot.empty) continue;

			const referenceFields = new Set<string>();
			const analyzedDocs = snapshot.docs;

			analyzedDocs.forEach(doc => {
				const data = doc.data();
				Object.entries(data).forEach(([key, value]) => {
					if (value && typeof (value as any).path === 'string' && typeof (value as any).parent === 'object') {
						// Extract target collection from path (e.g. "users/123" -> users)
						const path = (value as any).path as string;
						const parts = path.split('/');
						if (parts.length >= 2) {
							const targetCollection = parts[0];
							// Add relationship: This Collection (Child) -> Target Collection (Parent)
							const exists = relationships.find(r =>
								r.parentTable === targetCollection &&
								r.childTable === collectionName &&
								r.columns.includes(key)
							);

							if (!exists) {
								relationships.push({
									parentTable: targetCollection,
									childTable: collectionName,
									columns: [key],
									confidence: 1.0,
									type: "1:N", // Usually
									isArrayReference: false
								});
							}
						}
					}
					if (Array.isArray(value)) {
						const first = value[0];
						if (first && typeof (first as any).path === 'string') {
							const path = (first as any).path as string;
							const parts = path.split('/');
							if (parts.length >= 2) {
								const targetCollection = parts[0];
								const exists = relationships.find(r =>
									r.parentTable === targetCollection &&
									r.childTable === collectionName &&
									r.columns.includes(key)
								);
								if (!exists) {
									relationships.push({
										parentTable: targetCollection,
										childTable: collectionName,
										columns: [key],
										confidence: 1.0,
										type: "N:M", // Array of Refs
										isArrayReference: true
									});
								}
							}
						}
					}
				});
			});

			const subcolsToCheck = analyzedDocs.slice(0, 5);
			for (const doc of subcolsToCheck) {
				try {
					const subcollections = await doc.ref.listCollections();
					subcollections.forEach(sub => {
						const subName = sub.id;
						const exists = relationships.find(r =>
							r.parentTable === collectionName &&
							r.childTable === subName
						);

						if (!exists) {
							relationships.push({
								parentTable: collectionName,
								childTable: subName,
								columns: ["_parent"],
								confidence: 1.0,
								type: "1:N", // Parent has many sub-docs
								isArrayReference: false
							});
						}
					});
				} catch (e) {
					// ignore
				}
			}
		}

		return relationships;
	}

	async hasData(collectionName: string): Promise<boolean> {
		if (!this.db) throw new Error("Not connected to Firestore");
		const collection = this.db.collection(collectionName);
		const snapshot = await collection.limit(1).get();
		return !snapshot.empty;
	}

	async clearCollection(collectionName: string): Promise<void> {
		if (!this.db) throw new Error("Not connected to Firestore");
		const db = this.db;
		const collection = db.collection(collectionName);
		const snapshot = await collection.get();

		const batchSize = 500;
		const batches: adminTypes.firestore.WriteBatch[] = [];
		let currentBatch = db.batch();
		let count = 0;

		snapshot.docs.forEach((doc) => {
			currentBatch.delete(doc.ref);
			count++;
			if (count >= batchSize) {
				batches.push(currentBatch);
				currentBatch = db.batch();
				count = 0;
			}
		});

		if (count > 0) {
			batches.push(currentBatch);
		}

		for (const batch of batches) {
			await batch.commit();
		}
	}

	async populateTestData(
		collectionName: string,
		count: number,
		relationships: Array<{ from: string; to: string; field: string }>,
		existingIds: Map<string, string[]>,
		options?: {
			batchSize?: number;
			startFrom?: number;
			onBatchComplete?: (batchIndex: number, ids: string[]) => Promise<void>;
		}
	): Promise<string[]> {
		if (!this.db) throw new Error("Not connected to Firestore");
		const collection = this.db.collection(collectionName);

		const generatedIds: string[] = [];
		const batchSize = options?.batchSize ?? 500;
		const startFrom = options?.startFrom ?? 0;

		const relatedIds: Map<string, string[]> = new Map();
		for (const rel of relationships) {
			if (rel.from === collectionName) {
				const targetIds = existingIds.get(rel.to) || [];
				if (targetIds.length > 10000) {
					const sampled = [];
					for (let i = 0; i < Math.min(1000, targetIds.length); i++) {
						sampled.push(targetIds[Math.floor(Math.random() * targetIds.length)]);
					}
					relatedIds.set(rel.to, sampled);
				} else {
					relatedIds.set(rel.to, targetIds);
				}
			}
		}

		for (let i = startFrom; i < count; i += batchSize) {
			const batch = this.db.batch();
			const batchCount = Math.min(batchSize, count - i);
			const batchIds: string[] = [];

			for (let j = 0; j < batchCount; j++) {
				const index = i + j;
				const docRef = collection.doc();
				const doc: any = {
					name: `${collectionName}_item_${index + 1}`,
					description: `Test data for ${collectionName} - Item ${index + 1}`,
					createdAt: admin.firestore.FieldValue.serverTimestamp(),
					updatedAt: admin.firestore.FieldValue.serverTimestamp(),
					index: index,
				};

				for (const rel of relationships) {
					if (rel.from === collectionName) {
						const targetIds = relatedIds.get(rel.to);
						if (targetIds && targetIds.length > 0) {
							const randomId = targetIds[Math.floor(Math.random() * targetIds.length)];
							if (rel.field.endsWith('Ids') || rel.field.endsWith('_ids')) {
								doc[rel.field] = [randomId];
							} else {
								doc[rel.field] = randomId;
							}
						}
					}
				}

				doc.status = ['active', 'inactive', 'pending'][Math.floor(Math.random() * 3)];
				doc.value = Math.floor(Math.random() * 1000);
				doc.isActive = Math.random() > 0.5;

				batch.set(docRef, doc);
				batchIds.push(docRef.id);
			}

			try {
				await batch.commit();
				generatedIds.push(...batchIds);

				// Callback for checkpoint updates
				if (options?.onBatchComplete) {
					await options.onBatchComplete(Math.floor(i / batchSize), batchIds);
				}
			} catch (error) {
				throw new Error(
					`Batch commit failed at index ${i}: ${error instanceof Error ? error.message : String(error)}`
				);
			}
		}

		return generatedIds;
	}
	async getPrimaryKeyField(collectionName: string): Promise<string> {
		return "id";
	}
}
