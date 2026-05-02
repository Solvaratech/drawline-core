# API Reference

Drawline Core provides a simple yet powerful public API surface designed to be integrated into CLI tools, web dashboards, or CI/CD pipelines.

## Main Entry Points

The library is structured into several key classes that handle different parts of the generation lifecycle.

### [TestDataGeneratorService](generator-service.md)
The primary orchestrator. This is the class you will interact with most often. It handles the 3-phase pipeline (Schema -> Generate -> Constraints).

### [SemanticProvider](semantic-provider.md)
The static engine that provides realistic data values. While usually called internally by the inference engine, it can be used directly for manual data generation.

### [BaseAdapter & Implementations](adapters.md)
The abstraction layer for different databases. If you need to support a new database type, you would implement a new adapter extending `BaseAdapter`.

## Common Types

The library uses a set of shared TypeScript types to define schemas and configurations.

```typescript
import { TestDataGeneratorService, TestDataConfig } from "@solvaratech/drawline-core";

// Configuration for a generation run
const config: TestDataConfig = {
  seed: 12345,
  batchSize: 1000,
  collections: [
    { collectionName: "users", count: 100 }
  ]
};
```

## Detailed Documentation

- [TestDataGeneratorService Reference](generator-service.md)
- [SemanticProvider Reference](semantic-provider.md)
- [Database Adapters Reference](adapters.md)
