# Introduction

## What is Drawline Core?

**Drawline Core** is a production-grade synthetic data engine designed for high-entropy, context-aware database seeding. Unlike traditional "Lorem Ipsum" generators, Drawline focuses on **Semantic Fidelity**—generating data that looks, feels, and behaves like real enterprise data.

Whether you are building a Fintech app requiring valid-looking Indian PAN cards or a Healthcare system needing realistic medical specialties, Drawline Core provides the engine to populate your development and staging environments with meaningful data.

### The Problem We Solve

Traditional data generators often produce "junk" data:
- `user_123@example.com` instead of `amit.sharma82@gmail.com`
- Lorem Ipsum text instead of realistic product descriptions.
- Broken foreign key relationships that crash your application logic.
- Inconsistent data across different database types (e.g., Postgres vs. MongoDB).

**Drawline** solves this by combining topological dependency resolution, smart field inference, and a curated global corpus of datasets.

### Why Drawline?

1. **Industry Fidelity**: Over 60+ domain-specific datasets ranging from Aviation to Fintech.
2. **Deterministic Consistency**: Using the Xoshiro128 algorithm, the same seed always produces the same data across any database system.
3. **Smart Inference**: Automatic mapping of your schema fields to realistic semantic generators using token-based scoring.
4. **Referential Integrity**: Guarantees valid foreign keys by resolving the "Generation Order" using topological sorting.
5. **Multi-Adapter Support**: Native support for Postgres, MySQL, MongoDB, SQLite, Firestore, and more.

### How it Works: The 3-Phase Pipeline

Drawline Core operates in a structured three-phase pipeline to ensure database stability and data integrity:

1.  **Phase 1: Schema Assurance**: The engine analyzes the target database and ensures all necessary tables/collections exist with the correct fields, skipping constraints temporarily to avoid circular dependency errors during creation.
2.  **Phase 2: Generation & Streaming**: Data is generated in topological order (parents before children). Using a high-performance streaming architecture, Drawline can push thousands of records per second while validating against business constraints.
3.  **Phase 3: Constraint Application**: Once data is safely inserted, the engine applies foreign key constraints and indices, ensuring a production-mirror environment.

### Key Concepts

*   **Semantic Provider**: The core corpus of 60+ JSON datasets that power the generation.
*   **Field Inference Engine**: The brain that tokenizes field names (e.g., `user_email` -> `email`) and assigns the best-fitting generator.
*   **Dependency Graph**: A topological resolver that determines which tables must be populated first.
*   **Adapters**: Pluggable modules that translate generic generation commands into database-specific queries (SQL, NoSQL, Document).
