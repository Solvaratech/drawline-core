# Validation Pipeline

The **Validation Pipeline** ensures that your database schemas and relationships remain healthy as your application evolves. It uses Drawline Core's internal logic to "dry-run" your schema.

## Key Checks

### 1. Topological Health
The pipeline checks if your schema contains unbreakable circular dependencies. If it does, the pipeline fails, forcing a design review.

### 2. Inference Coverage
Measures how many of your fields are successfully mapped to high-fidelity semantic generators vs. how many fall back to generic strings. This helps maintain data quality.

### 3. Constraint Verification
The pipeline attempts to apply all Phase 3 constraints (Foreign Keys, Indices) to a temporary database to verify that the schema is actually valid for the target database type (e.g., checking for incompatible data types in Postgres).

## Running the Pipeline

You can run the validation check as part of your CI suite:

```bash
npx drawline-core validate --schema ./src/schema/design.json
```

### Exit Codes
- `0`: Success. Schema is healthy.
- `1`: Error. Circular dependencies or invalid database constraints found.
- `2`: Warning. Low inference coverage (some fields have generic data).

## Proactive Correction

If the validation pipeline finds issues (like a missing foreign key target), it provides actionable suggestions:

```text
ERROR: Collection 'orders' references 'users' but 'users' has no Primary Key.
SUGGESTION: Add { "isPrimaryKey": true } to a field in 'users'.
```
