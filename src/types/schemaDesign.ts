/**
 * Types for the Schema Designer.
 */

export const DATABASE_TYPES = ["mongodb", "postgresql", "firestore", "sqlite", "mysql", "csv"] as const;
export type DatabaseType = typeof DATABASE_TYPES[number];

export type FieldType =
	| "string"
	| "integer"
	| "number"
	| "boolean"
	| "date"
	| "object"
	| "array"
	| "reference"
	| "null"
	| "undefined"
	| "objectid"
	| "binary"
	| "timestamp"
	| "long"
	| "decimal"
	| "float"
	| "regex"
	| "symbol"
	| "map"
	| "set"
	| "uuid"
	| "json"
	| "geopoint"
	| "bytes"
	| "timestamptz";

/**
 * Constraints for data validation and generation.
 */
export interface FieldConstraints {
	minLength?: number;
	maxLength?: number;
	pattern?: string;
	enum?: string[];

	min?: number;
	max?: number;
	multipleOf?: number;

	minItems?: number;
	maxItems?: number;
	uniqueItems?: boolean;

	unique?: boolean;
	index?: boolean;
	sparse?: boolean;
	immutable?: boolean;
	lowercase?: boolean;
	uppercase?: boolean;
	trim?: boolean;

	startDate?: string;
	endDate?: string;

	nullPercentage?: number;

	// Cross-column constraints
	minColumn?: string; // value >= column
	maxColumn?: string; // value <= column
	gtColumn?: string; // value > column
	ltColumn?: string; // value < column
}

export interface SchemaField {
	id: string;
	name: string;
	type: FieldType;
	required?: boolean;
	defaultValue?: unknown;
	arrayItemType?: FieldType;
	objectFields?: SchemaField[];
	referencedCollectionId?: string;
	description?: string;
	constraints?: FieldConstraints;
	uneditable?: boolean;
	isPrimaryKey?: boolean;
	isForeignKey?: boolean;
	foreignKeyTarget?: string;
	rawType?: string;
	nullable?: boolean;
	isSerial?: boolean;
	// Composite key support
	// Composite PK index (undefined if single PK).
	compositePrimaryKeyIndex?: number;
	// Composite FK group name.
	compositeKeyGroup?: string;
}

export interface SchemaCollection {
	id: string;
	name: string;
	displayName?: string;
	fields: SchemaField[];
	position: { x: number; y: number };
	color?: string;
	// Firestore subcollection metadata
	isSubcollection?: boolean;
	parentCollection?: string;
	documentId?: string;
	dbName?: string;
	// Postgres schema
	schema?: string;
}

export interface SchemaRelationship {
	id: string;
	fromCollectionId: string;
	toCollectionId: string;
	type: "one-to-one" | "one-to-many" | "many-to-many" | "many-to-one";
	// Single field (backward compatibility)
	fromField?: string;
	toField?: string;
	// Composite key support: arrays of fields for multi-column relationships
	fromFields?: string[];
	toFields?: string[];
	data?: Record<string, any>;
}

export interface SchemaDesign {
	collections: SchemaCollection[];
	relationships: SchemaRelationship[];
	version: number;
}

