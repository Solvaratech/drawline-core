import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		globals: true,
		environment: "node",
		include: ["src/**/*.test.ts"],
		setupFiles: ["./src/tests/setup.ts"],
		coverage: {
			reporter: ["text", "json", "html"],
			include: ["src/**/*.ts"],
			exclude: [
				"src/**/*.test.ts",
				"src/tests/**",
				"src/types/**",
				"src/cli.ts",
				"src/index.ts",
				"src/server.ts",
				"src/generators/**",
				"src/generator/adapters/CSVExportAdapter.ts",
				"src/generator/adapters/SQLiteAdapter.ts",
				"src/generator/adapters/EphemeralAdapter.ts"
			],
			thresholds: {
				lines: 20,
				functions: 20,
				branches: 15,
				statements: 20
			}
		},
	},
});
