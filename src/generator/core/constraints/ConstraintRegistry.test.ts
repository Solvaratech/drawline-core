import { describe, it, expect, beforeEach } from "vitest";
import {
  ConstraintRegistry,
  createDefaultRegistry,
  createRangeValidator,
  createStringLengthValidator,
  createPatternValidator,
  createEnumValidator,
  createEmailValidator,
  createUrlValidator,
  createCrossColumnValidator,
  createSumOfValidator,
  createRatioOfValidator,
  createPercentageOfValidator,
  createConditionalValidator,
} from "./index";

describe("ConstraintRegistry", () => {
  let registry: ConstraintRegistry;

  beforeEach(() => {
    registry = createDefaultRegistry();
  });

  describe("basic operations", () => {
    it("should register and retrieve validators", () => {
      const validator = createRangeValidator("price", { min: 0, max: 100 });
      registry.register("price:range", validator);

      expect(registry.has("price:range")).toBe(true);
      expect(registry.getValidator("price:range")).toBe(validator);
    });

    it("should unregister validators", () => {
      const validator = createRangeValidator("price", { min: 0, max: 100 });
      registry.register("price:range", validator);

      expect(registry.unregister("price:range")).toBe(true);
      expect(registry.has("price:range")).toBe(false);
    });

    it("should register field constraints", () => {
      const validator = createEmailValidator("email");
      registry.registerFieldConstraint("email", validator);

      const fieldConstraints = registry.getFieldConstraints("email");
      expect(fieldConstraints).toHaveLength(1);
      expect(fieldConstraints[0]).toBe(validator);
    });

    it("should register document constraints", () => {
      const validator = {
        metadata: {
          name: "doc:total",
          type: "cross_column" as const,
          severity: "error" as const,
        },
        validate: () => ({ valid: true }),
      };
      registry.registerDocumentConstraint(validator);

      const docConstraints = registry.getDocumentConstraints();
      expect(docConstraints).toHaveLength(1);
    });

    it("should clone registry", () => {
      const validator = createRangeValidator("price", { min: 0, max: 100 });
      registry.register("price:range", validator);

      const cloned = registry.clone();
      expect(cloned.has("price:range")).toBe(true);
      expect(cloned.getValidator("price:range")).toBe(validator);
    });

    it("should clear registry", () => {
      const validator = createRangeValidator("price", { min: 0, max: 100 });
      registry.register("price:range", validator);
      registry.registerFieldConstraint("email", createEmailValidator("email"));

      registry.clear();

      expect(registry.has("price:range")).toBe(false);
      expect(registry.getFieldConstraints("email")).toHaveLength(0);
    });

    it("should return correct stats", () => {
      registry.register("v1", { metadata: { name: "v1", type: "field_validation", severity: "error" }, validate: () => ({ valid: true }) });
      registry.register("v2", { metadata: { name: "v2", type: "field_validation", severity: "error" }, validate: () => ({ valid: true }) });
      registry.registerFieldConstraint("f1", { metadata: { name: "f1", type: "field_validation", severity: "error" }, validate: () => ({ valid: true }) });

      const stats = registry.getStats();
      expect(stats.totalValidators).toBe(2);
      expect(stats.fieldConstraints).toBe(1);
    });
  });

  describe("validateDocument", () => {
    it("should validate document with field constraints", () => {
      const validator = createRangeValidator("price", { min: 0, max: 100 });
      registry.register("price:range", validator);
      registry.registerFieldConstraint("price", validator);

      const document = { price: 50 };
      const results = registry.validateDocument(document);

      expect(results).toHaveLength(0);
    });

    it("should detect invalid field values", () => {
      const validator = createRangeValidator("price", { min: 0, max: 100 });
      registry.registerFieldConstraint("price", validator);

      const document = { price: 150 };
      const results = registry.validateDocument(document);

      expect(results).toHaveLength(1);
      expect(results[0].valid).toBe(false);
      expect(results[0].fieldName).toBe("price");
    });

    it("should validate multiple fields", () => {
      const priceValidator = createRangeValidator("price", { min: 0, max: 100 });
      const quantityValidator = createRangeValidator("quantity", { min: 1, max: 1000 });

      registry.registerFieldConstraint("price", priceValidator);
      registry.registerFieldConstraint("quantity", quantityValidator);

      const document = { price: 50, quantity: 500 };
      const results = registry.validateDocument(document);

      expect(results).toHaveLength(0);
    });

    it("should report all violations in strict mode", () => {
      const priceValidator = createRangeValidator("price", { min: 0, max: 100 });
      const quantityValidator = createRangeValidator("quantity", { min: 1, max: 1000 });

      registry.registerFieldConstraint("price", priceValidator);
      registry.registerFieldConstraint("quantity", quantityValidator);

      const document = { price: 150, quantity: 2000 };
      const results = registry.validateDocument(document);

      expect(results).toHaveLength(2);
    });
  });

  describe("validateBatch", () => {
    it("should validate batch of documents", () => {
      const validator = createRangeValidator("price", { min: 0, max: 100 });
      registry.registerFieldConstraint("price", validator);

      const documents = [
        { price: 50 },
        { price: 75 },
        { price: 25 },
      ];

      const report = registry.validateBatch(documents);
      expect(report.totalViolations).toBe(0);
      expect(report.documentsWithViolations).toBe(0);
    });

    it("should detect violations in batch", () => {
      const validator = createRangeValidator("price", { min: 0, max: 100 });
      registry.registerFieldConstraint("price", validator);

      const documents = [
        { price: 50 },
        { price: 150 },
        { price: 200 },
      ];

      const report = registry.validateBatch(documents);
      expect(report.totalViolations).toBe(2);
      expect(report.documentsWithViolations).toBe(2);
    });

    it("should track execution time", () => {
      const documents = [{ price: 50 }, { price: 75 }];
      const report = registry.validateBatch(documents);
      expect(report.executionTimeMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe("fromSchemaFields", () => {
    it("should create constraints from schema fields", () => {
      const fields = [
        { name: "status", type: "string", constraints: { enum: ["active", "inactive", "pending"] } },
        { name: "price", type: "number", constraints: { min: 0, max: 1000 } },
        { name: "name", type: "string", constraints: { pattern: "^[A-Z].*" } },
      ];

      registry.fromSchemaFields(fields);

      expect(registry.has("status:enum")).toBe(true);
      expect(registry.has("price:range")).toBe(true);
      expect(registry.has("name:pattern")).toBe(true);
    });

    it("should validate enum constraints", () => {
      const fields = [
        { name: "status", type: "string", constraints: { enum: ["active", "inactive"] } },
      ];

      registry.fromSchemaFields(fields);

      const validDoc = { status: "active" };
      const invalidDoc = { status: "deleted" };

      expect(registry.validateDocument(validDoc)).toHaveLength(0);
      expect(registry.validateDocument(invalidDoc as any)).toHaveLength(1);
    });
  });
});

describe("Field Validators", () => {
  describe("createRangeValidator", () => {
    it("should validate values within range", () => {
      const validator = createRangeValidator("price", { min: 0, max: 100 });
      const result = validator.validate(50, { document: {}, random: () => 0.5 });

      expect(result.valid).toBe(true);
    });

    it("should reject values below minimum", () => {
      const validator = createRangeValidator("price", { min: 0, max: 100 });
      const result = validator.validate(-10, { document: {}, random: () => 0.5 });

      expect(result.valid).toBe(false);
      expect(result.retryable).toBe(true);
    });

    it("should reject values above maximum", () => {
      const validator = createRangeValidator("price", { min: 0, max: 100 });
      const result = validator.validate(150, { document: {}, random: () => 0.5 });

      expect(result.valid).toBe(false);
    });

    it("should handle exclusive bounds", () => {
      const validator = createRangeValidator("price", { min: 0, max: 100, inclusive: false });
      const result = validator.validate(0, { document: {}, random: () => 0.5 });

      expect(result.valid).toBe(false);
    });
  });

  describe("createStringLengthValidator", () => {
    it("should validate string length", () => {
      const validator = createStringLengthValidator("name", { minLength: 3, maxLength: 10 });
      const result = validator.validate("John", { document: {}, random: () => 0.5 });

      expect(result.valid).toBe(true);
    });

    it("should reject short strings", () => {
      const validator = createStringLengthValidator("name", { minLength: 5 });
      const result = validator.validate("Jo", { document: {}, random: () => 0.5 });

      expect(result.valid).toBe(false);
    });

    it("should reject long strings", () => {
      const validator = createStringLengthValidator("name", { maxLength: 5 });
      const result = validator.validate("Jonathan", { document: {}, random: () => 0.5 });

      expect(result.valid).toBe(false);
    });
  });

  describe("createPatternValidator", () => {
    it("should validate matching pattern", () => {
      const validator = createPatternValidator("code", /^[A-Z]{3}$/);
      const result = validator.validate("ABC", { document: {}, random: () => 0.5 });

      expect(result.valid).toBe(true);
    });

    it("should reject non-matching pattern", () => {
      const validator = createPatternValidator("code", /^[A-Z]{3}$/);
      const result = validator.validate("abc", { document: {}, random: () => 0.5 });

      expect(result.valid).toBe(false);
    });
  });

  describe("createEnumValidator", () => {
    it("should validate enum values", () => {
      const validator = createEnumValidator("status", ["active", "inactive", "pending"]);
      const result = validator.validate("active", { document: {}, random: () => 0.5 });

      expect(result.valid).toBe(true);
    });

    it("should reject invalid enum values", () => {
      const validator = createEnumValidator("status", ["active", "inactive", "pending"]);
      const result = validator.validate("deleted" as "active", { document: {}, random: () => 0.5 });

      expect(result.valid).toBe(false);
      expect(result.retryable).toBe(false);
    });
  });

  describe("createEmailValidator", () => {
    it("should validate valid emails", () => {
      const validator = createEmailValidator("email");
      const result = validator.validate("test@example.com", { document: {}, random: () => 0.5 });

      expect(result.valid).toBe(true);
    });

    it("should reject invalid emails", () => {
      const validator = createEmailValidator("email");
      const result = validator.validate("invalid-email", { document: {}, random: () => 0.5 });

      expect(result.valid).toBe(false);
    });
  });

  describe("createUrlValidator", () => {
    it("should validate valid URLs", () => {
      const validator = createUrlValidator("url");
      const result = validator.validate("https://example.com", { document: {}, random: () => 0.5 });

      expect(result.valid).toBe(true);
    });

    it("should reject invalid URLs", () => {
      const validator = createUrlValidator("url");
      const result = validator.validate("not-a-url", { document: {}, random: () => 0.5 });

      expect(result.valid).toBe(false);
    });
  });
});

describe("Cross-Column Validators", () => {
  describe("createCrossColumnValidator", () => {
    it("should validate greater than", () => {
      const validator = createCrossColumnValidator("discount", {
        sourceField: "discount",
        targetField: "price",
        operator: "lt",
      });

      const result = validator.validate(50, { document: { price: 100, discount: 50 }, random: () => 0.5 });
      expect(result.valid).toBe(true);
    });

    it("should reject when constraint violated", () => {
      const validator = createCrossColumnValidator("discount", {
        sourceField: "discount",
        targetField: "price",
        operator: "lt",
      });

      const result = validator.validate(150, { document: { price: 100, discount: 150 }, random: () => 0.5 });
      expect(result.valid).toBe(false);
    });
  });

  describe("createSumOfValidator", () => {
    it("should validate sum constraints", () => {
      const validator = createSumOfValidator("total", {
        targetFields: ["subtotal", "tax"],
        sumField: "total",
      });

      const result = validator.validate(120, {
        document: { subtotal: 100, tax: 20, total: 120 },
        random: () => 0.5,
      });

      expect(result.valid).toBe(true);
    });

    it("should reject incorrect sums", () => {
      const validator = createSumOfValidator("total", {
        targetFields: ["subtotal", "tax"],
        sumField: "total",
      });

      const result = validator.validate(100, {
        document: { subtotal: 100, tax: 20, total: 100 },
        random: () => 0.5,
      });

      expect(result.valid).toBe(false);
    });
  });

  describe("createRatioOfValidator", () => {
    it("should validate ratio constraints", () => {
      const validator = createRatioOfValidator("ratio", {
        numeratorField: "width",
        denominatorField: "height",
        targetRatio: 2,
        tolerance: 0.1,
      });

      const result = validator.validate(100, {
        document: { width: 200, height: 100, ratio: 100 },
        random: () => 0.5,
      });

      expect(result.valid).toBe(true);
    });
  });

  describe("createPercentageOfValidator", () => {
    it("should validate percentage constraints", () => {
      const validator = createPercentageOfValidator("percentage", {
        partField: "tax",
        wholeField: "total",
        targetPercentage: 20,
        tolerance: 1,
      });

      const result = validator.validate(20, {
        document: { total: 100, tax: 20, percentage: 20 },
        random: () => 0.5,
      });

      expect(result.valid).toBe(true);
    });
  });

  describe("createConditionalValidator", () => {
    it("should apply then constraint when condition is met", () => {
      const validator = createConditionalValidator("discount", {
        conditionField: "type",
        conditionOperator: "eq",
        conditionValue: "premium",
        thenField: "discount",
        thenConstraint: (value) => ({
          valid: typeof value === "number" && value > 0,
          errorMessage: "Premium customers must have discount > 0",
        }),
      });

      const result = validator.validate(10, {
        document: { type: "premium", discount: 10 },
        random: () => 0.5,
      });

      expect(result.valid).toBe(true);
    });

    it("should skip constraint when condition is not met", () => {
      const validator = createConditionalValidator("discount", {
        conditionField: "type",
        conditionOperator: "eq",
        conditionValue: "premium",
        thenField: "discount",
        thenConstraint: () => ({ valid: false, errorMessage: "Should not apply" }),
      });

      const result = validator.validate(0, {
        document: { type: "basic", discount: 0 },
        random: () => 0.5,
      });

      expect(result.valid).toBe(true);
    });
  });
});

describe("Integration Scenarios", () => {
  let registry: ConstraintRegistry;

  beforeEach(() => {
    registry = createDefaultRegistry();
  });

  it("should validate order with multiple constraints", () => {
    registry.registerFieldConstraint("subtotal", createRangeValidator("subtotal", { min: 0 }));
    registry.registerFieldConstraint("tax", createRangeValidator("tax", { min: 0 }));
    registry.registerFieldConstraint("total", createSumOfValidator("total", {
      targetFields: ["subtotal", "tax"],
      sumField: "total",
    }));
    registry.registerFieldConstraint("discount", createCrossColumnValidator("discount", {
      sourceField: "discount",
      targetField: "total",
      operator: "lt",
    }));

    const validOrder = {
      subtotal: 100,
      tax: 10,
      total: 110,
      discount: 20,
    };

    const results = registry.validateDocument(validOrder);
    expect(results).toHaveLength(0);
  });

  it("should detect multiple constraint violations in one document", () => {
    registry.registerFieldConstraint("price", createRangeValidator("price", { min: 0, max: 100 }));
    registry.registerFieldConstraint("quantity", createRangeValidator("quantity", { min: 1, max: 100 }));

    const invalidOrder = {
      price: 200,
      quantity: -5,
    };

    const results = registry.validateDocument(invalidOrder);
    expect(results.length).toBeGreaterThanOrEqual(2);
  });

  it("should handle complex business rules", () => {
    registry.registerFieldConstraint("status", createEnumValidator("status", ["draft", "pending", "approved", "rejected"]));
    registry.registerFieldConstraint("approved_at", createConditionalValidator("approved_at", {
      conditionField: "status",
      conditionOperator: "eq",
      conditionValue: "approved",
      thenField: "approved_at",
      thenConstraint: (value) => ({
        valid: value !== null && value !== undefined,
        errorMessage: "Approved documents must have approved_at",
      }),
      elseConstraint: (value) => ({
        valid: value === null || value === undefined,
        errorMessage: "Non-approved documents should not have approved_at",
      }),
    }));

    const approvedDoc = { status: "approved", approved_at: new Date() };
    const draftDoc = { status: "draft", approved_at: null };

    expect(registry.validateDocument(approvedDoc)).toHaveLength(0);
    expect(registry.validateDocument(draftDoc)).toHaveLength(0);
  });
});
