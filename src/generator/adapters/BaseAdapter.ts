import type { GeneratedDocument, CollectionResult, FieldGenerationContext, RelationshipMap, TestDataConfig, CollectionIdConfig } from "../types";
import { SchemaField, SchemaCollection, SchemaRelationship } from "../../types/schemaDesign";
import { logger } from "../../utils";
import seedrandom from "seedrandom";
import crypto from "crypto";
import { Faker, en } from "@faker-js/faker";
import { fieldInferenceEngine } from "../core/FieldInferenceEngine";

export interface CollectionDetails {
	primaryKey?: string;
	primaryKeyType?: 'string' | 'integer' | 'number' | 'uuid' | 'long';
	startId?: number;
	// Composite PK support - TODO - not woriking as of now for data generation
	primaryKeys?: string[];
	primaryKeyTypes?: ('string' | 'integer' | 'number' | 'uuid' | 'long')[];
	isCompositePK?: boolean;
}

/**
 * Core database adapter logic.
 */
export abstract class BaseAdapter {
	protected faker: any;
	protected seed: number | string = 12345;
	protected sessionId: string;
	protected collectionConfigs: Map<string, CollectionIdConfig> = new Map();
	protected collectionIdToName: Map<string, string> = new Map();
	protected schemaMap: Map<string, SchemaCollection> = new Map();
	protected relationshipMap: RelationshipMap = { byFrom: new Map(), byTo: new Map(), byId: new Map() };

	constructor() {
		this.sessionId = crypto.randomBytes(8).toString("hex");
	}

	// Abstract Methods

	abstract connect(): Promise<void>;

	abstract disconnect(): Promise<void>;

	abstract insertDocuments(
		collectionName: string,
		documents: GeneratedDocument[],
		batchSize?: number,
		allowedReferenceFields?: Set<string>,
		schema?: SchemaField[]
	): Promise<(string | number)[]>;

	abstract clearCollection(collectionName: string): Promise<void>;

	abstract collectionExists(collectionName: string): Promise<boolean>;

	abstract ensureCollection(collectionName: string, schema?: SchemaField[], skipForeignKeys?: boolean): Promise<void>;

	abstract getCollectionDetails(collectionName: string): Promise<CollectionDetails>;

	abstract getDocumentCount(collectionName: string): Promise<number>;
	abstract validateReference(
		collectionName: string,
		fieldName: string,
		value: unknown
	): Promise<boolean>;

	/**
	 * Add foreign key constraints (SQL only, others no-op)
	 */
	abstract addForeignKeyConstraints(collectionName: string, schema: SchemaField[]): Promise<void>;

	/**
	 * Default uses the generic DependencyGraph class.
	 * PostgreSQL adapter can override to use actual FK constraints from the database.
	 */
	buildDependencyOrder(
		collections: SchemaCollection[],
		relationships: SchemaRelationship[]
	): SchemaCollection[] {
		const { DependencyGraph } = require("../core/DependencyGraph");
		const graph = new DependencyGraph(collections, relationships);
		return graph.getGenerationOrder();
	}

	async getCollectionSchema(collectionName: string): Promise<SchemaField[]> {
		return [];
	}

	async getPrimaryKeyField(collectionName: string): Promise<string> {
		const details = await this.getCollectionDetails(collectionName).catch(() => null);
		return details?.primaryKey || "id";
	}

	async updateSequence(collectionName: string): Promise<void> {
		// no-op by default
	}


	// Core Generation Logic

	async initialize(
		config: TestDataConfig,
		collections: SchemaCollection[],
		relationships: SchemaRelationship[],
		seed?: number | string
	): Promise<void> {
		if (seed) this.seed = seed;

		const { fakerEN } = await import("@faker-js/faker");
		this.faker = fakerEN;

		this.collectionIdToName.clear();
		this.schemaMap.clear();
		for (const col of collections) {
			this.collectionIdToName.set(col.id, col.name);
			this.schemaMap.set(col.name, col);
			// Also store with qualified name for PostgreSQL schema support
			if ((col as any).dbName && (col as any).dbName !== col.name) {
				this.schemaMap.set((col as any).dbName, col);
			}
			if (col.schema && col.name && !col.name.includes('.')) {
				this.schemaMap.set(`${col.schema}.${col.name}`, col);
			}
		}

		this.buildRelationshipMap(relationships);

		await this.preloadMetadata(collections, config);
	}


	async generateCollectionData(
		collection: SchemaCollection,
		count: number
	): Promise<GeneratedDocument[]> {
		const documents: GeneratedDocument[] = [];
		const random = seedrandom(`${this.seed}_${collection.name}`);

		// Note: Using synced schema from schemaMap to ensure FK metadata is present.
		const syncedSchema = this.schemaMap.get(collection.name) ||
			this.schemaMap.get(collection.name.split('.').pop()!) ||
			collection;

		const pkFields = syncedSchema.fields.filter(f => f.isPrimaryKey);
		const isCompositePK = pkFields.length > 1;

		for (let i = 0; i < count; i++) {
			const doc: GeneratedDocument = {
				id: undefined as any,
				data: {}
			};

			// TODO: Composite key handling not working yet
			if (isCompositePK) {
				const sortedPkFields = [...pkFields].sort((a, b) =>
					(a.compositePrimaryKeyIndex ?? 0) - (b.compositePrimaryKeyIndex ?? 0)
				);

				for (const pkField of sortedPkFields) {
					// If this PK column is also a FK, skip it - it will be populated by relationship resolver
					if (pkField.isForeignKey) {
						continue;
					}

					const pkValue = this.generatePKValue(collection.name, pkField, i);
					doc.data[pkField.name] = pkValue;
				}

				// Use first non-FK PK column as the "id" for internal tracking
				const firstNonFKPK = sortedPkFields.find(f => !f.isForeignKey);
				if (firstNonFKPK && doc.data[firstNonFKPK.name] !== undefined) {
					doc.id = doc.data[firstNonFKPK.name] as string | number;
				} else {
					doc.id = this.generateId(collection.name, i);
				}
			} else {
				const docId = this.generateId(collection.name, i);
				doc.id = docId;

				const pkField = pkFields[0];
				if (pkField) {
					doc.data[pkField.name] = docId;
				}
				if (!doc.data['id']) doc.data['id'] = docId;
			}

			const sortedFields = this.sortFieldsByDependency(syncedSchema.fields);

			for (const field of sortedFields) {
				if (field.isPrimaryKey) continue;
				if (field.name === 'id' && !field.isPrimaryKey) continue;
				if (field.type === 'reference' || field.isForeignKey) continue; // Handled by resolver

				const context: FieldGenerationContext = {
					collectionName: syncedSchema.name,
					field,
					documentIndex: i,
					seed: this.seed,
					random,
					generatedIds: new Map(),
					collectionMap: new Map(),
					relationships: [],
					doc
				};
				doc.data[field.name] = await this.generateFieldValue(context);
			}

			await this.resolveRelationships(collection.name, i, doc, random);

			documents.push(doc);
		}

		return documents;
	}

