import { Client } from "pg";
import { decrypt } from "./utils";
import { DatabaseRelationship } from "./types";
import { getFriendlyErrorMessage } from "../utils/errorMessages";
import { logger } from "../utils";

/**
 * Manages PostgreSQL connections.
 */
export class PostgreSQLHandler {
  private client: Client | null = null;
  private connectionString: string;
  private activeDatabaseName: string | null = null;

  constructor(encryptedConnectionString: string, databaseName?: string) {
    this.connectionString = decrypt(encryptedConnectionString);
    this.activeDatabaseName = databaseName || null;
  }

  private parseTableSchema(collectionName: string): {
    schema: string;
    table: string;
  } {
    if (collectionName.includes(".")) {
      const parts = collectionName.split(".");
      if (parts.length === 2) {
        return { schema: parts[0], table: parts[1] };
      }
    }
    return { schema: "public", table: collectionName };
  }

  private getClientConfig() {
    if (this.activeDatabaseName) {
      try {
        const url = new URL(this.connectionString);
        url.pathname = `/${this.activeDatabaseName}`;
        return { connectionString: url.toString() };
      } catch (e) {
        return { connectionString: this.connectionString };
      }
    }
    return { connectionString: this.connectionString };
  }

  async connect(): Promise<void> {
    try {
      const config = this.getClientConfig();
      logger.log(
        "PostgreSQLHandler",
        `Connecting to ${config.connectionString.replace(/:[^:@]*@/, ":****@")}`,
      );
      this.client = new Client({
        connectionString: config.connectionString,
        ssl: { rejectUnauthorized: false },
      });
      await this.client.connect();
    } catch (error) {
      try {
        const config = this.getClientConfig();
        this.client = new Client({
          connectionString: config.connectionString,
          ssl: false,
        });
        await this.client.connect();
      } catch (secondError) {
        const firstMsg = error instanceof Error ? error.message : String(error);
        const secondMsg =
          secondError instanceof Error
            ? secondError.message
            : String(secondError);

        throw new Error(getFriendlyErrorMessage(secondError, "PostgreSQL"));
      }
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.end();
      this.client = null;
    }
  }

  async listDatabases(): Promise<string[]> {
    if (!this.client) throw new Error("Not connected to PostgreSQL");

    const result = await this.client.query(
      "SELECT datname FROM pg_database WHERE datistemplate = false;",
    );
    return result.rows.map((row) => row.datname);
  }

  /**
   * List all non-system schemas in the database.
   * Excludes information_schema, pg_catalog, pg_toast, etc.
   */
  async listSchemas(): Promise<string[]> {
    if (!this.client) throw new Error("Not connected to PostgreSQL");

    const result = await this.client.query(`
			SELECT schema_name 
			FROM information_schema.schemata 
			WHERE schema_name NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
			  AND schema_name NOT LIKE 'pg_%'
			ORDER BY schema_name
		`);
    return result.rows.map((row) => row.schema_name);
  }

  /**
   * Get all tables, optionally filtered by selected schemas.
   * @param selectedSchemas - If provided, only return tables from these schemas
   */
  async getCollections(selectedSchemas?: string[]): Promise<string[]> {
    if (!this.client) throw new Error("Not connected to PostgreSQL");

    // Log current database to verify connection
    const dbResult = await this.client.query("SELECT current_database()");
    logger.log(
      "PostgreSQLHandler",
      `Connected to database: ${dbResult.rows[0].current_database}`,
    );

    let query = `
			SELECT table_schema, table_name 
			FROM information_schema.tables 
			WHERE table_schema NOT IN ('information_schema', 'pg_catalog') 
			  AND table_type = 'BASE TABLE'
		`;

    let params: string[] = [];

    if (selectedSchemas && selectedSchemas.length > 0) {
      query += ` AND table_schema = ANY($1)`;
      params = selectedSchemas;
    }

    const result = await this.client.query(
      query,
      params.length > 0 ? [params] : undefined,
    );
    logger.log(
      "PostgreSQLHandler",
      `getCollections found ${result.rows.length} tables${selectedSchemas ? ` in schemas: ${selectedSchemas.join(", ")}` : ""}`,
    );

    return result.rows.map((row) => `${row.table_schema}.${row.table_name}`);
  }

