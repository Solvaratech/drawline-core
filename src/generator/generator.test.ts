import { describe, it, expect, beforeEach } from "vitest";
import { TestDataGeneratorService } from "./index";
import { InMemoryAdapter } from "./adapters/InMemoryAdapter";
import { SchemaCollection, SchemaRelationship } from "../types/schemaDesign";
import { TestDataConfig } from "./types";

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
});
