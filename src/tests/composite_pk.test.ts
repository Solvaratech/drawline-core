import { describe, it, expect, beforeEach } from "vitest";
import { TestDataGeneratorService } from "../generator";
import { NullAdapter } from "../generator/adapters/NullAdapter";
import { SchemaCollection, SchemaRelationship } from "../types/schemaDesign";
import { TestDataConfig } from "../generator/types";

describe("Composite Primary Key Integration", () => {
    let service: TestDataGeneratorService;
    let adapter: NullAdapter;

    beforeEach(() => {
        adapter = new NullAdapter();
        service = new TestDataGeneratorService(adapter);
    });

    it("should correctly resolve relationships pointing to composite primary keys", async () => {
        const collections: SchemaCollection[] = [
            {
                id: "parent",
                name: "parent",
                fields: [
                    { id: "p1", name: "tenant_id", type: "integer", isPrimaryKey: true, compositePrimaryKeyIndex: 0 },
                    { id: "p2", name: "user_id", type: "integer", isPrimaryKey: true, compositePrimaryKeyIndex: 1 },
                    { id: "p3", name: "display_name", type: "string" }
                ],
                position: { x: 0, y: 0 }
            },
            {
                id: "child",
                name: "child",
                fields: [
                    { id: "c1", name: "id", type: "integer", isPrimaryKey: true },
                    { 
                        id: "c2",
                        name: "parent_tenant_id", 
                        type: "integer", 
                        isForeignKey: true, 
                        referencedCollectionId: "parent",
                        compositeKeyGroup: "parent_ref",
                        foreignKeyTarget: "tenant_id"
                    },
                    { 
                        id: "c3",
                        name: "parent_user_id", 
                        type: "integer", 
                        isForeignKey: true, 
                        referencedCollectionId: "parent",
                        compositeKeyGroup: "parent_ref",
                        foreignKeyTarget: "user_id"
                    },
                    { id: "c4", name: "comment", type: "string" }
                ],
                position: { x: 0, y: 100 }
            }
        ];

        const relationships: SchemaRelationship[] = [
            {
                id: "rel1",
                fromCollectionId: "child",
                toCollectionId: "parent",
                type: "many-to-one",
                fromFields: ["parent_tenant_id", "parent_user_id"],
                toFields: ["tenant_id", "user_id"]
            }
        ];

        const config: TestDataConfig = {
            collections: [
                { collectionName: "parent", count: 10 },
                { collectionName: "child", count: 20 }
            ],
            relationships,
            seed: "composite-test-seed"
        };

        const result = await service.generateAndPopulate(collections, relationships, config);

        expect(result.success).toBe(true);
        expect(result.totalDocumentsGenerated).toBe(30);

        // Verify that no errors were recorded during generation
        expect(result.errors || []).toHaveLength(0);
    });
});
