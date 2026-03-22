/**
 * ORM Code Generators
 * 
 * Generate ORM-specific code from Drawline schema definitions
 */

export { PrismaGenerator } from "./PrismaGenerator";
export { TypeORMGenerator } from "./TypeORMGenerator";
export { DrizzleGenerator } from "./DrizzleGenerator";
export { MongooseGenerator } from "./MongooseGenerator";

export type { ORMType, ORMGenerator, GeneratedCode, FieldTypeContext } from "./types";

import { SchemaCollection, SchemaRelationship } from "../../types/schemaDesign";
import { ORMType, GeneratedCode } from "./types";
import { PrismaGenerator } from "./PrismaGenerator";
import { TypeORMGenerator } from "./TypeORMGenerator";
import { DrizzleGenerator } from "./DrizzleGenerator";
import { MongooseGenerator } from "./MongooseGenerator";

/**
 * Factory function to generate ORM code
 */
export function generateORMCode(
	ormType: ORMType,
	collections: SchemaCollection[],
	relationships: SchemaRelationship[]
): GeneratedCode {
	switch (ormType) {
		case "prisma":
			return new PrismaGenerator().generate(collections, relationships);
		case "typeorm":
			return new TypeORMGenerator().generate(collections, relationships);
		case "drizzle":
			return new DrizzleGenerator().generate(collections, relationships);
		case "mongoose":
			return new MongooseGenerator().generate(collections, relationships);
		default:
			throw new Error(`Unknown ORM type: ${ormType}`);
	}
}
