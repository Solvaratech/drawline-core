import { DatabaseType } from "../types/schemaDesign";
import { MongoDBHandler } from "./mongodb";
import { FirestoreHandler } from "./firestore";
import { PostgreSQLHandler } from "./postgresql";
import { encrypt, decrypt } from "./utils";

export type DatabaseHandler = MongoDBHandler | FirestoreHandler | PostgreSQLHandler;

export function createHandler(
	type: DatabaseType,
	encryptedCredentials: string,
	databaseName?: string
): DatabaseHandler {
	if (type === "mongodb") {
		return new MongoDBHandler(encryptedCredentials, databaseName);
	} else if (type === "firestore") {
		return new FirestoreHandler(encryptedCredentials);
	} else if (type === "postgresql") {
		return new PostgreSQLHandler(encryptedCredentials, databaseName);
	}
	throw new Error(`Unsupported database type: ${type}`);
}

export { MongoDBHandler, FirestoreHandler, PostgreSQLHandler };
export const encryptCredentials = encrypt;
export const decryptCredentials = decrypt;
export * from "./types";

