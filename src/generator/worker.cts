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
				config
			} = msg.data;

			try {
				const adapter = TestDataGeneratorService.createAdapter(
					connectionType as DatabaseType,
					encryptedCredentials,
					decryptCredentials,
					databaseName
				);

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

				const donePayload = {
					event: "done",
					data: result
				};
				if (parentPort) parentPort.postMessage(donePayload);
				else if (process.send) process.send(donePayload);

			} catch (error) {
				console.error("Worker Error:", error);
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