  async getCollectionStats(collectionName: string): Promise<{
    documentCount: number;
    estimatedSize: number;
  }> {
    if (!this.client) throw new Error("Not connected to PostgreSQL");

    try {
      const { schema, table } = this.parseTableSchema(collectionName);
      const countResult = await this.client.query(
        `SELECT COUNT(*) as count FROM "${schema}"."${table}"`,
      );
      const count = parseInt(countResult.rows[0].count, 10);

      const sizeResult = await this.client.query(
        `SELECT pg_total_relation_size($1) as size`,
        [`"${schema}"."${table}"`],
      );
      const size = parseInt(sizeResult.rows[0].size, 10);
      return { documentCount: count, estimatedSize: size };
    } catch {
      return { documentCount: 0, estimatedSize: 0 };
    }
  }

  async getDocuments(
    collectionName: string,
    filter: Record<string, unknown> = {},
    skip: number = 0,
    limit: number = 50,
  ): Promise<unknown[]> {
    if (!this.client) throw new Error("Not connected to PostgreSQL");

    const { schema, table } = this.parseTableSchema(collectionName);
    const query = `SELECT * FROM "${schema}"."${table}" LIMIT $1 OFFSET $2`;
    const result = await this.client.query(query, [limit, skip]);
    return result.rows;
  }

