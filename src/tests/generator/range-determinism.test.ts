import { describe, it, expect, beforeEach } from "vitest";
import { TestDataGeneratorService } from "../../generator/index";
import { InMemoryAdapter } from "../../generator/adapters/InMemoryAdapter";
import { SchemaCollection } from "../../types/schemaDesign";
import { TestDataConfig } from "../../generator/types";

describe("generateStream Range Determinism", () => {
  let adapter: InMemoryAdapter;
  let service: TestDataGeneratorService;
  let collections: SchemaCollection[];
  let config: TestDataConfig;

  beforeEach(() => {
    adapter = new InMemoryAdapter();
    service = new TestDataGeneratorService(adapter);

    collections = [
      {
        id: "users",
        name: "users",
        fields: [
          { id: "u1", name: "id", type: "integer", isPrimaryKey: true },
          { id: "u2", name: "name", type: "string" },
          { id: "u3", name: "email", type: "string" },
        ],
        position: { x: 0, y: 0 },
      },
    ];

    config = {
      collections: [{ collectionName: "users", count: 50 }],
      relationships: [],
      seed: 42,
    };
  });

  it("should produce identical document at index 0 between single and range=0", async () => {
    const result1 = await service.generateAndPopulate(collections, [], config);
    expect(result1.success).toBe(true);
    const data1 = adapter.getData("users");
    const doc0_v1 = { ...data1[0] };

    const adapter2 = new InMemoryAdapter();
    const service2 = new TestDataGeneratorService(adapter2);
    const result2 = await service2.generateCollectionWithRange(
      collections[0], 0, 1, config, []
    );
    expect(result2.success).toBe(true);
    const data2 = adapter2.getData("users");
    const doc0_v2 = { ...data2[0] };

    expect(doc0_v1).toEqual(doc0_v2);
  });

  it("should produce identical document at index 25 between single and range=25", async () => {
    const result1 = await service.generateAndPopulate(collections, [], config);
    expect(result1.success).toBe(true);
    const data1 = adapter.getData("users");
    const doc25_v1 = { ...data1[25] };

    const adapter2 = new InMemoryAdapter();
    const service2 = new TestDataGeneratorService(adapter2);
    const result2 = await service2.generateCollectionWithRange(
      collections[0], 25, 1, config, []
    );
    expect(result2.success).toBe(true);
    const data2 = adapter2.getData("users");
    const doc25_v2 = { ...data2[0] };

    expect(doc25_v1).toEqual(doc25_v2);
  });

  it("should produce identical documents 25-30 between single and range=25,count=5", async () => {
    const result1 = await service.generateAndPopulate(collections, [], config);
    expect(result1.success).toBe(true);
    const data1 = adapter.getData("users").slice(25, 30);

    const adapter2 = new InMemoryAdapter();
    const service2 = new TestDataGeneratorService(adapter2);
    const result2 = await service2.generateCollectionWithRange(
      collections[0], 25, 5, config, []
    );
    expect(result2.success).toBe(true);
    const data2 = adapter2.getData("users");

    expect(data1).toEqual(data2);
  });

  it("should generate first 25 and last 25 that match single-threaded", async () => {
    const result1 = await service.generateAndPopulate(collections, [], config);
    expect(result1.success).toBe(true);
    const allData = adapter.getData("users");

    const adapter2 = new InMemoryAdapter();
    const service2 = new TestDataGeneratorService(adapter2);
    await service2.generateCollectionWithRange(collections[0], 0, 25, config, []);
    const first25 = adapter2.getData("users");

    const adapter3 = new InMemoryAdapter();
    const service3 = new TestDataGeneratorService(adapter3);
    await service3.generateCollectionWithRange(collections[0], 25, 25, config, []);
    const last25 = adapter3.getData("users");

    expect(first25).toEqual(allData.slice(0, 25));
    expect(last25).toEqual(allData.slice(25, 50));
  });
});
