import { Client } from "pg";
import { BaseAdapter, CollectionDetails } from "./BaseAdapter";
import {
  SchemaField,
  SchemaCollection,
  SchemaRelationship,
} from "../../types/schemaDesign";
import { logger } from "../../utils";
import type { GeneratedDocument } from "../types";

export class PostgresAdapter extends BaseAdapter {
  private client: Client | null = null;
  private connectionString: string;
  private databaseName: string | null = null;
  private schemaCache: Map<
    string,
    { columns: Map<string, string>; autoIncrement: Set<string> }
  > = new Map();
  private detailsCache: Map<string, CollectionDetails> = new Map();

  constructor(connectionString: string, databaseName?: string) {
    super();
    this.connectionString = connectionString;
    this.databaseName = databaseName || null;
  }

  private getClientConfig() {
    if (this.databaseName && this.connectionString) {
      try {
        const url = new URL(this.connectionString);
        url.pathname = `/${this.databaseName}`;
        return { connectionString: url.toString() };
      } catch {
        return { connectionString: this.connectionString };
      }
    }
    return { connectionString: this.connectionString };
  }

  async connect(): Promise<void> {
    if (this.client) return;

    const config = this.getClientConfig();

    try {
      this.client = new Client({
        connectionString: config.connectionString,
        ssl: { rejectUnauthorized: false },
      });
      await this.client.connect();
      logger.log("PostgresAdapter", "Connected with SSL");
    } catch {
      try {
        this.client = new Client({
          connectionString: config.connectionString,
          ssl: false,
        });
        await this.client.connect();
        logger.log("PostgresAdapter", "Connected without SSL");
      } catch (error) {
        throw new Error(
          `Failed to connect to PostgreSQL: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.end();
      this.client = null;
    }
    this.schemaCache.clear();
    this.detailsCache.clear();
  }

  async insertDocuments(
    collectionName: string,
    documents: GeneratedDocument[],
    batchSize: number = 1000,
    allowedReferenceFields?: Set<string>,
    schema?: SchemaField[],
  ): Promise<(string | number)[]> {
    if (!this.client) throw new Error("Not connected to PostgreSQL");
    if (documents.length === 0) return [];

    if (documents.length >= 5000) {
      return this.insertDocumentsUnnestBulk(collectionName, documents, allowedReferenceFields);
    }

    return this.insertDocumentsBatch(collectionName, documents, batchSize, allowedReferenceFields, schema);
  }

  private async insertDocumentsUnnestBulk(
    collectionName: string,
    documents: GeneratedDocument[],
    allowedReferenceFields?: Set<string>,
  ): Promise<(string | number)[]> {
    const insertedIds: (string | number)[] = [];

    const schemaInfo = await this.getSchemaInfo(collectionName);
    const { columns: columnTypes, autoIncrement: autoIncrementColumns } = schemaInfo;
    const validColumns = new Set(columnTypes.keys());

    const details = await this.getCollectionDetails(collectionName);
    const primaryKey = details.primaryKey || "id";

    if (validColumns.size === 0) {
      throw new Error(`Table ${collectionName} does not exist`);
    }

    const allKeys = new Set<string>();
    documents.forEach((doc) => {
      Object.keys(doc.data).forEach((k) => allKeys.add(k));
    });
    const columns = Array.from(allKeys).filter(
      (key) => validColumns.has(key) && !autoIncrementColumns.has(key),
    );

    const hasExplicitId = documents.some(
      (d) => d.id !== undefined && d.id !== null,
    );
    if (
      hasExplicitId &&
      primaryKey &&
      validColumns.has(primaryKey) &&
      !columns.includes(primaryKey) &&
      !autoIncrementColumns.has(primaryKey)
    ) {
      columns.unshift(primaryKey);
    }

    if (columns.length === 0) {
      logger.warn("PostgresAdapter", `No matching columns for table ${collectionName}`);
      return [];
    }

    logger.log("PostgresAdapter", `UNNEST bulk insert: ${documents.length} rows into ${collectionName}`);

    const columnArrays: Record<string, unknown[]> = {};
    for (const col of columns) {
      columnArrays[col] = [];
    }

    for (const doc of documents) {
      const rowData = { ...doc.data };

      if (doc.id !== undefined && primaryKey && validColumns.has(primaryKey) && !autoIncrementColumns.has(primaryKey)) {
        if (rowData[primaryKey] === undefined) {
          rowData[primaryKey] = doc.id;
        }
      }

      for (const col of columns) {
        let val = rowData[col];
        const pgType = columnTypes.get(col);

        if (val === undefined || val === null) {
          val = null;
        } else if (pgType === "json" || pgType === "jsonb") {
          val = JSON.stringify(val);
        }

        columnArrays[col].push(val);
      }
    }

    const placeholders: string[] = [];
    for (let i = 0; i < documents.length; i++) {
      placeholders.push(`(${columns.map((_, j) => `$${j * documents.length + i + 1}`).join(", ")})`);
    }

    const values: unknown[] = [];
    for (const col of columns) {
      values.push(...columnArrays[col]);
    }

    const { schema: tableSchema, table: tableName } = this.parseTableSchema(collectionName);
    const query = `
      INSERT INTO "${tableSchema}"."${tableName}" (${columns.map((c) => `"${c}"`).join(", ")})
      VALUES ${placeholders.join(", ")}
      ON CONFLICT DO NOTHING
      RETURNING "${primaryKey}"
    `;

    try {
      const result = await this.client!.query(query, values);

      if (result.rows.length > 0) {
        result.rows.forEach((r) => {
          if (r[primaryKey] !== undefined) {
            insertedIds.push(r[primaryKey] as string | number);
          }
        });
      } else {
        for (const doc of documents) {
          if (doc.id !== undefined && doc.id !== null) {
            insertedIds.push(doc.id);
          } else if (primaryKey && validColumns.has(primaryKey) && !autoIncrementColumns.has(primaryKey)) {
            insertedIds.push(doc.data[primaryKey] as string | number);
          }
        }
      }

      if (details.isCompositePK && details.primaryKeys) {
        const existing = this.insertedCompositePKRows.get(collectionName) || [];
        for (const doc of documents) {
          const pkRow: Record<string, unknown> = {};
          for (const pk of details.primaryKeys!) {
            pkRow[pk] = doc.data[pk];
          }
          existing.push(pkRow);
        }
        this.insertedCompositePKRows.set(collectionName, existing);
        const simpleName = collectionName.split(".").pop()!;
        if (simpleName !== collectionName) {
          this.insertedCompositePKRows.set(simpleName, existing);
        }
      }
    } catch (error) {
      logger.error("PostgresAdapter", `UNNEST bulk insert failed for ${collectionName}:`, error);
      return this.insertDocumentsBatch(collectionName, documents, 1000, allowedReferenceFields);
    }

    return insertedIds;
  }

  private async insertDocumentsBatch(
    collectionName: string,
    documents: GeneratedDocument[],
    batchSize: number,
    allowedReferenceFields?: Set<string>,
    schema?: SchemaField[],
  ): Promise<(string | number)[]> {
    const insertedIds: (string | number)[] = [];

    const schemaInfo = await this.getSchemaInfo(collectionName);
    const { columns: columnTypes, autoIncrement: autoIncrementColumns } = schemaInfo;
    const validColumns = new Set(columnTypes.keys());

    const details = await this.getCollectionDetails(collectionName);
    const primaryKey = details.primaryKey || "id";

    const allKeys = new Set<string>();
    documents.forEach((doc) => {
      Object.keys(doc.data).forEach((k) => allKeys.add(k));
    });
    const columns = Array.from(allKeys).filter(
      (key) => validColumns.has(key) && !autoIncrementColumns.has(key),
    );

    const hasExplicitId = documents.some(
      (d) => d.id !== undefined && d.id !== null,
    );
    if (
      hasExplicitId &&
      primaryKey &&
      validColumns.has(primaryKey) &&
      !columns.includes(primaryKey) &&
      !autoIncrementColumns.has(primaryKey)
    ) {
      columns.unshift(primaryKey);
    }

    if (columns.length === 0) {
      logger.warn("PostgresAdapter", `No matching columns for table ${collectionName}`);
      return [];
    }

    logger.log("PostgresAdapter", `Batch insert: ${documents.length} rows into ${collectionName}`);

    for (let i = 0; i < documents.length; i += batchSize) {
      const batch = documents.slice(i, i + batchSize);
      const values: unknown[] = [];
      const placeholders: string[] = [];

      batch.forEach((doc, batchIndex) => {
        const rowPlaceholders: string[] = [];
        const rowData = { ...doc.data };

        if (
          doc.id !== undefined &&
          primaryKey &&
          validColumns.has(primaryKey) &&
          !autoIncrementColumns.has(primaryKey)
        ) {
          if (rowData[primaryKey] === undefined) {
            rowData[primaryKey] = doc.id;
          }
        }

        columns.forEach((col, colIndex) => {
          const paramIndex = batchIndex * columns.length + colIndex + 1;
          rowPlaceholders.push(`$${paramIndex}`);

          let val = rowData[col];
          const pgType = columnTypes.get(col);

          if (pgType === "json" || pgType === "jsonb") {
            if (val !== undefined && val !== null) {
              val = JSON.stringify(val);
            }
          }

          values.push(val);
        });
        placeholders.push(`(${rowPlaceholders.join(", ")})`);
      });

      const { schema: tableSchema, table: tableName } = this.parseTableSchema(collectionName);
      let query = `
        INSERT INTO "${tableSchema}"."${tableName}" (${columns.map((c) => `"${c}"`).join(", ")})
        VALUES ${placeholders.join(", ")}
        ON CONFLICT DO NOTHING
      `;

      if (primaryKey && validColumns.has(primaryKey)) {
        query += ` RETURNING "${primaryKey}"`;
      }

      try {
        const result = await this.client!.query(query, values);

        if (primaryKey && validColumns.has(primaryKey)) {
          result.rows.forEach((r) => {
            if (r[primaryKey] !== undefined) {
              insertedIds.push(r[primaryKey]);
            }
          });
        }

        if (details.isCompositePK && details.primaryKeys) {
          const existing = this.insertedCompositePKRows.get(collectionName) || [];
          for (const doc of batch) {
            const pkRow: Record<string, unknown> = {};
            for (const pk of details.primaryKeys!) {
              pkRow[pk] = doc.data[pk];
            }
            existing.push(pkRow);
          }
          this.insertedCompositePKRows.set(collectionName, existing);
          const simpleName = collectionName.split(".").pop()!;
          if (simpleName !== collectionName) {
            this.insertedCompositePKRows.set(simpleName, existing);
          }
        }
      } catch (error) {
        logger.error("PostgresAdapter", `Batch insert failed for ${collectionName}:`, error);
        throw error;
      }
    }

    if (insertedIds.length === 0 && documents.length > 0) {
      return documents
        .map((d) => d.id)
        .filter((id): id is string | number => id !== undefined);
    }

    return insertedIds;
  }

  /**
   * Get cached schema info or fetch from database
   */
  private async getSchemaInfo(
    collectionName: string,
  ): Promise<{ columns: Map<string, string>; autoIncrement: Set<string> }> {
    if (this.schemaCache.has(collectionName)) {
      return this.schemaCache.get(collectionName)!;
    }

    if (!this.client) throw new Error("Not connected to PostgreSQL");

    const { schema, table } = this.parseTableSchema(collectionName);

    const columnResult = await this.client.query(
      `SELECT column_name, data_type, column_default 
			 FROM information_schema.columns 
			 WHERE table_schema = $1 AND table_name = $2`,
      [schema, table],
    );

    const columns = new Map<string, string>();
    const autoIncrement = new Set<string>();

    columnResult.rows.forEach((r) => {
      columns.set(r.column_name, r.data_type);
      if (r.column_default?.startsWith("nextval")) {
        autoIncrement.add(r.column_name);
      }
    });

    const info = { columns, autoIncrement };
    this.schemaCache.set(collectionName, info);
    return info;
  }

  async clearCollection(collectionName: string): Promise<void> {
    if (!this.client) throw new Error("Not connected to PostgreSQL");

    const { schema, table } = await this.resolveCollectionName(collectionName);

    await this.client.query(`TRUNCATE TABLE "${schema}"."${table}" CASCADE`);
    logger.log("PostgresAdapter", `Cleared table ${schema}.${table}`);
  }

  async validateReference(
    collectionName: string,
    fieldName: string,
    value: unknown,
  ): Promise<boolean> {
    if (!this.client) throw new Error("Not connected to PostgreSQL");

    const details = await this.getCollectionDetails(collectionName);
    const primaryKey = details.primaryKey || "id";

    const { schema, table } = this.parseTableSchema(collectionName);
    const result = await this.client.query(
      `SELECT 1 FROM "${schema}"."${table}" WHERE "${fieldName}" = $1 LIMIT 1`,
      [value],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async getDocumentCount(collectionName: string): Promise<number> {
    if (!this.client) throw new Error("Not connected to PostgreSQL");
    const { schema, table } = this.parseTableSchema(collectionName);
    const result = await this.client.query(
      `SELECT COUNT(*) as count FROM "${schema}"."${table}"`,
    );
    return parseInt(result.rows[0].count, 10);
  }

  async collectionExists(collectionName: string): Promise<boolean> {
    if (!this.client) throw new Error("Not connected to PostgreSQL");
    const { schema, table } = this.parseTableSchema(collectionName);
    const result = await this.client.query(
      "SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2",
      [schema, table],
    );
    return result.rowCount !== null && result.rowCount > 0;
  }

  async ensureCollection(
    collectionName: string,
    schema?: SchemaField[],
    skipForeignKeys: boolean = false,
  ): Promise<void> {
    if (!this.client) throw new Error("Not connected to PostgreSQL");

    const exists = await this.collectionExists(collectionName);
    if (exists) {
      logger.log(
        "PostgresAdapter",
        `Table ${collectionName} already exists, skipping creation`,
      );
      return;
    }

    if (!schema || schema.length === 0) {
      throw new Error(
        `Table ${collectionName} does not exist and cannot be auto-created without schema`,
      );
    }

    const { schema: tableSchema, table: tableName } =
      this.parseTableSchema(collectionName);

    if (tableSchema !== "public") {
      await this.client.query(`CREATE SCHEMA IF NOT EXISTS "${tableSchema}"`);
    }

    // Detect composite primary key - handle it well, for now maybe need to show a warning msg
    // that data generation might not work properly for composite key - TODO
    const pkFields = schema.filter((f) => f.isPrimaryKey);
    const isCompositePK = pkFields.length > 1;

    // Group composite FKs by compositeKeyGroup
    const compositeFKGroups = new Map<string, SchemaField[]>();
    schema.forEach((field) => {
      if (field.isForeignKey && field.compositeKeyGroup) {
        if (!compositeFKGroups.has(field.compositeKeyGroup)) {
          compositeFKGroups.set(field.compositeKeyGroup, []);
        }
        compositeFKGroups.get(field.compositeKeyGroup)!.push(field);
      }
    });

    // Create table columns
    const columns = schema.map((field) => {
      let type = this.mapToPostgresType(field.type);
      let constraints = "";

      if (field.isPrimaryKey) {
        // For composite PK, use table-level constraint; skip column-level PRIMARY KEY
        if (!isCompositePK) {
          if (type === "INTEGER" && !field.compositePrimaryKeyIndex) {
            type = "SERIAL";
          }
          constraints = " PRIMARY KEY";
        } else {
          // Part of composite PK - just ensure NOT NULL
          constraints = " NOT NULL";
        }
      } else {
        if (field.required) constraints += " NOT NULL";

        if (field.defaultValue !== undefined && field.defaultValue !== null) {
          let defaultStr: string;
          const rawDefault = field.defaultValue;
          if (rawDefault instanceof Date) {
            defaultStr = `'${rawDefault.toISOString()}'`;
          } else if (typeof rawDefault === "string") {
            defaultStr = `'${rawDefault.replace(/'/g, "''")}'`;
          } else {
            defaultStr = String(rawDefault);
          }
          constraints += ` DEFAULT ${defaultStr}`;
        }

