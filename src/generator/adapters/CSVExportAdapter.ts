import { BaseAdapter, CollectionDetails } from "./BaseAdapter";
import { GeneratedDocument } from "../types";
import { SchemaField } from "../../types/schemaDesign";
import * as fs from "fs";
import * as path from "path";

export class CSVExportAdapter extends BaseAdapter {
	private tempDir: string;
	private fileStreams: Map<string, number> = new Map(); // Map collection name to file descriptor
	private headersWritten: Set<string> = new Set();
	private createdFiles: Set<string> = new Set(); // Track created files separately
	private separator: string = ",";

	constructor(tempDir: string) {
		super();
		this.tempDir = tempDir;
		if (!fs.existsSync(this.tempDir)) {
			fs.mkdirSync(this.tempDir, { recursive: true });
		}
	}

	async connect(): Promise<void> {
		// No-op
	}

	async disconnect(): Promise<void> {
		// Close all open file descriptors
		for (const fd of this.fileStreams.values()) {
			try {
				fs.closeSync(fd);
			} catch (e) {
				console.error("Error closing CSV file descriptor:", e);
			}
		}
		this.fileStreams.clear();
	}

	async ensureCollection(collectionName: string, schema?: SchemaField[], skipForeignKeys?: boolean): Promise<void> {
		const filePath = path.join(this.tempDir, `${collectionName}.csv`);

		if (!this.fileStreams.has(collectionName)) {
			// Open file for appending
			const fd = fs.openSync(filePath, "w"); // 'w' to Create/Truncate
			this.fileStreams.set(collectionName, fd);
			this.createdFiles.add(collectionName);
		}

		if (schema && !this.headersWritten.has(collectionName)) {
			// Write header
			const header = schema.map(f => f.name).join(this.separator);
			fs.writeSync(this.fileStreams.get(collectionName)!, header + "\n");
			this.headersWritten.add(collectionName);
		}
	}

	async insertDocuments(
		collectionName: string,
		documents: GeneratedDocument[],
		batchSize?: number,
		allowedReferenceFields?: Set<string>,
		schema?: SchemaField[]
	): Promise<(string | number)[]> {
		if (documents.length === 0) return [];

		// Ensure file is open
		if (!this.fileStreams.has(collectionName)) {
			await this.ensureCollection(collectionName, schema);
		}

		const fd = this.fileStreams.get(collectionName)!;
		const ids: (string | number)[] = [];

		// If header not written yet (and we have documents to infer from or schema passed late)
		if (!this.headersWritten.has(collectionName)) {
			let headers: string[] = [];
			if (schema) {
				headers = schema.map(f => f.name);
			} else {
				headers = Object.keys(documents[0].data);
			}
			fs.writeSync(fd, headers.join(this.separator) + "\n");
			this.headersWritten.add(collectionName);
		}

		// Use a buffer for batch writing to minimize I/O calls
		let buffer = "";
		let headers: string[] = [];

		// Get headers again to match order
		if (schema) {
			headers = schema.map(f => f.name);
		} else {
			// Fallback: This is risky if docs have different keys, ideally we rely on schema.
			// But since headers are already written, we must follow that order?
			// For simplicity, we assume schema or first doc keys were used.
			// We need to know the header order to map values correctly.
			// Ideally we store the header order.
			// But let's just grab keys from first doc if we don't have schema tracking.
			headers = Object.keys(documents[0].data);
		}

		for (const doc of documents) {
			ids.push(doc.id);

			const row = headers.map(field => {
				const val = doc.data[field];
				return this.formatCSVValue(val);
			});

			buffer += row.join(this.separator) + "\n";
		}

		fs.writeSync(fd, buffer);

		return ids;
	}

	async clearCollection(collectionName: string): Promise<void> {
		// Not typically used in export
	}

	async collectionExists(collectionName: string): Promise<boolean> {
		return true;
	}

	async getCollectionDetails(collectionName: string): Promise<CollectionDetails> {
		return {
			primaryKey: 'id',
			primaryKeyType: 'string'
		};
	}

	async getDocumentCount(collectionName: string): Promise<number> {
		return 0; // Not critical for export
	}

	async validateReference(
		collectionName: string,
		fieldName: string,
		value: unknown
	): Promise<boolean> {
		return true;
	}

	async addForeignKeyConstraints(collectionName: string, schema: SchemaField[]): Promise<void> {
		// No-op
	}

	// Helper to format CSV values
	private formatCSVValue(val: any): string {
		if (val === null || val === undefined) return "";

		let str;
		if (val instanceof Date) {
			str = val.toISOString();
		} else if (typeof val === 'object') {
			str = JSON.stringify(val);
		} else {
			str = String(val);
		}

		// Escape quotes and wrap in quotes if contains comma, newline or quotes
		if (str.includes(this.separator) || str.includes('"') || str.includes("\n") || str.includes("\r")) {
			return `"${str.replace(/"/g, '""')}"`;
		}
		return str;
	}

	/**
	 * Get paths to all generated CSV files
	 */
	public getFilePaths(): Record<string, string> {
		const files: Record<string, string> = {};
		for (const name of this.createdFiles) {
			files[`${name}.csv`] = path.join(this.tempDir, `${name}.csv`);
		}
		return files;
	}
}
