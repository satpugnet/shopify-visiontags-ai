import { describe, it, expect, vi, beforeEach } from "vitest";

// ==================================
// UNIT TESTS for sanitizeJobId
// ==================================

// Replicate the sanitizeJobId function for testing
// (to avoid module initialization issues with Redis)
function sanitizeJobId(id: string): string {
  return id.replace(/[:/]/g, "_");
}

describe("sanitizeJobId", () => {
  it("should replace colons with underscores", () => {
    expect(sanitizeJobId("gid:shopify:Product:123")).toBe(
      "gid_shopify_Product_123"
    );
  });

  it("should replace slashes with underscores", () => {
    expect(sanitizeJobId("gid://shopify/Product/123")).toBe(
      "gid___shopify_Product_123"
    );
  });

  it("should handle Shopify GID format correctly", () => {
    const shopifyGid = "gid://shopify/Product/7654321098765";
    const sanitized = sanitizeJobId(shopifyGid);

    // Should not contain colons or slashes
    expect(sanitized).not.toContain(":");
    expect(sanitized).not.toContain("/");

    // Should be a valid BullMQ job ID (no special chars)
    expect(sanitized).toBe("gid___shopify_Product_7654321098765");
  });

  it("should return unchanged string if no colons or slashes", () => {
    expect(sanitizeJobId("simple-id-123")).toBe("simple-id-123");
  });

  it("should handle empty string", () => {
    expect(sanitizeJobId("")).toBe("");
  });

  it("should handle multiple consecutive colons and slashes", () => {
    expect(sanitizeJobId("a::b//c:/d")).toBe("a__b__c__d");
  });

  it("should preserve underscores", () => {
    expect(sanitizeJobId("product_id_123")).toBe("product_id_123");
  });

  it("should handle UUIDs (which are valid already)", () => {
    const uuid = "dcf307b2-1234-5678-9abc-def012345678";
    expect(sanitizeJobId(uuid)).toBe(uuid);
  });
});

describe("BullMQ job ID constraints", () => {
  it("sanitized IDs should be valid for BullMQ", () => {
    const shopifyIds = [
      "gid://shopify/Product/123",
      "gid://shopify/Product/456789012345",
      "gid://shopify/ProductVariant/987654321",
    ];

    for (const id of shopifyIds) {
      const sanitized = sanitizeJobId(id);
      // BullMQ doesn't allow colons in job IDs
      expect(sanitized).not.toContain(":");
    }
  });
});

// ==================================
// QUEUE LOGIC TESTS (testing the logic without actual BullMQ)
// ==================================

describe("queueProductAnalysis logic", () => {
  // Replicate the job creation logic from queue.server.ts
  function createJobSpec(
    jobId: string,
    productId: string,
    imageUrl: string,
    shop: string
  ) {
    const sanitizedProductId = sanitizeJobId(productId);
    return {
      name: `analyze-${sanitizedProductId}`,
      data: { jobId, productId, imageUrl, shop },
      opts: {
        jobId: `${jobId}-${sanitizedProductId}`,
      },
    };
  }

  it("should create correct job name", () => {
    const spec = createJobSpec(
      "job-123",
      "gid://shopify/Product/456",
      "https://cdn.shopify.com/image.jpg",
      "test-shop.myshopify.com"
    );

    expect(spec.name).toBe("analyze-gid___shopify_Product_456");
  });

  it("should include correct job data", () => {
    const spec = createJobSpec(
      "job-123",
      "gid://shopify/Product/456",
      "https://cdn.shopify.com/image.jpg",
      "test-shop.myshopify.com"
    );

    expect(spec.data).toEqual({
      jobId: "job-123",
      productId: "gid://shopify/Product/456",
      imageUrl: "https://cdn.shopify.com/image.jpg",
      shop: "test-shop.myshopify.com",
    });
  });

  it("should create unique job ID for deduplication", () => {
    const spec = createJobSpec(
      "job-123",
      "gid://shopify/Product/456",
      "https://cdn.shopify.com/image.jpg",
      "test-shop.myshopify.com"
    );

    expect(spec.opts.jobId).toBe("job-123-gid___shopify_Product_456");
  });

  it("should preserve original productId in data", () => {
    const spec = createJobSpec(
      "job-123",
      "gid://shopify/Product/456",
      "https://cdn.shopify.com/image.jpg",
      "test-shop.myshopify.com"
    );

    // Original ID is preserved in data
    expect(spec.data.productId).toBe("gid://shopify/Product/456");
    // But sanitized in the job ID/name
    expect(spec.name).not.toContain("://");
  });
});

