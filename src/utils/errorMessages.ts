/**
 * Centralized error message utility for user-friendly error handling.
 * Maps technical database/connection errors to human-readable messages.
 */

interface ErrorPattern {
	patterns: (string | RegExp)[];
	message: string;
}

const ERROR_PATTERNS: ErrorPattern[] = [
	// Connection errors
	{
		patterns: ["ECONNREFUSED", "connection refused", "connect ECONNREFUSED"],
		message: "Unable to connect to database. Please check if the server is running and accessible.",
	},
	{
		patterns: ["ETIMEDOUT", "timed out", "timeout", "serverSelectionTimeoutMS"],
		message: "Connection timed out. The database server took too long to respond.",
	},
	{
		patterns: ["ENOTFOUND", "getaddrinfo", "ENOENT", "host not found"],
		message: "Database server not found. Please check the hostname in your connection string.",
	},
	{
		patterns: ["ENETUNREACH", "network unreachable", "no route to host"],
		message: "Network error. Please check your internet connection.",
	},

	// Authentication errors
	{
		patterns: [
			"authentication failed",
			"auth failed",
			"invalid credentials",
			"bad auth",
			"password authentication failed",
			"SCRAM",
			"MongoServerError: bad auth",
		],
		message: "Database authentication failed. Please verify your username and password.",
	},
	{
		patterns: ["not authorized", "unauthorized", "permission denied", "EACCES", "access denied"],
		message: "Access denied. You don't have permission to access this database.",
	},

	// SSL/TLS errors
	{
		patterns: [
			"CERT_",
			"SSL",
			"certificate",
			"TLS",
			"unable to verify",
			"self signed",
			"UNABLE_TO_GET_ISSUER_CERT",
		],
		message: "SSL/TLS connection error. Please check your security settings or try disabling SSL verification.",
	},

	// Database-specific errors
	{
		patterns: ["too many connections", "connection limit", "max_connections"],
		message: "Database is currently busy. Please try again in a moment.",
	},
	{
		patterns: ["database does not exist", "unknown database", 'database "', "does not exist"],
		message: "Database not found. Please check the database name in your connection string.",
	},
	{
		patterns: ["collection does not exist", "table does not exist", "relation does not exist"],
		message: "The requested table or collection was not found.",
	},

	// Query/Operation errors
	{
		patterns: ["duplicate key", "unique constraint", "already exists"],
		message: "This record already exists. Please use a different value.",
	},
	{
		patterns: ["foreign key constraint", "violates foreign key"],
		message: "Cannot complete this operation because of a relationship with other data.",
	},
	{
		patterns: ["syntax error", "invalid query"],
		message: "There was an error processing your request. Please try again.",
	},

	// Invalid connection string
	{
		patterns: ["invalid connection string", "Invalid scheme", "Invalid URL", "URI malformed", "parse error"],
		message: "Invalid connection string format. Please check your connection URL.",
	},
];

/**
 * Checks if an error message matches any of the given patterns
 */
function matchesPattern(errorMessage: string, patterns: (string | RegExp)[]): boolean {
	const lowerMessage = errorMessage.toLowerCase();
	return patterns.some((pattern) => {
		if (typeof pattern === "string") {
			return lowerMessage.includes(pattern.toLowerCase());
		}
		return pattern.test(errorMessage);
	});
}


export function getFriendlyErrorMessage(error: unknown, context?: string): string {
	let rawMessage = "";
	if (error instanceof Error) {
		rawMessage = error.message;
	} else if (typeof error === "string") {
		rawMessage = error;
	} else {
		rawMessage = String(error);
	}

	for (const { patterns, message } of ERROR_PATTERNS) {
		if (matchesPattern(rawMessage, patterns)) {
			return message;
		}
	}

	if (context) {
		return `Failed to connect to ${context}. Please check your connection settings and try again.`;
	}

	return "An unexpected error occurred. Please try again.";
}

export async function withFriendlyErrors<T>(
	fn: () => Promise<T>,
	context?: string
): Promise<T> {
	try {
		return await fn();
	} catch (error) {
		throw new Error(getFriendlyErrorMessage(error, context));
	}
}
