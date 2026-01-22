import { SchemaField, FieldType } from "../types/schemaDesign";
import { logger } from "./logger";

export function convertSchemaToFields(schema: Record<string, unknown>, depth: number = 0): SchemaField[] {
	if (depth > 5) return [];

	if (typeof schema === "string") {
		try {
			schema = JSON.parse(schema);
		} catch (e) {
			logger.error("SchemaConverter", "Failed to parse schema string:", e);
			return [];
		}
	}

	if (Array.isArray(schema)) {
		return schema.map((item: any, index: number) => {
			if (typeof item === "object" && item !== null && "name" in item && "type" in item) {
				return {
					...item,
					id: item.id || `field-${item.name}-${Date.now()}-${Math.random()}`,
				} as SchemaField;
			}
			return {
				id: `field-unknown-${index}-${Date.now()}`,
				name: item?.name || ((typeof item === 'string') ? item : `Field ${index + 1}`),
				type: (item?.type as FieldType) || "string",
			};
		});
	}

	const fields: SchemaField[] = [];
	for (const [fieldName, fieldInfo] of Object.entries(schema)) {
		if (fieldName === "_subcollections" || fieldName === "_subcollectionsInfo") continue;

		let fieldValue = fieldInfo;
		if (typeof fieldInfo === "object" && fieldInfo !== null && "type" in fieldInfo) {
			fieldValue = (fieldInfo as any).type || fieldInfo;
		}

		const field: SchemaField = {
			id: `field-${fieldName}`,
			name: fieldName,
			type: "string" as FieldType,
		};

		const isNumericKey = /^\d+$/.test(fieldName);
		if (isNumericKey) {
			if (typeof fieldValue === 'string') {
				const knownTypes = ['string', 'number', 'boolean', 'integer', 'double', 'float', 'decimal', 'timestamp', 'date', 'geopoint', 'map', 'array', 'list', 'set', 'null', 'undefined', 'reference', 'objectid', 'uuid', 'json'];
				if (!knownTypes.includes(fieldValue.toLowerCase())) {
					field.name = fieldValue;
				}
			} else if (typeof fieldValue === 'object' && fieldValue !== null) {
				if ('name' in fieldValue && typeof (fieldValue as any).name === 'string') {
					field.name = (fieldValue as any).name;
				}
			}
		}

		if (typeof fieldInfo === "object" && fieldInfo !== null) {
			if ("referencedCollectionId" in fieldInfo) {
				field.referencedCollectionId = (fieldInfo as any).referencedCollectionId;
			}
			if ("isPrimaryKey" in fieldInfo) {
				field.isPrimaryKey = (fieldInfo as any).isPrimaryKey;
			}
			if ("isForeignKey" in fieldInfo) {
				field.isForeignKey = (fieldInfo as any).isForeignKey;
			}
			if ("isUnique" in fieldInfo) {
				const isUnique = (fieldInfo as any).isUnique;
				if (isUnique) {
					field.constraints = { ...field.constraints, unique: true };
				}
			}
			if ("nullable" in fieldInfo) {
				field.nullable = (fieldInfo as any).nullable;
				if (field.nullable === false) {
					field.required = true;
				}
			}
			if ("rawType" in fieldInfo) {
				field.rawType = (fieldInfo as any).rawType;
			}
			if ("isSerial" in fieldInfo) {
				field.isSerial = (fieldInfo as any).isSerial;
			}
			if ("foreignKeyTarget" in fieldInfo) {
				field.foreignKeyTarget = (fieldInfo as any).foreignKeyTarget;
			}
		}

		if (field.name === "_id") {
			field.type = "objectid";
			field.constraints = { ...field.constraints, unique: true };
			fields.push(field);
			continue;
		}

		if (fieldValue === null || fieldValue === undefined) {
			field.type = "null";
		} else if (typeof fieldValue === "string") {
			const explicitTypes = ['timestamp', 'geopoint', 'reference', 'documentid', 'number', 'integer', 'boolean', 'double', 'float', 'map', 'array', 'null', 'json', 'objectid'];
			if (explicitTypes.includes(fieldValue.toLowerCase())) {
				field.type = fieldValue.toLowerCase() as FieldType;
			}
			else if (/^\d{4}-\d{2}-\d{2}T/.test(fieldValue) ||
				(['createdat', 'updatedat', 'created_at', 'updated_at', 'timestamp'].includes(field.name.toLowerCase()))) {
				field.type = "timestamp" as FieldType;
			}
			else {
				field.type = "string";
			}
		} else if (typeof fieldValue === "number") {
			field.type = Number.isInteger(fieldValue) ? "integer" : "number";
		} else if (typeof fieldValue === "boolean") {
			field.type = "boolean";
		} else if (fieldValue instanceof Date) {
			field.type = "timestamp" as FieldType;
		} else if (Array.isArray(fieldValue)) {
			field.type = "array";
			if (fieldValue.length > 0) {
				const itemType = typeof fieldValue[0];
				if (itemType === "string") field.arrayItemType = "string";
				else if (itemType === "number") field.arrayItemType = Number.isInteger(fieldValue[0]) ? "integer" : "number";
				else if (itemType === "boolean") field.arrayItemType = "boolean";
				else if (itemType === "object") field.arrayItemType = "object";
				else field.arrayItemType = "string";
			}
		} else if (typeof fieldValue === "object") {
			const keys = Object.keys(fieldValue as object);

			if ('_seconds' in (fieldValue as any) && '_nanoseconds' in (fieldValue as any)) {
				field.type = "timestamp" as FieldType;
			}
			else if ('latitude' in (fieldValue as any) && 'longitude' in (fieldValue as any) && keys.length === 2) {
				field.type = "geopoint" as FieldType;
			}
			else if (('firestore' in (fieldValue as any) && 'path' in (fieldValue as any)) ||
				('path' in (fieldValue as any) && typeof (fieldValue as any).path === 'string' && (fieldValue as any).path.includes('/'))) {
				field.type = "reference" as FieldType;
			}
			else {
				field.type = "object";
				const objectFields = convertSchemaToFields(fieldValue as Record<string, unknown>, depth + 1);
				if (objectFields.length > 0) {
					field.objectFields = objectFields;
				}
			}
		}

		fields.push(field);
	}
	fields.sort((a, b) => {
		if (a.name === "_id") return -1;
		if (b.name === "_id") return 1;
		return a.name.localeCompare(b.name);
	});

	return fields;
}