	protected generatePKValue(collectionName: string, field: SchemaField, index: number): string | number {
		const config = this.collectionConfigs.get(collectionName);
		const startId = config?.startId ?? 0;
		const effectiveIndex = index + startId;

		const fieldType = field.type.toLowerCase();

		if (fieldType === 'integer' || fieldType === 'number' || fieldType === 'long') {
			return effectiveIndex + 1;
		}
		if (fieldType === 'uuid') {
			return this.generateUUID(collectionName, effectiveIndex);
		}

		return this.generateUUID(collectionName, effectiveIndex);
	}

	/**
	 * Generates a consistent value for FK resolution (must match parent generation).
	 */
	protected generateFieldValueForFk(collectionName: string, field: SchemaField, index: number): string | number {
		const config = this.collectionConfigs.get(collectionName) ||
			this.collectionConfigs.get(collectionName.split('.').pop()!);
		const startId = config?.startId ?? 0;
		const effectiveIndex = index + startId;

		const fieldType = field.type?.toLowerCase() || 'string';
		const rawType = (field.rawType || '').toLowerCase();

		if (field.isPrimaryKey) {
			return this.generatePKValue(collectionName, field, index);
		}

		if (fieldType === 'integer' || fieldType === 'number' || fieldType === 'long' ||
			rawType.includes('int') || rawType.includes('serial')) {
			return effectiveIndex + 1;
		}

		if (fieldType === 'uuid' || rawType.includes('uuid')) {
			return this.generateUUID(collectionName + '_' + field.name, effectiveIndex);
		}

		if (fieldType === 'string' || rawType.includes('text') || rawType.includes('char')) {
			const normalizedName = collectionName.includes('.') ? collectionName.split('.').pop()! : collectionName;

			const seedInput = `${this.seed}_${field.name}_${effectiveIndex}_string`;
			let hash = 0;
			for (let i = 0; i < seedInput.length; i++) {
				hash = ((hash << 5) - hash) + seedInput.charCodeAt(i);
				hash |= 0;
			}
			this.faker.seed(hash);

			const fieldName = field.name.toLowerCase();
			let value: string;

			if (fieldName.includes('country')) {
				value = this.faker.location.country();
			} else if (fieldName.includes('code')) {
				value = this.faker.string.alphanumeric(6).toUpperCase();
			} else if (fieldName.includes('name')) {
				value = this.faker.person.fullName();
			} else {
				value = this.faker.word.words(2);
			}

			if (field.constraints?.unique) {
				const suffix = `_${effectiveIndex}`;
				const max = field.constraints?.maxLength ?? 255;
				const keep = Math.max(1, max - suffix.length);
				value = value.substring(0, keep) + suffix;
			}

			return value;
		}

		return this.generateUUID(collectionName + '_' + field.name, effectiveIndex);
	}

	protected async generateFieldValue(context: FieldGenerationContext): Promise<unknown> {
		const { field, random } = context;

		const isRequired = field.required === true;

		if (!isRequired) {
			const nullRate = field.constraints?.nullPercentage !== undefined
				? field.constraints.nullPercentage / 100
				: 0.2; // Default 20% if optional and unspecified

			if (random() < nullRate) return null;
		}

		if (field.defaultValue !== undefined && field.defaultValue !== null) {
			if (typeof field.defaultValue === "string") {
				const lower = field.defaultValue.toLowerCase().trim();
				// Handle all common timestamp/date default value patterns
				const timestampPatterns = [
					"current_timestamp",
					"current timestamp", // space variant (common in some DBs)
					"now()",
					"current_date",
					"current_time",
					"getdate()",
					"sysdate",
					"systimestamp",
					"localtimestamp",
				];
				if (timestampPatterns.some(p => lower === p || lower.startsWith(p))) {
					return new Date();
				}
			}
			return field.defaultValue;
		}

		switch (field.type) {
			case "string": return this.generateString(field, context);
			case "integer":
			case "long": return this.generateInteger(field, context);
			case "number":
			case "float":
			case "decimal": return this.generateNumber(field, context);
			case "boolean": return random() > 0.5;
			case "date":
			case "timestamptz":
			case "timestamp": return this.generateDate(field, context);

			case "object":
			case "json":
			case "map": return this.generateObject(field, context);
			case "array":
			case "set": return this.generateArray(field, context);
			case "geopoint": return this.generateGeoPoint(context);
			case "binary":
			case "bytes": return this.generateBinary(context);

			case "uuid": return this.generateUUID(context.collectionName, context.documentIndex);
			case "objectid": return this.generateObjectIdLike(context.collectionName, context.documentIndex);
			case "reference": return this.generateUUID(context.collectionName, context.documentIndex); // Placeholder ID (UUID for non-MongoDB)

			case "null": return null;
			case "undefined": return undefined;

			case "regex":
			case "symbol":
			default: return this.generateString(field, context);
		}
	}

	// Relationship Resolution

