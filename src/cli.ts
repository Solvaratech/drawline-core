#!/usr/bin/env node
import { Command } from "commander";
import * as fs from "fs";
import * as path from "path";
import { TestDataGeneratorService } from "./generator";
import { cliLogger } from "./utils";
import { SchemaDesign } from "./types/schemaDesign";
import { TestDataConfig } from "./generator/types";

const program = new Command();

program
	.name("drawline")
	.description("CLI tool for Drawline OSS engine")
	.version("0.1.0");

program
	.command("gen")
	.description("Generate and populate test data")
	.requiredOption("-s, --schema <path>", "Path to schema JSON file")
	.requiredOption("-c, --config <path>", "Path to configuration JSON file")
	.option("-d, --db <type>", "Database type (mongodb, postgresql, firestore, in-memory, dynamodb, sqlserver, redis)", "in-memory")
	.option("-u, --url <url>", "Database connection URL (or credentials for Firestore)")
	.action(async (options) => {
		try {
			cliLogger.header("Drawline Data Generation");
			
			const schemaPath = path.resolve(options.schema);
			const configPath = path.resolve(options.config);

			if (!fs.existsSync(schemaPath)) {
				cliLogger.error(`Schema file not found: ${schemaPath}`);
				process.exit(1);
			}
			if (!fs.existsSync(configPath)) {
				cliLogger.error(`Config file not found: ${configPath}`);
				process.exit(1);
			}

			const schema: SchemaDesign = JSON.parse(fs.readFileSync(schemaPath, "utf-8"));
			const config: TestDataConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));

			cliLogger.step(`Using database: ${options.db}`);
			
			let adapter;
			if (options.db === "in-memory") {
				const { InMemoryAdapter } = await import("./generator/adapters/InMemoryAdapter");
				adapter = new InMemoryAdapter();
			} else {
				if (!options.url) {
					cliLogger.error("Connection URL is required for real databases");
					process.exit(1);
				}
				adapter = TestDataGeneratorService.createAdapter(
					options.db as any,
					options.url,
					(s) => s // Simple no-op decrypt for CLI usage
				);
			}

			const service = new TestDataGeneratorService(adapter);
			
			cliLogger.step("Starting generation...");
			const result = await service.generateAndPopulate(
				schema.collections,
				schema.relationships,
				{
					...config,
					onProgress: (p) => {
						cliLogger.info(`Progress: ${p.collectionName} (${p.generatedCount}/${p.totalCount})`);
					}
				}
			);

			if (result.success) {
				cliLogger.success(`Successfully generated ${result.totalDocumentsGenerated} documents!`);
				result.collections.forEach(c => {
					cliLogger.info(`- ${c.collectionName}: ${c.documentCount} docs`);
				});
			} else {
				cliLogger.error("Generation failed!");
				result.errors?.forEach(e => cliLogger.error(`  - ${e}`));
			}
		} catch (error) {
			cliLogger.error("An unexpected error occurred:", error);
			process.exit(1);
		}
	});

program
	.command("validate")
	.description("Validate schema JSON")
	.requiredOption("-s, --schema <path>", "Path to schema JSON file")
	.action((options) => {
		try {
			cliLogger.header("Schema Validation");
			const schemaPath = path.resolve(options.schema);
			if (!fs.existsSync(schemaPath)) {
				cliLogger.error(`Schema file not found: ${schemaPath}`);
				process.exit(1);
			}

			const schemaContent = fs.readFileSync(schemaPath, "utf-8");
			const schema: SchemaDesign = JSON.parse(schemaContent);

			// Basic structural validation
			if (!schema.collections || !Array.isArray(schema.collections)) {
				cliLogger.error("Invalid schema: 'collections' array is missing");
				process.exit(1);
			}

			cliLogger.success(`Schema is valid! (${schema.collections.length} collections, ${schema.relationships?.length || 0} relationships)`);
		} catch (error) {
			cliLogger.error("Validation failed:", error);
			process.exit(1);
		}
	});

program
	.command("init")
	.description("Initialize a sample project configuration")
	.action(() => {
		cliLogger.header("Drawline Initialization");
		
		const sampleSchema = {
			collections: [
				{
					id: "users",
					name: "users",
					fields: [
						{ id: "u1", name: "id", type: "integer", isPrimaryKey: true },
						{ id: "u2", name: "name", type: "string" }
					],
					position: { x: 0, y: 0 }
				}
			],
			relationships: [],
			version: 1
		};

		const sampleConfig = {
			collections: [
				{ collectionName: "users", count: 10 }
			],
			relationships: []
		};

		fs.writeFileSync("schema.json", JSON.stringify(sampleSchema, null, 2));
		fs.writeFileSync("drawline.config.json", JSON.stringify(sampleConfig, null, 2));
		
		cliLogger.success("Created sample schema.json and drawline.config.json");
		cliLogger.info("Try running: drawline gen --schema schema.json --config drawline.config.json");
	});

program.parse();
