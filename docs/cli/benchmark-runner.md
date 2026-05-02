# Interactive Benchmark Runner

The **Interactive Benchmark Runner** is a developer tool used to measure the performance characteristics of the Drawline engine and its database adapters.

## Why Benchmark?

Synthetic data generation can be resource-intensive, especially when dealing with millions of records and complex foreign key relationships. The benchmark runner helps you:
- Compare the write speed of Postgres vs. MongoDB for your specific schema.
- Identify bottlenecks in the Field Inference Engine.
- Optimize `batchSize` settings for your production environment.

## Running a Benchmark

To start the interactive runner:

```bash
npx drawline-core benchmark
```

The runner will prompt you for:
1.  **Target Adapters**: Select one or more databases to test.
2.  **Dataset Size**: Number of records to generate (e.g., 10k, 100k, 1M).
3.  **Concurrency**: Number of parallel worker threads.

## Metrics Tracked

| Metric | Description |
| :--- | :--- |
| **TPS** | Transactions Per Second. The primary measure of throughput. |
| **P95 Latency** | The time it takes to generate and insert a single batch for 95% of requests. |
| **CPU/RAM** | Peak resource usage during the generation phase. |
| **Inference Time** | Time spent by the engine tokenizing and mapping fields before generation starts. |

## Interpreting Results

At the end of the run, the tool generates a summary table:

```text
Benchmark Results:
Adapter     | Records | Time (s) | TPS   | P95 (ms)
--------------------------------------------------
Postgres    | 100,000 | 12.4     | 8,064 | 45
MongoDB     | 100,000 | 8.2      | 12,195| 32
SQLite      | 100,000 | 15.1     | 6,622 | 58
```

## Best Practices
- Run benchmarks on hardware similar to your production or staging environment.
- Use a representative schema with realistic relationship depth.
- Disable logging during benchmarks to avoid I/O bottlenecks.