	protected async resolveRelationships(
		collectionName: string,
		index: number,
		doc: GeneratedDocument,
		random: () => number
	): Promise<void> {
		const simpleName = collectionName.includes('.') ? collectionName.split('.').pop()! : collectionName;

		// Outgoing - try both qualified and simple names
		const outgoing = this.relationshipMap.byFrom.get(collectionName) ||
			this.relationshipMap.byFrom.get(simpleName) || [];
		for (const rel of outgoing) {
			const targetName = this.collectionIdToName.get(rel.toCollectionId);
			if (!targetName) continue;
			await this.applyRelationship(rel, collectionName, targetName, index, doc, random, false);
		}

		// Incoming (One-to-Many / Many-to-Many only)
		const incoming = this.relationshipMap.byTo.get(collectionName) ||
			this.relationshipMap.byTo.get(simpleName) || [];
		for (const rel of incoming) {
			const parentName = this.collectionIdToName.get(rel.fromCollectionId);
			if (!parentName) continue;

			if (rel.type === "one-to-many" || (rel.type === "many-to-many" && rel.toField)) {
				await this.applyRelationship(rel, collectionName, parentName, index, doc, random, rel.type === "one-to-many");
			}
		}

		await this.resolveImplicitReferences(collectionName, doc, random);
	}

	protected async applyRelationship(
		rel: SchemaRelationship,
		currentCollection: string,
		targetCollection: string,
		index: number,
		doc: GeneratedDocument,
		random: () => number,
		isIncomingOneToMany: boolean
	): Promise<void> {
		const fromFields = rel.fromFields || (rel.fromField ? [rel.fromField] : []);
		const toFields = rel.toFields || (rel.toField ? [rel.toField] : []);

		if (fromFields.length > 1 || toFields.length > 1) {
			await this.applyCompositeRelationship(rel, currentCollection, targetCollection, index, doc, random, isIncomingOneToMany);
			return;
		}

		let fieldName: string | undefined;
		if (isIncomingOneToMany) {
			fieldName = rel.toField || this.inferFieldName(currentCollection, targetCollection);
		} else {
			const fromName = this.collectionIdToName.get(rel.fromCollectionId);
			if (fromName === currentCollection) {
				fieldName = rel.fromField || this.inferFieldName(currentCollection, targetCollection);
			} else {
				fieldName = rel.toField || this.inferFieldName(currentCollection, targetCollection);
			}
		}

		if (!fieldName) return;

		let value: any;
		if (isIncomingOneToMany) {
			const targetCount = this.getCount(targetCollection);
			if (targetCount > 0) {
				const parentIndex = index % targetCount;
				value = this.generateId(targetCollection, parentIndex);
			}
		} else {
			// One-to-one, Many-to-one, Many-to-many
			value = this.resolveStandardRelationship(rel, targetCollection, index, random);
		}

		if (value !== undefined && value !== null) {
			// Prevent overwriting PK
			const config = this.collectionConfigs.get(currentCollection);
			if (config && config.primaryKey === fieldName) return;

			doc.data[fieldName] = value;
		}
	}

	protected async applyCompositeRelationship(
		rel: SchemaRelationship,
		currentCollection: string,
		targetCollection: string,
		index: number,
		doc: GeneratedDocument,
		random: () => number,
		isIncomingOneToMany: boolean
	): Promise<void> {
		const targetCount = this.getCount(targetCollection);
		if (targetCount === 0) return;

		const parentIndex = index % targetCount;

		const targetSchema = this.schemaMap.get(targetCollection);
		if (!targetSchema) return;

		const targetPkFields = targetSchema.fields
			.filter(f => f.isPrimaryKey)
			.sort((a, b) => (a.compositePrimaryKeyIndex ?? 0) - (b.compositePrimaryKeyIndex ?? 0));

		const fromFields = rel.fromFields || (rel.fromField ? [rel.fromField] : []);
		const toFields = rel.toFields || (rel.toField ? [rel.toField] : []);

		for (let i = 0; i < fromFields.length; i++) {
			const childField = fromFields[i];
			const parentField = toFields[i] || targetPkFields[i]?.name || 'id';

			const parentPkField = targetPkFields.find(f => f.name === parentField) || targetPkFields[i];

			if (parentPkField) {
				const value = this.generatePKValue(targetCollection, parentPkField, parentIndex);
				doc.data[childField] = value;
			} else {
				// Fallback: use generateId for the target collection
				doc.data[childField] = this.generateId(targetCollection, parentIndex);
			}
		}
	}

	protected resolveStandardRelationship(
		rel: SchemaRelationship,
		targetCollection: string,
		index: number,
		random: () => number
	): any {
		const targetCount = this.getCount(targetCollection);
		if (targetCount === 0) return null;

		switch (rel.type) {
			case "one-to-one":
			case "many-to-one":
			case "one-to-many":
				const cyclicIndex = index % targetCount;
				return this.generateId(targetCollection, cyclicIndex);

			case "many-to-many":
				const refCount = 1 + Math.floor(random() * 3); // 1-3 refs
				const ids = new Set();
				for (let i = 0; i < refCount; i++) {
					const rIndex = Math.floor(random() * targetCount);
					ids.add(this.generateId(targetCollection, rIndex));
				}
				return Array.from(ids);

			default: return null;
		}
	}

