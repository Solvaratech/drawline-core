import { describe, it, expect, beforeEach } from "vitest";
import {
  computeShards,
  generateDeterministicShards,
  createShardTasks,
  ShardRange,
  ShardTask,
} from "../../generator/workers/WorkerPool";

describe("WorkerPool Shard Computation", () => {
  describe("computeShards", () => {
    it("should divide 10 items across 2 workers evenly", () => {
      const shards = computeShards(10, 2, "seed123");

      expect(shards).toHaveLength(2);
      expect(shards[0]).toEqual({ workerId: 0, start: 0, end: 5, count: 5 });
      expect(shards[1]).toEqual({ workerId: 1, start: 5, end: 10, count: 5 });
    });

    it("should handle uneven division with remainder", () => {
      const shards = computeShards(10, 3, "seed123");

      expect(shards).toHaveLength(3);
      expect(shards[0]).toEqual({ workerId: 0, start: 0, end: 4, count: 4 });
      expect(shards[1]).toEqual({ workerId: 1, start: 4, end: 7, count: 3 });
      expect(shards[2]).toEqual({ workerId: 2, start: 7, end: 10, count: 3 });
    });

    it("should handle 1 worker (no sharding)", () => {
      const shards = computeShards(100, 1, "seed123");

      expect(shards).toHaveLength(1);
      expect(shards[0]).toEqual({ workerId: 0, start: 0, end: 100, count: 100 });
    });

    it("should handle more workers than items", () => {
      const shards = computeShards(3, 5, "seed123");

      expect(shards).toHaveLength(3);
      expect(shards[0].count).toBe(1);
      expect(shards[1].count).toBe(1);
      expect(shards[2].count).toBe(1);
    });

    it("should produce contiguous ranges", () => {
      const shards = computeShards(100, 4, "seed123");

      for (let i = 1; i < shards.length; i++) {
        expect(shards[i].start).toBe(shards[i - 1].end);
      }
      expect(shards[shards.length - 1].end).toBe(100);
    });

    it("should cover the entire range (start to end)", () => {
      const totalCount = 50;
      const shards = computeShards(totalCount, 4, "seed456");

      const totalGenerated = shards.reduce((sum, s) => sum + s.count, 0);
      expect(totalGenerated).toBe(totalCount);
    });
  });

  describe("generateDeterministicShards", () => {
    it("should generate shards for multiple collections", () => {
      const collections = [
        { collectionName: "users", count: 100 },
        { collectionName: "orders", count: 200 },
      ];

      const result = generateDeterministicShards(collections, 4, "seed789");

      expect(result.has("users")).toBe(true);
      expect(result.has("orders")).toBe(true);

      const userShards = result.get("users")!;
      const orderShards = result.get("orders")!;

      expect(userShards.reduce((sum, s) => sum + s.count, 0)).toBe(100);
      expect(orderShards.reduce((sum, s) => sum + s.count, 0)).toBe(200);
    });

    it("should be deterministic for same seed", () => {
      const collections = [
        { collectionName: "users", count: 50 },
      ];

      const result1 = generateDeterministicShards(collections, 3, "fixed-seed");
      const result2 = generateDeterministicShards(collections, 3, "fixed-seed");

      const shards1 = JSON.stringify(Array.from(result1.entries()));
      const shards2 = JSON.stringify(Array.from(result2.entries()));

      expect(shards1).toBe(shards2);
    });
  });

  describe("createShardTasks", () => {
    it("should create tasks for all collections and shards", () => {
      const collections = [
        { collectionName: "users", count: 10 },
        { collectionName: "orders", count: 20 },
      ];

      const tasks = createShardTasks(collections, 2, "seed123");

      const userTasks = tasks.filter((t) => t.collectionIndex === 0);
      const orderTasks = tasks.filter((t) => t.collectionIndex === 1);

      expect(userTasks.length).toBe(2);
      expect(orderTasks.length).toBe(2);

      expect(userTasks.reduce((sum, t) => sum + t.count, 0)).toBe(10);
      expect(orderTasks.reduce((sum, t) => sum + t.count, 0)).toBe(20);
    });

    it("should assign correct rangeStart values", () => {
      const collections = [
        { collectionName: "items", count: 100 },
      ];

      const tasks = createShardTasks(collections, 4, "seed123");

      expect(tasks[0].rangeStart).toBe(0);
      expect(tasks[0].count).toBe(25);

      expect(tasks[1].rangeStart).toBe(25);
      expect(tasks[1].count).toBe(25);

      expect(tasks[2].rangeStart).toBe(50);
      expect(tasks[2].count).toBe(25);

      expect(tasks[3].rangeStart).toBe(75);
      expect(tasks[3].count).toBe(25);
    });

    it("should produce task counts that sum to total documents", () => {
      const collections = [
        { collectionName: "users", count: 50 },
        { collectionName: "posts", count: 100 },
        { collectionName: "comments", count: 200 },
      ];

      const tasks = createShardTasks(collections, 4, "seed456");

      const totalCounts = tasks.reduce((sum, t) => sum + t.count, 0);
      expect(totalCounts).toBe(350);
    });
  });

  describe("Deterministic Consistency", () => {
    it("should produce identical shards across multiple runs with same seed", () => {
      const collections = [
        { collectionName: "test", count: 1000 },
      ];

      const run1 = createShardTasks(collections, 4, "deterministic-seed");
      const run2 = createShardTasks(collections, 4, "deterministic-seed");
      const run3 = createShardTasks(collections, 4, "deterministic-seed");

      expect(run1).toEqual(run2);
      expect(run2).toEqual(run3);
    });

    it("should produce consistent shard assignments regardless of seed", () => {
      const collections = [
        { collectionName: "test", count: 100 },
      ];

      const run1 = createShardTasks(collections, 2, "seed-A");
      const run2 = createShardTasks(collections, 2, "seed-B");
      const run3 = createShardTasks(collections, 2, "seed-C");

      expect(run1).toEqual(run2);
      expect(run2).toEqual(run3);
    });
  });
});
