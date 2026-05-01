# Unified Test Dispatcher

Drawline Core features a unified CLI for all validation tasks. This ensures that developers and CI/CD pipelines use the exact same verification logic.

## Usage

```bash
npm test
```

### Interactive Mode
When run in a local terminal, the dispatcher will prompt you with three options:

1. **Interactive Data Generation Test**: Choose an industry (Fintech, OTT, etc.) and a database adapter. The CLI will generate data, measure performance, and save a full report + CSV artifacts in `test-results/`.
2. **Automated Unit Tests**: Runs the Vitest suite for all core components.
3. **Exit**.

### CI/CD Mode
If run in a non-TTY environment (like GitHub Actions), or by passing the `--ci` flag, the dispatcher executes a mandatory **Full-Validation Suite**:

1. **Dataset Integrity Check**: Validates the JSON syntax of all 60+ datasets.
2. **Automated Unit Tests**: Executes the full Vitest suite.
3. **Performance Benchmark**: Runs a non-interactive benchmark for Ecommerce, Fintech, and Logistics to verify TPS stability.

```bash
npm test -- --ci
```

## Reports & Artifacts
Every benchmark run generates a `test-report.md` in the `test-results/` directory containing:
- **Throughput**: Transactions Per Second (TPS).
- **Latency**: Average ms per document.
- **Resource Usage**: Heap memory and CPU time.
- **Success Table**: Detailed status for each collection.
