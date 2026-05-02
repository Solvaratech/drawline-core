# CLI & Tooling

Drawline Core is accompanied by a suite of CLI tools designed to streamline the testing and benchmarking of your database schemas.

## Overview

The CLI tools allow you to:
- Run relationship-aware data generation from the terminal.
- Benchmark the performance of different database adapters.
- Validate your schema against the Inference Engine rules.

## Available Tools

### [Unified Test Dispatcher](unified-test-cli.md)
The primary CLI for running generation tasks. It supports multiple adapters and provides real-time progress tracking.

### [Interactive Benchmark Runner](benchmark-runner.md)
A specialized tool for measuring the Throughput (TPS) and Latency of data generation across different environments.

## Installation

The CLI tools are bundled with the `@solvaratech/drawline-core` package. You can run them using `npx`:

```bash
npx drawline-core --help
```

Or install globally:

```bash
npm install -g @solvaratech/drawline-core
```
