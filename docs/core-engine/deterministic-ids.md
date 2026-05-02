# Deterministic ID Generation

Drawline Core is built on the principle of **Repeatability**. Whether you run the generator today on Postgres or next month on MongoDB, the same configuration should yield the exact same data. This is made possible by our deterministic generation strategy.

## The PRNG: Xoshiro128

Instead of using `Math.random()`, which is unpredictable and varies across environments, Drawline uses the **Xoshiro128** Pseudo-Random Number Generator (PRNG).

### Why Xoshiro128?
- **Speed**: Extremely fast with a low memory footprint.
- **Statistical Quality**: Passes modern tests for randomness.
- **Seeded**: By providing a fixed `seed` (an integer), the sequence of "random" numbers generated is identical every time.

## Seeded Cross-Database Identity

In a typical microservice environment, you might have some data in SQL and some in NoSQL. If you want to test an integration between them, you need the IDs to match.

Drawline achieves this by:
1.  **Global Seed**: A primary seed is provided in the `TestDataConfig`.
2.  **Derived Seeds**: For each collection and document index, a new seed is derived.
3.  **Cross-Database Consistency**: Because the "Author" with index #5 always gets the same seed regardless of whether the target is Postgres or JSON, its `id`, `name`, and `email` will be identical in both systems.

## Global Unique IDs (GUIDs)

For databases requiring UUIDs or ObjectIDs (like MongoDB), the engine uses the seeded PRNG to generate the bytes for the ID.
- **UUIDs**: Generated as Version 4 (Random), but using the seeded sequence.
- **ObjectIDs**: Following the MongoDB format but with seeded machine/process/counter segments.

## ID Reference Mapping

When a child record needs a parent ID, Drawline doesn't query the database. Instead:
1.  The engine knows the count of parent records (from the config).
2.  It uses the seeded PRNG to pick an index (e.g., "Parent #42").
3.  It then **re-calculates** what the ID for "Parent #42" was during its own generation phase.

This "Zero-Query" approach makes Drawline incredibly fast and allows it to generate child records even if the parent records aren't physically in the database yet (e.g., during parallel streaming).

> [!IMPORTANT]
> To maintain determinism, always provide a fixed `seed` in your configuration. If you leave it empty, a random seed will be chosen, and subsequent runs will produce different data.
