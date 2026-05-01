import { parentPort } from "worker_threads";
import { TestDataGeneratorService } from "./index";
import { decryptCredentials } from "../connections";
import { DatabaseType } from "../types/schemaDesign";

console.log("[Worker] STARTING execution...");

// Abstract IPC channel to support both Worker Threads (parentPort) and Child Processes (process)
const ipcChannel = parentPort || process;

setInterval(() => { }, 10000); // Keep alive

if (ipcChannel && typeof ipcChannel.on === 'function') {
	ipcChannel.on("message", async (msg: any) => {
		if (msg.event === "start_generation") {
			const {
				connectionType,
				encryptedCredentials,
				databaseName,
				collections,
				relationships,
				config,
				shard
			} = msg.data;

			try {
				const adapter = TestDataGeneratorService.createAdapter(
					connectionType as DatabaseType,
					encryptedCredentials,
					decryptCredentials,
					databaseName
				);

				const service = new TestDataGeneratorService(adapter);

				const postProgress = async (progress: any) => {
					const payload = {
						event: "progress",
						data: { ...progress, workerId: shard?.workerId }
					};
					if (parentPort) {
						parentPort.postMessage(payload);
					} else if (process.send) {
						process.send(payload);
					}
				};

				let result;
				if (shard && shard.collectionIndex !== undefined) {
					const collection = collections[shard.collectionIndex];
					result = await service.generateCollectionWithRange(
						collection,
						shard.rangeStart,
						shard.count,
						{ ...config, onProgress: postProgress },
						relationships
					);
				} else {
					result = await service.generateAndPopulate(
						collections,
						relationships,
						{ ...config, onProgress: postProgress }
					);
				}

				const donePayload = {
					event: "done",
					data: result,
					workerId: shard?.workerId
				};
				if (parentPort) parentPort.postMessage(donePayload);
				else if (process.send) process.send(donePayload);

			} catch (error) {
				console.error("Worker Error:", error);
				const errorPayload = {
					event: "error",
					error: error instanceof Error ? error.message : String(error),
					workerId: shard?.workerId
				};
				if (parentPort) parentPort.postMessage(errorPayload);
				else if (process.send) process.send(errorPayload);
			}
		} else if (msg.event === "start_export") {
			const {
				tempDir,
				collections,
				relationships,
				config
			} = msg.data;

			try {
				// Use the CSVExportAdapter directly
				// Dynamic import to avoid circular dep issues potential or just require
				const { CSVExportAdapter } = await import("./adapters/CSVExportAdapter");

				const adapter = new CSVExportAdapter(tempDir);
				const service = new TestDataGeneratorService(adapter);

				// Reconstruct the onProgress callback to send messages back to parent
				const generatorConfig = {
					...config,
					onProgress: async (progress: any) => {
						const payload = {
							event: "progress",
							data: progress
						};
						if (parentPort) {
							parentPort.postMessage(payload);
						} else if (process.send) {
							process.send(payload);
						}
					}
				};

				const result = await service.generateAndPopulate(
					collections,
					relationships,
					generatorConfig
				);

				// cleanup
				await adapter.disconnect();

				const files = adapter.getFilePaths();

				const donePayload = {
					event: "done",
					data: {
						success: result.success,
						files: files
					}
				};

				if (parentPort) parentPort.postMessage(donePayload);
				else if (process.send) process.send(donePayload);

			} catch (error) {
				console.error("Worker Export Error:", error);
				const errorPayload = {
					event: "error",
					error: error instanceof Error ? error.message : String(error)
				};
				if (parentPort) parentPort.postMessage(errorPayload);
				else if (process.send) process.send(errorPayload);
			}
		}
	});
}
