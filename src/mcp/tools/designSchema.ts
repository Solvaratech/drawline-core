import { z } from "zod";
import { SchemaCollection, SchemaField, FieldType, DatabaseType } from "../../types/schemaDesign";

// ── Input schema ──────────────────────────────────────────────────────────────

export const DesignSchemaInput = {
  entities: z
    .array(z.object({
      name: z.string().describe("Collection / table name (snake_case recommended)"),
      fields: z
        .array(z.object({
          name: z.string(),
          type: z.string().describe(
            "Field type: string | integer | number | boolean | date | timestamp | uuid | " +
            "json | array | object | geopoint | email (alias) | url (alias)"
          ),
          required: z.boolean().optional().default(false),
          is_primary_key: z.boolean().optional().default(false),
          is_foreign_key: z.boolean().optional().default(false),
          references: z.string().optional().describe("Target collection name if foreign key"),
          unique: z.boolean().optional(),
          enum: z.array(z.string()).optional().describe("Allowed values"),
          max_length: z.number().int().optional(),
          min: z.number().optional(),
          max: z.number().optional(),
          default_value: z.any().optional(),
          description: z.string().optional(),
        }))
        .optional()
        .default([])
        .describe("Field definitions. If omitted, sensible defaults are generated"),
      add_standard_fields: z
        .boolean()
        .optional()
        .default(true)
        .describe("Auto-add id, created_at, updated_at if not present"),
    }))
    .describe("List of entities / collections to define"),
  relationships: z
    .array(z.object({
      from_collection: z.string(),
      to_collection: z.string(),
      type: z.enum(["one-to-one", "one-to-many", "many-to-one", "many-to-many"]),
      from_field: z.string().optional().describe("FK field on from_collection (auto-derived if omitted)"),
    }))
    .optional()
    .default([]),
  database_type: z
    .enum(["postgresql", "mongodb", "mysql", "sqlite", "firestore", "dynamodb", "csv"] as const)
    .optional()
    .default("postgresql")
    .describe("Target database — influences id type and naming conventions"),
};

// ── Type helpers ──────────────────────────────────────────────────────────────

type FieldTypeAlias =
  | "email" | "url" | "phone" | "text" | "varchar" | "char"
  | "int" | "bigint" | "long" | "double" | "real" | "float" | "decimal"
  | "bool" | "datetime" | "timestamptz" | "time"
  | "json" | "jsonb" | "uuid" | "objectid";

const TYPE_ALIAS_MAP: Record<FieldTypeAlias, FieldType> = {
  email: "string", url: "string", phone: "string", text: "string",
  varchar: "string", char: "string",
  int: "integer", bigint: "long", long: "long",
  double: "number", real: "float", float: "float", decimal: "decimal",
  bool: "boolean",
  datetime: "timestamp", timestamptz: "timestamptz", time: "string",
  json: "json", jsonb: "json",
  uuid: "uuid", objectid: "objectid",
};

const VALID_TYPES = new Set<FieldType>([
  "string","integer","number","boolean","date","object","array","reference",
  "null","undefined","objectid","binary","timestamp","long","decimal","float",
  "regex","symbol","map","set","uuid","json","geopoint","bytes","timestamptz",
]);

function resolveType(raw: string): FieldType {
  const t = raw.toLowerCase().trim() as FieldTypeAlias;
  if (VALID_TYPES.has(t as FieldType)) return t as FieldType;
  return TYPE_ALIAS_MAP[t] ?? "string";
}

function idType(dbType: string): FieldType {
  if (dbType === "mongodb") return "objectid";
  if (dbType === "firestore") return "string";
  return "uuid";
}

function makeStandardFields(collectionName: string, dbType: string): SchemaField[] {
  return [
    {
      id: `${collectionName}-id`,
      name: "id",
      type: idType(dbType),
      required: true,
      isPrimaryKey: true,
    },
    {
      id: `${collectionName}-created_at`,
      name: "created_at",
      type: "timestamp",
      required: true,
      defaultValue: "CURRENT_TIMESTAMP",
    },
    {
      id: `${collectionName}-updated_at`,
      name: "updated_at",
      type: "timestamp",
      required: true,
      defaultValue: "CURRENT_TIMESTAMP",
    },
  ];
}

// ── Main handler ──────────────────────────────────────────────────────────────

