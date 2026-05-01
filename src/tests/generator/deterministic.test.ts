import { describe, it, expect, beforeEach } from "vitest";
import { TestDataGeneratorService } from "../../generator/index";
import { InMemoryAdapter } from "../../generator/adapters/InMemoryAdapter";
import { SchemaCollection } from "../../types/schemaDesign";
import { TestDataConfig } from "../../generator/types";
import { computeShards } from "../../generator/workers/WorkerPool";

describe("Deterministic Sharding Consistency", () => {
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
      collections: [{ collectionName: "users", count: 100 }],
      relationships: [],
      seed: 42,
    };
  });

  async function generateSingleThreaded(): Promise<any[]> {
    const freshAdapter = new InMemoryAdapter();
    const freshService = new TestDataGeneratorService(freshAdapter);

    const result = await freshService.generateAndPopulate(
      collections,
      [],
      config
    );

    if (!result.success) {
      throw new Error((result.errors || []).join(", "));
    }

    return freshAdapter.getData("users");
  }

  async function generateSharded(
    shardCount: number
  ): Promise<any[]> {
    const shards = computeShards(100, shardCount, config.seed!);
    const allResults: any[] = [];

    for (const shard of shards) {
      const freshAdapter = new InMemoryAdapter();
      const freshService = new TestDataGeneratorService(freshAdapter);

      const result = await freshService.generateCollectionWithRange(
        collections[0],
        shard.start,
        shard.count,
        config,
        []
      );

      if (!result.success) {
        throw new Error((result.errors || []).join(", "));
      }

      const data = freshAdapter.getData("users");
      allResults.push(...data);
    }

    allResults.sort((a, b) => a.id - b.id);
    return allResults;
  }

  it("should produce identical output for single vs 4-worker sharded generation", async () => {
    const singleThreaded = await generateSingleThreaded();
    const sharded4 = await generateSharded(4);

    expect(sharded4).toHaveLength(singleThreaded.length);
    expect(sharded4).toEqual(singleThreaded);
  });

  it("should produce identical output for single vs 2-worker sharded generation", async () => {
    const singleThreaded = await generateSingleThreaded();
    const sharded2 = await generateSharded(2);

    expect(sharded2).toHaveLength(singleThreaded.length);
    expect(sharded2).toEqual(singleThreaded);
  });

  it("should have deterministic IDs across all shards", async () => {
    const shards = computeShards(100, 4, config.seed!);
    const allIds: number[] = [];

    for (const shard of shards) {
      const freshAdapter = new InMemoryAdapter();
      const freshService = new TestDataGeneratorService(freshAdapter);

      await freshService.generateCollectionWithRange(
        collections[0],
        shard.start,
        shard.count,
        config,
        []
      );

      const data = freshAdapter.getData("users");
      allIds.push(...data.map((d: any) => d.id));
    }

    allIds.sort((a, b) => a - b);
    const expectedIds = Array.from({ length: 100 }, (_, i) => i + 1);

    expect(allIds).toEqual(expectedIds);
  });

  it("should have deterministic email generation across shards", async () => {
    const singleThreaded = await generateSingleThreaded();
    const sharded4 = await generateSharded(4);

    const singleEmails = singleThreaded.map((d) => d.email);
    const shardedEmails = sharded4.map((d) => d.email);

    expect(shardedEmails).toEqual(singleEmails);
  });

  it("should be reproducible with same seed on different runs", async () => {
    const run1 = await generateSingleThreaded();
    const run2 = await generateSingleThreaded();

    expect(run1).toEqual(run2);
  });

  it("should produce different output with different seeds", async () => {
    const configA = { ...config, seed: 123 };
    const configB = { ...config, seed: 456 };

    const adapterA = new InMemoryAdapter();
    const serviceA = new TestDataGeneratorService(adapterA);
    const resultA = await serviceA.generateAndPopulate(collections, [], configA);

    const adapterB = new InMemoryAdapter();
    const serviceB = new TestDataGeneratorService(adapterB);
    const resultB = await serviceB.generateAndPopulate(collections, [], configB);

    const dataA = adapterA.getData("users");
    const dataB = adapterB.getData("users");

    expect(dataA).not.toEqual(dataB);
  });
});

describe("Range-based Document Generation", () => {
  let collections: SchemaCollection[];
  let config: TestDataConfig;

  beforeEach(() => {
    collections = [
      {
        id: "orders",
        name: "orders",
        fields: [
          { id: "o1", name: "id", type: "integer", isPrimaryKey: true },
          { id: "o2", name: "product", type: "string" },
          { id: "o3", name: "amount", type: "integer" },
        ],
        position: { x: 0, y: 0 },
      },
    ];

    config = {
      collections: [{ collectionName: "orders", count: 50 }],
      relationships: [],
      seed: 999,
    };
  });

  it("should generate correct document count for each range", async () => {
    const shards = computeShards(50, 5, config.seed!);

    for (const shard of shards) {
      const adapter = new InMemoryAdapter();
      const service = new TestDataGeneratorService(adapter);

      await service.generateCollectionWithRange(
        collections[0],
        shard.start,
        shard.count,
        config,
        []
      );

      const data = adapter.getData("orders");
      expect(data.length).toBe(shard.count);
    }
  });

  it("should generate IDs within the correct range", async () => {
    const shard = { workerId: 0, start: 10, end: 20, count: 10 };

    const adapter = new InMemoryAdapter();
    const service = new TestDataGeneratorService(adapter);

    await service.generateCollectionWithRange(
      collections[0],
      shard.start,
      shard.count,
      config,
      []
    );

    const data = adapter.getData("orders");
    const ids = data.map((d: any) => d.id).sort((a: number, b: number) => a - b);

    expect(ids).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
  });

  it("should combine all shards into complete dataset", async () => {
    const shards = computeShards(50, 5, config.seed!);
    const allData: any[] = [];

    for (const shard of shards) {
      const adapter = new InMemoryAdapter();
      const service = new TestDataGeneratorService(adapter);

      await service.generateCollectionWithRange(
        collections[0],
        shard.start,
        shard.count,
        config,
        []
      );

      allData.push(...adapter.getData("orders"));
    }

    allData.sort((a, b) => a.id - b.id);
    const ids = allData.map((d) => d.id);

    const expectedIds = Array.from({ length: 50 }, (_, i) => i + 1);
    expect(ids).toEqual(expectedIds);
  });
});
