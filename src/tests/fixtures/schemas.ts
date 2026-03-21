import { SchemaCollection, SchemaRelationship } from "../../types/schemaDesign";

// ---------------------------------------------------------------------------
// 1. Collections
// ---------------------------------------------------------------------------

export const usersCollection: SchemaCollection = {
    id: "users",
    name: "users",
    fields: [
        { id: "u1", name: "id", type: "integer", isPrimaryKey: true },
        { id: "u2", name: "username", type: "string" },
        { id: "u3", name: "email", type: "string" },
        { id: "u4", name: "is_active", type: "boolean" },
        { id: "u5", name: "created_at", type: "timestamp" },
        { id: "u6", name: "balance", type: "float" }
    ],
    position: { x: 0, y: 0 }
};

export const profilesCollection: SchemaCollection = {
    id: "profiles",
    name: "profiles",
    fields: [
        { id: "pr1", name: "id", type: "integer", isPrimaryKey: true },
        { id: "pr2", name: "user_id", type: "integer", isForeignKey: true, referencedCollectionId: "users" },
        { id: "pr3", name: "description", type: "string" },
        { id: "pr4", name: "avatar_url", type: "string" }
    ],
    position: { x: 300, y: 0 }
};

export const settingsCollection: SchemaCollection = {
    id: "settings",
    name: "settings",
    fields: [
        { id: "s1", name: "id", type: "integer", isPrimaryKey: true },
        { id: "s2", name: "user_id", type: "integer", isForeignKey: true, referencedCollectionId: "users" },
        { id: "s3", name: "theme", type: "string" },
        { id: "s4", name: "notifications_enabled", type: "boolean" }
    ],
    position: { x: -300, y: 0 }
};

export const postsCollection: SchemaCollection = {
    id: "posts",
    name: "posts",
    fields: [
        { id: "p1", name: "id", type: "integer", isPrimaryKey: true },
        { id: "p2", name: "title", type: "string" },
        { id: "p3", name: "body", type: "string" },
        { id: "p4", name: "user_id", type: "integer", isForeignKey: true, referencedCollectionId: "users" },
        { id: "p5", name: "status", type: "string" },
        { id: "p6", name: "views", type: "integer" },
        { id: "p7", name: "published_at", type: "timestamp" }
    ],
    position: { x: 0, y: 300 }
};

export const commentsCollection: SchemaCollection = {
    id: "comments",
    name: "comments",
    fields: [
        { id: "c1", name: "id", type: "integer", isPrimaryKey: true },
        { id: "c2", name: "post_id", type: "integer", isForeignKey: true, referencedCollectionId: "posts" },
        { id: "c3", name: "user_id", type: "integer", isForeignKey: true, referencedCollectionId: "users" },
        { id: "c4", name: "content", type: "string" },
        { id: "c5", name: "created_at", type: "timestamp" }
    ],
    position: { x: 300, y: 300 }
};

export const tagsCollection: SchemaCollection = {
    id: "tags",
    name: "tags",
    fields: [
        { id: "t1", name: "id", type: "integer", isPrimaryKey: true },
        { id: "t2", name: "name", type: "string" }
    ],
    position: { x: 0, y: 600 }
};

export const postTagsCollection: SchemaCollection = {
    id: "post_tags",
    name: "post_tags",
    fields: [
        { id: "pt1", name: "post_id", type: "integer", isForeignKey: true, referencedCollectionId: "posts" },
        { id: "pt2", name: "tag_id", type: "integer", isForeignKey: true, referencedCollectionId: "tags" }
    ],
    position: { x: 300, y: 600 }
};

// ---------------------------------------------------------------------------
// 2. Relationships
// ---------------------------------------------------------------------------

export const complexSchemaRelationships: SchemaRelationship[] = [
    {
        id: "rel_profile_user",
        fromCollectionId: "profiles",
        toCollectionId: "users",
        fromField: "user_id",
        toField: "id",
        type: "one-to-one"
    },
    {
        id: "rel_settings_user",
        fromCollectionId: "settings",
        toCollectionId: "users",
        fromField: "user_id",
        toField: "id",
        type: "one-to-one"
    },
    {
        id: "rel_post_user",
        fromCollectionId: "posts",
        toCollectionId: "users",
        fromField: "user_id",
        toField: "id",
        type: "many-to-one"
    },
    {
        id: "rel_comment_post",
        fromCollectionId: "comments",
        toCollectionId: "posts",
        fromField: "post_id",
        toField: "id",
        type: "many-to-one"
    },
    {
        id: "rel_comment_user",
        fromCollectionId: "comments",
        toCollectionId: "users",
        fromField: "user_id",
        toField: "id",
        type: "many-to-one"
    },
    {
        id: "rel_post_tags_post",
        fromCollectionId: "post_tags",
        toCollectionId: "posts",
        fromField: "post_id",
        toField: "id",
        type: "many-to-one"
    },
    {
        id: "rel_post_tags_tag",
        fromCollectionId: "post_tags",
        toCollectionId: "tags",
        fromField: "tag_id",
        toField: "id",
        type: "many-to-one"
    }
];

export const complexSchemaCollections: SchemaCollection[] = [
    usersCollection,
    profilesCollection,
    settingsCollection,
    postsCollection,
    commentsCollection,
    tagsCollection,
    postTagsCollection
];
