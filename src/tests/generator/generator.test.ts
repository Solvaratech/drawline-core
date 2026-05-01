import { describe, it, expect, beforeEach } from "vitest";
import { TestDataGeneratorService } from "../../generator/index";
import { InMemoryAdapter } from "../../generator/adapters/InMemoryAdapter";
import { SchemaCollection, SchemaRelationship } from "../../types/schemaDesign";
import { TestDataConfig } from "../../generator/types";

describe("TestDataGeneratorService with InMemoryAdapter", () => {
	let adapter: InMemoryAdapter;
	let service: TestDataGeneratorService;

	beforeEach(() => {
		adapter = new InMemoryAdapter();
		service = new TestDataGeneratorService(adapter);
	});

	it("should generate simple collection data", async () => {
		const collections: SchemaCollection[] = [
			{
				id: "users",
				name: "users",
				fields: [
					{ id: "u1", name: "id", type: "integer", isPrimaryKey: true },
					{ id: "u2", name: "name", type: "string" },
					{ id: "u3", name: "email", type: "string" }
				],
				position: { x: 0, y: 0 }
			}
		];

		const relationships: SchemaRelationship[] = [];

		const config: TestDataConfig = {
			collections: [
				{ collectionName: "users", count: 5 }
			],
			relationships: []
		};

		const result = await service.generateAndPopulate(collections, relationships, config);

		if (!result.success) {
			console.log("Generation Errors:", result.errors);
		}

		expect(result.success).toBe(true);
		expect(result.totalDocumentsGenerated).toBe(5);
		
		const data = adapter.getData("users");
		expect(data).toHaveLength(5);
		expect(data[0]).toHaveProperty("name");
		expect(data[0]).toHaveProperty("email");
	});

	it("should resolve relationships between collections", async () => {
		const collections: SchemaCollection[] = [
			{
				id: "users",
				name: "users",
				fields: [
					{ id: "u1", name: "id", type: "integer", isPrimaryKey: true },
					{ id: "u2", name: "name", type: "string" }
				],
				position: { x: 0, y: 0 }
			},
			{
				id: "posts",
				name: "posts",
				fields: [
					{ id: "p1", name: "id", type: "integer", isPrimaryKey: true },
					{ id: "p2", name: "title", type: "string" },
					{ id: "p3", name: "userId", type: "integer", isForeignKey: true, referencedCollectionId: "users" }
				],
				position: { x: 100, y: 100 }
			}
		];

		const relationships: SchemaRelationship[] = [
			{
				id: "r1",
				fromCollectionId: "posts",
				toCollectionId: "users",
				fromField: "userId",
				toField: "id",
				type: "many-to-one"
			}
		];

		const config: TestDataConfig = {
			collections: [
				{ collectionName: "users", count: 2 },
				{ collectionName: "posts", count: 4 }
			],
			relationships: []
		};

		const result = await service.generateAndPopulate(collections, relationships, config);

		expect(result.success).toBe(true);
		
		const postData = adapter.getData("posts");
		const userData = adapter.getData("users");
		
		expect(postData).toHaveLength(4);
		expect(userData).toHaveLength(2);
		
		// Each post should have a userId that exists in users
		const userIds = userData.map(u => u.id);
		postData.forEach(post => {
			expect(userIds).toContain(post.userId);
		});
	});

	it("should throw for unsupported adapter type", () => {
		expect(() => {
			TestDataGeneratorService.createAdapter("oracle" as any, "secret", (s) => s);
		}).toThrowError("Unsupported database type");
	});

	it("should auto-resolve missing target primary keys in relationships", async () => {
		const collections: SchemaCollection[] = [
			{
				id: "users_no_pk", // No explicit primary key
				name: "users_no_pk",
				fields: [
					{ id: "u2", name: "name", type: "string" } // "id" field missing, should be auto-appended by InMemoryAdapter or gracefully handled
				],
				position: { x: 0, y: 0 }
			},
			{
				id: "posts",
				name: "posts",
				fields: [
					{ id: "p2", name: "title", type: "string" }
					// no userId field initially, should be injected
				],
				position: { x: 100, y: 100 }
			}
		];

		const relationships: SchemaRelationship[] = [
			{
				id: "r1",
				fromCollectionId: "posts",
				toCollectionId: "users_no_pk",
				fromField: "userId",
				type: "many-to-one"
				// No toField provided
			}
		];

		const config: TestDataConfig = {
			collections: [
				{ collectionName: "users_no_pk", count: 1 },
				{ collectionName: "posts", count: 1 }
			],
			relationships: []
		};

		const result = await service.generateAndPopulate(collections, relationships, config);
		expect(result.success).toBe(true);

		const postData = adapter.getData("posts");
		expect(postData[0]).toHaveProperty("userId");
		
		// It creates a warning for missing primary key defaulting to 'id'
		expect(result.warnings?.some(w => w.includes("No primary key found"))).toBe(true);
	});

	it("should catch errors from adapter during collection mapping", async () => {
		const collections: SchemaCollection[] = [
			{
				id: "bad_collection",
				name: "bad_collection",
				fields: [],
				position: { x:0, y:0 }
			}
		];

		const config: TestDataConfig = {
			collections: [{ collectionName: "bad_collection", count: 5 }],
			relationships: []
		};

		// Mock adapter throwing
		const originalGenerateStream = adapter.generateStream;
		adapter.generateStream = async function* () {
			throw new Error("Simulated generator failure");
		};

		const result = await service.generateAndPopulate(collections, [], config);
		
		expect(result.success).toBe(false);
		expect(result.totalDocumentsGenerated).toBe(0);
		expect(result.errors?.[0]).toContain("Simulated generator failure");
		
		adapter.generateStream = originalGenerateStream;
	});
});
