/**
 * A snapshot of the database schema.
 */
export interface PostgresSchemaSnapshot {
	tables: Record<string, PostgresTableSnapshot>;
	capturedAt: string; // ISO timestamp
	connectionId: number;
}

/**
 * Snapshot of a single PostgreSQL table
 */
export interface PostgresTableSnapshot {
	name: string;
	schema: string;
	columns: Record<string, PostgresColumnSnapshot>;
}

/**
 * Snapshot of a single PostgreSQL column
 */
export interface PostgresColumnSnapshot {
	name: string;
	type: string;
	rawType: string;
	nullable: boolean;
	isPrimaryKey: boolean;
	isUnique: boolean;
	isForeignKey: boolean;
	isSerial: boolean;
	defaultValue?: string;
	references?: { table: string; column: string };
}


/**
 * The result of a schema comparison.
 */
export interface SchemaDiff {
	hasDiff: boolean;
	addedTables: TableDiff[];
	removedTables: RemovedTableDiff[];
	modifiedTables: TableModification[];
	totalChanges: number;
	destructiveChanges: number;
}

export interface TableDiff {
	name: string;
	schema: string;
	columns: ColumnDiff[];
}

export interface RemovedTableDiff {
	name: string;
	schema: string;
	columnCount: number;
}

export interface ColumnDiff {
	name: string;
	type: string;
	nullable: boolean;
	isPrimaryKey: boolean;
	isUnique: boolean;
	isForeignKey: boolean;
	isSerial: boolean;
	defaultValue?: string;
	references?: { table: string; column: string };
}

export interface TableModification {
	tableName: string;
	tableSchema: string;
	addedColumns: ColumnDiff[];
	removedColumns: RemovedColumnDiff[];
	modifiedColumns: ColumnModification[];
}

export interface RemovedColumnDiff {
	name: string;
	type: string;
}

export interface ColumnModification {
	columnName: string;
	oldType: string;
	newType: string;
	oldNullable: boolean;
	newNullable: boolean;
	oldDefault?: string;
	newDefault?: string;
	isDestructive: boolean;
	changeDescription: string;
}

export interface DDLStatement {
	sql: string;
	description: string;
	isDestructive: boolean;
	requiresConfirmation: boolean;
	tableName: string;
	operationType: "CREATE_TABLE" | "DROP_TABLE" | "ADD_COLUMN" | "DROP_COLUMN" | "ALTER_COLUMN";
}


export interface DDLExecutionResult {
	success: boolean;
	executedCount: number;
	failedAt?: number;
	error?: string;
	executedStatements: string[];
}

export interface SchemaDiffResponse {
	diff: SchemaDiff;
	statements: DDLStatement[];
	canAutoSync: boolean;
}

export interface SchemaSyncInput {
	projectId: string;
	confirmDestructive?: boolean;
	selectedStatements?: number[];
}

//Response from syncSchemaToDatabase endpoint

export interface SchemaSyncResponse {
	success: boolean;
	requiresConfirmation?: boolean;
	destructiveOperations?: DDLStatement[];
	executionResult?: DDLExecutionResult;
	newSnapshot?: PostgresSchemaSnapshot;
	error?: string;
}