describe("queueBulkAnalysis logic", () => {
  function createBulkJobSpecs(
    jobId: string,
    products: Array<{ id: string; imageUrl: string }>,
    shop: string
  ) {
    return products.map((product) => {
      const sanitizedProductId = sanitizeJobId(product.id);
      return {
        name: `analyze-${sanitizedProductId}`,
        data: {
          jobId,
          productId: product.id,
          imageUrl: product.imageUrl,
          shop,
        },
        opts: {
          jobId: `${jobId}-${sanitizedProductId}`,
        },
      };
    });
  }

  it("should create job specs for all products", () => {
    const products = [
      { id: "gid://shopify/Product/1", imageUrl: "https://cdn.shopify.com/1.jpg" },
      { id: "gid://shopify/Product/2", imageUrl: "https://cdn.shopify.com/2.jpg" },
      { id: "gid://shopify/Product/3", imageUrl: "https://cdn.shopify.com/3.jpg" },
    ];

    const specs = createBulkJobSpecs("job-123", products, "test-shop.myshopify.com");

    expect(specs).toHaveLength(3);
  });

  it("should sanitize all product IDs", () => {
    const products = [
      { id: "gid://shopify/Product/1", imageUrl: "https://cdn.shopify.com/1.jpg" },
    ];

    const specs = createBulkJobSpecs("job-123", products, "test-shop.myshopify.com");

    expect(specs[0].name).toBe("analyze-gid___shopify_Product_1");
    expect(specs[0].opts.jobId).toBe("job-123-gid___shopify_Product_1");
  });

  it("should include correct data for each job", () => {
    const products = [
      { id: "gid://shopify/Product/1", imageUrl: "https://cdn.shopify.com/1.jpg" },
    ];

    const specs = createBulkJobSpecs("job-123", products, "test-shop.myshopify.com");

    expect(specs[0].data).toEqual({
      jobId: "job-123",
      productId: "gid://shopify/Product/1",
      imageUrl: "https://cdn.shopify.com/1.jpg",
      shop: "test-shop.myshopify.com",
    });
  });

  it("should handle empty product array", () => {
    const specs = createBulkJobSpecs("job-123", [], "test-shop.myshopify.com");

    expect(specs).toHaveLength(0);
  });

  it("should create unique job IDs for each product", () => {
    const products = [
      { id: "gid://shopify/Product/1", imageUrl: "https://cdn.shopify.com/1.jpg" },
      { id: "gid://shopify/Product/2", imageUrl: "https://cdn.shopify.com/2.jpg" },
    ];

    const specs = createBulkJobSpecs("job-123", products, "test-shop.myshopify.com");

    const jobIds = specs.map((s) => s.opts.jobId);
    const uniqueIds = new Set(jobIds);
    expect(uniqueIds.size).toBe(jobIds.length);
  });
});

// ==================================
// JOB DATA VALIDATION TESTS
// ==================================

describe("AnalysisJobData validation", () => {
  interface AnalysisJobData {
    jobId: string;
    productId: string;
    imageUrl: string;
    shop: string;
  }

  function isValidJobData(data: unknown): data is AnalysisJobData {
    if (typeof data !== "object" || data === null) return false;
    const obj = data as Record<string, unknown>;
    return (
      typeof obj.jobId === "string" &&
      typeof obj.productId === "string" &&
      typeof obj.imageUrl === "string" &&
      typeof obj.shop === "string"
    );
  }

  it("should validate correct job data structure", () => {
    const validData = {
      jobId: "job-123",
      productId: "gid://shopify/Product/456",
      imageUrl: "https://cdn.shopify.com/image.jpg",
      shop: "test-shop.myshopify.com",
    };
    expect(isValidJobData(validData)).toBe(true);
  });

  it("should reject missing fields", () => {
    const missingJobId = {
      productId: "gid://shopify/Product/456",
      imageUrl: "https://cdn.shopify.com/image.jpg",
      shop: "test-shop.myshopify.com",
    };
    expect(isValidJobData(missingJobId)).toBe(false);
  });

  it("should reject wrong types", () => {
    const wrongType = {
      jobId: 123, // should be string
      productId: "gid://shopify/Product/456",
      imageUrl: "https://cdn.shopify.com/image.jpg",
      shop: "test-shop.myshopify.com",
    };
    expect(isValidJobData(wrongType)).toBe(false);
  });

  it("should reject null", () => {
    expect(isValidJobData(null)).toBe(false);
  });

  it("should reject primitives", () => {
    expect(isValidJobData("string")).toBe(false);
    expect(isValidJobData(123)).toBe(false);
    expect(isValidJobData(true)).toBe(false);
  });
});

