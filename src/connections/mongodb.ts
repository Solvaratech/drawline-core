import { MongoClient } from "mongodb";
import { decrypt, inferFieldType, areTypesCompatible, calculateConfidenceScore, inferCardinality, normalizeFieldNameForComparison, jaroWinklerDistance } from "./utils";
import { FieldTypeInfo, RelationshipFeatures, RelationshipCandidate, DatabaseRelationship } from "./types";
import { getFriendlyErrorMessage } from "../utils/errorMessages";
import { logger } from "../utils";

/**
 * Handles MongoDB connections and operations.
 */
export class MongoDBHandler {
	private client: MongoClient | null = null;
	private connectionString: string;
	private databaseName: string | null = null;

	constructor(encryptedConnectionString: string, databaseName?: string) {
		this.connectionString = decrypt(encryptedConnectionString);
		this.databaseName = databaseName || this.getDatabaseNameFromUri(this.connectionString) || null;
	}

	private getDatabaseNameFromUri(uri: string): string | null {
		try {
			// Handle standard and srv connection strings
			const match = uri.match(/^mongodb(?:\+srv)?:\/\/[^\/]+\/([^\?]+)/);
			return match ? match[1] : null;
		} catch (e) {
			return null;
		}
	}

	setDatabase(databaseName: string): void {
		this.databaseName = databaseName;
	}

	private getDatabase() {
		if (!this.client) throw new Error("Not connected to MongoDB");
		return this.client.db(this.databaseName || undefined);
	}

	async connect(): Promise<void> {
		try {
			this.client = new MongoClient(this.connectionString, {
				serverSelectionTimeoutMS: 5000,
				socketTimeoutMS: 5000,
			});
			await this.client.connect();
			await this.client.db("admin").command({ ping: 1 });
		} catch (error) {
			throw new Error(getFriendlyErrorMessage(error, "MongoDB"));
		}
	}

	async disconnect(): Promise<void> {
		if (this.client) {
			await this.client.close();
			this.client = null;
		}
	}

	async listDatabases(): Promise<string[]> {
		if (!this.client) throw new Error("Not connected to MongoDB");

		const adminDb = this.client.db("admin");
		const result = await adminDb.admin().listDatabases();
		return result.databases
			.map((db) => db.name)
			.filter((name) => !["admin", "local", "config"].includes(name));
	}

	async getCollections(): Promise<string[]> {
		if (!this.client) throw new Error("Not connected to MongoDB");

		const db = this.getDatabase();
		const collections = await db.listCollections().toArray();
		return collections.map((c) => c.name);
	}

	async getCollectionStats(collectionName: string): Promise<{
		documentCount: number;
		estimatedSize: number;
	}> {
		const db = this.getDatabase();
		const collection = db.collection(collectionName);

		const documentCount = await collection.countDocuments();

		const stats = await db.command({ collStats: collectionName }).catch(() => ({ size: 0 }));

		return {
			documentCount,
			estimatedSize: (stats as Record<string, unknown>).size as number || 0,
		};
	}

	async getDocuments(
		collectionName: string,
		filter: Record<string, unknown> = {},
		skip: number = 0,
		limit: number = 50
	): Promise<unknown[]> {
		const db = this.getDatabase();
		const collection = db.collection(collectionName);

		return collection.find(filter).skip(skip).limit(limit).toArray();
	}

