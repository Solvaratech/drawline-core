import { describe, it, expect } from "vitest";
import { createTemporalValidator } from "./temporalValidators";
import { createMutuallyExclusiveValidator } from "./crossColumnValidators";

describe("New Constraint Validators", () => {
  describe("createTemporalValidator", () => {
    it("should validate 'before' constraint", () => {
      const validator = createTemporalValidator("createdAt", {
        operator: "before",
        targetField: "expiresAt"
      });
      
      const beforeDate = new Date("2023-01-01");
      const afterDate = new Date("2023-12-31");
      
      const result = validator.validate(beforeDate, {
        document: { createdAt: beforeDate, expiresAt: afterDate },
        random: () => 0.5
      });
      
      expect(result.valid).toBe(true);
      
      const invalidResult = validator.validate(afterDate, {
        document: { createdAt: afterDate, expiresAt: beforeDate },
        random: () => 0.5
      });
      expect(invalidResult.valid).toBe(false);
    });

    it("should validate 'after' constraint", () => {
      const validator = createTemporalValidator("updatedAt", {
        operator: "after",
        targetField: "createdAt"
      });
      
      const createdAt = new Date("2023-01-01");
      const updatedAt = new Date("2023-01-02");
      
      const result = validator.validate(updatedAt, {
        document: { createdAt, updatedAt },
        random: () => 0.5
      });
      
      expect(result.valid).toBe(true);
    });

    it("should validate 'within_days' constraint", () => {
      const validator = createTemporalValidator("endDate", {
        operator: "within_days",
        targetField: "startDate",
        value: 30
      });
      
      const startDate = new Date("2023-01-01");
      const validEndDate = new Date("2023-01-15");
      const invalidEndDate = new Date("2023-02-15");
      
      expect(validator.validate(validEndDate, {
        document: { startDate, endDate: validEndDate },
        random: () => 0.5
      }).valid).toBe(true);
      
      expect(validator.validate(invalidEndDate, {
        document: { startDate, endDate: invalidEndDate },
        random: () => 0.5
      }).valid).toBe(false);
    });

    it("should validate 'older_than' constraint", () => {
      const validator = createTemporalValidator("birthDate", {
        operator: "older_than",
        value: 18
      });
      
      const now = new Date();
      const eighteenYearsAgo = new Date(now.getFullYear() - 18, now.getMonth(), now.getDate());
      const twentyYearsAgo = new Date(now.getFullYear() - 20, now.getMonth(), now.getDate());
      const tenYearsAgo = new Date(now.getFullYear() - 10, now.getMonth(), now.getDate());
      
      expect(validator.validate(twentyYearsAgo, {
        document: { birthDate: twentyYearsAgo },
        random: () => 0.5
      }).valid).toBe(true);
      
      expect(validator.validate(tenYearsAgo, {
        document: { birthDate: tenYearsAgo },
        random: () => 0.5
      }).valid).toBe(false);
    });
  });

  describe("createMutuallyExclusiveValidator", () => {
    it("should validate that only one field is set", () => {
      const validator = createMutuallyExclusiveValidator("fieldA", ["fieldA", "fieldB", "fieldC"]);
      
      // Case 1: Only fieldA is set
      expect(validator.validate("val", {
        document: { fieldA: "val" },
        random: () => 0.5
      }).valid).toBe(true);
      
      // Case 2: fieldA and fieldB are set
      expect(validator.validate("val", {
        document: { fieldA: "val", fieldB: "val2" },
        random: () => 0.5
      }).valid).toBe(false);
      
      // Case 3: None are set (fieldA is undefined)
      expect(validator.validate(undefined, {
        document: {},
        random: () => 0.5
      }).valid).toBe(true);
    });
  });
});