	protected async resolveImplicitReferences(
		collectionName: string,
		doc: GeneratedDocument,
		random: () => number
	): Promise<void> {
		const schema = this.schemaMap.get(collectionName) ||
			this.schemaMap.get(collectionName.split('.').pop()!);
		if (!schema) {
			logger.warn("BaseAdapter", `resolveImplicitReferences: No schema found for ${collectionName}`);
			return;
		}

		const allCompositeGroups = new Map<string, SchemaField[]>();
		for (const field of schema.fields) {
			if (field.compositeKeyGroup && field.isForeignKey) {
				if (!allCompositeGroups.has(field.compositeKeyGroup)) {
					allCompositeGroups.set(field.compositeKeyGroup, []);
				}
				allCompositeGroups.get(field.compositeKeyGroup)!.push(field);
			}
		}

		const compositeGroups = new Map<string, SchemaField[]>();
		const singleFkFields: SchemaField[] = [];

		for (const field of schema.fields) {
			if (!field.isForeignKey && field.type !== 'reference') continue;

			// This ensures we override incorrect values from explicit relationships
			if (field.compositeKeyGroup) {
				if (!compositeGroups.has(field.compositeKeyGroup)) {
					compositeGroups.set(field.compositeKeyGroup, []);
				}
				compositeGroups.get(field.compositeKeyGroup)!.push(field);
			} else {
				if (doc.data[field.name] !== undefined && doc.data[field.name] !== null) {
					continue;
				}
				singleFkFields.push(field);
			}
		}

		for (const [groupName, fields] of compositeGroups) {
			await this.resolveCompositeFKGroup(collectionName, doc, fields, random);
		}

		for (const field of singleFkFields) {
			let targetCollectionName: string | undefined;

			if (field.isForeignKey && field.referencedCollectionId) {
				targetCollectionName = this.resolveTargetCollection(field);
			} else if (field.isForeignKey && !field.referencedCollectionId) {
				targetCollectionName = this.inferTargetFromFieldName(field.name);
			} else if (field.type === 'reference' && field.referencedCollectionId) {
				targetCollectionName = this.resolveTargetCollection(field);
			} else {
				continue;
			}

			if (!targetCollectionName) {
				logger.warn("BaseAdapter", `Could not determine target collection for FK field: ${collectionName}.${field.name}`);
				continue;
			}

			const targetCount = this.getCount(targetCollectionName);
			if (targetCount === 0) {
				logger.warn("BaseAdapter", `Target collection ${targetCollectionName} has 0 count for FK ${collectionName}.${field.name}`);
				continue;
			}

			const docIndex = typeof doc.id === 'number' ? doc.id - 1 : parseInt(String(doc.id), 10) || 0;
			const parentIndex = Math.abs(docIndex) % targetCount;

			const targetSchema = this.schemaMap.get(targetCollectionName) ||
				this.schemaMap.get(targetCollectionName.split('.').pop()!);
			const targetPkField = targetSchema?.fields.find(f => f.isPrimaryKey);

			let fkValue: string | number;
			const fieldType = field.type?.toLowerCase() || '';
			const rawType = (field.rawType || '').toLowerCase();
			const isUuidField = fieldType === 'uuid' || rawType.includes('uuid');
			const isIntegerField = fieldType === 'integer' || fieldType === 'long' ||
				rawType.includes('int') || rawType.includes('bigint') || rawType.includes('serial');

			if (isUuidField) {
				fkValue = this.generateUUID(targetCollectionName, parentIndex);
			} else if (isIntegerField) {
				const config = this.collectionConfigs.get(targetCollectionName) ||
					this.collectionConfigs.get(targetCollectionName.split('.').pop()!);
				const startId = config?.startId ?? 0;
				fkValue = parentIndex + startId + 1;
			} else if (targetPkField) {
				fkValue = this.generatePKValue(targetCollectionName, targetPkField, parentIndex);
			} else {
				fkValue = this.generateId(targetCollectionName, parentIndex);
			}

			doc.data[field.name] = fkValue;
		}
	}

	/**
	 * Resolves composite FKs by ensuring all columns reference the same parent row.
	 */
	protected async resolveCompositeFKGroup(
		collectionName: string,
		doc: GeneratedDocument,
		fkFields: SchemaField[],
		random: () => number
	): Promise<void> {
		if (fkFields.length === 0) return;

		const firstField = fkFields[0];
		const targetCollectionName = this.resolveTargetCollection(firstField);
		if (!targetCollectionName) {
			logger.warn("BaseAdapter", `Could not determine target for composite FK group in ${collectionName}`);
			return;
		}

		const targetCount = this.getCount(targetCollectionName);
		if (targetCount === 0) {
			logger.warn("BaseAdapter", `Target ${targetCollectionName} has 0 count for composite FK in ${collectionName}`);
			return;
		}

		const docIndex = typeof doc.id === 'number' ? doc.id - 1 : parseInt(String(doc.id), 10) || 0;
		const parentIndex = Math.abs(docIndex) % targetCount;

		const targetSchema = this.schemaMap.get(targetCollectionName) ||
			this.schemaMap.get(targetCollectionName.split('.').pop()!);
		if (!targetSchema) {
			logger.warn("BaseAdapter", `Could not find schema for target ${targetCollectionName}`);
			return;
		}

		const allTargetFields = targetSchema.fields;
		const targetPkFields = allTargetFields
			.filter(f => f.isPrimaryKey)
			.sort((a, b) => (a.compositePrimaryKeyIndex ?? 0) - (b.compositePrimaryKeyIndex ?? 0));

		logger.log("BaseAdapter", `Composite FK: ${collectionName} -> ${targetCollectionName}, allFields=[${allTargetFields.map(f => f.name).join(',')}], pkFields=[${targetPkFields.map(f => f.name).join(',')}]`);

		for (const fkField of fkFields) {
			const targetCol = fkField.foreignKeyTarget || fkField.name;

			let targetField = allTargetFields.find(f => f.name === targetCol) ||
				allTargetFields.find(f => f.name.toLowerCase() === targetCol?.toLowerCase());

			if (!targetField) {
				targetField = targetPkFields.find(f => f.name === targetCol) ||
					targetPkFields.find(f => f.name.toLowerCase() === targetCol?.toLowerCase());
			}

			logger.log("BaseAdapter", `FK field ${fkField.name}: foreignKeyTarget=${fkField.foreignKeyTarget}, targetCol=${targetCol}, foundField=${targetField?.name || 'NONE'} (isPK=${targetField?.isPrimaryKey})`);

			if (targetField) {
				const value = this.generateFieldValueForFk(targetCollectionName, targetField, parentIndex);
				logger.log("BaseAdapter", `Generated FK value for ${fkField.name}: ${value} (targetType: ${targetField.type})`);
				doc.data[fkField.name] = value;
			} else {
				const fieldType = fkField.type?.toLowerCase() || '';
				const rawType = (fkField.rawType || '').toLowerCase();

				logger.warn("BaseAdapter", `No target field found for ${fkField.name}, using fallback (fieldType=${fieldType}, rawType=${rawType})`);

				if (fieldType === 'uuid' || rawType.includes('uuid')) {
					doc.data[fkField.name] = this.generateUUID(targetCollectionName, parentIndex);
				} else if (fieldType === 'integer' || fieldType === 'long' ||
					rawType.includes('int') || rawType.includes('serial')) {
					const config = this.collectionConfigs.get(targetCollectionName) ||
						this.collectionConfigs.get(targetCollectionName.split('.').pop()!);
					const startId = config?.startId ?? 0;
					doc.data[fkField.name] = parentIndex + startId + 1;
				} else {
					doc.data[fkField.name] = this.generateId(targetCollectionName, parentIndex);
				}
			}
		}

		logger.log("BaseAdapter", `Resolved composite FK group for ${collectionName}, parent row: ${parentIndex}`);
	}