	async inferSchema(collectionName: string, sampleSize: number = 100): Promise<Record<string, unknown>> {
		const db = this.getDatabase();
		const collection = db.collection(collectionName);
		const { ObjectId } = await import("mongodb");

		const schemaPipeline = [
			{ $sample: { size: Math.min(sampleSize * 5, 300) } },
			{ $project: { array: { $objectToArray: "$$ROOT" } } },
			{ $unwind: "$array" },
			{ $group: { _id: null, allKeys: { $addToSet: "$array.k" } } }
		];

		let allKeys: string[] = [];
		try {
			const result = await collection.aggregate(schemaPipeline).toArray();
			if (result.length > 0 && result[0].allKeys) {
				allKeys = result[0].allKeys;
			}
		} catch (e) {
			logger.warn("MongoDBHandler", "Schema aggregation failed, falling back", e);
		}

		if (allKeys.length === 0) {
			const docs = await collection.find().limit(sampleSize).toArray();
			if (docs.length === 0) return { _id: "objectid" };
			const keysSet = new Set<string>();
			docs.forEach(d => Object.keys(d).forEach(k => keysSet.add(k)));
			allKeys = Array.from(keysSet);
		}

		const documents = await collection.find().limit(sampleSize).toArray();
		const schema: Record<string, { typeCounts: Map<string, number>; samples: unknown[] }> = {};
		allKeys.forEach(k => {
			if (!schema[k]) schema[k] = { typeCounts: new Map(), samples: [] };
		});

		documents.forEach((doc) => {
			Object.entries(doc).forEach(([key, value]) => {
				if (!schema[key]) schema[key] = { typeCounts: new Map(), samples: [] };

				let type = "unknown";
				if (value === null) type = "null";
				else if (value === undefined) type = "undefined";
				else if (typeof value === "object") {
					if (value instanceof ObjectId) {
						type = "objectid";
					} else if (value instanceof Date) {
						type = "date";
					} else if (Array.isArray(value)) {
						type = "array";
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

		const inferredSchema: Record<string, unknown> = {};
		Object.entries(schema).forEach(([key, data]) => {
			let dominantType = "string";
			let maxCount = 0;

			data.typeCounts.forEach((count, type) => {
				if (type !== "null" && type !== "undefined" && count > maxCount) {
					maxCount = count;
					dominantType = type;
				}
			});

			let finalType = dominantType;
			let itemsType: string | undefined = undefined;

			if (finalType === "array") {
				const distinctItemTypes = new Set<string>();
				data.samples.forEach((sampleVal: any) => {
					if (Array.isArray(sampleVal)) {
						sampleVal.forEach(v => {
							if (v && typeof v === 'object' && !(v instanceof ObjectId) && !(v instanceof Date)) {
								distinctItemTypes.add('object');
							} else {
								distinctItemTypes.add('primitive');
							}
						});
					}
				});

				if (distinctItemTypes.has('object') && distinctItemTypes.has('primitive')) itemsType = "mixed";
				else if (distinctItemTypes.has('object')) itemsType = "object";
				else itemsType = "primitive";
			}

			if (data.typeCounts.size === 0 && key === "_id") {
				finalType = "unknown";
			} else if (data.typeCounts.size === 0) {
				finalType = "unknown";
			}

			const fieldSchema: any = {
				type: finalType,
				nullable: data.typeCounts.has("null") || data.typeCounts.has("undefined"),
				samples: data.samples
			};

			if (finalType === "array" && itemsType) {
				fieldSchema.items = itemsType;
			}

			inferredSchema[key] = fieldSchema;
		});

		return inferredSchema;
	}


	async detectRelationships(collections: string[]): Promise<DatabaseRelationship[]> {
		const db = this.getDatabase();
		const { ObjectId } = await import("mongodb");
		const relationships: DatabaseRelationship[] = [];

		const MAX_ID_SAMPLE = 5000;

		const collectionStats = new Map<string, { size: number; ids: Set<string>; idType: FieldTypeInfo }>();
		const collectionIndexes = new Map<string, Set<string>>();
		const collectionUniqueIndexes = new Map<string, Set<string>>();

		for (const collectionName of collections) {
			const collection = db.collection(collectionName);
			const size = await collection.countDocuments();

			let ids: string[] = [];
			let idValues: any[] = [];

			if (size > MAX_ID_SAMPLE) {
				// Using limit is usually cheaper/faster than $sample for huge datasets,
				// though $sample avoids bias.
				const limitDocs = await collection.find({}, { projection: { _id: 1 } }).limit(MAX_ID_SAMPLE).toArray();
				ids = limitDocs.map(d => String(d._id));
				idValues = limitDocs.map(d => d._id);
			} else {
				const allDocs = await collection.find({}, { projection: { _id: 1 } }).toArray();
				ids = allDocs.map(d => String(d._id));
				idValues = allDocs.map(d => d._id);
			}

			collectionStats.set(collectionName, {
				size,
				ids: new Set(ids),
				idType: inferFieldType(idValues, ObjectId)
			});

			const indexes = await collection.listIndexes().toArray();
			const indexFields = new Set<string>();
			const uniqueFields = new Set<string>();

			indexes.forEach(idx => {
				Object.keys(idx.key).forEach(k => {
					indexFields.add(k);
					if (idx.unique) {
						uniqueFields.add(k);
					}
				});
			});
			collectionIndexes.set(collectionName, indexFields);
			collectionUniqueIndexes.set(collectionName, uniqueFields);
		}

		const emitted = new Set<string>();

		for (const childCollection of collections) {
			const collection = db.collection(childCollection);

			const sampleDocs = await collection.find().limit(500).toArray();
			const allFieldsSet = new Set<string>();
			sampleDocs.forEach(d => Object.keys(d).forEach(k => allFieldsSet.add(k)));
			const allFields = Array.from(allFieldsSet);

			const analysisDocs = sampleDocs;
			if (analysisDocs.length === 0) continue;

			const fieldValuesMap = new Map<string, any[]>();
			const isArrayFieldMap = new Map<string, boolean>();

			allFields.forEach(f => {
				if (f !== "_id") { fieldValuesMap.set(f, []); isArrayFieldMap.set(f, false); }
			});

			analysisDocs.forEach(doc => {
				Object.entries(doc).forEach(([k, v]) => {
					if (k === "_id" || !fieldValuesMap.has(k)) return;
					if (Array.isArray(v)) {
						isArrayFieldMap.set(k, true);
						v.forEach(val => fieldValuesMap.get(k)!.push(val));
					} else if (v !== null && v !== undefined) {
						fieldValuesMap.get(k)!.push(v);
					}
				});
			});

			for (const parentCollection of collections) {
				if (parentCollection === childCollection) continue;

				const parentStats = collectionStats.get(parentCollection);
				if (!parentStats || parentStats.ids.size === 0) continue;

				for (const [fieldName, values] of fieldValuesMap.entries()) {
					if (values.length === 0) continue;

					const fieldType = inferFieldType(values, ObjectId);
					const typeCompat = areTypesCompatible(fieldType, parentStats.idType);

					if (!typeCompat.compatible || typeCompat.score < 0.7) continue;

					let matchCount = 0;
					let validCount = 0;
					const matchedValues = new Set<string>();

					values.forEach(v => {
						const vStr = String(v);
						validCount++;
						if (parentStats.ids.has(vStr)) {
							matchCount++;
							matchedValues.add(vStr);
						}
					});

					if (validCount === 0) continue;

					const matchAccuracy = matchCount / validCount;
					if (matchAccuracy < 0.5) continue;

					const coverageRatio = parentStats.ids.size > 0 ? matchedValues.size / parentStats.ids.size : 0;

					const { normalized: normalizedField } = normalizeFieldNameForComparison(fieldName);
					const { normalized: normalizedCollection } = normalizeFieldNameForComparison(parentCollection);
					const nameSimilarityScore = jaroWinklerDistance(normalizedField, normalizedCollection);

					// Enhanced suffix detection - includes plural forms for array references
					const lowerFieldName = fieldName.toLowerCase();
					const lowerParentCollection = parentCollection.toLowerCase();
					// Singularize collection name for matching (products -> product)
					const singularCollection = lowerParentCollection.endsWith('s') && lowerParentCollection.length > 1
						? lowerParentCollection.slice(0, -1)
						: lowerParentCollection;

					const hasSuffixMatch =
						fieldName.endsWith('_id') || fieldName.endsWith('Id') || fieldName.endsWith('ID') ||
						fieldName.endsWith('_ids') || fieldName.endsWith('Ids') || fieldName.endsWith('IDS') ||
						fieldName.endsWith('Ref') || fieldName.endsWith('_ref') ||
						lowerFieldName === `${lowerParentCollection}id` ||
						lowerFieldName === `${lowerParentCollection}_id` ||
						lowerFieldName === `${singularCollection}id` ||
						lowerFieldName === `${singularCollection}_id` ||
						lowerFieldName === `${singularCollection}ids` ||
						lowerFieldName === `${singularCollection}_ids`;

					// Check for exact normalized name match (e.g., field "products" matches collection "products")
					const hasExactNormalizedMatch = normalizedField === normalizedCollection ||
						lowerFieldName === lowerParentCollection ||
						lowerFieldName === singularCollection;

					// Check if field name contains collection name or vice versa
					const hasContainmentMatch = lowerFieldName.includes(singularCollection) ||
						singularCollection.includes(normalizedField);

					//const features: RelationshipFeatures = {
					//	coverageRatio,
					//	nameSimilarityScore,
					//	hasSuffixMatch,
					//	outOfRangePercentage: 0,
					//	dataTypeMatch: true,
					//	cardinalityRisk: 0 // TODO: implement this
					//};

					let confidence = 0.5; // Base

					if (hasSuffixMatch) confidence += 0.3;
					if (hasExactNormalizedMatch) confidence += 0.25;
					if (hasContainmentMatch && !hasExactNormalizedMatch) confidence += 0.15;
					if (nameSimilarityScore > 0.8) confidence += 0.1;

					const indexes = collectionIndexes.get(parentCollection);
					if (indexes && (indexes.has(fieldName) || indexes.has(fieldName.replace(/_?id$/i, '')))) {
						confidence += 0.1;
					}

					// Skip only if no reasonable evidence of a relationship
					// - Low name similarity AND no suffix/exact match AND no containment
					if (nameSimilarityScore < 0.6 && !hasSuffixMatch && !hasExactNormalizedMatch && !hasContainmentMatch) {
						continue;
					}

					confidence = Math.min(confidence, 1.0);

					if (confidence >= 0.65) {
						const isArrayRef = isArrayFieldMap.get(fieldName) || false;

						let relType = "1:N";

						if (isArrayRef) {
							relType = "N:N";
						} else {
							const uniqueFields = collectionUniqueIndexes.get(childCollection);
							if (uniqueFields && uniqueFields.has(fieldName)) {
								relType = "1:1";
							}
						}

						const key = `${parentCollection}.${childCollection}.${fieldName}`;
						if (emitted.has(key)) continue;
						emitted.add(key);

						relationships.push({
							parentTable: parentCollection,
							childTable: childCollection,
							columns: [fieldName],
							confidence,
							type: relType,
							isArrayReference: isArrayRef
						});
					}
				}
			}
		}

		return relationships;
	}

	async createCollection(collectionName: string): Promise<void> {
		const db = this.getDatabase();
		await db.createCollection(collectionName);
	}

	async deleteCollection(collectionName: string): Promise<void> {
		const db = this.getDatabase();
		await db.collection(collectionName).drop();
	}

	async renameCollection(oldName: string, newName: string): Promise<void> {
		const db = this.getDatabase();
		await db.collection(oldName).rename(newName);
	}

	async hasData(collectionName: string): Promise<boolean> {
		const db = this.getDatabase();
		const collection = db.collection(collectionName);
		const count = await collection.countDocuments();
		return count > 0;
	}

	async clearCollection(collectionName: string): Promise<void> {
		const db = this.getDatabase();
		const collection = db.collection(collectionName);
		await collection.deleteMany({});
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
		const db = this.getDatabase();
		const collection = db.collection(collectionName);
		const { ObjectId } = await import("mongodb");

		const generatedIds: string[] = [];
		const batchSize = options?.batchSize ?? 1000;
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

		// Batching to prevent memory OOM
		for (let i = startFrom; i < count; i += batchSize) {
			const batch: any[] = [];
			const batchCount = Math.min(batchSize, count - i);

			for (let j = 0; j < batchCount; j++) {
				const index = i + j;
				const doc: any = {
					name: `${collectionName}_item_${index + 1}`,
					description: `Test data for ${collectionName} - Item ${index + 1}`,
					createdAt: new Date(),
					updatedAt: new Date(),
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
								doc[rel.field] = ObjectId.isValid(randomId) ? new ObjectId(randomId) : randomId;
							}
						}
					}
				}

				doc.status = ['active', 'inactive', 'pending'][Math.floor(Math.random() * 3)];
				doc.value = Math.floor(Math.random() * 1000);
				doc.isActive = Math.random() > 0.5;

				batch.push(doc);
			}

			if (batch.length > 0) {
				try {
					const result = await collection.insertMany(batch, { ordered: false });
					const batchIds = Object.values(result.insertedIds).map(id => id.toString());
					generatedIds.push(...batchIds);

					if (options?.onBatchComplete) {
						await options.onBatchComplete(Math.floor(i / batchSize), batchIds);
					}

					batch.length = 0;
				} catch (error: any) {
					if (error.writeErrors && error.insertedIds) {
						const insertedIds = Object.values(error.insertedIds).map((id: unknown) => String(id));
						generatedIds.push(...insertedIds);
						throw new Error(
							`Partial batch failure: ${insertedIds.length}/${batch.length} documents inserted. ` +
							`Error: ${error.message}`
						);
					}
					throw error;
				}
			}
		}

		return generatedIds;
	}
}