  async inferSchema(
    collectionName: string,
    sampleSize: number = 100,
  ): Promise<Record<string, unknown>> {
    if (!this.client) throw new Error("Not connected to PostgreSQL");

    const { schema: tableSchema, table: tableName } =
      this.parseTableSchema(collectionName);

    const result = await this.client.query(
      `SELECT column_name, data_type, is_nullable, column_default
             FROM information_schema.columns 
             WHERE table_schema = $1 AND table_name = $2`,
      [tableSchema, tableName],
    );

    const pkResult = await this.client.query(
      `SELECT kcu.column_name, kcu.ordinal_position
             FROM information_schema.table_constraints tc
             JOIN information_schema.key_column_usage kcu
               ON tc.constraint_name = kcu.constraint_name
               AND tc.table_schema = kcu.table_schema
             WHERE tc.constraint_type = 'PRIMARY KEY'
               AND tc.table_name = $2
               AND tc.table_schema = $1
             ORDER BY kcu.ordinal_position`,
      [tableSchema, tableName],
    );
    const primaryKeyPositions = new Map<string, number>();
    pkResult.rows.forEach((r, idx) => {
      primaryKeyPositions.set(r.column_name, idx);
    });
    const isCompositePrimaryKey = pkResult.rows.length > 1;

    const uniqueResult = await this.client.query(
      `SELECT kcu.column_name
             FROM information_schema.table_constraints tc
             JOIN information_schema.key_column_usage kcu
               ON tc.constraint_name = kcu.constraint_name
               AND tc.table_schema = kcu.table_schema
             WHERE tc.constraint_type = 'UNIQUE'
               AND tc.table_name = $2
               AND tc.table_schema = $1`,
      [tableSchema, tableName],
    );
    const uniqueColumns = new Set(uniqueResult.rows.map((r) => r.column_name));

    const fkResult = await this.client.query(
      //   `SELECT
      // 			tc.constraint_name,
      // 			kcu.column_name,
      // 			kcu.ordinal_position,
      // 			ccu.table_schema AS foreign_schema,
      // 			ccu.table_name AS foreign_table,
      // 			ccu.column_name AS foreign_column
      //          FROM information_schema.table_constraints tc
      //          JOIN information_schema.key_column_usage kcu
      //            ON tc.constraint_name = kcu.constraint_name
      //            AND tc.table_schema = kcu.table_schema
      // 		 JOIN information_schema.constraint_column_usage ccu
      // 		   ON ccu.constraint_name = tc.constraint_name
      // 		   AND ccu.table_schema = tc.table_schema
      //          WHERE tc.constraint_type = 'FOREIGN KEY'
      //            AND tc.table_name = $2
      //            AND tc.table_schema = $1
      //          ORDER BY tc.constraint_name, kcu.ordinal_position`,
      `SELECT
				c.conname AS constraint_name,
				a_from.attname AS column_name,
				a_from.attnum AS ordinal_position,
				n_to.nspname AS foreign_schema,
				c_to.relname AS foreign_table,
				a_to.attname AS foreign_column
			FROM pg_constraint c
			JOIN pg_class c_from ON c_from.oid = c.conrelid
			JOIN pg_namespace n_from ON n_from.oid = c_from.relnamespace
			JOIN pg_class c_to ON c_to.oid = c.confrelid
			JOIN pg_namespace n_to ON n_to.oid = c_to.relnamespace
			JOIN LATERAL UNNEST(c.conkey) WITH ORDINALITY AS fk(attnum, ord) ON true
			JOIN pg_attribute a_from ON a_from.attrelid = c.conrelid AND a_from.attnum = fk.attnum
			JOIN LATERAL UNNEST(c.confkey) WITH ORDINALITY AS rfk(attnum, ord) ON rfk.ord = fk.ord
			JOIN pg_attribute a_to ON a_to.attrelid = c.confrelid AND a_to.attnum = rfk.attnum
				WHERE c.contype = 'f'
				AND n_from.nspname = $1
				AND c_from.relname = $2
				ORDER BY c.conname, fk.ord`,
      [tableSchema, tableName],
    );

    // const foreignKeysMap = new Map<
    //   string,
    //   { table: string; column: string; constraintName: string }
    // >();

    // New structure - group composite FK columns by constraint name
    const foreignKeysMap = new Map<
      string,
      {
        table: string;
        column: string;
        constraintName: string;
        isComposite: boolean;
        compositeColumns?: { localColumn: string; foreignColumn: string }[];
      }
    >();

    // const constraintColumnCount = new Map<string, number>();
    // fkResult.rows.forEach((r) => {
    //   constraintColumnCount.set(
    //     r.constraint_name,
    //     (constraintColumnCount.get(r.constraint_name) || 0) + 1,
    //   );
    // });

    // Group by constraint first
    const constraintMap = new Map<
      string,
      {
        table: string;
        columns: { localColumn: string; foreignColumn: string }[];
      }
    >();

    fkResult.rows.forEach((r) => {
      const fkTable =
        r.foreign_schema === "public"
          ? r.foreign_table
          : `${r.foreign_schema}.${r.foreign_table}`;

      if (!constraintMap.has(r.constraint_name)) {
        constraintMap.set(r.constraint_name, { table: fkTable, columns: [] });
      }
      constraintMap.get(r.constraint_name)!.columns.push({
        localColumn: r.column_name,
        foreignColumn: r.foreign_column, // ← each column gets ITS OWN mapping
      });
    });

    // fkResult.rows.forEach((r) => {
    //   const fkTable =
    //     r.foreign_schema === "public"
    //       ? r.foreign_table
    //       : `${r.foreign_schema}.${r.foreign_table}`;
    //   foreignKeysMap.set(r.column_name, {
    //     table: fkTable,
    //     column: r.foreign_column,
    //     constraintName: r.constraint_name,
    //   });
    // });

    // Now build foreignKeysMap per column, but with full composite context
    constraintMap.forEach((constraint, constraintName) => {
      const isComposite = constraint.columns.length > 1;
      constraint.columns.forEach(({ localColumn, foreignColumn }) => {
        foreignKeysMap.set(localColumn, {
          table: constraint.table,
          column: foreignColumn, // ← correct mapping per column
          constraintName,
          isComposite,
          compositeColumns: isComposite ? constraint.columns : undefined,
        });
      });
    });

    const schema: Record<string, unknown> = {};

    result.rows.forEach((row) => {
      let type = "string";
      const pgType = row.data_type.toLowerCase();
      const defaultValue = row.column_default
        ? row.column_default.toLowerCase()
        : "";

      if (pgType === "integer" || pgType === "smallint") {
        type = "integer";
      } else if (pgType === "bigint") {
        type = "integer";
      } else if (
        pgType.includes("numeric") ||
        pgType.includes("decimal") ||
        pgType.includes("real") ||
        pgType.includes("double") ||
        pgType === "money"
      ) {
        type = "number";
      } else if (pgType.includes("bool")) {
        type = "boolean";
      } else if (
        pgType.includes("timestamp") ||
        pgType.includes("date") ||
        pgType.includes("time")
      ) {
        type = "timestamp";
      } else if (pgType.includes("json")) {
        type = "object";
      } else if (pgType.endsWith("[]") || pgType === "array") {
        type = "array";
      } else if (pgType.includes("uuid")) {
        type = "uuid";
      }

      // If default value has 'nextval', it's likely a serial column.
      const isSerial = defaultValue.includes("nextval");

      if (isSerial) {
        type = "integer"; // Serial is technically an integer
      }

      const isPrimaryKey = primaryKeyPositions.has(row.column_name);
      const isUnique = uniqueColumns.has(row.column_name);
      const fk = foreignKeysMap.get(row.column_name);

      // Handle composite keys
      const compositePrimaryKeyIndex =
        isCompositePrimaryKey && isPrimaryKey
          ? primaryKeyPositions.get(row.column_name)
          : undefined;
      const compositeKeyGroup = fk?.isComposite ? fk.constraintName : undefined;

      schema[row.column_name] = {
        type,
        rawType: row.data_type,
        nullable: !isPrimaryKey && row.is_nullable === "YES",
        isPrimaryKey,
        isUnique,
        isForeignKey: !!fk,
        references: fk ? { table: fk.table, column: fk.column } : undefined,
        referencedCollectionId: fk ? fk.table : undefined,
        foreignKeyTarget: fk ? fk.column : undefined,
        isSerial,
        // Composite key support
        compositePrimaryKeyIndex,
        compositeKeyGroup,
      };
    });

    return schema;
  }

