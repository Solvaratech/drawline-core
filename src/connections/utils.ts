import crypto from "crypto";
import { FieldTypeInfo, RelationshipFeatures } from "./types";

/**
 * Simple encryption helpers for credentials.
 */
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "default-key-change-in-production";
const ALGORITHM = "aes-256-gcm";

export function encrypt(text: string): string {
	const iv = crypto.randomBytes(16);
	const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY.padEnd(32, "0")).slice(0, 32), iv);
	let encrypted = cipher.update(text, "utf8", "hex");
	encrypted += cipher.final("hex");
	const authTag = cipher.getAuthTag();
	return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
}

export function decrypt(encryptedText: string): string {
	const [ivHex, authTagHex, encrypted] = encryptedText.split(":");
	const iv = Buffer.from(ivHex, "hex");
	const authTag = Buffer.from(authTagHex, "hex");
	const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY.padEnd(32, "0")).slice(0, 32), iv);
	decipher.setAuthTag(authTag);
	let decrypted = decipher.update(encrypted, "hex", "utf8");
	decrypted += decipher.final("utf8");
	return decrypted;
}

/**
 * Calculates Jaro-Winkler distance for string similarity.
 */
export function jaroWinklerDistance(str1: string, str2: string): number {
	const s1 = str1.toLowerCase();
	const s2 = str2.toLowerCase();

	if (s1 === s2) return 1.0;

	// Check for substring match
	if (s1.includes(s2) || s2.includes(s1)) {
		const baseScore = Math.max(s1.length, s2.length) / Math.min(s1.length, s2.length);
		return Math.min(0.85 + (1 / baseScore) * 0.15, 1.0);
	}

	// Jaro distance
	const matchWindow = Math.floor(Math.max(s1.length, s2.length) / 2) - 1;
	if (matchWindow < 0) return 0;

	const s1Matches = new Array(s1.length).fill(false);
	const s2Matches = new Array(s2.length).fill(false);

	let matches = 0;
	let transpositions = 0;

	// Find matches
	for (let i = 0; i < s1.length; i++) {
		const start = Math.max(0, i - matchWindow);
		const end = Math.min(i + matchWindow + 1, s2.length);

		for (let j = start; j < end; j++) {
			if (s2Matches[j] || s1[i] !== s2[j]) continue;
			s1Matches[i] = true;
			s2Matches[j] = true;
			matches++;
			break;
		}
	}

	if (matches === 0) return 0;

	// Find transpositions
	let k = 0;
	for (let i = 0; i < s1.length; i++) {
		if (!s1Matches[i]) continue;
		while (!s2Matches[k]) k++;
		if (s1[i] !== s2[k]) transpositions++;
		k++;
	}

	const jaro = (matches / s1.length + matches / s2.length + (matches - transpositions / 2) / matches) / 3.0;

	// Winkler modification (common prefix up to 4 chars)
	let prefix = 0;
	for (let i = 0; i < Math.min(4, Math.min(s1.length, s2.length)); i++) {
		if (s1[i] === s2[i]) prefix++;
		else break;
	}

	return jaro + (prefix * 0.1 * (1 - jaro));
}

/**
 * Normalizes field names for easier comparison.
 */
export function normalizeFieldNameForComparison(fieldName: string): { normalized: string; wasTrimmed: boolean } {
	let normalized = fieldName.toLowerCase();
	let wasTrimmed = false;

	const suffixes = ['_id', 'id', 'id_', '_key', '_fk', 'key', 'fk'];
	for (const suffix of suffixes) {
		if (normalized.endsWith(suffix)) {
			normalized = normalized.slice(0, -suffix.length);
			wasTrimmed = true;
			break;
		}
	}

	if (normalized.endsWith('s') && normalized.length > 1) {
		normalized = normalized.slice(0, -1);
	}

	return { normalized, wasTrimmed };
}

/**
 * Guesses field type from a set of sample values.
 */
