export interface FieldTypeInfo {
	primaryType: "ObjectId" | "String" | "Number" | "Mixed" | "Null";
	secondaryTypes?: string[];
	percentageOfPrimaryType: number;
	isNumericString?: boolean;
	isUUID?: boolean;
	averageLength?: number;
}

export interface RelationshipFeatures {
	coverageRatio: number;
	nameSimilarityScore: number;
	hasSuffixMatch: boolean;
	outOfRangePercentage: number;
	dataTypeMatch: boolean;
	cardinalityRisk: number;
}

export interface RelationshipCandidate {
	fromCollection: string;      // Table being pointed to (e.g. "users")
	toCollection: string;         // Table holding the foreign key (e.g. "orders")
	field: string;               // The actual FK column (e.g. "userId")
	matchedCount: number;
	totalFieldValues: number;
	confidence: number;
	features: RelationshipFeatures;
	relationshipType: "1:1" | "1:N" | "N:M";
}

export interface DatabaseRelationship {
	parentTable: string;
	childTable: string;
	columns: string[];
	parentColumns?: string[];
	confidence: number;
	type?: string;
	isArrayReference?: boolean;
}