  /**
   * Detect relationships between collections.
   * @param collections - List of collection names to detect relationships for
   * @param selectedSchemas - If provided, only query schemas in this list for improved performance
   */
  async detectRelationships(
    collections: string[],
    selectedSchemas?: string[],
  ): Promise<DatabaseRelationship[]> {
    if (!this.client) throw new Error("Not connected to PostgreSQL");

    // Extract schemas from collections if selectedSchemas not provided
    const schemasToQuery =
      selectedSchemas && selectedSchemas.length > 0
        ? selectedSchemas
        : [...new Set(collections.map((c) => this.parseTableSchema(c).schema))];

    const fkQuery = `
            SELECT
                tc.constraint_name,
                tc.table_schema AS child_schema,
                tc.table_name AS child_table,
                kcu.column_name AS child_column,
                ccu.table_schema AS parent_schema,
                ccu.table_name AS parent_table,
                ccu.column_name AS parent_column
            FROM
                information_schema.table_constraints AS tc
                JOIN information_schema.key_column_usage AS kcu
                  ON tc.constraint_name = kcu.constraint_name
                  AND tc.table_schema = kcu.table_schema
                JOIN information_schema.constraint_column_usage AS ccu
                  ON ccu.constraint_name = tc.constraint_name
                  AND ccu.table_schema = tc.table_schema
            WHERE tc.constraint_type = 'FOREIGN KEY' 
              AND tc.table_schema = ANY($1)
            ORDER BY tc.constraint_name, kcu.ordinal_position;
        `;

    const fkResult = await this.client.query(fkQuery, [schemasToQuery]);

    const uniqueQuery = `
			SELECT tc.table_schema, tc.table_name, kcu.column_name
			FROM information_schema.table_constraints tc
			JOIN information_schema.key_column_usage kcu 
			  ON tc.constraint_name = kcu.constraint_name 
			  AND tc.table_schema = kcu.table_schema
			WHERE tc.constraint_type = 'UNIQUE' 
			  AND tc.table_schema = ANY($1)
		`;

    const uniqueResult = await this.client.query(uniqueQuery, [schemasToQuery]);
    const uniqueColumns = new Set<string>();
    uniqueResult.rows.forEach((r) => {
      const tableName = `${r.table_schema}.${r.table_name}`;
      uniqueColumns.add(`${tableName}.${r.column_name}`);
    });

    const explicitRelationshipsMap = new Map<string, DatabaseRelationship>();

    fkResult.rows.forEach((row) => {
      const childTable = `${row.child_schema}.${row.child_table}`;
      const parentTable = `${row.parent_schema}.${row.parent_table}`;

      if (
        !collections.includes(childTable) ||
        !collections.includes(parentTable)
      )
        return;

      if (!explicitRelationshipsMap.has(row.constraint_name)) {
        const formKey = `${childTable}.${row.child_column}`;
        const isOneToOne = uniqueColumns.has(formKey);

        explicitRelationshipsMap.set(row.constraint_name, {
          parentTable: parentTable,
          childTable: childTable,
          columns: [],
          parentColumns: [], // Keep track of parent columns for composite FKs
          confidence: 1.0,
          type: isOneToOne ? "1:1" : "1:N",
        });
      }
      const rel = explicitRelationshipsMap.get(row.constraint_name)!;
      rel.columns.push(row.child_column);
      if (rel.parentColumns) {
        rel.parentColumns.push(row.parent_column);
      }
    });

    const explicitRelationships = Array.from(explicitRelationshipsMap.values());

    const heuristicCandidates: DatabaseRelationship[] = [];
    const explicitKeys = new Set<string>();
    explicitRelationships.forEach((r) => {
      r.columns.forEach((col) => explicitKeys.add(`${r.childTable}.${col}`));
    });

    const schemasInUse = new Set<string>();
    collections.forEach((c) => {
      const { schema } = this.parseTableSchema(c);
      schemasInUse.add(schema);
    });

    const schemasArray = Array.from(schemasInUse);

    const columnsQuery = `
			SELECT table_schema, table_name, column_name, data_type 
			FROM information_schema.columns 
			WHERE table_schema = ANY($1)
		`;

    const columnsResult = await this.client.query(columnsQuery, [schemasArray]);

    const allColumns = columnsResult.rows.filter((r) => {
      const name = `${r.table_schema}.${r.table_name}`;
      return collections.includes(name);
    });

    const pkInfo = new Map<string, { type: string; count: number }>();

    const allPksResult = await this.client.query(
      `
			SELECT tc.table_schema, tc.table_name, kcu.column_name, c.data_type
			FROM information_schema.table_constraints tc
			JOIN information_schema.key_column_usage kcu
			  ON tc.constraint_name = kcu.constraint_name
			JOIN information_schema.columns c
			  ON c.table_name = tc.table_name AND c.column_name = kcu.column_name
			WHERE tc.constraint_type = 'PRIMARY KEY'
			  AND tc.table_schema = ANY($1)
		`,
      [schemasArray],
    );

    allPksResult.rows.forEach((r) => {
      const tableName = `${r.table_schema}.${r.table_name}`;
      if (!collections.includes(tableName)) return;

      if (!pkInfo.has(tableName)) {
        pkInfo.set(tableName, { type: r.data_type.toLowerCase(), count: 0 });
      }
      const info = pkInfo.get(tableName)!;
      info.count++;
    });

    const emittedHeuristics = new Set<string>();

    for (const col of allColumns) {
      const { table_schema, table_name, column_name, data_type } = col;
      const tableName = `${table_schema}.${table_name}`;

      const fullKey = `${tableName}.${column_name}`;

      if (explicitKeys.has(fullKey) || column_name.toLowerCase() === "id")
        continue;

      if (
        column_name.endsWith("external_id") ||
        column_name.endsWith("stripe_id") ||
        column_name.endsWith("legacy_id")
      )
        continue;

      for (const targetTable of collections) {
        if (targetTable === tableName) continue;

        let confidence = 0.5;
        let isMatch = false;
        const lowerCol = column_name.toLowerCase();

        const targetParts = this.parseTableSchema(targetTable);
        const targetPureName = targetParts.table;

        if (
          lowerCol === `${targetPureName}_id` ||
          lowerCol === `${targetPureName}id`
        ) {
          isMatch = true;
          confidence += 0.2;
        } else if (
          targetPureName.endsWith("s") &&
          (lowerCol === `${targetPureName.slice(0, -1)}_id` ||
            lowerCol === `${targetPureName.slice(0, -1)}id`)
        ) {
          isMatch = true;
          confidence += 0.2;
        }

        if (isMatch) {
          const targetPk = pkInfo.get(targetTable);

          if (targetPk && targetPk.count > 1) {
            continue;
          }

          const colType = data_type.toLowerCase();

          if (targetPk) {
            const targetPkType = targetPk.type;

            const isNumberFamily = (t: string) =>
              [
                "smallint",
                "integer",
                "bigint",
                "numeric",
                "decimal",
                "real",
                "double precision",
              ].some((n) => t.includes(n));

            const isUuid = (t: string) => t.includes("uuid");
            const isString = (t: string) =>
              t.includes("char") || t.includes("text");

            const typeMatch =
              colType === targetPkType ||
              (isNumberFamily(colType) && isNumberFamily(targetPkType)) ||
              (isUuid(colType) && isUuid(targetPkType)) ||
              (isString(colType) && isString(targetPkType));

            if (!typeMatch) {
              continue;
            } else {
              confidence += 0.1;
            }
          }

          if (confidence > 0.75) confidence = 0.75;

          const dedupKey = `${targetTable}.${tableName}.${column_name}`;
          if (emittedHeuristics.has(dedupKey)) {
            continue;
          }
          emittedHeuristics.add(dedupKey);

          const isOneToOne = uniqueColumns.has(fullKey);

          heuristicCandidates.push({
            parentTable: targetTable,
            childTable: tableName,
            columns: [column_name],
            confidence,
            type: isOneToOne ? "1:1" : "1:N",
          });
        }
      }
    }

    return [...explicitRelationships, ...heuristicCandidates];
  }