export function inferFieldType(sampleValues: any[], ObjectId: any): FieldTypeInfo {
	if (sampleValues.length === 0) {
		return { primaryType: "Null", percentageOfPrimaryType: 100 };
	}

	const nonNullValues = sampleValues.filter(v => v !== null && v !== undefined);
	if (nonNullValues.length === 0) {
		return { primaryType: "Null", percentageOfPrimaryType: 100 };
	}

	const typeCounts = new Map<string, number>();
	let objectIdCount = 0;
	let stringCount = 0;
	let numberCount = 0;
	let totalLength = 0;
	let numericStringCount = 0;
	let uuidCount = 0;

	for (const value of nonNullValues) {
		let type: string;

		if (value && typeof value === "object" && ObjectId.isValid && ObjectId.isValid(value)) {
			type = "ObjectId";
			objectIdCount++;
		} else if (typeof value === "string") {
			type = "String";
			stringCount++;
			totalLength += value.length;

			if (/^-?\d+\.?\d*$/.test(value)) {
				numericStringCount++;
			}
			if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
				uuidCount++;
			}
		} else if (typeof value === "number") {
			type = "Number";
			numberCount++;
		} else if (Array.isArray(value)) {
			type = "Array";
		} else if (value instanceof Date) {
			type = "Date";
		} else {
			type = typeof value;
		}

		typeCounts.set(type, (typeCounts.get(type) || 0) + 1);
	}

	let primaryType: FieldTypeInfo["primaryType"] = "Mixed";
	let maxCount = 0;

	for (const [type, count] of typeCounts.entries()) {
		if (count > maxCount) {
			maxCount = count;
			if (type === "ObjectId") primaryType = "ObjectId";
			else if (type === "String") primaryType = "String";
			else if (type === "Number") primaryType = "Number";
		}
	}

	const percentage = (maxCount / nonNullValues.length) * 100;
	const secondaryTypes = Array.from(typeCounts.keys()).filter(t => typeCounts.get(t)! < maxCount);

	return {
		primaryType: primaryType === "Mixed" && maxCount > 0 ? "String" : primaryType,
		secondaryTypes: secondaryTypes.length > 0 ? secondaryTypes : undefined,
		percentageOfPrimaryType: percentage,
		isNumericString: numericStringCount / stringCount > 0.8,
		isUUID: uuidCount / stringCount > 0.8,
		averageLength: stringCount > 0 ? totalLength / stringCount : undefined,
	};
}

/**
 * Checks if two types are compatible.
 */
export function areTypesCompatible(fieldType: FieldTypeInfo, idType: FieldTypeInfo): { compatible: boolean; score: number } {
	if (fieldType.primaryType === "ObjectId" && idType.primaryType === "ObjectId") {
		return { compatible: true, score: 1.0 };
	}

	if (fieldType.primaryType === "String" && idType.primaryType === "String") {
		return { compatible: true, score: 1.0 };
	}

	if (fieldType.primaryType === "Number" && idType.primaryType === "Number") {
		return { compatible: true, score: 1.0 };
	}

	if (fieldType.primaryType === "String" && fieldType.isUUID && idType.primaryType === "String") {
		return { compatible: true, score: 0.95 };
	}

	if (fieldType.primaryType === "String" && fieldType.isUUID && idType.primaryType === "ObjectId") {
		return { compatible: false, score: 0.0 };
	}

	if (fieldType.primaryType === "Number" && idType.primaryType === "ObjectId") {
		return { compatible: false, score: 0.0 };
	}

	if (fieldType.primaryType === "Mixed" || fieldType.secondaryTypes) {
		return { compatible: fieldType.percentageOfPrimaryType >= 70, score: fieldType.percentageOfPrimaryType / 100 };
	}

	return { compatible: false, score: 0.0 };
}

/**
 * Determines a good sample size based on collection size.
 */
export function calculateSampleSize(collectionSize: number, maxSampleSize: number = 1000): number {
	if (collectionSize < 1000) {
		return collectionSize;
	} else if (collectionSize <= 100_000) {
		return Math.max(100, Math.floor(collectionSize * 0.01));
	} else {
		return Math.max(1000, Math.floor(collectionSize * 0.001));
	}
}

/**
 * Computes a confidence score for a relationship.
 */
export function calculateConfidenceScore(features: RelationshipFeatures): number {
	const coverage = Math.min(features.coverageRatio, 1.0);
	const similarity = features.nameSimilarityScore;
	const suffix = features.hasSuffixMatch ? 1.0 : 0.0;
	const outOfRange = 1.0 - Math.min(features.outOfRangePercentage / 100, 1.0);
	const dataType = features.dataTypeMatch ? 1.0 : 0.0;
	const cardinality = 1.0 - features.cardinalityRisk;

	const rawScore =
		(coverage * 0.40) +
		(similarity * 0.25) +
		(suffix * 0.20) +
		(outOfRange * 0.10) +
		(dataType * 0.15);

	const finalScore = rawScore * (1.0 - (features.cardinalityRisk * 0.3));

	return Math.round(finalScore * 100) / 100;
}

/**
 * Guesses if a relationship is 1:1 or 1:N.
 */
export function inferCardinality(
	fromCollectionSize: number,
	toCollectionSize: number,
	matchedCount: number,
	fieldHasArrays: boolean
): "1:1" | "1:N" | "N:M" {
	if (fieldHasArrays) return "N:M";

	const duplicateRatio = 1 - (matchedCount / toCollectionSize);
	if (duplicateRatio > 0.5) return "1:N";

	return "1:1";
}