	/**
	 * Helper to resolve target collection name with fallback for qualified names
	 */
	protected resolveTargetCollection(field: SchemaField): string | undefined {
		if (!field.referencedCollectionId) {
			return this.inferTargetFromFieldName(field.name);
		}

		if (this.schemaMap.has(field.referencedCollectionId)) {
			return field.referencedCollectionId;
		}

		const resolvedName = this.collectionIdToName.get(field.referencedCollectionId);
		if (resolvedName && this.schemaMap.has(resolvedName)) {
			return resolvedName;
		}

		const simpleName = field.referencedCollectionId.split('.').pop()!;
		if (this.schemaMap.has(simpleName)) {
			return simpleName;
		}

		for (const key of this.schemaMap.keys()) {
			if (key.endsWith('.' + simpleName) || key === simpleName) {
				return key;
			}
		}

		return field.referencedCollectionId;
	}

	/**
	 * Infer target collection name from FK field name patterns
	 * Examples: product_id -> products, user_id -> users, order_id -> orders
	 */
	protected inferTargetFromFieldName(fieldName: string): string | undefined {
		const suffixes = ['_id', '_uuid', '_key', '_fk'];
		let baseName = fieldName.toLowerCase();

		for (const suffix of suffixes) {
			if (baseName.endsWith(suffix)) {
				baseName = baseName.slice(0, -suffix.length);
				break;
			}
		}

		const candidates = [
			baseName,
			baseName + 's',
			baseName + 'es',
			baseName.endsWith('y') ? baseName.slice(0, -1) + 'ies' : null,
		].filter(Boolean) as string[];

		for (const candidate of candidates) {
			if (this.schemaMap.has(candidate)) {
				return candidate;
			}

			for (const key of this.schemaMap.keys()) {
				if (key.endsWith('.' + candidate)) return key;
			}
		}

		return undefined;
	}



	/**
	 * Generate ID for a collection at index
	 */
	generateId(collectionName: string, index: number): string | number {
		let config = this.collectionConfigs.get(collectionName);

		if (!config && collectionName.includes('.')) {
			const simpleName = collectionName.split('.').pop()!;
			config = this.collectionConfigs.get(simpleName);
		}

		const idType = config?.idType ?? "string";
		const startId = config?.startId ?? 0;
		const effectiveIndex = index + startId;

		if (idType === "integer" || idType === "long" || idType === "bigint") return effectiveIndex + 1;
		if (idType === "uuid") return this.generateUUID(collectionName, effectiveIndex);

		if (idType === "string" || idType === "objectid" || !idType) {
			return this.generateObjectIdLike(collectionName, effectiveIndex);
		}

		throw new Error(`Unsupported ID type: '${idType}' for collection '${collectionName}'.`);
	}

	protected generateUUID(collectionName: string, index: number): string {
		const normalizedName = collectionName.includes('.')
			? collectionName.split('.').pop()!
			: collectionName;
		const input = `${normalizedName}_${index}_${this.sessionId}_${this.seed}`;
		const hash = crypto.createHash("sha256").update(input).digest("hex");
		return [
			hash.substring(0, 8), hash.substring(8, 12), hash.substring(12, 16),
			hash.substring(16, 20), hash.substring(20, 32)
		].join("-");
	}

	protected generateObjectIdLike(collectionName: string, index: number): string {
		// CRITICAL: Normalize to simple name for consistent ObjectId generation
		const normalizedName = collectionName.includes('.')
			? collectionName.split('.').pop()!
			: collectionName;
		const input = `${normalizedName}_${index}_${this.sessionId}_${this.seed}`;
		const hash = crypto.createHash("sha256").update(input).digest("hex");
		return hash.substring(0, 24);
	}

	protected getCount(collectionName: string): number {
		let config = this.collectionConfigs.get(collectionName);

		if (!config && collectionName.includes('.')) {
			const simpleName = collectionName.split('.').pop()!;
			config = this.collectionConfigs.get(simpleName);
		}

		return config?.count ?? 0;
	}

