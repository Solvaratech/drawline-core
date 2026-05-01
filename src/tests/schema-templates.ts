import { SchemaDesign } from "../types/schemaDesign";

export const SCHEMA_TEMPLATES: Record<string, SchemaDesign> = {
	ecommerce: {
		version: 1,
		collections: [
			{
				id: "users", name: "users", position: { x: 0, y: 0 },
				fields: [
					{ id: "u1", name: "id", type: "integer", isPrimaryKey: true },
					{ id: "u2", name: "full_name", type: "string" },
					{ id: "u3", name: "email", type: "string" },
					{ id: "u4", name: "address", type: "string" }
				]
			},
			{
				id: "products", name: "products", position: { x: 250, y: 0 },
				fields: [
					{ id: "p1", name: "id", type: "integer", isPrimaryKey: true },
					{ id: "p2", name: "product_name", type: "string" },
					{ id: "p3", name: "brand", type: "string" },
					{ id: "p4", name: "price", type: "float" }
				]
			},
			{
				id: "orders", name: "orders", position: { x: 125, y: 200 },
				fields: [
					{ id: "o1", name: "id", type: "integer", isPrimaryKey: true },
					{ id: "o2", name: "user_id", type: "integer", isForeignKey: true, referencedCollectionId: "users" },
					{ id: "o3", name: "order_status", type: "string" },
					{ id: "o4", name: "total_amount", type: "float" },
					{ id: "o5", name: "created_at", type: "date" }
				]
			}
		],
		relationships: [
			{ id: "r1", fromCollectionId: "orders", toCollectionId: "users", type: "many-to-one", fromField: "user_id", toField: "id" }
		]
	},
	ott_streaming: {
		version: 1,
		collections: [
			{
				id: "profiles", name: "profiles", position: { x: 0, y: 0 },
				fields: [
					{ id: "pr1", name: "id", type: "integer", isPrimaryKey: true },
					{ id: "pr2", name: "profile_name", type: "string" },
					{ id: "pr3", name: "age", type: "integer" }
				]
			},
			{
				id: "movies", name: "movies", position: { x: 300, y: 0 },
				fields: [
					{ id: "m1", name: "id", type: "integer", isPrimaryKey: true },
					{ id: "m2", name: "title", type: "string" },
					{ id: "m3", name: "genre", type: "string" },
					{ id: "m4", name: "release_year", type: "integer" }
				]
			},
			{
				id: "watch_history", name: "watch_history", position: { x: 150, y: 250 },
				fields: [
					{ id: "w1", name: "id", type: "integer", isPrimaryKey: true },
					{ id: "w2", name: "profile_id", type: "integer", isForeignKey: true, referencedCollectionId: "profiles" },
					{ id: "w3", name: "movie_id", type: "integer", isForeignKey: true, referencedCollectionId: "movies" },
					{ id: "w4", name: "watched_duration", type: "integer" }
				]
			}
		],
		relationships: [
			{ id: "r1", fromCollectionId: "watch_history", toCollectionId: "profiles", type: "many-to-one", fromField: "profile_id", toField: "id" },
			{ id: "r2", fromCollectionId: "watch_history", toCollectionId: "movies", type: "many-to-one", fromField: "movie_id", toField: "id" }
		]
	},
	social_media: {
		version: 1,
		collections: [
			{
				id: "users", name: "users", position: { x: 0, y: 0 },
				fields: [
					{ id: "u1", name: "id", type: "integer", isPrimaryKey: true },
					{ id: "u2", name: "username", type: "string" },
					{ id: "u3", name: "bio", type: "string" }
				]
			},
			{
				id: "posts", name: "posts", position: { x: 300, y: 0 },
				fields: [
					{ id: "p1", name: "id", type: "integer", isPrimaryKey: true },
					{ id: "p2", name: "author_id", type: "integer", isForeignKey: true, referencedCollectionId: "users" },
					{ id: "p3", name: "content", type: "string" },
					{ id: "p4", name: "hashtag", type: "string" }
				]
			},
			{
				id: "comments", name: "comments", position: { x: 150, y: 250 },
				fields: [
					{ id: "c1", name: "id", type: "integer", isPrimaryKey: true },
					{ id: "c2", name: "post_id", type: "integer", isForeignKey: true, referencedCollectionId: "posts" },
					{ id: "c3", name: "user_id", type: "integer", isForeignKey: true, referencedCollectionId: "users" },
					{ id: "c4", name: "comment_text", type: "string" }
				]
			}
		],
		relationships: [
			{ id: "r1", fromCollectionId: "posts", toCollectionId: "users", type: "many-to-one", fromField: "author_id", toField: "id" },
			{ id: "r2", fromCollectionId: "comments", toCollectionId: "posts", type: "many-to-one", fromField: "post_id", toField: "id" }
		]
	},
	fintech: {
		version: 1,
		collections: [
			{
				id: "customers", name: "customers", position: { x: 0, y: 0 },
				fields: [
					{ id: "c1", name: "id", type: "integer", isPrimaryKey: true },
					{ id: "c2", name: "full_name", type: "string" },
					{ id: "c3", name: "pan_card", type: "string" },
					{ id: "c4", name: "bank_name", type: "string" }
				]
			},
			{
				id: "transactions", name: "transactions", position: { x: 300, y: 0 },
				fields: [
					{ id: "t1", name: "id", type: "integer", isPrimaryKey: true },
					{ id: "t2", name: "customer_id", type: "integer", isForeignKey: true, referencedCollectionId: "customers" },
					{ id: "t3", name: "amount", type: "float" },
					{ id: "t4", name: "transaction_type", type: "string" },
					{ id: "t5", name: "currency", type: "string" }
				]
			}
		],
		relationships: [
			{ id: "r1", fromCollectionId: "transactions", toCollectionId: "customers", type: "many-to-one", fromField: "customer_id", toField: "id" }
		]
	},
	healthcare: {
		version: 1,
		collections: [
			{
				id: "doctors", name: "doctors", position: { x: 0, y: 0 },
				fields: [
					{ id: "d1", name: "id", type: "integer", isPrimaryKey: true },
					{ id: "d2", name: "full_name", type: "string" },
					{ id: "d3", name: "medical_specialty", type: "string" }
				]
			},
			{
				id: "patients", name: "patients", position: { x: 300, y: 0 },
				fields: [
					{ id: "pa1", name: "id", type: "integer", isPrimaryKey: true },
					{ id: "pa2", name: "full_name", type: "string" },
					{ id: "pa3", name: "age", type: "integer" }
				]
			},
			{
				id: "appointments", name: "appointments", position: { x: 150, y: 250 },
				fields: [
					{ id: "a1", name: "id", type: "integer", isPrimaryKey: true },
					{ id: "a2", name: "doctor_id", type: "integer", isForeignKey: true, referencedCollectionId: "doctors" },
					{ id: "a3", name: "patient_id", type: "integer", isForeignKey: true, referencedCollectionId: "patients" },
					{ id: "a4", name: "vital_type", type: "string" },
					{ id: "a5", name: "appointment_date", type: "date" }
				]
			}
		],
		relationships: [
			{ id: "r1", fromCollectionId: "appointments", toCollectionId: "doctors", type: "many-to-one", fromField: "doctor_id", toField: "id" },
			{ id: "r2", fromCollectionId: "appointments", toCollectionId: "patients", type: "many-to-one", fromField: "patient_id", toField: "id" }
		]
	},
	logistics: {
		version: 1,
		collections: [
			{
				id: "carriers", name: "carriers", position: { x: 0, y: 0 },
				fields: [
					{ id: "cr1", name: "id", type: "integer", isPrimaryKey: true },
					{ id: "cr2", name: "carrier_name", type: "string" },
					{ id: "cr3", name: "hq_country", type: "string" }
				]
			},
			{
				id: "shipments", name: "shipments", position: { x: 300, y: 0 },
				fields: [
					{ id: "sh1", name: "id", type: "integer", isPrimaryKey: true },
					{ id: "sh2", name: "carrier_id", type: "integer", isForeignKey: true, referencedCollectionId: "carriers" },
					{ id: "sh3", name: "origin_state", type: "string" },
					{ id: "sh4", name: "destination_state", type: "string" },
					{ id: "sh5", name: "weight_unit", type: "string" }
				]
			}
		],
		relationships: [
			{ id: "r1", fromCollectionId: "shipments", toCollectionId: "carriers", type: "many-to-one", fromField: "carrier_id", toField: "id" }
		]
	},
	education_lms: {
		version: 1,
		collections: [
			{
				id: "courses", name: "courses", position: { x: 0, y: 0 },
				fields: [
					{ id: "co1", name: "id", type: "integer", isPrimaryKey: true },
					{ id: "co2", name: "course_name", type: "string" },
					{ id: "co3", name: "subject", type: "string" }
				]
			},
			{
				id: "students", name: "students", position: { x: 300, y: 0 },
				fields: [
					{ id: "st1", name: "id", type: "integer", isPrimaryKey: true },
					{ id: "st2", name: "full_name", type: "string" },
					{ id: "st3", name: "university", type: "string" }
				]
			},
			{
				id: "enrollments", name: "enrollments", position: { x: 150, y: 250 },
				fields: [
					{ id: "en1", name: "id", type: "integer", isPrimaryKey: true },
					{ id: "en2", name: "course_id", type: "integer", isForeignKey: true, referencedCollectionId: "courses" },
					{ id: "en3", name: "student_id", type: "integer", isForeignKey: true, referencedCollectionId: "students" }
				]
			}
		],
		relationships: [
			{ id: "r1", fromCollectionId: "enrollments", toCollectionId: "courses", type: "many-to-one", fromField: "course_id", toField: "id" },
			{ id: "r2", fromCollectionId: "enrollments", toCollectionId: "students", type: "many-to-one", fromField: "student_id", toField: "id" }
		]
	},
	aviation: {
		version: 1,
		collections: [
			{
				id: "airlines", name: "airlines", position: { x: 0, y: 0 },
				fields: [
					{ id: "al1", name: "id", type: "integer", isPrimaryKey: true },
					{ id: "al2", name: "airline_name", type: "string" },
					{ id: "al3", name: "hq_country", type: "string" }
				]
			},
			{
				id: "flights", name: "flights", position: { x: 300, y: 0 },
				fields: [
					{ id: "fl1", name: "id", type: "integer", isPrimaryKey: true },
					{ id: "fl2", name: "airline_id", type: "integer", isForeignKey: true, referencedCollectionId: "airlines" },
					{ id: "fl3", name: "flight_number", type: "string" },
					{ id: "fl4", name: "flight_status", type: "string" }
				]
			}
		],
		relationships: [
			{ id: "r1", fromCollectionId: "flights", toCollectionId: "airlines", type: "many-to-one", fromField: "airline_id", toField: "id" }
		]
	},
	real_estate: {
		version: 1,
		collections: [
			{
				id: "agents", name: "agents", position: { x: 0, y: 0 },
				fields: [
					{ id: "ag1", name: "id", type: "integer", isPrimaryKey: true },
					{ id: "ag2", name: "full_name", type: "string" },
					{ id: "ag3", name: "company", type: "string" }
				]
			},
			{
				id: "properties", name: "properties", position: { x: 300, y: 0 },
				fields: [
					{ id: "pr1", name: "id", type: "integer", isPrimaryKey: true },
					{ id: "pr2", name: "agent_id", type: "integer", isForeignKey: true, referencedCollectionId: "agents" },
					{ id: "pr3", name: "property_type", type: "string" },
					{ id: "pr4", name: "price", type: "float" },
					{ id: "pr5", name: "state", type: "string" }
				]
			}
		],
		relationships: [
			{ id: "r1", fromCollectionId: "properties", toCollectionId: "agents", type: "many-to-one", fromField: "agent_id", toField: "id" }
		]
	},
	government: {
		version: 1,
		collections: [
			{
				id: "citizens", name: "citizens", position: { x: 0, y: 0 },
				fields: [
					{ id: "ci1", name: "id", type: "integer", isPrimaryKey: true },
					{ id: "ci2", name: "full_name", type: "string" },
					{ id: "ci3", name: "aadhaar", type: "string" },
					{ id: "ci4", name: "state", type: "string" }
				]
			},
			{
				id: "applications", name: "applications", position: { x: 300, y: 0 },
				fields: [
					{ id: "ap1", name: "id", type: "integer", isPrimaryKey: true },
					{ id: "ap2", name: "citizen_id", type: "integer", isForeignKey: true, referencedCollectionId: "citizens" },
					{ id: "ap3", name: "ministry", type: "string" },
					{ id: "ap4", name: "status", type: "string" }
				]
			}
		],
		relationships: [
			{ id: "r1", fromCollectionId: "applications", toCollectionId: "citizens", type: "many-to-one", fromField: "citizen_id", toField: "id" }
		]
	},
	media_entertainment: {
		version: 1,
		collections: [
			{
				id: "creators", name: "creators", position: { x: 0, y: 0 },
				fields: [
					{ id: "cr1", name: "id", type: "integer", isPrimaryKey: true },
					{ id: "cr2", name: "full_name", type: "string" },
					{ id: "cr3", name: "social_platform", type: "string" }
				]
			},
			{
				id: "content", name: "content", position: { x: 300, y: 0 },
				fields: [
					{ id: "co1", name: "id", type: "integer", isPrimaryKey: true },
					{ id: "co2", name: "creator_id", type: "integer", isForeignKey: true, referencedCollectionId: "creators" },
					{ id: "co3", name: "genre", type: "string" },
					{ id: "co4", name: "resolution", type: "string" }
				]
			}
		],
		relationships: [
			{ id: "r1", fromCollectionId: "content", toCollectionId: "creators", type: "many-to-one", fromField: "creator_id", toField: "id" }
		]
	}
};
