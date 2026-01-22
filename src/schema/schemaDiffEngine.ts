/**
 * Compares your canvas with the database to generate SQL updates.
 */

import { SchemaCollection, SchemaField } from "../types/schemaDesign";
import {
	PostgresSchemaSnapshot,
	PostgresTableSnapshot,
	PostgresColumnSnapshot,
	SchemaDiff,
	TableDiff,
	RemovedTableDiff,
	TableModification,
	ColumnDiff,
	RemovedColumnDiff,
	ColumnModification,
	DDLStatement,
} from "../types/schemaDiff";

function fieldTypeToPostgresType(field: SchemaField): string {
	const type = field.type;
	const rawType = field.rawType;

	if (rawType) {
		// prefre rawtype
		return rawType.toLowerCase();
	}

	switch (type) {
		case "string":
			if (field.constraints?.maxLength) {
				return `varchar(${field.constraints.maxLength})`;
			}
			return "text";
		case "integer":
			if (field.isSerial) {
				return "serial";
			}
			return "integer";
		case "number":
		case "decimal":
		case "float":
			return "numeric";
		case "boolean":
			return "boolean";
		case "date":
		case "timestamp":
		case "timestamptz":
			return "timestamp with time zone";
		case "uuid":
			return "uuid";
		case "json":
		case "object":
			return "jsonb";
		case "array":
			const itemType = field.arrayItemType || "text";
			return `${itemType}[]`;
		default:
			return "text";
	}
}

function normalizeType(type: string): string {
	const t = type.toLowerCase().trim();

	if (t === "string") return "text";
	if (t === "number" || t === "decimal" || t === "float") return "numeric";
	if (t === "integer" || t === "int") return "integer";
	if (t === "reference") return "uuid"; // FK fields use reference type

	if (t.includes("character varying") || t.includes("varchar")) {
		const match = t.match(/\((\d+)\)/);
		return match ? `varchar(${match[1]})` : "varchar";
	}
	if (t === "int4") return "integer";
	if (t === "int8") return "bigint";
	if (t === "int2") return "smallint";
	if (t === "float4") return "real";
	if (t === "float8") return "double precision";
	if (t === "bool") return "boolean";

	if (t.includes("timestamp with time zone") || t === "timestamptz") return "timestamptz";
	if (t.includes("timestamp without time zone")) return "timestamp";
	if (t === "timestamp") return "timestamptz";

	if (t === "serial" || t === "serial4") return "serial";
	if (t === "bigserial" || t === "serial8") return "bigserial";

	if (t === "user-defined") return "user-defined";

	return t;
}

export function isDestructiveTypeChange(oldType: string, newType: string): boolean {
	const old = normalizeType(oldType);
	const newer = normalizeType(newType);

	if (old === newer) return false;

	const wideningConversions: Record<string, string[]> = {
		"smallint": ["integer", "bigint", "numeric"],
		"integer": ["bigint", "numeric"],
		"real": ["double precision", "numeric"],
		"varchar": ["text"],
		"char": ["varchar", "text"],
	};

	const oldBase = old.replace(/\([^)]*\)/, "");
	const newBase = newer.replace(/\([^)]*\)/, "");

	if (wideningConversions[oldBase]?.includes(newBase)) {
		return false;
	}

	if (oldBase === "varchar" && newBase === "varchar") {
		const oldLen = parseInt(old.match(/\((\d+)\)/)?.[1] || "0");
		const newLen = parseInt(newer.match(/\((\d+)\)/)?.[1] || "0");
		return newLen > 0 && newLen < oldLen;
	}

	return true;
}

/**
 * Sync modes: 'full' (destructive) vs 'additive' (safe).
 */
export type SchemaSyncMode = 'full' | 'additive';

export interface SchemaSyncOptions {
	allowDropTables?: boolean;
	allowDropColumns?: boolean;
}

