
const DEBUG = typeof process !== "undefined" && process.env?.DRAWLINE_DEBUG === "true";

export const logger = {
	log: (prefix: string, ...args: unknown[]) => {
		if (DEBUG) {
			console.log(`[Drawline] [${prefix}]`, ...args);
		}
	},
	warn: (prefix: string, ...args: unknown[]) => {
		if (DEBUG) {
			console.warn(`[Drawline] [${prefix}]`, ...args);
		}
	},
	error: (prefix: string, ...args: unknown[]) => {
		if (DEBUG) {
			console.error(`[Drawline] [${prefix}]`, ...args);
		}
	},
};