  async hasData(collectionName: string): Promise<boolean> {
    if (!this.client) throw new Error("Not connected to PostgreSQL");
    const { schema, table } = this.parseTableSchema(collectionName);
    const result = await this.client.query(
      `SELECT 1 FROM "${schema}"."${table}" LIMIT 1`,
    );
    return result.rowCount !== null && result.rowCount > 0;
  }

  async renameCollection(oldName: string, newName: string): Promise<void> {
    if (!this.client) throw new Error("Not connected to PostgreSQL");
    const { schema: oldSchema, table: oldTable } =
      this.parseTableSchema(oldName);
    const { table: newTable } = this.parseTableSchema(newName);

    await this.client.query(
      `ALTER TABLE "${oldSchema}"."${oldTable}" RENAME TO "${newTable}"`,
    );
  }

  async createCollection(collectionName: string): Promise<void> {
    if (!this.client) throw new Error("Not connected to PostgreSQL");

    const { schema, table } = this.parseTableSchema(collectionName);

    if (schema !== "public") {
      await this.client.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
    }

    await this.client.query(`
			CREATE TABLE "${schema}"."${table}" (
				"id" SERIAL PRIMARY KEY
			)
		`);
  }

  async deleteCollection(collectionName: string): Promise<void> {
    if (!this.client) throw new Error("Not connected to PostgreSQL");
    const { schema, table } = this.parseTableSchema(collectionName);
    await this.client.query(
      `DROP TABLE IF EXISTS "${schema}"."${table}" CASCADE`,
    );
  }
  async getPrimaryKeyField(collectionName: string): Promise<string> {
    if (!this.client) throw new Error("Not connected to PostgreSQL");

    const { schema, table } = this.parseTableSchema(collectionName);

    const query = `
            SELECT kcu.column_name
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
              ON tc.constraint_name = kcu.constraint_name
              AND tc.table_schema = kcu.table_schema
            WHERE tc.constraint_type = 'PRIMARY KEY'
              AND tc.table_name = $2
              AND tc.table_schema = $1
            LIMIT 1
        `;

    const result = await this.client.query(query, [schema, table]);
    if (result.rows.length > 0) {
      return result.rows[0].column_name;
    }
    return "id";
  }