// TODO: Investigate potential edge cases where diff computation might incorrectly return 0 changes.
export function computeSchemaDiff(
	originalSnapshot: PostgresSchemaSnapshot | null | undefined,
	currentCollections: SchemaCollection[],
	syncConfig: SchemaSyncMode | SchemaSyncOptions = 'additive'
): SchemaDiff {
	const addedTables: TableDiff[] = [];
	const removedTables: RemovedTableDiff[] = [];
	const modifiedTables: TableModification[] = [];

	let allowDropTables = false;
	let allowDropColumns = false;

	if (typeof syncConfig === 'string') {
		allowDropTables = syncConfig === 'full';
		allowDropColumns = syncConfig === 'full';
	} else {
		allowDropTables = syncConfig.allowDropTables ?? false;
		allowDropColumns = syncConfig.allowDropColumns ?? false;
	}

	if (!originalSnapshot) {
		return {
			hasDiff: false,
			addedTables: [],
			removedTables: [],
			modifiedTables: [],
			totalChanges: 0,
			destructiveChanges: 0,
		};
	}

	const originalTables = originalSnapshot.tables;

	const extractTableName = (name: string): string => {
		if (name.includes('.')) {
			return name.split('.').pop()!.toLowerCase();
		}
		return name.toLowerCase();
	};

	const getCollectionFullName = (collection: SchemaCollection): string => {
		return (collection as any).dbName || collection.id ||
			(collection.schema ? `${collection.schema}.${collection.name}` : collection.name);
	};

	const originalTablesByName = new Map<string, { key: string; table: any }>();
	for (const key of Object.keys(originalTables)) {
		const tableName = extractTableName(key);
		originalTablesByName.set(tableName, { key, table: originalTables[key] });
	}

	const currentTablesByName = new Map<string, SchemaCollection>();
	for (const collection of currentCollections) {
		const fullName = getCollectionFullName(collection);
		const tableName = extractTableName(fullName);
		currentTablesByName.set(tableName, collection);
	}

	const originalTableNames = new Set(originalTablesByName.keys());
	const currentTableNames = new Set(currentTablesByName.keys());

	for (const collection of currentCollections) {
		const fullName = getCollectionFullName(collection);
		const tableName = extractTableName(fullName);
		if (!originalTableNames.has(tableName)) {
			addedTables.push({
				name: collection.name,
				schema: collection.schema || "public",
				columns: collection.fields.map(fieldToColumnDiff),
			});
		}
	}

	if (allowDropTables) {
		for (const [tableName, { key, table }] of originalTablesByName) {
			if (!currentTableNames.has(tableName)) {
				removedTables.push({
					name: key,
					schema: table.schema,
					columnCount: Object.keys(table.columns).length,
				});
			}
		}
	}

	for (const collection of currentCollections) {
		const fullName = getCollectionFullName(collection);
		const tableName = extractTableName(fullName);
		const originalEntry = originalTablesByName.get(tableName);
		if (originalEntry) {
			const modification = computeTableModification(
				originalEntry.table,
				collection,
				allowDropColumns
			);
			if (modification) {
				modifiedTables.push(modification);
			}
		}
	}

	let totalChanges = addedTables.length + removedTables.length;
	let destructiveChanges = removedTables.length;

	for (const mod of modifiedTables) {
		totalChanges += mod.addedColumns.length + mod.removedColumns.length + mod.modifiedColumns.length;
		destructiveChanges += mod.removedColumns.length;
		destructiveChanges += mod.modifiedColumns.filter(c => c.isDestructive).length;
	}

	return {
		hasDiff: totalChanges > 0,
		addedTables,
		removedTables,
		modifiedTables,
		totalChanges,
		destructiveChanges,
	};
}

/**
 * Converts our internal field format to a column diff.
 */
function fieldToColumnDiff(field: SchemaField): ColumnDiff {
	return {
		name: field.name,
		type: fieldTypeToPostgresType(field),
		nullable: field.nullable ?? !field.required,
		isPrimaryKey: field.isPrimaryKey ?? false,
		isUnique: field.constraints?.unique ?? false,
		isForeignKey: field.isForeignKey ?? false,
		isSerial: field.isSerial ?? false,
		defaultValue: field.defaultValue !== undefined ? String(field.defaultValue) : undefined,
		references: field.referencedCollectionId && field.foreignKeyTarget
			? { table: field.referencedCollectionId, column: field.foreignKeyTarget }
			: undefined,
	};
}

function computeTableModification(
	original: PostgresTableSnapshot,
	current: SchemaCollection,
	allowDropColumns: boolean = false
): TableModification | null {
	const addedColumns: ColumnDiff[] = [];
	const removedColumns: RemovedColumnDiff[] = [];
	const modifiedColumns: ColumnModification[] = [];

	const originalColNames = new Set(Object.keys(original.columns));
	const currentColNames = new Set(current.fields.map(f => f.name));

	for (const field of current.fields) {
		if (!originalColNames.has(field.name)) {
			addedColumns.push(fieldToColumnDiff(field));
		}
	}

	if (allowDropColumns) {
		for (const colName of originalColNames) {
			if (!currentColNames.has(colName)) {
				const col = original.columns[colName];
				removedColumns.push({
					name: colName,
					type: col.type,
				});
			}
		}
	}

	for (const field of current.fields) {
		if (originalColNames.has(field.name)) {
			const originalCol = original.columns[field.name];
			const modification = computeColumnModification(originalCol, field);
			if (modification) {
				modifiedColumns.push(modification);
			}
		}
	}

	if (addedColumns.length === 0 && removedColumns.length === 0 && modifiedColumns.length === 0) {
		return null;
	}

	return {
		tableName: current.name,
		tableSchema: current.schema || "public",
		addedColumns,
		removedColumns,
		modifiedColumns,
	};
}

