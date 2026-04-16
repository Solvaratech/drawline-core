import { SchemaCollection, SchemaRelationship, SchemaField, FieldType } from "../types/schemaDesign";

// Re-export IdType from local definitions
export type IdType = "string" | "integer" | "uuid" | "objectid" | "long" | "bigint";

export interface CollectionIdConfig {
	collectionName: string;
	primaryKey: string;
	idType: IdType;
	startId: number;
	count: number;
}

export interface IdGeneratorOptions {
	seed?: number | string;
	sessionId?: string;
}



/**
 * Config for test data generation for a collection.
 */
export interface CollectionConfig {
	collectionName: string;
	count: number;
	distribution?: "uniform" | "normal" | "exponential";
	relationshipConfig?: Record<string, RelationshipConfig>;
}

/**
 * Relationship population config.
 */
export interface RelationshipConfig {
	minReferences?: number;
	maxReferences?: number;
	distribution?: "uniform" | "weighted";
	// For many-to-many: how many references per document
	averageReferences?: number;
}

/**
 * Main config for test data generation.
 */
export interface TestDataConfig {
	collections: CollectionConfig[];
	relationships: SchemaRelationship[];
	seed?: number | string;
	validateAfter?: boolean;
	batchSize?: number;
	allowProduction?: boolean;
	onProgress?: (progress: ProgressUpdate) => Promise<void> | void;
}

export interface ProgressUpdate {
	collectionName: string;
	generatedCount: number;
	totalCount: number;
	tps?: number;
	elapsedMs?: number;
	estimatedRemainingMs?: number;
}

/**
 * Generated document with its ID
 */
export interface GeneratedDocument {
	id: string | number;
	pkValues?: Record<string, string | number>; // For composite primary keys
	data: Record<string, unknown>;
}

/**
 * Collection generation result
 */
export interface CollectionResult {
	collectionName: string;
	generatedIds: (string | number)[];
	documentCount: number;
	errors?: string[];
	startId?: number;
	idType?: string;
}

/**
 * Validation result for a relationship
 */
export interface RelationshipValidationResult {
	relationshipId: string;
	fromCollection: string;
	toCollection: string;
	type: string;
	valid: boolean;
	issues: string[];
	checkedCount: number;
}

/**
 * Overall validation result
 */
export interface ValidationResult {
	valid: boolean;
	relationshipResults: RelationshipValidationResult[];
	orphanReferences: Array<{
		collection: string;
		field: string;
		invalidId: string;
	}>;
	summary: {
		totalRelationships: number;
		validRelationships: number;
		invalidRelationships: number;
		totalOrphans: number;
	};
}

/**
 * Complete generation result
 */
export interface GenerationResult {
	success: boolean;
	collections: CollectionResult[];
	validation?: ValidationResult;
	errors?: string[];
	warnings?: string[];
	totalDocumentsGenerated: number;
}

/**
 * Dependency graph node
 */
export interface DependencyNode {
	collectionName: string;
	collection: SchemaCollection;
	dependencies: Set<string>;
	strongDependencies: Set<string>;
	dependents: Set<string>;
	level: number;
}

/**
 * Relationship mapping helper.
 */
export interface RelationshipMap {
	byFrom: Map<string, SchemaRelationship[]>; // Collection name -> relationships where it's the source
	byTo: Map<string, SchemaRelationship[]>; // Collection name -> relationships where it's the target
	byId: Map<string, SchemaRelationship>; // Relationship ID -> relationship
}

// TODO - some of these are not in use, need to check and rmeove
export type IdMetadata = {
	type: "deterministic";
	count: number;
	sessionId: string;
	seed?: number | string;
	startId?: number;
	idType?: string;
};

export type IdTracker = Map<string, string[] | IdMetadata>;
export interface FieldGenerationContext {
	field: SchemaField;
	collectionName: string;
	documentIndex: number;
	generatedIds: IdTracker;
	collectionMap: Map<string, SchemaCollection>;
	relationships: SchemaRelationship[];
	seed: number | string;
	random: () => number; // Seeded random function
	doc?: GeneratedDocument;
}
