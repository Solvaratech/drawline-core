import { SchemaCollection, SchemaRelationship, SchemaField, FieldType } from "../../types/schemaDesign";
import { GeneratedCode, ORMGenerator, FieldTypeContext } from "./types";

/**
 * Generates Prisma schema files from canvas schema
 */
export class PrismaGenerator implements ORMGenerator {
	/**
	 * Map Drawline field types to Prisma types
	 */
	private mapFieldType(ctx: FieldTypeContext): string {
		const { fieldType, isPrimaryKey, isSerial } = ctx;

		// Handle serial/auto-increment
		if (isPrimaryKey && isSerial) {
			return "Int";
		}

		const typeMap: Record<string, string> = {
			string: "String",
			integer: "Int",
			number: "Float",
			boolean: "Boolean",
			date: "DateTime",
			timestamp: "DateTime",
			timestamptz: "DateTime",
			uuid: "String",
			objectid: "String",
			long: "BigInt",
			bigint: "BigInt",
			decimal: "Decimal",
			float: "Float",
			json: "Json",
			object: "Json",
			array: "Json",
			binary: "Bytes",
			bytes: "Bytes",
		};

		return typeMap[fieldType.toLowerCase()] || "String";
	}

	/**
	 * Generate field decorators
	 */
	private getFieldDecorators(field: SchemaField, isSerial: boolean): string[] {
		const decorators: string[] = [];

		if (field.isPrimaryKey) {
			decorators.push("@id");
			if (isSerial || field.isSerial) {
				decorators.push("@default(autoincrement())");
			} else if (field.type === "uuid") {
				decorators.push("@default(uuid())");
			}
		}

		if (field.constraints?.unique && !field.isPrimaryKey) {
			decorators.push("@unique");
		}

		if (field.defaultValue !== undefined && field.defaultValue !== null && !field.isPrimaryKey) {
			const defStr = String(field.defaultValue).toLowerCase();
			if (defStr.includes("now()") || defStr.includes("current_timestamp")) {
				decorators.push("@default(now())");
			} else if (typeof field.defaultValue === "string") {
				decorators.push(`@default("${field.defaultValue}")`);
			} else if (typeof field.defaultValue === "number" || typeof field.defaultValue === "boolean") {
				decorators.push(`@default(${field.defaultValue})`);
			}
		}

		return decorators;
	}

	/**
	 * Generate Prisma model from collection
	 */
	private generateModel(
		collection: SchemaCollection,
		relationships: SchemaRelationship[],
		collectionMap: Map<string, SchemaCollection>
	): string {
		const lines: string[] = [];
		const modelName = this.toPascalCase(collection.name);

		lines.push(`model ${modelName} {`);

		// Generate fields
		for (const field of collection.fields) {
			const ctx: FieldTypeContext = {
				fieldType: field.type,
				isPrimaryKey: !!field.isPrimaryKey,
				isForeignKey: !!field.isForeignKey,
				isSerial: !!field.isSerial,
				isNullable: !field.required && !field.isPrimaryKey,
				isUnique: !!field.constraints?.unique,
				defaultValue: field.defaultValue,
				enumValues: field.constraints?.enum,
			};

			const prismaType = this.mapFieldType(ctx);
			const nullable = ctx.isNullable ? "?" : "";
			const decorators = this.getFieldDecorators(field, ctx.isSerial);

			lines.push(`  ${field.name} ${prismaType}${nullable} ${decorators.join(" ")}`.trimEnd());
		}

		// Generate relationships
		const outgoingRels = relationships.filter(r => r.fromCollectionId === collection.id);
		const incomingRels = relationships.filter(r => r.toCollectionId === collection.id);

		// Outgoing relations (this collection has FK)
		for (const rel of outgoingRels) {
			const targetCollection = collectionMap.get(rel.toCollectionId);
			if (!targetCollection) continue;

			const targetModelName = this.toPascalCase(targetCollection.name);
			const relationFieldName = rel.fromField?.replace(/_id$|Id$/i, "") || targetModelName.toLowerCase();

			// Only add if we don't already have this field
			const hasField = collection.fields.some(f => f.name === relationFieldName);
			if (!hasField) {
				const fkField = rel.fromField || `${relationFieldName}Id`;
				const targetPk = rel.toField || "id";
				lines.push(`  ${relationFieldName} ${targetModelName} @relation(fields: [${fkField}], references: [${targetPk}])`);
			}
		}

		// Incoming relations (other collections have FK to this)
		for (const rel of incomingRels) {
			const sourceCollection = collectionMap.get(rel.fromCollectionId);
			if (!sourceCollection) continue;

			const sourceModelName = this.toPascalCase(sourceCollection.name);
			const lowerName = sourceModelName.toLowerCase();
			// Fix: Don't add 's' if it already ends with 's' (simple pluralization check)
			const relationFieldName = lowerName.endsWith('s') ? lowerName : lowerName + "s";

			// Check if this is a one-to-many or many-to-many
			const isMany = rel.type === "one-to-many" || rel.type === "many-to-many";
			if (isMany) {
				lines.push(`  ${relationFieldName} ${sourceModelName}[]`);
			}
		}

		lines.push("}");
		return lines.join("\n");
	}

	/**
	 * Convert snake_case or kebab-case to PascalCase
	 */
	private toPascalCase(str: string): string {
		return str
			.split(/[-_]/)
			.map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
			.join("");
	}

	/**
	 * Generate complete Prisma schema
	 */
	generate(
		collections: SchemaCollection[],
		relationships: SchemaRelationship[]
	): GeneratedCode {
		const lines: string[] = [];

		// Prisma datasource and generator
		lines.push("// Generated by Drawline");
		lines.push("// https://drawline.app");
		lines.push("");
		lines.push("generator client {");
		lines.push('  provider = "prisma-client-js"');
		lines.push("}");
		lines.push("");
		lines.push("datasource db {");
		lines.push('  provider = "postgresql"');
		lines.push('  url      = env("DATABASE_URL")');
		lines.push("}");
		lines.push("");

		// Create collection map for relationship lookup
		const collectionMap = new Map<string, SchemaCollection>();
		for (const col of collections) {
			collectionMap.set(col.id, col);
		}

		// Generate models
		for (const collection of collections) {
			lines.push(this.generateModel(collection, relationships, collectionMap));
			lines.push("");
		}

		return {
			filename: "schema.prisma",
			content: lines.join("\n"),
			language: "prisma",
		};
	}
}