        if (field.constraints?.enum && field.constraints?.enum.length > 0) {
          const enumValues = field.constraints.enum
            .map((v) => `'${v.replace(/'/g, "''")}'`)
            .join(", ");
          constraints += ` CHECK ("${field.name}" IN (${enumValues}))`;
        }

        // Handle single-column foreign key (skip if part of composite FK)
        if (
          !skipForeignKeys &&
          field.isForeignKey &&
          field.referencedCollectionId &&
          !field.compositeKeyGroup
        ) {
          const targetCol = field.foreignKeyTarget || "id";
          const { schema: targetSchema, table: targetTable } =
            this.parseTableSchema(field.referencedCollectionId);
          const targetTableQuoted = `"${targetSchema}"."${targetTable}"`;

          logger.log(
            "PostgresAdapter",
            `Adding FK to ${collectionName}.${field.name} referencing ${targetTableQuoted}.${targetCol}`,
          );
          constraints += ` REFERENCES ${targetTableQuoted} ("${targetCol}")`;
        }
      }

      return `"${field.name}" ${type}${constraints}`;
    });

    const tableConstraints: string[] = [];

    if (isCompositePK) {
      const pkColumnNames = pkFields
        .sort(
          (a, b) =>
            (a.compositePrimaryKeyIndex ?? 0) -
            (b.compositePrimaryKeyIndex ?? 0),
        )
        .map((f) => `"${f.name}"`)
        .join(", ");
      tableConstraints.push(`PRIMARY KEY (${pkColumnNames})`);
    }

    if (!skipForeignKeys) {
      compositeFKGroups.forEach((fields, groupName) => {
        const refTable = fields[0].referencedCollectionId;
        if (!refTable) return;

        const localCols = fields.map((f) => `"${f.name}"`).join(", ");
        const remoteCols = fields
          .map((f) => `"${f.foreignKeyTarget || "id"}"`)
          .join(", ");

        const { schema: targetSchema, table: targetTable } =
          this.parseTableSchema(refTable);
        const targetTableQuoted = `"${targetSchema}"."${targetTable}"`;

        logger.log(
          "PostgresAdapter",
          `Adding composite FK ${groupName} to ${collectionName} referencing ${targetTableQuoted}`,
        );
        tableConstraints.push(
          `FOREIGN KEY (${localCols}) REFERENCES ${targetTableQuoted} (${remoteCols})`,
        );
      });
    }

    if (columns.length === 0) {
      columns.push("id SERIAL PRIMARY KEY");
    }

    const allParts = [...columns, ...tableConstraints];
    const query = `CREATE TABLE "${tableSchema}"."${tableName}" (${allParts.join(", ")});`;
    logger.log("PostgresAdapter", `Executing SQL: ${query}`);

    try {
      await this.client.query(query);
      logger.log("PostgresAdapter", `Created table ${collectionName}`);
    } catch (error) {
      throw new Error(
        `Failed to create table ${collectionName}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async addForeignKeyConstraints(
    collectionName: string,
    schema: SchemaField[],
  ): Promise<void> {
    if (!this.client) throw new Error("Not connected to PostgreSQL");

    const fkFields = schema.filter(
      (f) => f.isForeignKey && f.referencedCollectionId,
    );
    if (fkFields.length === 0) return;

    const compositeFKGroups = new Map<string, SchemaField[]>();
    const singleFKFields: SchemaField[] = [];

    fkFields.forEach((field) => {
      if (field.compositeKeyGroup) {
        if (!compositeFKGroups.has(field.compositeKeyGroup)) {
          compositeFKGroups.set(field.compositeKeyGroup, []);
        }
        compositeFKGroups.get(field.compositeKeyGroup)!.push(field);
      } else {
        singleFKFields.push(field);
      }
    });

    const { schema: tableSchema, table: tableName } =
      this.parseTableSchema(collectionName);

    for (const [groupName, fields] of compositeFKGroups) {
      const refTable = fields[0].referencedCollectionId!;
      const localCols = fields.map((f) => `"${f.name}"`).join(", ");
      const remoteCols = fields
        .map((f) => `"${f.foreignKeyTarget || "id"}"`)
        .join(", ");

      const { schema: targetSchema, table: targetTable } =
        this.parseTableSchema(refTable);
      const constraintName = `fk_${tableName}_${groupName}`;

      const query = `
				ALTER TABLE "${tableSchema}"."${tableName}"
				ADD CONSTRAINT "${constraintName}"
				FOREIGN KEY (${localCols})
				REFERENCES "${targetSchema}"."${targetTable}" (${remoteCols})
				ON DELETE SET NULL
			`;

      try {
        await this.client.query(query);
        logger.log(
          "PostgresAdapter",
          `Added composite FK constraint ${constraintName}`,
        );
      } catch (error: any) {
        if (error.code === "42710") {
          // duplicate_object
          // ignore
        } else {
          logger.warn(
            "PostgresAdapter",
            `Failed to add composite FK constraint ${constraintName}:`,
            error.message,
          );
          if (error.code === "23503") throw error;
        }
      }
    }

    for (const field of singleFKFields) {
      const targetCol = field.foreignKeyTarget || "id";
      const constraintName = `fk_${tableName}_${field.name}`;

      const { schema: targetSchema, table: targetTable } =
        this.parseTableSchema(field.referencedCollectionId!);

      const query = `
				ALTER TABLE "${tableSchema}"."${tableName}"
				ADD CONSTRAINT "${constraintName}"
				FOREIGN KEY ("${field.name}")
				REFERENCES "${targetSchema}"."${targetTable}" ("${targetCol}")
				ON DELETE SET NULL
			`;

      try {
        await this.client.query(query);
      } catch (error: any) {
        if (error.code === "42710") {
          // duplicate_object
          // ignore
        } else {
          logger.warn(
            "PostgresAdapter",
            `Failed to add FK constraint ${constraintName}:`,
            error.message,
          );
          if (error.code === "23503") throw error;
        }
      }
    }
  }

  async updateSequence(collectionName: string): Promise<void> {
    if (!this.client) throw new Error("Not connected to PostgreSQL");

    const details = await this.getCollectionDetails(collectionName);
    if (details.primaryKeyType !== "integer" || !details.primaryKey) return;

    try {
      const seqRes = await this.client.query(
        `SELECT pg_get_serial_sequence($1, $2) as seq`,
        [collectionName, details.primaryKey],
      );

      const seqName = seqRes.rows[0]?.seq;
      if (seqName) {
        const { schema, table } = this.parseTableSchema(collectionName);
        await this.client.query(
          `SELECT setval($1, (SELECT MAX("${details.primaryKey}") FROM "${schema}"."${table}"))`,
          [seqName],
        );
        logger.log("PostgresAdapter", `Updated sequence for ${collectionName}`);
      }
    } catch (e) {
      logger.warn(
        "PostgresAdapter",
        `Failed to update sequence for ${collectionName}`,
        e,
      );
    }
  }

  private mapToPostgresType(type: string): string {
    switch (type) {
      case "string":
        return "TEXT";
      case "integer":
        return "INTEGER";
      case "long":
        return "BIGINT";
      case "number":
      case "float":
        return "DOUBLE PRECISION";
      case "decimal":
        return "DECIMAL";
      case "boolean":
        return "BOOLEAN";
      case "date":
        return "DATE";
      case "timestamp":
        return "TIMESTAMP";
      case "timestamptz":
        return "TIMESTAMPTZ";
      case "json":
      case "object":
      case "map":
      case "array":
      case "set":
      case "geopoint":
        return "JSONB";
      case "uuid":
        return "UUID";
      case "binary":
      case "bytes":
        return "BYTEA";
      default:
        return "TEXT";
    }
  }

  async getCollectionDetails(
    collectionName: string,
  ): Promise<CollectionDetails> {
    if (this.detailsCache.has(collectionName)) {
      return this.detailsCache.get(collectionName)!;
    }

    if (!this.client) throw new Error("Not connected to PostgreSQL");

    const query = `
			SELECT c.column_name, c.data_type, kcu.ordinal_position
			FROM information_schema.table_constraints tc 
			JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name 
				AND kcu.table_schema = tc.table_schema
			JOIN information_schema.columns c ON c.table_name = kcu.table_name 
				AND c.column_name = kcu.column_name 
				AND c.table_schema = kcu.table_schema
			WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_name = $2 AND c.table_schema = $1
			ORDER BY kcu.ordinal_position
		`;

    const { schema, table } = await this.resolveCollectionName(collectionName);
    const result = await this.client.query(query, [schema, table]);

    if (result.rows.length === 0) {
      const details: CollectionDetails = {
        primaryKey: "id",
        primaryKeyType: "string",
        isCompositePK: false,
      };
      this.detailsCache.set(collectionName, details);
      return details;
    }

    const isCompositePK = result.rows.length > 1;
    const primaryKeys: string[] = [];
    const primaryKeyTypes: ("string" | "integer" | "number" | "uuid")[] = [];

    for (const row of result.rows) {
      const pgType = row.data_type.toLowerCase();
      let type: "string" | "integer" | "number" | "uuid" = "string";

      if (pgType.includes("int") || pgType.includes("serial")) {
        type = "integer";
      } else if (
        pgType.includes("numeric") ||
        pgType.includes("decimal") ||
        pgType.includes("double") ||
        pgType.includes("float") ||
        pgType.includes("real")
      ) {
        type = "number";
      } else if (pgType.includes("uuid")) {
        type = "uuid";
      }

      primaryKeys.push(row.column_name);
      primaryKeyTypes.push(type);
    }

    // Get startId for the first integer PK column
    let startId = 0;
    const firstIntPKIdx = primaryKeyTypes.findIndex((t) => t === "integer");
    if (firstIntPKIdx >= 0) {
      try {
        const pkCol = primaryKeys[firstIntPKIdx];

        // First try to get MAX(id) for existing data
        const maxRes = await this.client.query(
          `SELECT MAX("${pkCol}") as max_id FROM "${schema}"."${table}"`,
        );

        if (maxRes.rows.length > 0 && maxRes.rows[0].max_id !== null) {
          startId = parseInt(maxRes.rows[0].max_id, 10);
        } else {
          // Table is empty - check if there's a sequence and get its current value
          // This handles the case where table was TRUNCATE'd but sequence wasn't reset
          try {
            const seqRes = await this.client.query(
              `SELECT pg_get_serial_sequence($1, $2) as seq`,
              [`${schema}.${table}`, pkCol],
            );
            const seqName = seqRes.rows[0]?.seq;
            if (seqName) {
              // Get the sequence's last_value (next value to be assigned - 1)
              const lastValRes = await this.client.query(
                `SELECT last_value, is_called FROM ${seqName}`,
              );
              if (lastValRes.rows.length > 0) {
                const lastValue = parseInt(lastValRes.rows[0].last_value, 10);
                const isCalled = lastValRes.rows[0].is_called;
                // If is_called is false, next value will be last_value
                // If is_called is true, next value will be last_value + 1
                // We want startId such that startId + 1 = next value to be assigned
                if (isCalled) {
                  startId = lastValue; // Next will be lastValue + 1, so startId = lastValue
                } else {
                  startId = lastValue - 1; // Next will be lastValue, so startId = lastValue - 1
                }
                logger.log(
                  "PostgresAdapter",
                  `${table}.${pkCol} sequence at ${lastValue} (is_called=${isCalled}), startId=${startId}`,
                );
              }
            }
          } catch (seqErr) {
            logger.warn(
              "PostgresAdapter",
              `No sequence found for ${table}.${pkCol}`,
            );
          }
        }
      } catch {
        logger.warn(
          "PostgresAdapter",
          `Failed to get MAX ID for ${collectionName}`,
        );
      }
    } else {
      // For UUID/String, use COUNT(*) as offset
      try {
        const countRes = await this.client.query(
          `SELECT COUNT(*) as count FROM "${schema}"."${table}"`,
        );
        if (countRes.rows.length > 0) {
          startId = parseInt(countRes.rows[0].count, 10);
        }
      } catch {
        logger.warn(
          "PostgresAdapter",
          `Failed to get COUNT for ${collectionName}`,
        );
      }
    }

    const details: CollectionDetails = {
      primaryKey: primaryKeys[0],
      primaryKeyType: primaryKeyTypes[0],
      startId,
      primaryKeys,
      primaryKeyTypes,
      isCompositePK,
    };
    this.detailsCache.set(collectionName, details);
    return details;
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
      if (parts.length > 2) {
        return { schema: parts[0], table: parts.slice(1).join(".") };
      }
    }
    return { schema: "public", table: collectionName };
  }

  private async resolveCollectionName(
    collectionName: string,
  ): Promise<{ schema: string; table: string }> {
    if (collectionName.includes(".")) {
      return this.parseTableSchema(collectionName);
    }

    try {
      if (!this.client) return { schema: "public", table: collectionName };

      const res = await this.client.query(
        `SELECT table_schema FROM information_schema.tables 
				 WHERE table_name = $1 
				 AND table_schema NOT IN ('information_schema', 'pg_catalog')`,
        [collectionName],
      );

      if (res.rows.length === 1) {
        return { schema: res.rows[0].table_schema, table: collectionName };
      } else if (res.rows.length > 1) {
        const hasPublic = res.rows.some((r) => r.table_schema === "public");
        if (!hasPublic) {
          logger.warn(
            "PostgresAdapter",
            `Ambiguous table '${collectionName}' found in multiple schemas: ${res.rows.map((r) => r.table_schema).join(", ")}. Defaulting to public.`,
          );
        }
      }
    } catch (e) {
      // Ignore lookup errors
    }

    return { schema: "public", table: collectionName };
  }

  async getCollections(): Promise<SchemaCollection[]> {
    if (!this.client) throw new Error("Not connected to PostgreSQL");

    const query = `
			SELECT table_schema, table_name 
			FROM information_schema.tables 
			WHERE table_schema NOT IN ('information_schema', 'pg_catalog') 
			  AND table_type = 'BASE TABLE'
		`;

    const result = await this.client.query(query);

    return result.rows.map((row) => {
      const name = `${row.table_schema}.${row.table_name}`;

      return {
        id: name,
        name,
        schema: row.table_schema,
        dbName: name,
        fields: [],
        position: { x: 0, y: 0 },
      } as unknown as SchemaCollection;
    });
  }

  private parseCheckConstraints(
    columnName: string,
    checkDefs: string[],
  ): {
    min?: number;
    max?: number;
    positive?: boolean;
    minLength?: number;
    maxLength?: number;
    minColumn?: string;
    maxColumn?: string;
    gtColumn?: string;
    ltColumn?: string;
    enum?: string[];
  } {
    const result: {
      min?: number;
      max?: number;
      positive?: boolean;
      minLength?: number;
      maxLength?: number;
      minColumn?: string;
      maxColumn?: string;
      gtColumn?: string;
      ltColumn?: string;
      enum?: string[];
    } = {};

    for (const def of checkDefs) {
      if (!def) continue;

      const normalized = def
        .replace(/\(/g, " ( ")
        .replace(/\)/g, " ) ")
        .replace(/::\w+/g, "")
        .replace(/["']/g, "")
        .toLowerCase()
        .trim();

      const colPattern = columnName.toLowerCase();

      // Pattern: length(column) BETWEEN N AND M
      const lengthBetweenMatch = normalized.match(
        /length\s*\(\s*(\w+)\s*\)\s+between\s+(\d+)\s+and\s+(\d+)/,
      );
      if (lengthBetweenMatch && lengthBetweenMatch[1] === colPattern) {
        result.minLength = parseInt(lengthBetweenMatch[2], 10);
        result.maxLength = parseInt(lengthBetweenMatch[3], 10);
        logger.log(
          "PostgresAdapter",
          `Parsed length constraint for ${columnName}: ${result.minLength}-${result.maxLength}`,
        );
      }

      // Pattern: length(column) >= N
      const lengthGteMatch = normalized.match(
        /length\s*\(\s*(\w+)\s*\)\s*>=\s*(\d+)/,
      );
      if (lengthGteMatch && lengthGteMatch[1] === colPattern) {
        result.minLength = parseInt(lengthGteMatch[2], 10);
      }

      // Pattern: length(column) > N
      const lengthGtMatch = normalized.match(
        /length\s*\(\s*(\w+)\s*\)\s*>\s*(\d+)/,
      );
      if (lengthGtMatch && lengthGtMatch[1] === colPattern) {
        result.minLength = parseInt(lengthGtMatch[2], 10) + 1;
      }

      // Pattern: length(column) <= N
      const lengthLteMatch = normalized.match(
        /length\s*\(\s*(\w+)\s*\)\s*<=\s*(\d+)/,
      );
      if (lengthLteMatch && lengthLteMatch[1] === colPattern) {
        result.maxLength = parseInt(lengthLteMatch[2], 10);
      }

      // Pattern: length(column) < N
      const lengthLtMatch = normalized.match(
        /length\s*\(\s*(\w+)\s*\)\s*<\s*(\d+)/,
      );
      if (lengthLtMatch && lengthLtMatch[1] === colPattern) {
        result.maxLength = parseInt(lengthLtMatch[2], 10) - 1;
      }

      // Pattern: column > N
      const gtMatch = normalized.match(
        new RegExp(`${colPattern}\\s*>\\s*(-?\\d+(?:\\.\\d+)?)`),
      );
      if (gtMatch) {
        const val = parseFloat(gtMatch[1]);
        result.min = Math.ceil(val + 1);
        if (val === 0) result.positive = true;
      }

      // Pattern: column >= N
      const gteMatch = normalized.match(
        new RegExp(`${colPattern}\\s*>=\\s*(-?\\d+(?:\\.\\d+)?)`),
      );
      if (gteMatch) {
        result.min = parseFloat(gteMatch[1]);
        if (result.min > 0) result.positive = true;
      }

      // Pattern: column < N
      const ltMatch = normalized.match(
        new RegExp(`${colPattern}\\s*<\\s*(-?\\d+(?:\\.\\d+)?)`),
      );
      if (ltMatch) {
        const val = parseFloat(ltMatch[1]);
        result.max = Math.floor(val - 1);
      }

      // Pattern: column <= N
      const lteMatch = normalized.match(
        new RegExp(`${colPattern}\\s*<=\\s*(-?\\d+(?:\\.\\d+)?)`),
      );
      if (lteMatch) {
        result.max = parseFloat(lteMatch[1]);
      }

      // Pattern: column BETWEEN N AND M
      const betweenMatch = normalized.match(
        new RegExp(
          `${colPattern}\\s+between\\s+(-?\\d+(?:\\.\\d+)?)\\s+and\\s+(-?\\d+(?:\\.\\d+)?)`,
        ),
      );
      if (betweenMatch) {
        result.min = parseFloat(betweenMatch[1]);
        result.max = parseFloat(betweenMatch[2]);
        if (result.min > 0) result.positive = true;
      }

      // Pattern: column >= other_column
      const crossColGteMatch = normalized.match(
        new RegExp(`${colPattern}\\s*>=\\s*(\\w+)`),
      );
      if (crossColGteMatch) {
        const otherCol = crossColGteMatch[1];
        if (!/^-?\d+(\.\d+)?$/.test(otherCol)) {
          result.minColumn = otherCol;
          logger.log(
            "PostgresAdapter",
            `Parsed cross-column constraint: ${columnName} >= ${otherCol}`,
          );
        }
      }

      // Pattern: column > other_column
      const crossColGtMatch = normalized.match(
        new RegExp(`${colPattern}\\s*>\\s*(\\w+)`),
      );
      if (crossColGtMatch && !result.minColumn) {
        const otherCol = crossColGtMatch[1];
        if (!/^-?\d+(\.\d+)?$/.test(otherCol)) {
          result.gtColumn = otherCol;
          logger.log(
            "PostgresAdapter",
            `Parsed cross-column constraint: ${columnName} > ${otherCol}`,
          );
        }
      }

      // Pattern: column <= other_column
      const crossColLteMatch = normalized.match(
        new RegExp(`${colPattern}\\s*<=\\s*(\\w+)`),
      );
      if (crossColLteMatch) {
        const otherCol = crossColLteMatch[1];
        if (!/^-?\d+(\.\d+)?$/.test(otherCol)) {
          result.maxColumn = otherCol;
          logger.log(
            "PostgresAdapter",
            `Parsed cross-column constraint: ${columnName} <= ${otherCol}`,
          );
        }
      }

      // Pattern: column < other_column
      const crossColLtMatch = normalized.match(
        new RegExp(`${colPattern}\\s*<\\s*(\\w+)`),
      );
      if (crossColLtMatch && !result.maxColumn) {
        const otherCol = crossColLtMatch[1];
        if (!/^-?\d+(\.\d+)?$/.test(otherCol)) {
          result.ltColumn = otherCol;
          logger.log(
            "PostgresAdapter",
            `Parsed cross-column constraint: ${columnName} < ${otherCol}`,
          );
        }
      }

      // Pattern: column IN ('val1', 'val2') or column::text = ANY (ARRAY['val1'::character varying, ...])
      // Simplified match for IN clause or ANY(ARRAY)

      // TODO - neeed to verify this thoroughly
      // 1. Try strict IN match
      // Normalized example: check ( statusfield in ( 'active', 'inactive' ) )
      const inMatch = normalized.match(
        new RegExp(`${colPattern}.*?\\s+in\\s+\\(([^)]+)\\)`),
      );
      if (inMatch) {
        const inner = inMatch[1];
        // Split by comma, handling quotes
        const values = inner.split(",").map((v) => {
          let val = v.trim();
          if (val.startsWith("'") && val.endsWith("'"))
            val = val.substring(1, val.length - 1);
          return val;
        });
        if (values && values.length > 0) {
          result.enum = values;
          logger.log(
            "PostgresAdapter",
            `Parsed IN constraint for ${columnName}: ${values.join(", ")}`,
          );
        }
      }

      // 2. Try ANY (ARRAY[...]) match
      // Normalized example: check ( statusfield = any ( array['active'::text, 'inactive'::text] ) )
      // Normalized example: check ( (statusfield)::text = any ( (array['active'::character varying, 'inactive'::character varying])::text[] ) )
      if (!result.enum) {
        const arrayMatch = normalized.match(/any\s*\(\s*array\s*\[(.*?)\]/);
        if (arrayMatch) {
          const inner = arrayMatch[1];
          // Simple CSV split first, then cleanup
          const values = inner.split(",").map((v) => {
            let val = v.trim().replace(/::[\w\s]+/g, "");
            if (val.startsWith("'") && val.endsWith("'"))
              val = val.substring(1, val.length - 1);
            return val;
          });

          if (values && values.length > 0) {
            result.enum = values;
            logger.log(
              "PostgresAdapter",
              `Parsed ANY(ARRAY) constraint for ${columnName}: ${values.join(", ")}`,
            );
          }
        }
      }
    }

    return result;
  }

  async getCollectionSchema(
    tableName: string,
    schemaName?: string,
  ): Promise<SchemaField[]> {
    if (!this.client) throw new Error("Not connected to PostgreSQL");

    let schema = schemaName;
    let table = tableName;

    if (!schema) {
      const resolved = await this.resolveCollectionName(tableName);
      schema = resolved.schema;
      table = resolved.table;
    }

    const checkQuery = `
			SELECT
				a.attname AS column_name,
				pg_get_constraintdef(c.oid) AS check_def
			FROM pg_constraint c
			JOIN pg_class t ON c.conrelid = t.oid
			JOIN pg_namespace n ON t.relnamespace = n.oid
			JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(c.conkey)
			WHERE c.contype = 'c'
				AND n.nspname = $1
				AND t.relname = $2
		`;

    const checkResult = await this.client.query(checkQuery, [schema, table]);

    const checkConstraintsMap = new Map<string, string[]>();
    for (const row of checkResult.rows) {
      const col = row.column_name;
      if (!checkConstraintsMap.has(col)) {
        checkConstraintsMap.set(col, []);
      }
      checkConstraintsMap.get(col)!.push(row.check_def);
    }

    const query = `
		SELECT
			a.attname                              AS column_name,
			format_type(a.atttypid, a.atttypmod) AS data_type,
			a.attnotnull                          AS not_null,
			a.attnum                              AS ordinal_position,

			-- Primary key
			(pk.conname IS NOT NULL)              AS is_primary_key,
			array_length(pk.conkey, 1)            AS pk_column_count,
			array_position(pk.conkey, a.attnum)   AS pk_position,

			-- Foreign key
			(fk.conname IS NOT NULL)              AS is_foreign_key,
			fk.conname                            AS fk_constraint_name,
			array_length(fk.conkey, 1)            AS fk_column_count,
			ft.relname                            AS foreign_table,
			fns.nspname                           AS foreign_schema,
			fa.attname                            AS foreign_column,

			-- Identity / serial detection
			a.attidentity                         AS identity,
			pg_get_expr(ad.adbin, ad.adrelid)     AS default_expr,
			
			-- Unique constraint
			(uq.conname IS NOT NULL)              AS is_unique,
			
			-- Enum values
			(SELECT array_agg(e.enumlabel)
			 FROM pg_enum e
			 JOIN pg_type t ON e.enumtypid = t.oid
			 WHERE t.oid = a.atttypid)           AS enum_values

		FROM pg_class t
		JOIN pg_namespace n ON n.oid = t.relnamespace
		JOIN pg_attribute a ON a.attrelid = t.oid
		LEFT JOIN pg_attrdef ad ON ad.adrelid = t.oid AND ad.adnum = a.attnum

		-- Primary key
		LEFT JOIN pg_constraint pk
			ON pk.conrelid = t.oid
			AND pk.contype = 'p'
			AND a.attnum = ANY(pk.conkey)

		-- Foreign key
		LEFT JOIN pg_constraint fk
			ON fk.conrelid = t.oid
			AND fk.contype = 'f'
			AND a.attnum = ANY(fk.conkey)
			
		-- Unique constraint
		LEFT JOIN pg_constraint uq
			ON uq.conrelid = t.oid
			AND uq.contype = 'u'
			AND a.attnum = ANY(uq.conkey)

		LEFT JOIN pg_class ft ON ft.oid = fk.confrelid
		LEFT JOIN pg_namespace fns ON fns.oid = ft.relnamespace
		LEFT JOIN pg_attribute fa
			ON fa.attrelid = fk.confrelid
			AND fa.attnum = fk.confkey[array_position(fk.conkey, a.attnum)]

		WHERE
			t.relkind = 'r'
			AND n.nspname = $1
			AND t.relname = $2
			AND a.attnum > 0
			AND NOT a.attisdropped

		ORDER BY a.attnum;
	`;

    const result = await this.client.query(query, [schema, table]);

    const fields: SchemaField[] = [];

    for (const row of result.rows) {
      const pgType = row.data_type.toLowerCase();
      let type: SchemaField["type"] = "string";

      if (
        pgType.startsWith("bigint") ||
        pgType.startsWith("integer") ||
        pgType.startsWith("smallint")
      )
        type = "integer";
      else if (pgType.startsWith("numeric") || pgType.startsWith("decimal"))
        type = "decimal";
      else if (
        pgType.startsWith("double precision") ||
        pgType.startsWith("real")
      )
        type = "float";
      else if (pgType.startsWith("boolean")) type = "boolean";
      else if (pgType.startsWith("timestamp with time zone"))
        type = "timestamptz";
      else if (pgType.startsWith("timestamp")) type = "timestamp";
      else if (pgType === "date") type = "date";
      else if (pgType.startsWith("json")) type = "json";
      else if (pgType.startsWith("uuid")) type = "uuid";
      else if (pgType.startsWith("bytea")) type = "binary";
      else if (pgType.endsWith("[]")) type = "array";
      // If it has enum values, treat it as string but with constraints
      else if (row.enum_values && row.enum_values.length > 0) type = "string";

      let enumValues: string[] | undefined = undefined;
      if (row.enum_values) {
        if (Array.isArray(row.enum_values)) {
          enumValues = row.enum_values;
        } else if (typeof row.enum_values === "string") {
          // Parse "{val1,val2}" format
          const raw = row.enum_values as string;
          enumValues = raw
            .substring(1, raw.length - 1)
            .split(",")
            .map((v) => {
              if (v.startsWith('"') && v.endsWith('"'))
                return v.substring(1, v.length - 1);
              return v;
            });
        }
      }

      const isPrimaryKey = row.is_primary_key === true;
      const isForeignKey = row.is_foreign_key === true;
      const isUnique = row.is_unique === true;

      const checkDefs = checkConstraintsMap.get(row.column_name) || [];
      const checkBounds = this.parseCheckConstraints(
        row.column_name,
        checkDefs,
      );

      if (
        checkBounds.min !== undefined ||
        checkBounds.max !== undefined ||
        checkBounds.minLength !== undefined ||
        checkBounds.maxLength !== undefined
      ) {
        logger.log(
          "PostgresAdapter",
          `CHECK constraint for ${table}.${row.column_name}: min=${checkBounds.min}, max=${checkBounds.max}, minLength=${checkBounds.minLength}, maxLength=${checkBounds.maxLength}`,
        );
      }

      const fkColumnCount = row.fk_column_count
        ? parseInt(row.fk_column_count, 10)
        : 1;
      const compositeKeyGroup =
        isForeignKey && fkColumnCount > 1 ? row.fk_constraint_name : undefined;

      const pkColumnCount = row.pk_column_count
        ? parseInt(row.pk_column_count, 10)
        : 1;
      const compositePrimaryKeyIndex =
        isPrimaryKey && pkColumnCount > 1 && row.pk_position
          ? parseInt(row.pk_position, 10) - 1
          : undefined;

      fields.push({
        id: row.column_name,
        name: row.column_name,
        type,
        rawType: row.data_type,
        isPrimaryKey,
        isForeignKey,
        compositePrimaryKeyIndex,

        required: row.not_null || isPrimaryKey,

        referencedCollectionId: isForeignKey
          ? row.foreign_schema === "public"
            ? row.foreign_table
            : `${row.foreign_schema}.${row.foreign_table}`
          : undefined,
        foreignKeyTarget: isForeignKey ? row.foreign_column : undefined,
        compositeKeyGroup,

        constraints: {
          unique: isUnique || undefined,
          min: checkBounds.min,
          max: checkBounds.max,
          minLength: checkBounds.minLength,
          maxLength: checkBounds.maxLength,
          minColumn: checkBounds.minColumn,
          maxColumn: checkBounds.maxColumn,
          gtColumn: checkBounds.gtColumn,
          ltColumn: checkBounds.ltColumn,
          enum: checkBounds.enum || enumValues,
        },
      });
    }

    return fields;
  }

  async detectRelationships(collections: string[]): Promise<
    Array<{
      id: string;
      fromCollectionId: string;
      toCollectionId: string;
      type: string;
      fromField: string;
      toField: string;
    }>
  > {
    if (!this.client) throw new Error("Not connected to PostgreSQL");

    const query = `
			SELECT
				tc.constraint_name,
				tc.table_schema AS from_schema,
				tc.table_name AS from_table,
				kcu.column_name AS from_column,
				ccu.table_schema AS to_schema,
				ccu.table_name AS to_table,
				ccu.column_name AS to_column
			FROM
				information_schema.table_constraints AS tc
				JOIN information_schema.key_column_usage AS kcu
					ON tc.constraint_name = kcu.constraint_name
					AND tc.table_schema = kcu.table_schema
				JOIN information_schema.constraint_column_usage AS ccu
					ON ccu.constraint_name = tc.constraint_name
					AND ccu.table_schema = tc.table_schema
			WHERE tc.constraint_type = 'FOREIGN KEY' 
				AND tc.table_schema NOT IN ('information_schema', 'pg_catalog')
		`;

    const result = await this.client.query(query);

    return result.rows.map((row) => {
      // Standardize on "schema.table" for ALL tables
      const fromCollection = `${row.from_schema}.${row.from_table}`;
      const toCollection = `${row.to_schema}.${row.to_table}`;

      return {
        id: row.constraint_name,
        fromCollectionId: fromCollection,
        toCollectionId: toCollection,
        type: "many-to-one", // Default for FK
        fromField: row.from_column,
        toField: row.to_column,
      };
    });
  }

  // PostgreSQL-specific dependency ordering using actual FK constraints.
  async buildDependencyOrder(
    collections: SchemaCollection[],
    relationships: SchemaRelationship[],
  ): Promise<SchemaCollection[]> {
    const collectionMap = new Map<string, SchemaCollection>();
    const collectionIdToName = new Map<string, string>();
    for (const col of collections) {
      collectionMap.set(col.name, col);
      collectionIdToName.set(col.id, col.name);
    }

    const selfReferencingTables = new Set<string>();

    const edgeMap = new Map<string, boolean>();
    const addEdge = (from: string, to: string, isStrong: boolean) => {
      if (from === to) {
        selfReferencingTables.add(from);
        return; // Don't add self-dependency edge
      }
      if (!collectionMap.has(from) || !collectionMap.has(to)) return;

      const key = `${from}|${to}`;
      const existing = edgeMap.get(key);
      // If edge exists, upgrade to strong if new edge is strong
      if (existing === undefined) {
        edgeMap.set(key, isStrong);
      } else if (isStrong && !existing) {
        edgeMap.set(key, true);
      }
    };

    const explicitRelFields = new Set<string>();

    for (const rel of relationships) {
      const fromName = collectionIdToName.get(rel.fromCollectionId);
      const toName = collectionIdToName.get(rel.toCollectionId);
      if (!fromName || !toName) continue;

      if (rel.fromField) explicitRelFields.add(`${fromName}|${rel.fromField}`);
      if (rel.fromFields) {
        for (const f of rel.fromFields)
          explicitRelFields.add(`${fromName}|${f}`);
      }

      let isStrong = true;
      if (rel.fromField) {
        const fromCol = collectionMap.get(fromName);
        const fkField = fromCol?.fields.find((f) => f.name === rel.fromField);
        if (
          fkField &&
          fkField.required !== true &&
          fkField.nullable !== false
        ) {
          isStrong = false; // Nullable FK = weak dependency
        }
      }

      switch (rel.type) {
        case "one-to-one":
        case "many-to-one":
          addEdge(fromName, toName, isStrong);
          break;
        case "one-to-many":
          addEdge(toName, fromName, isStrong);
          break;
        case "many-to-many":
          break;
      }
    }

    const processedGroups = new Set<string>();

    for (const col of collections) {
      for (const field of col.fields) {
        if (!field.isForeignKey || !field.referencedCollectionId) continue;

        if (explicitRelFields.has(`${col.name}|${field.name}`)) continue;

        const targetName =
          collectionIdToName.get(field.referencedCollectionId) ||
          field.referencedCollectionId;
        if (!collectionMap.has(targetName) || targetName === col.name) continue;

        if (field.compositeKeyGroup) {
          const groupKey = `${col.name}|${field.compositeKeyGroup}`;
          if (processedGroups.has(groupKey)) continue;
          processedGroups.add(groupKey);
        }

        // Only mark as strong if EXPLICITLY required
        const isStrong = field.required === true;
        addEdge(col.name, targetName, isStrong);
      }
    }

    const dependencies = new Map<string, Set<string>>();
    const dependents = new Map<string, Set<string>>();

    for (const col of collections) {
      dependencies.set(col.name, new Set());
      dependents.set(col.name, new Set());
    }

    for (const [key, isStrong] of edgeMap) {
      const [from, to] = key.split("|");
      dependencies.get(from)!.add(to);
      dependents.get(to)!.add(from);
    }

    const result: SchemaCollection[] = [];
    const processed = new Set<string>();
    const inDegree = new Map<string, number>();

    for (const col of collections) {
      inDegree.set(col.name, dependencies.get(col.name)!.size);
    }

    const getNextBatch = (): string[] => {
      const batch: string[] = [];
      for (const [name, degree] of inDegree) {
        if (degree === 0 && !processed.has(name)) {
          batch.push(name);
        }
      }
      return batch.sort();
    };

    let queue = getNextBatch();

    while (processed.size < collections.length) {
      if (queue.length === 0) {
        const remaining = collections
          .filter((c) => !processed.has(c.name))
          .sort((a, b) => {
            const aIn = inDegree.get(a.name) ?? 0;
            const bIn = inDegree.get(b.name) ?? 0;
            if (aIn !== bIn) return aIn - bIn; // Lower inDegree first
            return a.name.localeCompare(b.name); // Alphabetical tiebreaker
          });

        if (remaining.length === 0) break;

        const candidate = remaining[0];
        logger.warn(
          "PostgresAdapter",
          `Cycle detected, breaking at: ${candidate.name}`,
        );
        queue = [candidate.name];
      }

      for (const name of queue) {
        if (processed.has(name)) continue;

        processed.add(name);

        const col = collectionMap.get(name);
        if (!col) continue;

        result.push(col);

        for (const dependent of dependents.get(name) ?? []) {
          if (!processed.has(dependent)) {
            const deg = inDegree.get(dependent) ?? 0;
            inDegree.set(dependent, Math.max(0, deg - 1));
          }
        }
      }

      queue = getNextBatch();
    }

    for (const col of collections) {
      if (!result.includes(col)) {
        result.push(col);
      }
    }

    logger.log(
      "PostgresAdapter",
      `Dependency order: ${result.map((c) => c.name).join(" -> ")}`,
    );
    return result;
  }
}
