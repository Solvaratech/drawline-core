# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-04-19

### Added
- **High-Performance Architecture**:
  - Zero-memory streaming architecture for large-scale data generation.
  - Double-buffered output stream to maximize I/O throughput.
  - Integration with PostgreSQL's native `COPY FROM STDIN` protocol.
  - High-performance `xoshiro128**` Pseudo-Random Number Generator.
  - `FNV-1a` non-cryptographic hash function for ultra-fast deterministic seeds.
- **Advanced Constraint Engine**:
  - **Temporal Validators**: `before`, `after`, `within_days`, and `older_than` (age validation).
  - **Cross-Column Constraints**: `sum_of`, `ratio_of`, and `percentage_of` logic rules.
  - **Conditional Logic**: Mutually exclusive field sets and conditional validation.
  - **Real-time pipeline integration**: Automated document validation and heuristic correction during generation.
- **New Database Adapters**:
  - MySQL, SQLite (Secure), SQL Server, Redis, DynamoDB, and Firestore.
- **Deterministic Parallelism**:
  - Worker-shard integration for consistent seeds across parallel generation processes.
- **Improved Type Safety**:
  - Enhanced `ConstraintRegistry` support for `SchemaField[]` integration.
  - Full TypeScript type-check coverage for new validators.

### Changed
- Refactored `BaseAdapter` and all existing adapters to support streaming architecture.
- Optimized generating logic for composite primary keys and unique constraints.
- Updated `TestDataGeneratorService` to orchestrate multi-adapter generation within a single configuration.

### Fixed
- Resolved millisecond rounding issues in temporal date comparisons.
- Fixed variable shadowing in `temporalValidators` that led to incorrect boolean evaluation.
- Corrected index signature conflicts in `ConstraintRegistry` schema parsing.

---

## [0.1.2] - 2026-04-15
### Fixed
- Alignment of generator tests with the early streaming prototype.

## [0.1.1] - 2026-04-12
### Added
- Basic MongoDB and PostgreSQL adapters.
- Initial Constraint Engine prototype.

## [0.1.0] - 2026-04-01
### Added
- Initial release of `@solvaratech/drawline-core`.
