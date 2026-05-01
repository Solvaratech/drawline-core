import { describe, it, expect, beforeEach } from "vitest";
import { ColumnDependencyGraph } from "../../generator/core/ColumnDependencyGraph";
import { SchemaField } from "../../types/schemaDesign";

describe("ColumnDependencyGraph", () => {
  it("should build graph from fields without dependencies", () => {
    const fields: SchemaField[] = [
      { id: "1", name: "id", type: "integer", isPrimaryKey: true },
      { id: "2", name: "name", type: "string" },
      { id: "3", name: "email", type: "string" },
    ];
    const graph = new ColumnDependencyGraph(fields);
    const order = graph.getTopologicalSort();
    expect(order).toContain("id");
    expect(order).toContain("name");
    expect(order).toContain("email");
  });

  it("should detect dependencies and sort correctly", () => {
    const fields: SchemaField[] = [
      { id: "1", name: "id", type: "integer", isPrimaryKey: true },
      { id: "2", name: "created_at", type: "date", constraints: {} },
      { 
        id: "3", 
        name: "updated_at", 
        type: "date", 
        constraints: { gtColumn: "created_at" } 
      },
    ];
    const graph = new ColumnDependencyGraph(fields);
    const order = graph.getTopologicalSort();
    expect(order.indexOf("created_at")).toBeLessThan(order.indexOf("updated_at"));
  });

  it("should handle multiple dependencies", () => {
    const fields: SchemaField[] = [
      { id: "1", name: "start_date", type: "date" },
      { 
        id: "2", 
        name: "end_date", 
        type: "date", 
        constraints: { gtColumn: "start_date" } 
      },
      { 
        id: "3", 
        name: "duration_days", 
        type: "integer",
        constraints: { ltColumn: "end_date", maxColumn: "end_date" }
      },
    ];
    const graph = new ColumnDependencyGraph(fields);
    const order = graph.getTopologicalSort();
    expect(order.indexOf("start_date")).toBeLessThan(order.indexOf("end_date"));
  });

  it("should detect cycles and break them", () => {
    const fields: SchemaField[] = [
      { id: "1", name: "a", type: "integer", constraints: { gtColumn: "b" } },
      { id: "2", name: "b", type: "integer", constraints: { gtColumn: "a" } },
    ];
    const graph = new ColumnDependencyGraph(fields);
    expect(() => graph.getTopologicalSort()).not.toThrow();
  });
});



describe("Cross-column constraint scenarios", () => {
  it("created_at <= updated_at", () => {
    const fields: SchemaField[] = [
      { id: "1", name: "created_at", type: "date" },
      { id: "2", name: "updated_at", type: "date", constraints: { gtColumn: "created_at" } },
    ];
    const graph = new ColumnDependencyGraph(fields);
    const order = graph.getTopologicalSort();
    const createdIdx = order.indexOf("created_at");
    const updatedIdx = order.indexOf("updated_at");
    expect(createdIdx).toBeLessThan(updatedIdx);
  });

  it("start_date <= end_date", () => {
    const fields: SchemaField[] = [
      { id: "1", name: "start_date", type: "date" },
      { id: "2", name: "end_date", type: "date", constraints: { gtColumn: "start_date" } },
    ];
    const graph = new ColumnDependencyGraph(fields);
    const order = graph.getTopologicalSort();
    const startIdx = order.indexOf("start_date");
    const endIdx = order.indexOf("end_date");
    expect(startIdx).toBeLessThan(endIdx);
  });

  it("discount_price < original_price", () => {
    const fields: SchemaField[] = [
      { id: "1", name: "original_price", type: "number" },
      { id: "2", name: "discount_price", type: "number", constraints: { ltColumn: "original_price" } },
    ];
    const graph = new ColumnDependencyGraph(fields);
    const order = graph.getTopologicalSort();
    const originalIdx = order.indexOf("original_price");
    const discountIdx = order.indexOf("discount_price");
    expect(originalIdx).toBeLessThan(discountIdx);
  });

  it("quantity_available <= total_quantity", () => {
    const fields: SchemaField[] = [
      { id: "1", name: "total_quantity", type: "integer" },
      { id: "2", name: "quantity_available", type: "integer", constraints: { ltColumn: "total_quantity" } },
    ];
    const graph = new ColumnDependencyGraph(fields);
    const order = graph.getTopologicalSort();
    const totalIdx = order.indexOf("total_quantity");
    const availableIdx = order.indexOf("quantity_available");
    expect(totalIdx).toBeLessThan(availableIdx);
  });
});