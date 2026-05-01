import { SchemaField, FieldConstraints } from "../../types/schemaDesign";

export interface FieldNode {
  name: string;
  field: SchemaField;
  dependencies: Set<string>;
}

export interface DependencyEdge {
  from: string;
  to: string;
  type: "min" | "max" | "gt" | "lt" | "eq";
}

export class ColumnDependencyGraph {
  private nodes: Map<string, FieldNode> = new Map();
  private edges: DependencyEdge[] = [];
  private fieldIndex: Map<string, number> = new Map();

  constructor(fields: SchemaField[]) {
    this.buildGraph(fields);
  }

  private buildGraph(fields: SchemaField[]): void {
    fields.forEach((field, index) => {
      this.nodes.set(field.name, {
        name: field.name,
        field,
        dependencies: new Set(),
      });
      this.fieldIndex.set(field.name, index);
    });

    for (const field of fields) {
      const constraints = field.constraints;
      if (!constraints) continue;

      if (constraints.minColumn) {
        this.addEdge(constraints.minColumn, field.name, "min");
      }
      if (constraints.maxColumn) {
        this.addEdge(constraints.maxColumn, field.name, "max");
      }
      if (constraints.gtColumn) {
        this.addEdge(constraints.gtColumn, field.name, "gt");
      }
      if (constraints.ltColumn) {
        this.addEdge(constraints.ltColumn, field.name, "lt");
      }
    }

    this.detectCycles();
  }

  private addEdge(from: string, to: string, type: "min" | "max" | "gt" | "lt"): void {
    const fromNode = this.nodes.get(from);
    const toNode = this.nodes.get(to);

    if (!fromNode || !toNode) return;

    fromNode.dependencies.add(to);
    this.edges.push({ from, to, type });
  }

  private detectCycles(): void {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const dfs = (node: string): boolean => {
      visited.add(node);
      recursionStack.add(node);

      const nodeData = this.nodes.get(node);
      if (nodeData) {
        for (const dep of nodeData.dependencies) {
          if (!visited.has(dep)) {
            if (dfs(dep)) return true;
          }
          if (recursionStack.has(dep)) {
            console.warn(`ColumnDependencyGraph: Circular dependency detected between ${node} and ${dep}`);
            return true;
          }
        }
      }

      recursionStack.delete(node);
      return false;
    };

    for (const node of this.nodes.keys()) {
      if (!visited.has(node)) {
        if (dfs(node)) {
          this.breakCycle(node);
        }
      }
    }
  }

  private breakCycle(startNode: string): void {
    const visited = new Set<string>();
    const path: string[] = [];

    const findPath = (node: string): boolean => {
      visited.add(node);
      path.push(node);

      const nodeData = this.nodes.get(node);
      if (nodeData) {
        for (const dep of nodeData.dependencies) {
          if (dep === startNode) {
            return true;
          }
          if (!visited.has(dep)) {
            if (findPath(dep)) {
              return true;
            }
          }
        }
      }

      path.pop();
      return false;
    };

    findPath(startNode);

    if (path.length > 0) {
      const lastNode = path[path.length - 1];
      const lastNodeData = this.nodes.get(lastNode);
      if (lastNodeData && lastNodeData.dependencies.size > 0) {
        const firstDep = Array.from(lastNodeData.dependencies)[0];
        lastNodeData.dependencies.delete(firstDep);
        this.edges = this.edges.filter(e => !(e.from === lastNode && e.to === firstDep));
        console.log(`ColumnDependencyGraph: Broken cycle by removing edge ${lastNode} -> ${firstDep}`);
      }
    }
  }

  getTopologicalSort(): string[] {
    const inDegree = new Map<string, number>();
    const result: string[] = [];

    for (const [name, node] of this.nodes) {
      inDegree.set(name, 0);
    }

    for (const [name, node] of this.nodes) {
      for (const dep of node.dependencies) {
        inDegree.set(dep, (inDegree.get(dep) || 0) + 1);
      }
    }

    const queue: string[] = [];
    for (const [name, degree] of inDegree) {
      if (degree === 0) {
        queue.push(name);
      }
    }

    while (queue.length > 0) {
      const node = queue.shift()!;
      result.push(node);

      const nodeData = this.nodes.get(node);
      if (nodeData) {
        for (const dep of nodeData.dependencies) {
          const newDegree = (inDegree.get(dep) || 0) - 1;
          inDegree.set(dep, newDegree);
          if (newDegree === 0) {
            queue.push(dep);
          }
        }
      }
    }

    for (const name of this.nodes.keys()) {
      if (!result.includes(name)) {
        result.push(name);
      }
    }

    return result;
  }

  getDependencies(fieldName: string): string[] {
    const node = this.nodes.get(fieldName);
    return node ? Array.from(node.dependencies) : [];
  }

  hasDependency(fieldName: string): boolean {
    const node = this.nodes.get(fieldName);
    return node ? node.dependencies.size > 0 : false;
  }

  getEdges(): DependencyEdge[] {
    return [...this.edges];
  }

  getFieldType(fieldName: string): string | undefined {
    return this.nodes.get(fieldName)?.field.type;
  }
}