export function handleDesignSchema(args: {
  entities: Array<{
    name: string;
    fields?: Array<{
      name: string;
      type: string;
      required?: boolean;
      is_primary_key?: boolean;
      is_foreign_key?: boolean;
      references?: string;
      unique?: boolean;
      enum?: string[];
      max_length?: number;
      min?: number;
      max?: number;
      default_value?: unknown;
      description?: string;
    }>;
    add_standard_fields?: boolean;
  }>;
  relationships?: Array<{
    from_collection: string;
    to_collection: string;
    type: "one-to-one" | "one-to-many" | "many-to-one" | "many-to-many";
    from_field?: string;
  }>;
  database_type?: string;
}): string {
  const dbType = args.database_type ?? "postgresql";
  const collections: SchemaCollection[] = [];
  const entityMap = new Map<string, SchemaCollection>();

  for (const entity of args.entities) {
    const name = entity.name.toLowerCase().replace(/\s+/g, "_");
    const addStd = entity.add_standard_fields !== false;

    // Build user-defined fields
    const userFields: SchemaField[] = (entity.fields ?? []).map((f, idx) => {
      const field: SchemaField = {
        id: `${name}-${f.name}`,
        name: f.name,
        type: resolveType(f.type),
        required: f.required ?? false,
        isPrimaryKey: f.is_primary_key ?? false,
        isForeignKey: f.is_foreign_key ?? false,
        description: f.description,
        defaultValue: f.default_value,
      };

      if (f.unique || f.enum || f.max_length || f.min !== undefined || f.max !== undefined) {
        field.constraints = {
          ...(f.unique ? { unique: true } : {}),
          ...(f.enum ? { enum: f.enum } : {}),
          ...(f.max_length ? { maxLength: f.max_length } : {}),
          ...(f.min !== undefined ? { min: f.min } : {}),
          ...(f.max !== undefined ? { max: f.max } : {}),
        };
      }

      if (f.references) {
        field.isForeignKey = true;
        field.referencedCollectionId = f.references;
        field.foreignKeyTarget = "id";
      }

      return field;
    });

    // Standard fields: inject only if absent and requested
    let fields: SchemaField[] = [...userFields];
    if (addStd) {
      const stdFields = makeStandardFields(name, dbType);
      for (const std of stdFields) {
        const alreadyExists = fields.some(
          f => f.name === std.name || (std.isPrimaryKey && f.isPrimaryKey)
        );
        if (!alreadyExists) {
          // Prepend id, append created_at / updated_at
          if (std.isPrimaryKey) fields = [std, ...fields];
          else fields.push(std);
        }
      }
    }

    const col: SchemaCollection = {
      id: name,
      name,
      fields,
      position: { x: 0, y: 0 },
    };

    collections.push(col);
    entityMap.set(name, col);
  }

  // Add FK fields from relationships
  const relationships = args.relationships ?? [];
  for (const rel of relationships) {
    const fromName = rel.from_collection.toLowerCase().replace(/\s+/g, "_");
    const toName = rel.to_collection.toLowerCase().replace(/\s+/g, "_");
    const fromCol = entityMap.get(fromName);
    const toCol = entityMap.get(toName);

    if (!fromCol || !toCol) continue;

    const fkFieldName = rel.from_field ?? `${toName}_id`;
    // Deduplicate: skip injection if any of these is already true:
    //  a) a field with the exact derived name exists
    //  b) a FK field already references the same target collection (covers the case
    //     where the user explicitly defined user_id with references:"users" and also
    //     added a relationship orders→users — we should not inject a second users_id)
    const alreadyHasFK = fromCol.fields.some(
      f => f.name === fkFieldName ||
           (f.isForeignKey && f.referencedCollectionId === toName)
    );

    if (!alreadyHasFK && rel.type !== "many-to-many") {
      fromCol.fields.push({
        id: `${fromName}-${fkFieldName}`,
        name: fkFieldName,
        type: idType(dbType),
        required: rel.type === "many-to-one",
        isForeignKey: true,
        referencedCollectionId: toName,
        foreignKeyTarget: "id",
      });
    }
  }

  const output = {
    schema: collections,
    relationships: relationships.map(r => ({
      id: `rel-${r.from_collection}-${r.to_collection}`,
      fromCollectionId: r.from_collection.toLowerCase().replace(/\s+/g, "_"),
      toCollectionId: r.to_collection.toLowerCase().replace(/\s+/g, "_"),
      type: r.type,
      fromField: r.from_field ?? `${r.to_collection.toLowerCase().replace(/\s+/g, "_")}_id`,
      toField: "id",
    })),
    summary: {
      collections: collections.length,
      totalFields: collections.reduce((s, c) => s + c.fields.length, 0),
      relationships: relationships.length,
      database_type: dbType,
    },
  };

  return JSON.stringify(output, null, 2);
}
