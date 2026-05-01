import inquirer from "inquirer";
import * as fs from "fs";
import * as path from "path";
import { TestDataGeneratorService } from "../generator";
import { CSVExportAdapter } from "../generator/adapters/CSVExportAdapter";
import { cliLogger } from "../utils/cli-logger";
import { DatabaseType, SchemaDesign } from "../types/schemaDesign";

import { SCHEMA_TEMPLATES } from "./schema-templates";

export async function runBenchmarkTest(options?: { dbType?: string; schemaType?: string; count?: number }) {
	cliLogger.header("Drawline Performance Benchmark");

	const dbType = options?.dbType || (await inquirer.prompt([
		{
			type: "list",
			name: "dbType",
			message: "Select the database type for the test:",
			choices: [
				{ name: "Ephemeral (In-Memory, no persistence)", value: "ephemeral" },
				{ name: "SQLite (Local file)", value: "sqlite" },
				{ name: "CSV Export (Generates CSV files)", value: "csv" },
				{ name: "In-Memory Adapter", value: "in-memory" },
				new inquirer.Separator(),
				{ name: "PostgreSQL (Requires URL)", value: "postgresql" },
				{ name: "MongoDB (Requires URL)", value: "mongodb" },
			],
		},
	])).dbType;

	let dbUrl = "";
	if (["postgresql", "mongodb"].includes(dbType)) {
		if (options?.dbType) {
			dbUrl = process.env.DATABASE_URL || "";
		} else {
			const { url } = await inquirer.prompt([
				{
					type: "input",
					name: "url",
					message: `Enter the connection URL for ${dbType}:`,
					validate: (val) => (val.length > 0 ? true : "URL is required"),
				},
			]);
			dbUrl = url;
		}
	}

	const schemaType = options?.schemaType || (await inquirer.prompt([
		{
			type: "list",
			name: "schemaType",
			message: "Select the industry schema for the test:",
			choices: Object.keys(SCHEMA_TEMPLATES).map(key => ({
				name: key.replace(/_/g, " ").toUpperCase(),
				value: key
			}))
		}
	])).schemaType;

	const schema = SCHEMA_TEMPLATES[schemaType];

	const count = options?.count || (await inquirer.prompt([
		{
			type: "number",
			name: "count",
			message: "How many documents per collection would you like to generate?",
			default: 100,
			validate: (val) => (val > 0 ? true : "Count must be greater than 0"),
		},
	])).count;

	const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
	const resultsDir = path.resolve(process.cwd(), "test-results", timestamp);
	fs.mkdirSync(resultsDir, { recursive: true });

	cliLogger.step(`Setting up results directory: ${resultsDir}`);

	let adapter;
	if (dbType === "csv") {
		adapter = new CSVExportAdapter(resultsDir);
	} else if (dbType === "sqlite") {
		const { SQLiteAdapter } = await import("../generator/adapters/SQLiteAdapter");
		adapter = new SQLiteAdapter();
		await adapter.connect({ filename: path.join(resultsDir, "test.sqlite") });
	} else if (dbType === "in-memory") {
		const { InMemoryAdapter } = await import("../generator/adapters/InMemoryAdapter");
		adapter = new InMemoryAdapter();
	} else if (dbType === "ephemeral") {
		const { EphemeralAdapter } = await import("../generator/adapters/EphemeralAdapter");
		adapter = new EphemeralAdapter();
	} else {
		adapter = TestDataGeneratorService.createAdapter(dbType as any, dbUrl, (s) => s);
	}

	const service = new TestDataGeneratorService(adapter);
	const startTime = Date.now();

	cliLogger.step("Starting data generation...");

	const result = await service.generateAndPopulate(schema.collections, schema.relationships, {
		collections: schema.collections.map((c) => ({ collectionName: c.name, count })),
		relationships: schema.relationships,
		seed: "test-seed-" + timestamp,
		batchSize: 100,
		onProgress: (p) => {
			process.stdout.write(`\r${cliLogger.formatInfo(`Progress: ${p.collectionName} [${p.generatedCount}/${p.totalCount}] TPS: ${p.tps || 0}`)}`);
		},
	});

	process.stdout.write("\n");
	const durationMs = Date.now() - startTime;

	if (result.success) {
		const tps = Math.round((result.totalDocumentsGenerated / durationMs) * 1000);
		cliLogger.success(`Generation completed successfully!`);
		cliLogger.info(`Total Documents: ${result.totalDocumentsGenerated}`);
		cliLogger.info(`Total Time: ${(durationMs / 1000).toFixed(2)}s`);
		cliLogger.info(`Throughput: ${tps} Transactions Per Second`);

		// Performance and Resource Metrics
		const finalMemory = process.memoryUsage();
		const memoryUsedMB = Math.round((finalMemory.heapUsed / 1024 / 1024) * 100) / 100;
		const cpuUsage = process.cpuUsage();
		const cpuUserTime = (cpuUsage.user / 1000).toFixed(2);
		const cpuSystemTime = (cpuUsage.system / 1000).toFixed(2);
		const latencyPerDoc = (durationMs / result.totalDocumentsGenerated).toFixed(4);

		// Generate Enhanced Report
		const reportPath = path.join(resultsDir, "test-report.md");
		const reportContent = `
# 🚀 Drawline Performance & Realism Report
**Run ID:** \`${timestamp}\`
**Industry Template:** \`${schemaType.toUpperCase()}\`
**Target Database:** \`${dbType.toUpperCase()}\`

## 📊 Summary Metrics
- **Total Documents Generated:** ${result.totalDocumentsGenerated.toLocaleString()}
- **Total Execution Time:** ${(durationMs / 1000).toFixed(2)}s
- **Throughput (Transactions Per Second):** ${tps.toLocaleString()} docs/sec
- **Average Latency per Document:** ${latencyPerDoc}ms

## 💻 Resource Usage
- **Memory Consumption (Heap Used):** ${memoryUsedMB} MB
- **CPU User Time:** ${cpuUserTime}ms
- **CPU System Time:** ${cpuSystemTime}ms
- **Process ID:** ${process.pid}

## 📂 Collection Statistics
| Collection Name | Document Count | Status |
|-----------------|----------------|--------|
${result.collections.map((c) => `| ${c.collectionName} | ${c.documentCount.toLocaleString()} | ✅ SUCCESS |`).join("\n")}

## 🛠️ Configuration & Environment
- **PRNG Seed:** \`test-seed-${timestamp}\`
- **Batch Size:** 100
- **Engine Version:** ${schema.version}.0.0-stable
- **Operating System:** ${process.platform} (${process.arch})
- **Node.js Version:** ${process.version}

---
*Generated by Drawline Semantic Engine*
`;
		fs.writeFileSync(reportPath, reportContent);

		// If not CSV, we might want to export to CSV anyway as requested by user
		if (dbType !== "csv") {
			cliLogger.step("Exporting generated data to CSV for inspection...");
			const csvExportAdapter = new CSVExportAdapter(resultsDir);
			const csvService = new TestDataGeneratorService(csvExportAdapter);
			// We can't easily "export" from an adapter after the fact if it's ephemeral
			// But we can run a second pass or, better, the user just uses 'csv' as DB choice.
			// Actually, the user said "user should get two files with the test report and the test data as csv"
			// So I will make sure a CSV is always generated.
			// If it's a real DB, I'd have to query it back. For this test, I'll just regenerate to CSV with same seed.
			await csvService.generateAndPopulate(schema.collections, schema.relationships, {
				collections: schema.collections.map((c) => ({ collectionName: c.name, count })),
				relationships: schema.relationships,
				seed: "test-seed-" + timestamp,
				batchSize: 100,
			});
		}

		cliLogger.success(`Artifacts saved in: ${resultsDir}`);
		cliLogger.info(`- Report: test-report.md`);
		cliLogger.info(`- Data: CSV files per collection`);
	} else {
		cliLogger.error("Generation failed!");
		result.errors?.forEach((e) => cliLogger.error(`  - ${e}`));
	}
}


