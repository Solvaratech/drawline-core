import { SchemaCollection, SchemaRelationship, SchemaField } from "../../types/schemaDesign";
import { GeneratedCode, ORMGenerator, FieldTypeContext } from "./types";

/**
 * Generates Mongoose schema and models from canvas schema
 */
export class MongooseGenerator implements ORMGenerator {
	/**
	 * Map Drawline field types to Mongoose Schema types
	 */
	private mapFieldType(ctx: FieldTypeContext): string {
		const { fieldType, isPrimaryKey, isForeignKey } = ctx;

		// Mongoose handles _id automatically
		if (isPrimaryKey) {
			return "Schema.Types.ObjectId";
		}

		if (isForeignKey) {
			return "Schema.Types.ObjectId";
		}

		const typeMap: Record<string, string> = {
			string: "String",
			integer: "Number",
			number: "Number",
			boolean: "Boolean",
			date: "Date",
			timestamp: "Date",
			timestamptz: "Date",
			uuid: "String",
			objectid: "Schema.Types.ObjectId",
			long: "Number",
			bigint: "Number", // Mongoose doesn't natively support BigInt in all versions easily, standardizing on Number for simplicity or String
			decimal: "Number",
			float: "Number",
			json: "Schema.Types.Mixed",
			object: "Schema.Types.Mixed",
			array: "Array",
			binary: "Buffer",
			bytes: "Buffer",
		};

		return typeMap[fieldType.toLowerCase()] || "String";
	}

	/**
	 * Map Drawline field types to TypeScript interface types
	 */
	private mapTsType(ctx: FieldTypeContext): string {
		const { fieldType, isPrimaryKey, isForeignKey } = ctx;

		if (isPrimaryKey || isForeignKey || fieldType.toLowerCase() === "objectid") {
			return "mongoose.Types.ObjectId";
		}

		const typeMap: Record<string, string> = {
			string: "string",
			integer: "number",
			number: "number",
			boolean: "boolean",
			date: "Date",
			timestamp: "Date",
			timestamptz: "Date",
			uuid: "string",
			long: "number",
			bigint: "number",
			decimal: "number",
			float: "number",
			json: "any",
			object: "any",
			array: "any[]",
			binary: "Buffer",
			bytes: "Buffer",
		};

		return typeMap[fieldType.toLowerCase()] || "string";
	}

	/**
	 * Generate Mongoose schema definition for a field
	 */
	private generateSchemaField(
		field: SchemaField,
		collectionMap: Map<string, SchemaCollection>
	): string {
		// Skip _id field as Mongoose adds it automatically, unless it's a custom PK string
		if (field.isPrimaryKey && field.name === "_id") {
			return "";
		}

		const ctx: FieldTypeContext = {
			fieldType: field.type,
			isPrimaryKey: !!field.isPrimaryKey,
			isForeignKey: !!field.isForeignKey,
			isSerial: !!field.isSerial,
			isNullable: !field.required && !field.isPrimaryKey,
			isUnique: !!field.constraints?.unique,
			defaultValue: field.defaultValue,
		};

		const mongooseType = this.mapFieldType(ctx);
		const options: string[] = [`type: ${mongooseType}`];

		if (field.required && !field.isPrimaryKey) {
			options.push("required: true");
		}

		if (ctx.isUnique) {
			options.push("unique: true");
		}

		if (ctx.defaultValue !== undefined && ctx.defaultValue !== null) {
			const defStr = String(ctx.defaultValue).toLowerCase();
			if (defStr.includes("now()") || defStr.includes("current_timestamp")) {
				options.push("default: Date.now");
			} else if (typeof ctx.defaultValue === "string") {
				options.push(`default: "${ctx.defaultValue}"`);
			} else {
				options.push(`default: ${ctx.defaultValue}`);
			}
		}

		// Add ref for foreign keys
		if (ctx.isForeignKey && field.referencedCollectionId) {
			const targetCollection = collectionMap.get(field.referencedCollectionId);
			if (targetCollection) {
				const targetModelName = this.toPascalCase(targetCollection.name);
				options.push(`ref: "${targetModelName}"`);
			}
		}

		return `  ${field.name}: { ${options.join(", ")} },`;
	}

