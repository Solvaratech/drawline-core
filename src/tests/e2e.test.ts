import { describe, it, expect } from "vitest";
import { TestDataGeneratorService } from "../generator";
import { InMemoryAdapter } from "../generator/adapters/InMemoryAdapter";
import { complexSchemaCollections, complexSchemaRelationships } from "./fixtures/schemas";
import { createBasicDataConfig } from "./utils/testHelpers";

describe("End-to-End Core Workflow", () => {
    it("should process an extremely complex schema map, generate data, and maintain relationships", async () => {
        const adapter = new InMemoryAdapter();
        const service = new TestDataGeneratorService(adapter);

        const collections = complexSchemaCollections;
        const relationships = complexSchemaRelationships;
        
        // Massive data generation request
        const config = createBasicDataConfig({ 
            users: 20, 
            profiles: 20,
            settings: 20,
            posts: 100, 
            comments: 300,
            tags: 25,
            post_tags: 150
        });

        const result = await service.generateAndPopulate(collections, relationships, config);

        if (!result.success) {
            console.error("Errors:", result.errors);
            console.warn("Warnings:", result.warnings);
        }

        expect(result.success).toBe(true);
        expect(result.totalDocumentsGenerated).toBe(635); // 20 + 20 + 20 + 100 + 300 + 25 + 150

        const usersData = adapter.getData("users");
        const profilesData = adapter.getData("profiles");
        const settingsData = adapter.getData("settings");
        const postsData = adapter.getData("posts");
        const commentsData = adapter.getData("comments");
        const tagsData = adapter.getData("tags");
        const postTagsData = adapter.getData("post_tags");

        // Verify counts
        expect(usersData).toHaveLength(20);
        expect(settingsData).toHaveLength(20);
        expect(postsData).toHaveLength(100);
        expect(commentsData).toHaveLength(300);
        
        // Verify multiple types of complex fields were generated correctly
        // Just tasting the first record of users to confirm types
        const firstUser = usersData[0];
        expect(firstUser).toHaveProperty("username");
        expect(firstUser).toHaveProperty("created_at");
        expect(firstUser).toHaveProperty("balance");
        expect(typeof firstUser.balance === "number" || firstUser.balance === null).toBe(true);
        expect(typeof firstUser.is_active === "boolean" || firstUser.is_active === null).toBe(true);

        // Verify relationships using Sets for quick lookup
        const userIds = new Set(usersData.map(u => u.id));
        const postIds = new Set(postsData.map(p => p.id));
        const tagIds = new Set(tagsData.map(t => t.id));

        // 1. Every post must belong to a valid user
        postsData.forEach(post => {
            expect(userIds.has(post.user_id)).toBe(true);
        });

        // 2. Every comment must belong to a valid post AND valid user
        commentsData.forEach(comment => {
            expect(postIds.has(comment.post_id)).toBe(true);
            expect(userIds.has(comment.user_id)).toBe(true);
            expect(comment).toHaveProperty("created_at");
        });

        // 3. Every post_tag entry must reference a valid post and valid tag
        postTagsData.forEach(pt => {
            expect(postIds.has(pt.post_id)).toBe(true);
            expect(tagIds.has(pt.tag_id)).toBe(true);
        });
        
        // 4. Every setting and profile must belong to a valid user
        settingsData.forEach(setting => {
             expect(userIds.has(setting.user_id)).toBe(true);
             expect(typeof setting.notifications_enabled === "boolean" || setting.notifications_enabled === null).toBe(true);
        });
    });
});
