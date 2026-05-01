import { spawn } from "child_process";
import inquirer from "inquirer";
import { runBenchmarkTest } from "../src/tests/interactive-runner";
import * as fs from "fs";
import * as path from "path";
import { cliLogger } from "../src/utils/cli-logger";

async function runBenchmark() {
	cliLogger.header("Drawline CI Full-Validation Suite");
	
	// 1. Dataset Integrity Check
	cliLogger.step("Verifying Dataset Integrity...");
	const datasetsDir = path.join(__dirname, "../src/generator/datasets");
	const files = fs.readdirSync(datasetsDir).filter(f => f.endsWith(".json"));
	cliLogger.info(`Found ${files.length} datasets. Validating...`);
	
	for (const file of files) {
		try {
			const content = fs.readFileSync(path.join(datasetsDir, file), "utf-8");
			JSON.parse(content);
		} catch (err) {
			cliLogger.error(`Invalid JSON in ${file}`);
			process.exit(1);
		}
	}
	cliLogger.success("All datasets are valid.");

	// 2. Unit Tests
	cliLogger.step("Running Automated Unit Tests...");
	await new Promise<void>((resolve) => {
		const child = spawn("npx", ["vitest", "run"], {
			stdio: "inherit",
			shell: true
		});
		child.on("exit", (code) => {
			if (code !== 0) process.exit(code || 1);
			resolve();
		});
	});

	// 3. Performance Benchmark (Sample Industries)
	const benchmarks = [
		{ schemaType: "ecommerce", count: 500 },
		{ schemaType: "fintech", count: 500 },
		{ schemaType: "logistics", count: 500 }
	];

	for (const b of benchmarks) {
		cliLogger.step(`Running Benchmark: ${b.schemaType.toUpperCase()}`);
		await runBenchmarkTest({
			dbType: "ephemeral",
			schemaType: b.schemaType,
			count: b.count
		});
	}
	
	cliLogger.success("Full CI Validation Suite Completed.");
}

async function main() {
	const args = process.argv.slice(2);
	const isCI = !process.stdout.isTTY || args.includes("--ci") || args.includes("--benchmark");

	if (isCI) {
		cliLogger.info("CI/CD Environment detected. Running automated benchmark...");
		await runBenchmark();
		return;
	}

	const { testType } = await inquirer.prompt([
		{
			type: "list",
			name: "testType",
			message: "What kind of tests would you like to run?",
			choices: [
				{ name: "Interactive Data Generation Test (Stats + Artifacts)", value: "interactive" },
				{ name: "Automated Unit Tests (Vitest)", value: "vitest" },
				{ name: "Exit", value: "exit" },
			],
		},
	]);

	if (testType === "interactive") {
		await runBenchmarkTest();
	} else if (testType === "vitest") {
		runVitest();
	} else {
		process.exit(0);
	}
}

function runVitest() {
	const child = spawn("npx", ["vitest", "run", "--coverage"], {
		stdio: "inherit",
		shell: true
	});
	child.on("exit", (code) => process.exit(code || 0));
}


main().catch(err => {
	cliLogger.error("Dispatcher failed", err);
	process.exit(1);
});