	/**
	 * Generate TypeScript interface for a collection
	 */
	private generateInterface(
		collection: SchemaCollection,
		relationships: SchemaRelationship[],
		collectionMap: Map<string, SchemaCollection>
	): string {
		const lines: string[] = [];
		const interfaceName = `I${this.toPascalCase(collection.name)}`;

		lines.push(`export interface ${interfaceName} extends Document {`);

		// Fields
		for (const field of collection.fields) {
			if (field.name === "_id" && field.isPrimaryKey) continue; // Document already has _id

			const ctx: FieldTypeContext = {
				fieldType: field.type,
				isPrimaryKey: !!field.isPrimaryKey,
				isForeignKey: !!field.isForeignKey,
				isSerial: !!field.isSerial,
				isNullable: !field.required,
				isUnique: false
			};

			const tsType = this.mapTsType(ctx);
			const optional = ctx.isNullable ? "?" : "";
			lines.push(`  ${field.name}${optional}: ${tsType};`);
		}

		// Virtuals / Relations (populated fields)
		// Outgoing (BelongsTo) - usually mapped as field above, but maybe typed as populated doc?
		// Incoming (HasMany) - virtuals
		const incomingRels = relationships.filter(r => r.toCollectionId === collection.id);
		for (const rel of incomingRels) {
			const sourceCollection = collectionMap.get(rel.fromCollectionId);
			if (sourceCollection) {
				const sourceName = this.toPascalCase(sourceCollection.name);
				const fieldName = this.toCamelCase(sourceCollection.name) + "s"; // e.g. posts
				lines.push(`  ${fieldName}?: I${sourceName}[];`);
			}
		}

		lines.push(`  createdAt?: Date;`);
		lines.push(`  updatedAt?: Date;`);
		lines.push("}");

		return lines.join("\n");
	}

	/**
	 * Generate Mongoose Model
	 */
	private generateModel(
		collection: SchemaCollection,
		relationships: SchemaRelationship[],
		collectionMap: Map<string, SchemaCollection>
	): string {
		const lines: string[] = [];
		const modelName = this.toPascalCase(collection.name);
		const interfaceName = `I${modelName}`;
		const schemaName = `${modelName}Schema`;

		// Generate Interface
		lines.push(this.generateInterface(collection, relationships, collectionMap));
		lines.push("");

		// Generate Schema
		lines.push(`const ${schemaName} = new Schema<${interfaceName}>({`);

		for (const field of collection.fields) {
			const fieldDef = this.generateSchemaField(field, collectionMap);
			if (fieldDef) lines.push(fieldDef);
		}

		lines.push("}, { timestamps: true });");
		lines.push("");

		// Add virtuals for incoming relationships
		const incomingRels = relationships.filter(r => r.toCollectionId === collection.id);
		for (const rel of incomingRels) {
			const sourceCollection = collectionMap.get(rel.fromCollectionId);
			if (sourceCollection) {
				const sourceName = this.toPascalCase(sourceCollection.name);
				const fieldName = this.toCamelCase(sourceCollection.name) + "s";
				const foreignField = rel.fromField || this.toCamelCase(collection.name) + "Id"; // Assuming default FK naming if not specified

				lines.push(`${schemaName}.virtual("${fieldName}", {`);
				lines.push(`  ref: "${sourceName}",`);
				lines.push(`  localField: "_id",`);
				lines.push(`  foreignField: "${foreignField}"`);
				lines.push("});");
				lines.push("");
			}
		}

		lines.push("// Ensure virtuals are included in JSON");
		lines.push(`${schemaName}.set("toJSON", { virtuals: true });`);
		lines.push(`${schemaName}.set("toObject", { virtuals: true });`);
		lines.push("");

		lines.push(`export const ${modelName} = mongoose.models.${modelName} || mongoose.model<${interfaceName}>("${modelName}", ${schemaName});`);

		return lines.join("\n");
	}

	private toPascalCase(str: string): string {
		return str
			.split(/[-_]/)
			.map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
			.join("");
	}

	private toCamelCase(str: string): string {
		const pascal = this.toPascalCase(str);
		return pascal.charAt(0).toLowerCase() + pascal.slice(1);
	}

	generate(
		collections: SchemaCollection[],
		relationships: SchemaRelationship[]
	): GeneratedCode {
		const lines: string[] = [];

		lines.push("// Generated by Drawline");
		lines.push(`import mongoose, { Schema, Document } from "mongoose";`);
		lines.push("");

		const collectionMap = new Map<string, SchemaCollection>();
		for (const col of collections) {
			collectionMap.set(col.id, col);
		}

		for (const collection of collections) {
			lines.push(this.generateModel(collection, relationships, collectionMap));
			lines.push("");
		}

		return {
			filename: "models.ts",
			content: lines.join("\n"),
			language: "typescript",
		};
	}
}