	protected async preloadMetadata(collections: SchemaCollection[], config: TestDataConfig): Promise<void> {
		const configMap = new Map(config.collections.map(c => [c.collectionName, c.count]));

		for (const col of collections) {
			const count = configMap.get(col.name) ?? 0;

			const fullDbName = (col as any).dbName ||
				(col.schema && col.schema !== 'public' ? `${col.schema}.${col.name}` : col.name);

			let details: CollectionDetails | undefined;
			try {
				details = await this.getCollectionDetails(fullDbName);
			} catch (e) {
				// Ignore connection errors or missing collection errors
			}

			const pkField = col.fields.find(f => f.isPrimaryKey) || col.fields.find(f => f.name === 'id');
			let idType: "integer" | "string" | "uuid" | "objectid" = "string";

			if (pkField) {
				if (['integer', 'number', 'float', 'decimal', 'double', 'real', 'serial', 'bigserial', 'long', 'bigint'].includes(pkField.type)) {
					idType = 'integer';
				}
				else if (pkField.type === 'uuid') idType = 'uuid';
				else if (pkField.type === 'objectid') idType = 'objectid';

				if (pkField.type === 'string' && details?.primaryKeyType) {
					if (details.primaryKeyType === 'uuid') idType = 'uuid';
					if (details.primaryKeyType === 'integer') idType = 'integer';
				}
			} else if (details?.primaryKeyType) {
				if (details.primaryKeyType === 'integer' || details.primaryKeyType === 'number' || details.primaryKeyType === 'long') idType = 'integer';
				else if (details.primaryKeyType === 'uuid') idType = 'uuid';
			}

			let startId = 0;
			if (details?.startId) {
				startId = details.startId;
			}

			try {
				const dbSchema = await this.getCollectionSchema(fullDbName);
				if (dbSchema && dbSchema.length > 0) {
					logger.log("BaseAdapter", `Syncing schema for ${col.name} with ${dbSchema.length} DB fields`);
					for (const dbField of dbSchema) {
						const schemaField = col.fields.find(f => f.name === dbField.name);
						if (schemaField) {
							if (dbField.constraints?.enum && dbField.constraints.enum.length > 0) {
								logger.log("BaseAdapter", `Syncing Enum for ${col.name}.${dbField.name}:`, dbField.constraints.enum);
								schemaField.constraints = {
									...schemaField.constraints,
									enum: dbField.constraints.enum
								};
							}

							if (dbField.constraints?.unique) {
								logger.log("BaseAdapter", `Enforcing unique for ${col.name}.${dbField.name}`);
								schemaField.constraints = {
									...schemaField.constraints,
									unique: true
								};
							}

							const dbC = dbField.constraints;
							if (dbC && (dbC.min !== undefined || dbC.max !== undefined || dbC.minLength !== undefined || dbC.maxLength !== undefined ||
								dbC.minColumn || dbC.maxColumn || dbC.gtColumn || dbC.ltColumn)) {

								schemaField.constraints = {
									...schemaField.constraints,
									min: dbC.min,
									max: dbC.max,
									minLength: dbC.minLength,
									maxLength: dbC.maxLength,
									minColumn: dbC.minColumn,
									maxColumn: dbC.maxColumn,
									gtColumn: dbC.gtColumn,
									ltColumn: dbC.ltColumn
								};
							}

							if (dbField.type && schemaField.type !== dbField.type) {
								const oldType = schemaField.type;

								if (dbField.type === 'uuid') {
									schemaField.type = 'uuid';
								}
								else if ((dbField.type === 'integer' || dbField.type === 'long') &&
									(oldType === 'string' || oldType === 'reference' || oldType === 'objectid')) {
									schemaField.type = dbField.type;
								}
								else if ((dbField.type === 'date' || dbField.type === 'timestamp' || dbField.type === 'timestamptz') &&
									oldType === 'string') {
									schemaField.type = dbField.type;
								}
								else if (dbField.type === 'boolean' && oldType !== 'boolean') {
									schemaField.type = 'boolean';
								}
								else {
									if (dbField.type !== 'string') {
										schemaField.type = dbField.type;
									}
								}
							}

							if (dbField.required && !schemaField.required) {
								schemaField.required = true;
							}

							if (dbField.constraints?.min !== undefined) {
								schemaField.constraints = {
									...schemaField.constraints,
									min: dbField.constraints.min
								};
							}
							if (dbField.constraints?.max !== undefined) {
								schemaField.constraints = {
									...schemaField.constraints,
									max: dbField.constraints.max
								};
							}

							if (dbField.constraints?.minLength !== undefined) {
								schemaField.constraints = {
									...schemaField.constraints,
									minLength: dbField.constraints.minLength
								};
							}
							if (dbField.constraints?.maxLength !== undefined) {
								schemaField.constraints = {
									...schemaField.constraints,
									maxLength: dbField.constraints.maxLength
								};
							}

							if (dbField.isPrimaryKey !== undefined) {
								schemaField.isPrimaryKey = dbField.isPrimaryKey;
							}
							if (dbField.compositePrimaryKeyIndex !== undefined) {
								schemaField.compositePrimaryKeyIndex = dbField.compositePrimaryKeyIndex;
							}
							if (dbField.isForeignKey) {
								schemaField.isForeignKey = true;
								if (dbField.referencedCollectionId) {
									schemaField.referencedCollectionId = dbField.referencedCollectionId;
								}
								if (dbField.foreignKeyTarget) {
									schemaField.foreignKeyTarget = dbField.foreignKeyTarget;
								}
							}

							if (dbField.compositeKeyGroup) {
								schemaField.compositeKeyGroup = dbField.compositeKeyGroup;
							}

							if (dbField.rawType && !schemaField.rawType) {
								schemaField.rawType = dbField.rawType;
							}
						} else {
							col.fields.push({
								id: dbField.id || dbField.name,
								name: dbField.name,
								type: dbField.type,
								rawType: dbField.rawType,
								isPrimaryKey: dbField.isPrimaryKey,
								isForeignKey: dbField.isForeignKey,
								compositePrimaryKeyIndex: dbField.compositePrimaryKeyIndex,
								compositeKeyGroup: dbField.compositeKeyGroup,
								referencedCollectionId: dbField.referencedCollectionId,
								foreignKeyTarget: dbField.foreignKeyTarget,
								required: dbField.required,
								constraints: dbField.constraints
							});
						}
					}
				} else {
					logger.log("BaseAdapter", `No DB schema found for ${col.name}`);
				}
			} catch (e) {
				logger.warn("BaseAdapter", `Failed to sync schema for ${col.name}:`, e);
			}


			const finalIdType = pkField?.type || details?.primaryKeyType || 'string';

			const configEntry = {
				collectionName: col.name,
				primaryKey: pkField?.name || details?.primaryKey || "id",
				idType: finalIdType as any,
				startId,
				count
			};

			this.collectionConfigs.set(col.name, configEntry);
			if ((col as any).dbName && (col as any).dbName !== col.name) {
				this.collectionConfigs.set((col as any).dbName, configEntry);
			}
			if (col.schema && col.name && !col.name.includes('.')) {
				this.collectionConfigs.set(`${col.schema}.${col.name}`, configEntry);
			}

		}

	}

	/**
	 * Sort fields topologically based on cross-column constraints.
	 * If B depends on A (e.g. B > A), A comes first.
	 */
	protected sortFieldsByDependency(fields: SchemaField[]): SchemaField[] {
		const dependencyMap = new Map<string, Set<string>>();
		const nameToField = new Map<string, SchemaField>();

		for (const field of fields) {
			nameToField.set(field.name, field);
			if (!dependencyMap.has(field.name)) {
				dependencyMap.set(field.name, new Set());
			}

			const c = field.constraints;
			if (c) {
				const deps = [c.minColumn, c.maxColumn, c.gtColumn, c.ltColumn];
				for (const dep of deps) {
					if (dep) {
						dependencyMap.get(field.name)!.add(dep);
					}
				}
			}
		}

		const visited = new Set<string>();
		const tempVisited = new Set<string>();
		const sorted: SchemaField[] = [];

		const visit = (fieldName: string) => {
			if (tempVisited.has(fieldName)) return; // Cyclic dependency detected, ignore
			if (visited.has(fieldName)) return;

			tempVisited.add(fieldName);

			const deps = dependencyMap.get(fieldName);
			if (deps) {
				for (const depName of deps) {
					if (nameToField.has(depName)) {
						visit(depName);
					}
				}
			}

			tempVisited.delete(fieldName);
			visited.add(fieldName);

			const f = nameToField.get(fieldName);
			if (f) sorted.push(f);
		};

		for (const field of fields) {
			visit(field.name);
		}

		return sorted;
	}

