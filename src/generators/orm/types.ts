import { SchemaCollection, SchemaRelationship } from "../../types/schemaDesign";

/**
 * Supported ORM types for code generation
 */
export type ORMType = "prisma" | "typeorm" | "drizzle" | "mongoose";

/**
 * Generated code output
 */
export interface GeneratedCode {
	filename: string;
	content: string;
	language: "prisma" | "typescript";
}

/**
 * Interface for ORM code generators
 */
export interface ORMGenerator {
	/**
	 * Generate ORM-specific code from schema
	 */
	generate(
		collections: SchemaCollection[],
		relationships: SchemaRelationship[]
	): GeneratedCode;
}

/**
 * Field type mapping context
 */
export interface FieldTypeContext {
	fieldType: string;
	isPrimaryKey: boolean;
	isForeignKey: boolean;
	isSerial: boolean;
	isNullable: boolean;
	isUnique: boolean;
	defaultValue?: unknown;
	enumValues?: string[];
}
