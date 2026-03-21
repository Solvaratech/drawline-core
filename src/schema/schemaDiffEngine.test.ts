import { describe, it, expect } from "vitest";
import { isDestructiveTypeChange, computeSchemaDiff, generateDDL } from "./schemaDiffEngine";
import { SchemaCollection } from "../types/schemaDesign";
import { PostgresSchemaSnapshot } from "../types/schemaDiff";

describe("schemaDiffEngine", () => {
	describe("isDestructiveTypeChange", () => {
		it("should detect widening changes as non-destructive", () => {
			expect(isDestructiveTypeChange("smallint", "integer")).toBe(false);
			expect(isDestructiveTypeChange("integer", "bigint")).toBe(false);
			expect(isDestructiveTypeChange("real", "double precision")).toBe(false);
			expect(isDestructiveTypeChange("char(10)", "varchar(50)")).toBe(false);
			expect(isDestructiveTypeChange("varchar(10)", "text")).toBe(false);
		});

		it("should detect shrinking varchar as destructive", () => {
			expect(isDestructiveTypeChange("varchar(50)", "varchar(10)")).toBe(true);
			// However, expanding is fine
			expect(isDestructiveTypeChange("varchar(10)", "varchar(50)")).toBe(false);
		});

		it("should detect type changes that can lose data as destructive", () => {
			expect(isDestructiveTypeChange("text", "integer")).toBe(true);
			expect(isDestructiveTypeChange("bigint", "integer")).toBe(true);
			expect(isDestructiveTypeChange("timestamp", "boolean")).toBe(true);
		});

		it("should ignore differences in casing", () => {
			expect(isDestructiveTypeChange("INTEGER", "integer")).toBe(false);
			expect(isDestructiveTypeChange("VARCHAR", "varchar")).toBe(false);
		});
	});

	describe("computeSchemaDiff", () => {
		it("should return nothing when no snapshot is provided", () => {
			const diff = computeSchemaDiff(null, []);
			expect(diff.hasDiff).toBe(false);
			expect(diff.totalChanges).toBe(0);
		});

		it("should detect added columns and tables", () => {
			const snapshot = {
				tables: {}
			} as unknown as PostgresSchemaSnapshot;
			const current: SchemaCollection[] = [
				{
					id: "table1",
					name: "users",
					fields: [
						{ id: "f1", name: "id", type: "integer", isPrimaryKey: true },
						{ id: "f2", name: "name", type: "string", required: true }
					],
					position: { x: 0, y: 0 }
				}
			];
			const diff = computeSchemaDiff(snapshot, current);
			expect(diff.hasDiff).toBe(true);
			expect(diff.addedTables).toHaveLength(1);
			expect(diff.addedTables[0].name).toBe("users");
			expect(diff.addedTables[0].columns).toHaveLength(2);
			expect(diff.addedTables[0].columns[1].type).toBe("text"); // 'string' converts to 'text' generally if no constraints
		});

		it("should detect removed columns and tables strictly if allowDrop is specified", () => {
			const snapshot = {
				tables: {
					users: {
						schema: "public",
						columns: {
							id: { type: "integer", nullable: false },
							age: { type: "integer", nullable: true }
						}
					},
					old_table: {
						schema: "public",
						columns: {
							id: { type: "integer", nullable: false }
						}
					}
				}
			} as unknown as PostgresSchemaSnapshot;
			
			const current: SchemaCollection[] = [
				{
					id: "users",
					name: "users",
					fields: [
						{ id: "f1", name: "id", type: "integer", isPrimaryKey: true, required: true }
					], // 'age' is removed
					position: { x: 0, y: 0 }
				}
			];

			// Using string 'full' enables dropping
			const diffFull = computeSchemaDiff(snapshot, current, 'full');
			expect(diffFull.removedTables).toHaveLength(1);
			expect(diffFull.removedTables[0].name).toBe("old_table");
			expect(diffFull.modifiedTables).toHaveLength(1);
			expect(diffFull.modifiedTables[0].removedColumns).toHaveLength(1);
			expect(diffFull.modifiedTables[0].removedColumns[0].name).toBe("age");

			// Additive mode shouldn't drop
			const diffAdditive = computeSchemaDiff(snapshot, current, 'additive');
			expect(diffAdditive.removedTables).toHaveLength(0);
			expect(diffAdditive.modifiedTables).toHaveLength(0); // Age is missing but additive doesn't drop
		});

		it("should detect column modifications like type changes, nullability, and defaults", () => {
			const snapshot = {
				tables: {
					users: {
						schema: "public",
						columns: {
							name: { type: "varchar", nullable: true }, // will change to text, required
							email: { type: "text", nullable: false }, // no change
							score: { type: "integer", nullable: true, defaultValue: "0" } // change default
						}
					}
				}
			} as unknown as PostgresSchemaSnapshot;

			const current: SchemaCollection[] = [
				{
					id: "users",
					name: "users",
					fields: [
						{ id: "f1", name: "name", type: "string", required: true }, // new type text, NOT NULL
						{ id: "f2", name: "email", type: "string", required: true }, 
						{ id: "f3", name: "score", type: "integer", defaultValue: 100 }
					],
					position: { x: 0, y: 0 }
				}
			];

			const diff = computeSchemaDiff(snapshot, current);
			expect(diff.modifiedTables).toHaveLength(1);
			const mod = diff.modifiedTables[0];
			expect(mod.modifiedColumns).toHaveLength(2); // name and score
			
			const nameChange = mod.modifiedColumns.find(c => c.columnName === "name");
			expect(nameChange?.newType).toBe("text");
			expect(nameChange?.newNullable).toBe(false);
			
			const scoreChange = mod.modifiedColumns.find(c => c.columnName === "score");
			expect(scoreChange?.newDefault).toBe("100");
		});

		it("should recognize foreign key relationships", () => {
			// This covers the specific request for relationship detection
			const snapshot = {
				tables: {}
			} as unknown as PostgresSchemaSnapshot;
			const current: SchemaCollection[] = [
				{
					id: "table1",
					name: "posts",
					fields: [
						{ id: "p1", name: "user_id", type: "integer", isForeignKey: true, referencedCollectionId: "users", foreignKeyTarget: "id" }
					],
					position: { x: 0, y: 0 }
				}
			];

			const diff = computeSchemaDiff(snapshot, current);
			expect(diff.addedTables[0].columns[0].references).toEqual({
				table: "users",
				column: "id"
			});
		});
	});

	describe("generateDDL", () => {
		it("should generate proper CREATE TABLE DDL", () => {
			const statements = generateDDL({
				hasDiff: true,
				totalChanges: 1,
				destructiveChanges: 0,
				addedTables: [
					{
						name: "users",
						schema: "public",
						columns: [
							{ name: "id", type: "integer", isPrimaryKey: true, isSerial: true, nullable: false, isUnique: false, isForeignKey: false },
							{ name: "email", type: "text", isPrimaryKey: false, isSerial: false, nullable: false, isUnique: true, isForeignKey: false },
							{ name: "team_id", type: "integer", isPrimaryKey: false, isSerial: false, nullable: true, isUnique: false, isForeignKey: true, references: { table: "teams", column: "id" } }
						]
					}
				],
				removedTables: [],
				modifiedTables: []
			});

			expect(statements).toHaveLength(1);
			expect(statements[0].sql).toContain("CREATE TABLE \"public\".\"users\"");
			expect(statements[0].sql).toContain("\"id\" INTEGER PRIMARY KEY");
			expect(statements[0].sql).toContain("\"email\" TEXT NOT NULL UNIQUE");
			expect(statements[0].sql).toContain("\"team_id\" INTEGER REFERENCES \"teams\"(\"id\")");
		});

		it("should generate proper ALTER and DROP statements", () => {
			const statements = generateDDL({
				hasDiff: true,
				totalChanges: 3,
				destructiveChanges: 1,
				addedTables: [],
				removedTables: [
					{ name: "old_stuff", schema: "public", columnCount: 1 }
				],
				modifiedTables: [
					{
						tableName: "users",
						tableSchema: "public",
						addedColumns: [
							{ name: "bio", type: "text", nullable: true, isPrimaryKey: false, isSerial: false, isUnique: false, isForeignKey: false }
						],
						modifiedColumns: [
							{ columnName: "age", oldType: "varchar", newType: "integer", oldNullable: true, newNullable: true, isDestructive: true, changeDescription: "" }
						],
						removedColumns: [
							{ name: "outdated", type: "boolean" }
						]
					}
				]
			});

			const sqls = statements.map(s => s.sql);
			
			// Added columns (bio)
			const addSql = sqls.find(s => s.includes("ADD COLUMN \"bio\" TEXT"));
			expect(addSql).toBeDefined();

			// Modified columns (age)
			const alterTypeSql = sqls.find(s => s.includes("ALTER COLUMN \"age\" TYPE INTEGER"));
			expect(alterTypeSql).toBeDefined();
			// Since it's destructive, it shouldn't have USING clause
			expect(alterTypeSql).not.toContain("USING");

			// Removed columns (outdated)
			const dropColSql = sqls.find(s => s.includes("DROP COLUMN \"outdated\""));
			expect(dropColSql).toBeDefined();

			// Removed tables (old_stuff)
			const dropTableSql = sqls.find(s => s.includes("DROP TABLE \"public\".\"old_stuff\""));
			expect(dropTableSql).toBeDefined();
		});
	});
});
