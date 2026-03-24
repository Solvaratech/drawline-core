import { SchemaCollection, SchemaRelationship, SchemaField } from "../../types/schemaDesign";
import { GeneratedCode, ORMGenerator, FieldTypeContext } from "./types";

/**
 * Generates TypeORM entity classes from canvas schema
 */
export class TypeORMGenerator implements ORMGenerator {
	/**
	 * Map Drawline field types to TypeScript types
	 */
	private mapFieldType(ctx: FieldTypeContext): string {
		const { fieldType } = ctx;

		const typeMap: Record<string, string> = {
			string: "string",
			integer: "number",
			number: "number",
			boolean: "boolean",
			date: "Date",
			timestamp: "Date",
			timestamptz: "Date",
			uuid: "string",
			objectid: "string",
			long: "bigint",
			bigint: "bigint",
			decimal: "string",
			float: "number",
			json: "object",
			object: "object",
			array: "any[]",
			binary: "Buffer",
			bytes: "Buffer",
		};

		return typeMap[fieldType.toLowerCase()] || "string";
	}

	/**
	 * Get TypeORM column decorator type
	 */
	private getColumnType(ctx: FieldTypeContext): string {
		const { fieldType } = ctx;

		const typeMap: Record<string, string> = {
			string: "varchar",
			integer: "int",
			number: "float",
			boolean: "boolean",
			date: "timestamp",
			timestamp: "timestamp",
			timestamptz: "timestamptz",
			uuid: "uuid",
			objectid: "varchar",
			long: "bigint",
			bigint: "bigint",
			decimal: "decimal",
			float: "float",
			json: "json",
			object: "json",
			binary: "bytea",
			bytes: "bytea",
		};

		return typeMap[fieldType.toLowerCase()] || "varchar";
	}

	/**
	 * Generate field with decorators
	 */
	private generateField(
		field: SchemaField,
		relationships: SchemaRelationship[],
		collectionId: string,
		collectionMap: Map<string, SchemaCollection>
	): string[] {
		const lines: string[] = [];

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

		const tsType = this.mapFieldType(ctx);

		// Primary key
		if (ctx.isPrimaryKey) {
			if (ctx.isSerial) {
				lines.push("  @PrimaryGeneratedColumn()");
			} else if (field.type === "uuid") {
				lines.push('  @PrimaryGeneratedColumn("uuid")');
			} else {
				lines.push("  @PrimaryColumn()");
			}
		} else {
			// Regular column
			const columnOpts: string[] = [];

			if (ctx.isNullable) {
				columnOpts.push("nullable: true");
			}
			if (ctx.isUnique) {
				columnOpts.push("unique: true");
			}
			if (ctx.defaultValue !== undefined && ctx.defaultValue !== null) {
				const defStr = String(ctx.defaultValue).toLowerCase();
				if (defStr.includes("now()") || defStr.includes("current_timestamp")) {
					// Use @CreateDateColumn or @UpdateDateColumn instead
					if (field.name.toLowerCase().includes("created")) {
						lines.push("  @CreateDateColumn()");
						lines.push(`  ${field.name}: Date;`);
						lines.push("");
						return lines;
					} else if (field.name.toLowerCase().includes("updated")) {
						lines.push("  @UpdateDateColumn()");
						lines.push(`  ${field.name}: Date;`);
						lines.push("");
						return lines;
					}
				} else if (typeof ctx.defaultValue === "string") {
					columnOpts.push(`default: "${ctx.defaultValue}"`);
				} else {
					columnOpts.push(`default: ${ctx.defaultValue}`);
				}
			}

			const columnType = this.getColumnType(ctx);
			if (columnOpts.length > 0) {
				lines.push(`  @Column({ type: "${columnType}", ${columnOpts.join(", ")} })`);
			} else {
				lines.push(`  @Column({ type: "${columnType}" })`);
			}
		}

		const nullable = ctx.isNullable ? "?" : "";
		lines.push(`  ${field.name}${nullable}: ${tsType};`);
		lines.push("");

		return lines;
	}