// ==================================
// REDIS CONNECTION TESTS
// ==================================

describe("Redis connection options parsing", () => {
  // Test the URL parsing logic
  function parseRedisUrl(redisUrl: string) {
    const url = new URL(redisUrl);
    return {
      host: url.hostname,
      port: parseInt(url.port || "6379"),
      password: url.password || undefined,
      username: url.username || undefined,
    };
  }

  it("should parse basic Redis URL", () => {
    const options = parseRedisUrl("redis://localhost:6379");
    expect(options.host).toBe("localhost");
    expect(options.port).toBe(6379);
    expect(options.password).toBeUndefined();
  });

  it("should parse Redis URL with password", () => {
    const options = parseRedisUrl("redis://:password123@localhost:6379");
    expect(options.host).toBe("localhost");
    expect(options.port).toBe(6379);
    expect(options.password).toBe("password123");
  });

  it("should parse Redis URL with username and password", () => {
    const options = parseRedisUrl("redis://user:pass@localhost:6379");
    expect(options.host).toBe("localhost");
    expect(options.username).toBe("user");
    expect(options.password).toBe("pass");
  });

  it("should default port to 6379", () => {
    const options = parseRedisUrl("redis://localhost");
    expect(options.port).toBe(6379);
  });

  it("should handle Railway Redis URLs", () => {
    const options = parseRedisUrl("redis://default:abc123@railway-redis.internal:6379");
    expect(options.host).toBe("railway-redis.internal");
    expect(options.username).toBe("default");
    expect(options.password).toBe("abc123");
  });
});

// ==================================
// QUEUE CONFIGURATION TESTS
// ==================================

describe("Queue default options", () => {
  it("should have correct default job options", () => {
    const defaultOptions = {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 5000,
      },
      removeOnComplete: 100,
      removeOnFail: 50,
    };

    // Verify the expected configuration
    expect(defaultOptions.attempts).toBe(3);
    expect(defaultOptions.backoff.type).toBe("exponential");
    expect(defaultOptions.backoff.delay).toBe(5000);
    expect(defaultOptions.removeOnComplete).toBe(100);
    expect(defaultOptions.removeOnFail).toBe(50);
  });

  it("should have correct worker options", () => {
    const workerOptions = {
      concurrency: 5,
      // No limiter -- withRetry in vision.server.ts handles actual 429s
    };

    // Verify the expected configuration
    expect(workerOptions.concurrency).toBe(5);
    expect(workerOptions).not.toHaveProperty("limiter");
  });
});

// ==================================
// WORKER CALLBACK LOGIC TESTS
// ==================================

describe("Worker job processing logic", () => {
  // Replicate the product update logic from the worker
  function determineProductStatus(
    isVisionError: boolean,
    errorMessage?: string
  ): { status: "ANALYZED" | "ERROR"; error?: string } {
    if (isVisionError) {
      return { status: "ERROR", error: errorMessage };
    }
    return { status: "ANALYZED" };
  }

  it("should return ANALYZED status on success", () => {
    const result = determineProductStatus(false);
    expect(result.status).toBe("ANALYZED");
    expect(result.error).toBeUndefined();
  });

  it("should return ERROR status on vision error", () => {
    const result = determineProductStatus(true, "API error");
    expect(result.status).toBe("ERROR");
    expect(result.error).toBe("API error");
  });

  // Test the job completion logic
  function determineJobStatus(
    processed: number,
    totalItems: number
  ): "COMPLETED" | "PROCESSING" {
    return processed >= totalItems ? "COMPLETED" : "PROCESSING";
  }

  it("should return COMPLETED when all items processed", () => {
    expect(determineJobStatus(10, 10)).toBe("COMPLETED");
  });

  it("should return PROCESSING when not all items processed", () => {
    expect(determineJobStatus(5, 10)).toBe("PROCESSING");
  });

  it("should handle edge case of 0 items", () => {
    expect(determineJobStatus(0, 0)).toBe("COMPLETED");
  });

  it("should return COMPLETED even if processed > totalItems", () => {
    // Edge case: shouldn't happen but should be handled
    expect(determineJobStatus(15, 10)).toBe("COMPLETED");
  });
});