function computeColumnModification(
	original: PostgresColumnSnapshot,
	current: SchemaField
): ColumnModification | null {
	const changes: string[] = [];
	const newType = fieldTypeToPostgresType(current);
	const newNullable = current.nullable ?? !current.required;

	const oldTypeNorm = normalizeType(original.type);
	const newTypeNorm = normalizeType(newType);

	if (oldTypeNorm !== newTypeNorm) {
		changes.push(`type: ${original.type} → ${newType}`);
	}
	if (original.nullable !== newNullable) {
		changes.push(`nullable: ${original.nullable} → ${newNullable}`);
	}

	const newDefault = current.defaultValue !== undefined ? String(current.defaultValue) : undefined;
	if (original.defaultValue !== newDefault) {
		changes.push(`default: ${original.defaultValue || "none"} → ${newDefault || "none"}`);
	}

	if (changes.length === 0) {
		return null;
	}

	return {
		columnName: current.name,
		oldType: original.type,
		newType,
		oldNullable: original.nullable,
		newNullable,
		oldDefault: original.defaultValue,
		newDefault,
		isDestructive: isDestructiveTypeChange(original.type, newType),
		changeDescription: changes.join("; "),
	};
}

export function generateDDL(diff: SchemaDiff): DDLStatement[] {
	const statements: DDLStatement[] = [];

	for (const table of diff.addedTables) {
		statements.push(generateCreateTableDDL(table));
	}

	for (const mod of diff.modifiedTables) {
		for (const col of mod.addedColumns) {
			statements.push(generateAddColumnDDL(mod.tableName, mod.tableSchema, col));
		}
	}

	for (const mod of diff.modifiedTables) {
		for (const colMod of mod.modifiedColumns) {
			statements.push(...generateAlterColumnDDL(mod.tableName, mod.tableSchema, colMod));
		}
	}

	for (const mod of diff.modifiedTables) {
		for (const col of mod.removedColumns) {
			statements.push(generateDropColumnDDL(mod.tableName, mod.tableSchema, col));
		}
	}

	for (const table of diff.removedTables) {
		statements.push(generateDropTableDDL(table));
	}

	return statements;
}

/**
 * Handles cases where table name payload might include "schema." prefix
 */
function getQualifiedTableName(name: string, schema: string = "public"): string {
	let cleanName = name;
	if (name.startsWith(`${schema}.`)) {
		cleanName = name.substring(schema.length + 1);
	}
	return `"${schema}"."${cleanName}"`;
}

/**
 * Helper to correctly quote a table reference (which might be "schema.table" or just "table")
 */
function quoteTableRef(tableRef: string): string {
	if (tableRef.includes(".")) {
		const parts = tableRef.split(".");
		return parts.map(p => `"${p}"`).join(".");
	}
	return `"${tableRef}"`;
}

function generateCreateTableDDL(table: TableDiff): DDLStatement {
	const qualifiedName = getQualifiedTableName(table.name, table.schema);

	const columnDefs = table.columns.map(col => {
		let def = `"${col.name}" ${col.type.toUpperCase()}`;
		if (col.isPrimaryKey) def += " PRIMARY KEY";
		if (!col.nullable && !col.isPrimaryKey) def += " NOT NULL";
		if (col.isUnique && !col.isPrimaryKey) def += " UNIQUE";
		if (col.defaultValue) def += ` DEFAULT ${col.defaultValue}`;
		if (col.references) {
			const refTable = col.references.table;
			const refQualified = quoteTableRef(refTable);
			def += ` REFERENCES ${refQualified}("${col.references.column}")`;
		}
		return def;
	});

	const sql = `CREATE TABLE ${qualifiedName} (\n  ${columnDefs.join(",\n  ")}\n);`;

	return {
		sql,
		description: `Create table "${table.name}"`,
		isDestructive: false,
		requiresConfirmation: false,
		tableName: table.name,
		operationType: "CREATE_TABLE",
	};
}

