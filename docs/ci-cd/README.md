# CI/CD & DevOps

Drawline Core is designed to be an integral part of your modern DevOps pipeline. By automating data generation, you can ensure that every developer and CI runner has access to high-quality, sanitized data.

## The DevOps Vision

Instead of sharing a single "dirty" staging database, Drawline enables a **"Database-as-Code"** approach:
1.  **Schema changes** are committed to Git.
2.  **CI/CD triggers** a fresh data generation run.
3.  **Ephemeral environments** (like Vercel Previews or Kubernetes namespaces) are spun up with fresh, deterministic data.

## In This Section

### [Validation Pipeline](validation-pipeline.md)
How to use Drawline to validate schema migrations and ensure referential integrity before they reach production.

### [Automated Publishing](automated-publishing.md)
Details on our automated versioning and npm publishing workflow using `semantic-release`.

## Integration Example (GitHub Actions)

```yaml
jobs:
  seed-database:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Generate Test Data
        run: npx drawline-core generate --config ./drawline.config.json --adapter postgres
        env:
          DATABASE_URL: ${{ secrets.STAGING_DB_URL }}
```
