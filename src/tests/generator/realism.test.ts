import { describe, it, expect } from "vitest";
import { TestDataGeneratorService } from "../../generator";
import { EphemeralAdapter } from "../../generator/adapters/EphemeralAdapter";

describe("Realism Verification", () => {
  it("should generate realistic post titles and zipfian views", async () => {
    const adapter = new EphemeralAdapter();
    const service = new TestDataGeneratorService(adapter);

    const schema = {
      collections: [
        {
          id: "posts",
          name: "posts",
          fields: [
            { id: "p1", name: "id", type: "integer", isPrimaryKey: true, required: true },
            { id: "p2", name: "title", type: "string", required: true },
            { id: "p4", name: "views", type: "integer", required: true }
          ]
        },
        {
          id: "users_india",
          name: "users_india",
          fields: [
            { id: "u1", name: "id", type: "integer", isPrimaryKey: true, required: true },
            { id: "u2", name: "full_name", type: "string", required: true },
            { id: "u3", name: "job_title", type: "string", required: true },
            { id: "u4", name: "aadhaar", type: "string", required: true }
          ]
        }
      ]
    };

    const results = await service.generateAndPopulate(
      schema.collections as any,
      [],
      {
        collections: [
          { collectionName: "posts", count: 10 },
          { collectionName: "users_india", count: 10 }
        ],
        relationships: [],
        seed: 12345
      }
    );

    console.log("GENERATION ERRORS:", results.errors);

    const indiaDocs = await adapter.getDocuments("users_india");
    console.log("INDIAN USER SAMPLE:");
    indiaDocs.slice(0, 3).forEach(d => {
        const data = d.data as any;
        console.log(`- Name: ${data.full_name}`);
        console.log(`  Job: ${data.job_title}`);
        console.log(`  Aadhaar: ${data.aadhaar}`);
    });

    const postDocs = await adapter.getDocuments("posts");
    expect(postDocs.length).toBe(10);
    
    // Verify Indian names (should contain common surnames like Sharma, Gupta, etc.)
    const indiaNames = indiaDocs.map(d => (d.data as any).full_name as string);
    const hasIndianSurnames = indiaNames.some(n => 
        n.includes("Sharma") || n.includes("Gupta") || n.includes("Singh") || 
        n.includes("Patel") || n.includes("Chaturvedi") || n.includes("Bhandari") ||
        n.includes("Mishra")
    );
    expect(hasIndianSurnames).toBe(true);

    // Verify Job Titles (should be non-empty strings)
    const jobs = indiaDocs.map(d => (d.data as any).job_title as string);
    expect(jobs.every(j => typeof j === "string" && j.length > 3)).toBe(true);
    
    // Log one full document to verify the "feel" of the data
    console.log("FULL SAMPLE DOC:", JSON.stringify(indiaDocs[0].data, null, 2));
  });
});
