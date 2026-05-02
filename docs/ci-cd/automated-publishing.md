# Automated Publishing

Drawline Core follows a strict **Semantic Versioning (SemVer)** and automated publishing workflow to ensure stability for downstream users.

## Tools Used

- **Semantic Release**: Automatically determines the next version number based on commit messages.
- **GitHub Actions**: Handles the build, test, and publish lifecycle.
- **Conventional Commits**: Commit messages must follow the `feat:`, `fix:`, or `perf:` prefixes.

## The Release Workflow

1.  **Commit**: A developer pushes a commit to the `main` branch.
2.  **Test**: GitHub Actions runs the full test suite (Unit tests + Integration tests with actual DB adapters).
3.  **Build**: The TypeScript source is compiled into the `dist/` directory.
4.  **Analyze**: `semantic-release` analyzes the commits since the last tag:
    - `feat`: Triggers a **minor** release (e.g., `0.2.0` -> `0.3.0`).
    - `fix`: Triggers a **patch** release (e.g., `0.2.1` -> `0.2.2`).
    - `BREAKING CHANGE`: Triggers a **major** release (e.g., `1.0.0` -> `2.0.0`).
5.  **Tag & Release**: A new tag is created on GitHub, and the package is published to npm.
6.  **Changelog**: The `CHANGELOG.md` file is automatically updated with the list of changes.

## Manual Versioning (Fallback)

While automation is preferred, the project can be manually versioned using:

```bash
npm version [patch|minor|major]
git push origin main --tags
```

> [!IMPORTANT]
> Always ensure that the `package.json` version matches the latest GitHub tag to avoid deployment conflicts.