	protected buildRelationshipMap(relationships: SchemaRelationship[]): void {
		this.relationshipMap = { byFrom: new Map(), byTo: new Map(), byId: new Map() };

		for (const rel of relationships) {
			this.relationshipMap.byId.set(rel.id, rel);

			const fromName = this.collectionIdToName.get(rel.fromCollectionId);
			if (fromName) {
				if (!this.relationshipMap.byFrom.has(fromName)) this.relationshipMap.byFrom.set(fromName, []);
				this.relationshipMap.byFrom.get(fromName)!.push(rel);
			}

			const toName = this.collectionIdToName.get(rel.toCollectionId);
			if (toName) {
				if (!this.relationshipMap.byTo.has(toName)) this.relationshipMap.byTo.set(toName, []);
				this.relationshipMap.byTo.get(toName)!.push(rel);
			}
		}
	}

	protected seedFaker(context: FieldGenerationContext, suffix: string = ""): void {
		const { seed, documentIndex, field, collectionName } = context;

		const config = this.collectionConfigs.get(collectionName);
		const startId = config?.startId ?? 0;
		const effectiveIndex = documentIndex + startId;

		const input = `${seed}_${field.name}_${effectiveIndex}_${suffix}`;

		let hash = 0;
		for (let i = 0; i < input.length; i++) {
			hash = ((hash << 5) - hash) + input.charCodeAt(i);
			hash |= 0;
		}

		this.faker = new Faker({ locale: [en] });
		this.faker.seed(Math.abs(hash));
	}

	protected generateString(field: SchemaField, context: FieldGenerationContext): string {
		this.seedFaker(context, "string");

		let value = "";
		const fieldName = field.name.toLowerCase();
		const isEmailField = fieldName.includes("email");
		const isIdField = fieldName === 'id' || fieldName.endsWith('_id') || fieldName.endsWith('guid') || fieldName.endsWith('uuid');


		if (isEmailField) {
			value = this.faker.internet.email().toLowerCase();
		}
		else if (isIdField) {
			value = this.generateUUID(context.collectionName, context.documentIndex);
		}
		else if (field.constraints?.enum && field.constraints.enum.length > 0) {
			value = this.faker.helpers.arrayElement(field.constraints.enum);
		}
		else if (field.constraints?.pattern) {
			try {
				value = this.faker.helpers.fromRegExp(field.constraints.pattern);
			} catch {
				value = this.smartString(field.name, context.collectionName);
			}
		}
		else {
			value = this.smartString(field.name, context.collectionName);
		}

		if (field.constraints?.trim) value = value.trim();
		if (field.constraints?.lowercase) value = value.toLowerCase();
		if (field.constraints?.uppercase) value = value.toUpperCase();

		if (field.constraints?.unique) {
			const config = this.collectionConfigs.get(context.collectionName);
			const startId = config?.startId ?? 0;
			const idx = context.documentIndex + startId;

			if (isEmailField && value.includes("@")) {
				const [local, domain] = value.split("@");

				const suffix = `_${idx}`;
				const max = field.constraints?.maxLength ?? 254;

				// Reserve space for "_idx@domain"
				const overhead = suffix.length + domain.length + 1;
				const keep = Math.max(1, max - overhead);

				const safeLocal = local.substring(0, keep);
				value = `${safeLocal}${suffix}@${domain}`;
			} else {
				const suffix = `_${idx}`;
				const max = field.constraints?.maxLength ?? 255;

				const keep = Math.max(1, max - suffix.length);
				value = value.substring(0, keep) + suffix;
			}
		}
		else {
			const max = field.constraints?.maxLength ?? 255;
			if (value.length > max) value = value.substring(0, max);
		}

		const min = field.constraints?.minLength ?? 0;
		if (value.length < min) {
			while (value.length < min) {
				const additionalWord = this.faker.lorem.word();
				value = value + " " + additionalWord;
			}
			if (value.length > min) {
				const lastSpace = value.lastIndexOf(' ', min);
				if (lastSpace > min * 0.7) {
					value = value.substring(0, lastSpace);
				} else {
					value = value.substring(0, min);
				}
			}
		}

		return value;
	}


	protected smartString(fieldName: string, collectionName: string): string {
		const result = fieldInferenceEngine.getGenerator(fieldName, collectionName);
		// Pass the seeded faker instance from BaseAdapter to ensure determinism
		const value = result.generator(this.faker);
		return String(value);
	}

	protected generateObject(field: SchemaField, context: FieldGenerationContext): object {
		this.seedFaker(context, "object");
		return {
			key: this.faker.lorem.word(),
			value: this.faker.lorem.sentence(),
			active: this.faker.datatype.boolean()
		};
	}

	protected generateArray(field: SchemaField, context: FieldGenerationContext): unknown[] {
		this.seedFaker(context, "array");
		const count = this.faker.number.int({ min: 1, max: 5 });
		const items: unknown[] = [];
		const itemType = field.arrayItemType || 'string';

		for (let i = 0; i < count; i++) {
			if (itemType === 'string') items.push(this.faker.lorem.word());
			else if (itemType === 'integer') items.push(this.faker.number.int({ min: 0, max: 100 }));
			else if (itemType === 'boolean') items.push(this.faker.datatype.boolean());
			else items.push(this.faker.lorem.word());
		}

		return items;
	}

	protected generateGeoPoint(context: FieldGenerationContext): { lat: number, lng: number } {
		this.seedFaker(context, "geo");
		return {
			lat: this.faker.location.latitude(),
			lng: this.faker.location.longitude()
		};
	}

	protected generateBinary(context: FieldGenerationContext): string {
		this.seedFaker(context, "binary");
		return this.faker.string.hexadecimal({ length: 16 });
	}