function generateAddColumnDDL(tableName: string, tableSchema: string, col: ColumnDiff): DDLStatement {
	const qualifiedName = getQualifiedTableName(tableName, tableSchema);

	let colDef = `"${col.name}" ${col.type.toUpperCase()}`;
	if (!col.nullable) colDef += " NOT NULL";
	if (col.isUnique) colDef += " UNIQUE";
	if (col.defaultValue) colDef += ` DEFAULT ${col.defaultValue}`;
	if (col.references) {
		const refQualified = quoteTableRef(col.references.table);
		colDef += ` REFERENCES ${refQualified}("${col.references.column}")`;
	}

	const sql = `ALTER TABLE ${qualifiedName} ADD COLUMN ${colDef};`;

	return {
		sql,
		description: `Add column "${col.name}" to "${tableName}"`,
		isDestructive: false,
		requiresConfirmation: false,
		tableName,
		operationType: "ADD_COLUMN",
	};
}

function generateAlterColumnDDL(
	tableName: string,
	tableSchema: string,
	colMod: ColumnModification
): DDLStatement[] {
	const statements: DDLStatement[] = [];
	const qualifiedName = getQualifiedTableName(tableName, tableSchema);

	const oldTypeNorm = normalizeType(colMod.oldType);
	const newTypeNorm = normalizeType(colMod.newType);

	if (oldTypeNorm !== newTypeNorm) {
		const useCast = colMod.isDestructive ? "" : ` USING "${colMod.columnName}"::${colMod.newType}`;
		statements.push({
			sql: `ALTER TABLE ${qualifiedName} ALTER COLUMN "${colMod.columnName}" TYPE ${colMod.newType.toUpperCase()}${useCast};`,
			description: `Change type of "${colMod.columnName}" from ${colMod.oldType} to ${colMod.newType}`,
			isDestructive: colMod.isDestructive,
			requiresConfirmation: colMod.isDestructive,
			tableName,
			operationType: "ALTER_COLUMN",
		});
	}

	if (colMod.oldNullable !== colMod.newNullable) {
		if (colMod.newNullable) {
			statements.push({
				sql: `ALTER TABLE ${qualifiedName} ALTER COLUMN "${colMod.columnName}" DROP NOT NULL;`,
				description: `Make "${colMod.columnName}" nullable`,
				isDestructive: false,
				requiresConfirmation: false,
				tableName,
				operationType: "ALTER_COLUMN",
			});
		} else {
			statements.push({
				sql: `ALTER TABLE ${qualifiedName} ALTER COLUMN "${colMod.columnName}" SET NOT NULL;`,
				description: `Make "${colMod.columnName}" required (NOT NULL)`,
				isDestructive: true, // May fail if existing nulls
				requiresConfirmation: true,
				tableName,
				operationType: "ALTER_COLUMN",
			});
		}
	}

	if (colMod.oldDefault !== colMod.newDefault) {
		if (colMod.newDefault) {
			statements.push({
				sql: `ALTER TABLE ${qualifiedName} ALTER COLUMN "${colMod.columnName}" SET DEFAULT ${colMod.newDefault};`,
				description: `Set default for "${colMod.columnName}" to ${colMod.newDefault}`,
				isDestructive: false,
				requiresConfirmation: false,
				tableName,
				operationType: "ALTER_COLUMN",
			});
		} else {
			statements.push({
				sql: `ALTER TABLE ${qualifiedName} ALTER COLUMN "${colMod.columnName}" DROP DEFAULT;`,
				description: `Remove default from "${colMod.columnName}"`,
				isDestructive: false,
				requiresConfirmation: false,
				tableName,
				operationType: "ALTER_COLUMN",
			});
		}
	}

	return statements;
}

function generateDropColumnDDL(
	tableName: string,
	tableSchema: string,
	col: RemovedColumnDiff
): DDLStatement {
	const qualifiedName = getQualifiedTableName(tableName, tableSchema);

	return {
		sql: `ALTER TABLE ${qualifiedName} DROP COLUMN "${col.name}";`,
		description: `Drop column "${col.name}" from "${tableName}" (DATA WILL BE LOST)`,
		isDestructive: true,
		requiresConfirmation: true,
		tableName,
		operationType: "DROP_COLUMN",
	};
}

function generateDropTableDDL(table: RemovedTableDiff): DDLStatement {
	const qualifiedName = getQualifiedTableName(table.name, table.schema);

	return {
		sql: `DROP TABLE ${qualifiedName} CASCADE;`,
		description: `Drop table "${table.name}" (ALL DATA WILL BE LOST, ${table.columnCount} columns)`,
		isDestructive: true,
		requiresConfirmation: true,
		tableName: table.name,
		operationType: "DROP_TABLE",
	};
}
