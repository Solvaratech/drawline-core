# Dependency Resolution

One of the most complex challenges in synthetic data generation is maintaining **Referential Integrity**. Drawline Core solves this by using a sophisticated Dependency Resolution engine that calculates the optimal "Generation Order" for your database.

## Topological Sorting

The engine treats your database schema as a **Directed Acyclic Graph (DAG)**.
- **Nodes**: Tables or Collections.
- **Edges**: Foreign Key relationships (pointing from Child to Parent).

Before generation begins, the engine performs a **Topological Sort**. This ensures that parent entities are always created before their dependent children.

### Example Scenario

Consider a standard E-commerce schema:
1. `Users` (No dependencies)
2. `Products` (No dependencies)
3. `Orders` (Depends on `Users`)
4. `OrderItems` (Depends on `Orders` and `Products`)

**Generation Order:** `Users` & `Products` (Level 0) → `Orders` (Level 1) → `OrderItems` (Level 2).

## Handling Relationship Types

The engine distinguishes between different relationship types to determine dependency direction:

### 1. One-to-One / Many-to-One
- The "From" collection (the one holding the foreign key) is the **Child**.
- The "To" collection (the one being referenced) is the **Parent**.
- **Rule**: Parent must be generated first.

### 2. One-to-Many
- Often used to represent the inverse of a Many-to-One.
- **Rule**: The "From" collection is the Parent.

### 3. Many-to-Many
- Usually handled via a join table.
- **Rule**: Both target collections must exist before the join table is populated.

## Strong vs. Weak Dependencies

Not all relationships are created equal. The engine categorizes dependencies to handle complex scenarios:

- **Strong Dependency**: A relationship where the foreign key is **required** (non-nullable). The child *cannot* exist without the parent.
- **Weak Dependency**: A relationship where the foreign key is **optional**. The child *can* be created first and updated later.

## Cycle Breaking (The "Heuristic" Savior)

Real-world databases occasionally contain **Circular Dependencies** (e.g., `User` has a `primary_account_id` → `Account`, and `Account` has an `owner_id` → `User`).

Drawline Core includes a built-in cycle-breaking heuristic:
1. It detects the cycle.
2. It identifies the "Weakest Link" (the dependency most likely to be optional).
3. It breaks the cycle at that point, allowing the topological sort to complete.
4. It logs a warning to the developer.

> [!WARNING]
> While the engine can break cycles, it is always better to design schemas without strong circular requirements for easier testing and maintenance.

## Implementation Details

The core logic resides in `src/generator/core/DependencyGraph.ts`. It provides several utility methods:
- `getGenerationOrder()`: Returns the flat list of collections in order.
- `getParallelGroups()`: Returns groups of collections that can be safely generated in parallel (Level 0, Level 1, etc.).
- `hasCircularDependencies()`: Boolean flag for validation reporting.