	protected generateInteger(field: SchemaField, context: FieldGenerationContext): number {
		this.seedFaker(context, "int");

		if (field.constraints?.unique) {
			const start = (this.collectionConfigs.get(context.collectionName)?.startId ?? 0) + 1;
			return start + context.documentIndex;
		}

		const min = Number(field.constraints?.min) || 0;
		const max = Number(field.constraints?.max) || 10000;
		let val = this.faker.number.int({ min, max });

		val = this.applyCrossColumnConstraints(val, field, context) as number;
		return Math.round(val);
	}

	protected generateNumber(field: SchemaField, context: FieldGenerationContext): number {
		this.seedFaker(context, "number");
		const min = Number(field.constraints?.min) || 0;
		const max = Number(field.constraints?.max) || 10000;
		let val = this.faker.number.float({ min, max });

		val = this.applyCrossColumnConstraints(val, field, context) as number;
		return val;
	}

	protected generateDate(field: SchemaField, context: FieldGenerationContext): Date {
		this.seedFaker(context, "date");

		const createdVal = context.doc?.data?.['createdAt'];
		if (field.name === 'updatedAt' && createdVal) {
			const createdAt = new Date(createdVal as string | number | Date);
			if (!isNaN(createdAt.getTime())) {
				const from = createdAt.getTime();
				const to = from + 10 * 24 * 60 * 60 * 1000; // +10 days
				const offset = Math.floor(context.random() * (to - from));
				return new Date(from + offset);
			}
		}

		if (field.constraints?.startDate || field.constraints?.endDate) {
			const from = field.constraints.startDate
				? new Date(field.constraints.startDate)
				: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000); // 1 year past

			const to = field.constraints.endDate
				? new Date(field.constraints.endDate)
				: new Date();

			if (from.getTime() >= to.getTime()) {
				return from;
			}

			const offset = Math.floor(
				context.random() * (to.getTime() - from.getTime())
			);
			return new Date(from.getTime() + offset);
		}

		const now = Date.now();
		const past = now - 365 * 24 * 60 * 60 * 1000;
		const offset = Math.floor(context.random() * (now - past));

		let generatedDate = new Date(past + offset);

		generatedDate = this.applyCrossColumnConstraints(generatedDate, field, context) as Date;

		return generatedDate;
	}


	/**
	 * Apply cross-column constraints (minColumn, maxColumn, gtColumn, ltColumn)
	 */
	protected applyCrossColumnConstraints(
		value: number | Date,
		field: SchemaField,
		context: FieldGenerationContext
	): number | Date {
		const constraints = field.constraints;
		if (!constraints) return value;

		const getRefValue = (colName: string): number | Date | undefined => {
			const refVal = context.doc?.data?.[colName];
			if (refVal === undefined || refVal === null) return undefined;

			if (value instanceof Date) {
				const d = new Date(refVal as string | number | Date);
				return isNaN(d.getTime()) ? undefined : d;
			}
			return Number(refVal);
		};

		let adjusted = value;

		if (constraints.minColumn) {
			const minVal = getRefValue(constraints.minColumn);
			if (minVal !== undefined) {
				if (adjusted < minVal) {
					if (adjusted instanceof Date) {
						// Add random offset between 1 min and 10 days (deterministic if random is seeded)
						const offset = 60 * 1000 + Math.floor(context.random() * 10 * 24 * 60 * 60 * 1000);
						adjusted = new Date((minVal as Date).getTime() + offset);
					} else {
						adjusted = (minVal as number) + Math.abs(adjusted as number);
					}
				}
			}
		}

		if (constraints.gtColumn) {
			const gtVal = getRefValue(constraints.gtColumn);
			if (gtVal !== undefined) {
				if (adjusted <= gtVal) {
					if (adjusted instanceof Date) {
						const offset = 60 * 1000 + Math.floor(context.random() * 10 * 24 * 60 * 60 * 1000);
						adjusted = new Date((gtVal as Date).getTime() + offset);
					} else {
						adjusted = (gtVal as number) + Math.max(1, Math.abs(adjusted as number));
					}
				}
			}
		}

		if (constraints.maxColumn) {
			const maxVal = getRefValue(constraints.maxColumn);
			if (maxVal !== undefined) {
				if (adjusted > maxVal) {
					if (adjusted instanceof Date) {
						const offset = 60 * 1000 + Math.floor(context.random() * 10 * 24 * 60 * 60 * 1000);
						adjusted = new Date((maxVal as Date).getTime() - offset);
					} else {
						const minLimit = Number(constraints.min ?? 0);
						const maxRef = maxVal as number;

						if (maxRef > minLimit) {
							const range = maxRef - minLimit;
							adjusted = minLimit + (Math.abs(adjusted as number) % range);
						} else {
							adjusted = maxRef;
						}
					}
				}
			}
		}

		if (constraints.ltColumn) {
			const ltVal = getRefValue(constraints.ltColumn);
			if (ltVal !== undefined) {
				if (adjusted >= ltVal) {
					if (adjusted instanceof Date) {
						const offset = 60 * 1000 + Math.floor(context.random() * 10 * 24 * 60 * 60 * 1000);
						adjusted = new Date((ltVal as Date).getTime() - offset);
					} else {
						const minLimit = Number(constraints.min ?? 0);
						const ltRef = ltVal as number;

						if (ltRef > minLimit) {
							const range = ltRef - minLimit;
							adjusted = minLimit + (Math.abs(adjusted as number) % range);
						} else {
							adjusted = ltRef - 1;
						}
					}
				}
			}
		}

		return adjusted;
	}

	protected inferFieldName(currentCollectionName: string, targetCollection: string): string | undefined {
		const collection = this.schemaMap.get(currentCollectionName);
		if (!collection) return undefined;

		const lowerTarget = targetCollection.toLowerCase();
		const candidates = [
			`${lowerTarget}Id`,
			`${lowerTarget}_id`,
			lowerTarget
		];

		for (const field of collection.fields) {
			if (candidates.includes(field.name)) return field.name;
			if (field.isForeignKey && field.referencedCollectionId === targetCollection) return field.name;
		}

		return `${lowerTarget}Id`;
	}
}
