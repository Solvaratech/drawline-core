import { TestDataConfig } from "../../generator/types";

/**
 * Helper to generate simple test data configurations
 */
export function createBasicDataConfig(counts: Record<string, number>): TestDataConfig {
    return {
        collections: Object.entries(counts).map(([name, count]) => ({
            collectionName: name,
            count
        })),
        relationships: []
    };
}