	/**
	 * Generate entity class
	 */
	private generateEntity(
		collection: SchemaCollection,
		relationships: SchemaRelationship[],
		collectionMap: Map<string, SchemaCollection>
	): string {
		const lines: string[] = [];
		const className = this.toPascalCase(collection.name);

		lines.push(`@Entity("${collection.name}")`);
		lines.push(`export class ${className} {`);

		// Generate fields
		for (const field of collection.fields) {
			lines.push(...this.generateField(field, relationships, collection.id, collectionMap));
		}

		// Generate relationships
		const outgoingRels = relationships.filter(r => r.fromCollectionId === collection.id);
		const incomingRels = relationships.filter(r => r.toCollectionId === collection.id);

		// Outgoing relations (ManyToOne - this collection has FK)
		for (const rel of outgoingRels) {
			const targetCollection = collectionMap.get(rel.toCollectionId);
			if (!targetCollection) continue;

			const targetClassName = this.toPascalCase(targetCollection.name);
			const relationFieldName = rel.fromField?.replace(/_id$|Id$/i, "") || targetClassName.toLowerCase();

			lines.push(`  @ManyToOne(() => ${targetClassName}, ${targetClassName.toLowerCase()} => ${targetClassName.toLowerCase()}.${this.toCamelCase(collection.name)}s)`);
			lines.push(`  @JoinColumn({ name: "${rel.fromField || relationFieldName + "Id"}" })`);
			lines.push(`  ${relationFieldName}: ${targetClassName};`);
			lines.push("");
		}

		// Incoming relations (OneToMany - other collections have FK to this)
		for (const rel of incomingRels) {
			const sourceCollection = collectionMap.get(rel.fromCollectionId);
			if (!sourceCollection) continue;

			const sourceClassName = this.toPascalCase(sourceCollection.name);
			const relationFieldName = this.toCamelCase(sourceCollection.name) + "s";
			const inversePropertyName = rel.fromField?.replace(/_id$|Id$/i, "") || this.toCamelCase(collection.name);

			lines.push(`  @OneToMany(() => ${sourceClassName}, ${this.toCamelCase(sourceCollection.name)} => ${this.toCamelCase(sourceCollection.name)}.${inversePropertyName})`);
			lines.push(`  ${relationFieldName}: ${sourceClassName}[];`);
			lines.push("");
		}

		lines.push("}");
		return lines.join("\n");
	}

	/**
	 * Convert to PascalCase
	 */
	private toPascalCase(str: string): string {
		return str
			.split(/[-_]/)
			.map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
			.join("");
	}

	/**
	 * Convert to camelCase
	 */
	private toCamelCase(str: string): string {
		const pascal = this.toPascalCase(str);
		return pascal.charAt(0).toLowerCase() + pascal.slice(1);
	}

	/**
	 * Generate complete TypeORM entities file
	 */
	generate(
		collections: SchemaCollection[],
		relationships: SchemaRelationship[]
	): GeneratedCode {
		const lines: string[] = [];

		// Imports
		lines.push("// Generated by Drawline");
		lines.push("// https://drawline.app");
		lines.push("");
		lines.push("import {");
		lines.push("  Entity,");
		lines.push("  Column,");
		lines.push("  PrimaryColumn,");
		lines.push("  PrimaryGeneratedColumn,");
		lines.push("  CreateDateColumn,");
		lines.push("  UpdateDateColumn,");
		lines.push("  OneToMany,");
		lines.push("  ManyToOne,");
		lines.push("  JoinColumn,");
		lines.push('} from "typeorm";');
		lines.push("");

		// Create collection map
		const collectionMap = new Map<string, SchemaCollection>();
		for (const col of collections) {
			collectionMap.set(col.id, col);
		}

		// Generate entities
		for (const collection of collections) {
			lines.push(this.generateEntity(collection, relationships, collectionMap));
			lines.push("");
		}

		return {
			filename: "entities.ts",
			content: lines.join("\n"),
			language: "typescript",
		};
	}
}