  /**
   * Snapshots the current DB schema for diffing.
   * This snapshot is stored in canvasData and used to detect changes.
   * @param connectionId - The connection ID for this snapshot
   * @param selectedSchemas - If provided, only snapshot tables from these schemas
   */
  async captureSchemaSnapshot(
    connectionId: number,
    selectedSchemas?: string[],
  ): Promise<{
    tables: Record<
      string,
      {
        name: string;
        schema: string;
        columns: Record<
          string,
          {
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
        >;
      }
    >;
    capturedAt: string;
    connectionId: number;
  }> {
    if (!this.client) throw new Error("Not connected to PostgreSQL");

    const collections = await this.getCollections(selectedSchemas);
    const tables: Record<string, any> = {};

    for (const collectionName of collections) {
      const schema = await this.inferSchema(collectionName);
      const { schema: tableSchema, table: tableName } =
        this.parseTableSchema(collectionName);

      const columns: Record<string, any> = {};
      for (const [fieldName, fieldInfo] of Object.entries(schema)) {
        const info = fieldInfo as any;
        const rawType = info.rawType || info.type || "text";
        columns[fieldName] = {
          name: fieldName,
          type: rawType,
          rawType: rawType,
          nullable: info.nullable ?? true,
          isPrimaryKey: info.isPrimaryKey ?? false,
          isUnique: info.isUnique ?? false,
          isForeignKey: info.isForeignKey ?? false,
          isSerial: info.isSerial ?? false,
          defaultValue: info.defaultValue,
          references: info.references,
        };
      }

      tables[collectionName] = {
        name: tableName,
        schema: tableSchema,
        columns,
      };
    }

    return {
      tables,
      capturedAt: new Date().toISOString(),
      connectionId,
    };
  }

  /**
   * Runs DDL statements in a transaction.
   * Returns success status and details about execution.
   */
  async executeDDL(
    statements: Array<{ sql: string; description: string }>,
  ): Promise<{
    success: boolean;
    executedCount: number;
    failedAt?: number;
    error?: string;
    executedStatements: string[];
  }> {
    if (!this.client) throw new Error("Not connected to PostgreSQL");

    const executedStatements: string[] = [];

    try {
      await this.client.query("BEGIN");

      for (let i = 0; i < statements.length; i++) {
        const stmt = statements[i];
        logger.log(
          "PostgreSQLHandler",
          `Executing DDL (${i + 1}/${statements.length}): ${stmt.description}`,
        );

        try {
          await this.client.query(stmt.sql);
          executedStatements.push(stmt.sql);
        } catch (stmtError: any) {
          // Rollback on failure
          await this.client.query("ROLLBACK");
          return {
            success: false,
            executedCount: i,
            failedAt: i,
            error: `Failed at statement ${i + 1}: ${stmtError.message}`,
            executedStatements,
          };
        }
      }

      await this.client.query("COMMIT");
      logger.log(
        "PostgreSQLHandler",
        `Successfully executed ${statements.length} DDL statements`,
      );

      return {
        success: true,
        executedCount: statements.length,
        executedStatements,
      };
    } catch (error: any) {
      try {
        await this.client.query("ROLLBACK");
      } catch (rollbackError) {
        logger.error("PostgreSQLHandler", "Rollback failed:", rollbackError);
      }

      return {
        success: false,
        executedCount: 0,
        error: error.message,
        executedStatements,
      };
    }
  }
}
