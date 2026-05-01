# Introduction

## What is Drawline Core?

**Drawline Core** is a production-grade synthetic data engine designed for high-entropy, context-aware database seeding. Unlike traditional "Lorem Ipsum" generators, Drawline focuses on **Drawline Semantic Engine**—generating data that looks, feels, and behaves like real enterprise data.

### Why Drawline?

1. **Industry Fidelity**: Over 60+ domain-specific datasets ranging from Aviation to Fintech.
2. **Deterministic Consistency**: The same seed always produces the same data across any database system.
3. **Smart Inference**: Automatic mapping of your schema fields to realistic semantic generators without manual configuration.
4. **Referential Integrity**: Guarantees valid foreign keys without making a single database query during the generation phase.
5. **Multi-Adapter Support**: Native support for Postgres, MySQL, MongoDB, SQLite, and more.

### Key Concepts

* **Semantic Engine**: The core corpus of 60+ JSON datasets that power the generation.
* **Inference Engine**: The brain that tokenizes field names and assigns the best-fitting generator.
* **Seeded RNG**: Uses the Xoshiro128 algorithm to ensure data is both random and repeatable.
* **Topological Generation**: Intelligent dependency resolution that handles complex relationship cycles.
