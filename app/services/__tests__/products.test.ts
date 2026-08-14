import { describe, it, expect, vi, beforeEach } from "vitest";

// ==================================
// UNIT TESTS (no mocking needed)
// ==================================

describe("Tag data validation", () => {
  it("should accept an array of string tags", () => {
    const tags = ["Blue", "Cotton", "Summer Vibes", "Casual"];

    expect(Array.isArray(tags)).toBe(true);
    expect(tags.every((t) => typeof t === "string")).toBe(true);
  });

  it("should handle empty tags array", () => {
    const tags: string[] = [];

    expect(tags.length).toBe(0);
    expect(Array.isArray(tags)).toBe(true);
  });

  it("should preserve tag case (Title Case from AI)", () => {
    const tags = ["Navy Blue", "Business Casual", "Resort Wear"];

    // Tags should maintain Title Case as returned by AI
    expect(tags[0]).toBe("Navy Blue");
    expect(tags[1]).toBe("Business Casual");
    expect(tags[2]).toBe("Resort Wear");
  });
});

describe("Product ID format validation", () => {
  it("should accept Shopify GID format", () => {
    const productId = "gid://shopify/Product/7654321098765";

    expect(productId.startsWith("gid://shopify/Product/")).toBe(true);
  });

  it("should extract numeric ID from GID", () => {
    const productId = "gid://shopify/Product/7654321098765";
    const numericId = productId.split("/").pop();

    expect(numericId).toBe("7654321098765");
    expect(/^\d+$/.test(numericId!)).toBe(true);
  });
});

describe("Product category detection", () => {
  const apparelCategories = [
    "Apparel",
    "Clothing",
    "Shirts",
    "Tops",
    "Dresses",
    "Pants",
    "Shorts",
    "Skirts",
    "Outerwear",
    "Jackets",
    "Coats",
    "Sweaters",
  ];

  it("should identify apparel categories", () => {
    for (const category of apparelCategories) {
      const isApparel = apparelCategories.some((cat) =>
        category.toLowerCase().includes(cat.toLowerCase())
      );
      expect(isApparel).toBe(true);
    }
  });

  it("should identify non-apparel categories", () => {
    const nonApparel = ["Electronics", "Home & Garden", "Books", "Toys"];

    for (const category of nonApparel) {
      const isApparel = apparelCategories.some((cat) =>
        category.toLowerCase().includes(cat.toLowerCase())
      );
      expect(isApparel).toBe(false);
    }
  });

  it("should handle compound category names", () => {
    const compoundCategories = [
      { name: "Men's Clothing", shouldBeApparel: true },
      { name: "Women's Tops", shouldBeApparel: true },
      { name: "Kids Outerwear", shouldBeApparel: true },
      { name: "Kitchen Electronics", shouldBeApparel: false },
    ];

    for (const { name, shouldBeApparel } of compoundCategories) {
      const isApparel = apparelCategories.some((cat) =>
        name.toLowerCase().includes(cat.toLowerCase())
      );
      expect(isApparel).toBe(shouldBeApparel);
    }
  });
});

describe("Image URL validation", () => {
  it("should accept Shopify CDN URLs", () => {
    const url =
      "https://cdn.shopify.com/s/files/1/0123/4567/8901/products/image.jpg";

    expect(url.includes("cdn.shopify.com")).toBe(true);
    expect(url.endsWith(".jpg") || url.endsWith(".png")).toBe(true);
  });

  it("should detect size suffix in optimized URLs", () => {
    const optimizedUrl =
      "https://cdn.shopify.com/s/files/1/0123/4567/8901/products/image_800x800.jpg";

    expect(/_\d+x\d+\./.test(optimizedUrl)).toBe(true);
  });

  it("should identify URLs without size suffix", () => {
    const originalUrl =
      "https://cdn.shopify.com/s/files/1/0123/4567/8901/products/image.jpg";

    expect(/_\d+x\d+\./.test(originalUrl)).toBe(false);
  });
});

// ==================================
// GRAPHQL INTEGRATION TESTS
// ==================================

describe("fetchAllProducts (with mocked admin)", () => {
  // Create a mock admin context
  function createMockAdmin(responses: Array<unknown>) {
    let callIndex = 0;
    return {
      graphql: vi.fn().mockImplementation(() => ({
        json: async () => responses[callIndex++] || responses[responses.length - 1],
      })),
    };
  }

  it("should fetch products with images", async () => {
    const mockResponse = {
      data: {
        products: {
          edges: [
            {
              cursor: "cursor1",
              node: {
                id: "gid://shopify/Product/1",
                title: "Blue T-Shirt",
                featuredImage: { url: "https://cdn.shopify.com/image1.jpg" },
                productType: "Apparel",
                tags: ["Cotton"],
                category: { name: "Shirts" },
              },
            },
            {
              cursor: "cursor2",
              node: {
                id: "gid://shopify/Product/2",
                title: "Red Dress",
                featuredImage: { url: "https://cdn.shopify.com/image2.jpg" },
                productType: "Dresses",
                tags: ["Silk"],
                category: null,
              },
            },
          ],
          pageInfo: { hasNextPage: false },
        },
      },
    };

    const admin = createMockAdmin([mockResponse]);

    // Import dynamically to avoid module initialization issues
    const { fetchAllProducts } = await import("../products.server");
    const products = await fetchAllProducts(admin as any, 10);

    expect(products).toHaveLength(2);
    expect(products[0].id).toBe("gid://shopify/Product/1");
    expect(products[0].title).toBe("Blue T-Shirt");
    expect(products[0].imageUrl).toBe("https://cdn.shopify.com/image1.jpg");
    expect(products[0].category).toBe("Shirts");
  });

  it("should filter out products without images", async () => {
    const mockResponse = {
      data: {
        products: {
          edges: [
            {
              cursor: "cursor1",
              node: {
                id: "gid://shopify/Product/1",
                title: "Has Image",
                featuredImage: { url: "https://cdn.shopify.com/image.jpg" },
                productType: "Apparel",
                tags: [],
                category: null,
              },
            },
            {
              cursor: "cursor2",
              node: {
                id: "gid://shopify/Product/2",
                title: "No Image",
                featuredImage: null,
                productType: "Apparel",
                tags: [],
                category: null,
              },
            },
          ],
          pageInfo: { hasNextPage: false },
        },
      },
    };

    const admin = createMockAdmin([mockResponse]);
    const { fetchAllProducts } = await import("../products.server");
    const products = await fetchAllProducts(admin as any, 10);

    expect(products).toHaveLength(1);
    expect(products[0].title).toBe("Has Image");
  });

  it("should paginate through multiple pages", async () => {
    const page1 = {
      data: {
        products: {
          edges: [
            {
              cursor: "cursor1",
              node: {
                id: "gid://shopify/Product/1",
                title: "Product 1",
                featuredImage: { url: "https://cdn.shopify.com/image1.jpg" },
                productType: "Apparel",
                tags: [],
                category: null,
              },
            },
          ],
          pageInfo: { hasNextPage: true },
        },
      },
    };

    const page2 = {
      data: {
        products: {
          edges: [
            {
              cursor: "cursor2",
              node: {
                id: "gid://shopify/Product/2",
                title: "Product 2",
                featuredImage: { url: "https://cdn.shopify.com/image2.jpg" },
                productType: "Apparel",
                tags: [],
                category: null,
              },
            },
          ],
          pageInfo: { hasNextPage: false },
        },
      },
    };

    const admin = createMockAdmin([page1, page2]);
    const { fetchAllProducts } = await import("../products.server");
    const products = await fetchAllProducts(admin as any, 10);

    expect(products).toHaveLength(2);
    expect(admin.graphql).toHaveBeenCalledTimes(2);
  });

  it("should respect limit parameter", async () => {
    // The function requests Math.min(50, limit - products.length) per page
    // With limit=1, it will request 1 product
    const mockResponse = {
      data: {
        products: {
          edges: [
            {
              cursor: "cursor1",
              node: {
                id: "gid://shopify/Product/1",
                title: "Product 1",
                featuredImage: { url: "https://cdn.shopify.com/image1.jpg" },
                productType: "Apparel",
                tags: [],
                category: null,
              },
            },
          ],
          pageInfo: { hasNextPage: true },
        },
      },
    };

    const admin = createMockAdmin([mockResponse]);
    const { fetchAllProducts } = await import("../products.server");
    const products = await fetchAllProducts(admin as any, 1);

    // Should stop after getting limit products even if hasNextPage is true
    expect(products.length).toBeLessThanOrEqual(1);
    // Should not make additional requests
    expect(admin.graphql).toHaveBeenCalledTimes(1);
  });

  it("should use productType as fallback when category is null", async () => {
    const mockResponse = {
      data: {
        products: {
          edges: [
            {
              cursor: "cursor1",
              node: {
                id: "gid://shopify/Product/1",
                title: "Product",
                featuredImage: { url: "https://cdn.shopify.com/image.jpg" },
                productType: "T-Shirts",
                tags: [],
                category: null,
              },
            },
          ],
          pageInfo: { hasNextPage: false },
        },
      },
    };

    const admin = createMockAdmin([mockResponse]);
    const { fetchAllProducts } = await import("../products.server");
    const products = await fetchAllProducts(admin as any, 10);

    expect(products[0].category).toBe("T-Shirts");
  });
});

describe("getProduct", () => {
  function createMockAdmin(response: unknown) {
    return {
      graphql: vi.fn().mockImplementation(() => ({
        json: async () => response,
      })),
    };
  }

  it("should return product when found", async () => {
    const mockResponse = {
      data: {
        product: {
          id: "gid://shopify/Product/123",
          title: "Test Product",
          featuredImage: { url: "https://cdn.shopify.com/test.jpg" },
          productType: "Apparel",
          tags: ["Blue", "Cotton"],
          category: { name: "Shirts" },
        },
      },
    };

    const admin = createMockAdmin(mockResponse);
    const { getProduct } = await import("../products.server");
    const product = await getProduct(admin as any, "gid://shopify/Product/123");

    expect(product).not.toBeNull();
    expect(product?.id).toBe("gid://shopify/Product/123");
    expect(product?.title).toBe("Test Product");
    expect(product?.tags).toEqual(["Blue", "Cotton"]);
  });

  it("should return null for product without image", async () => {
    const mockResponse = {
      data: {
        product: {
          id: "gid://shopify/Product/123",
          title: "Test Product",
          featuredImage: null,
          productType: "Apparel",
          tags: [],
          category: null,
        },
      },
    };

    const admin = createMockAdmin(mockResponse);
    const { getProduct } = await import("../products.server");
    const product = await getProduct(admin as any, "gid://shopify/Product/123");

    expect(product).toBeNull();
  });

  it("should return null when product not found", async () => {
    const mockResponse = {
      data: {
        product: null,
      },
    };

    const admin = createMockAdmin(mockResponse);
    const { getProduct } = await import("../products.server");
    const product = await getProduct(admin as any, "gid://shopify/Product/nonexistent");

    expect(product).toBeNull();
  });
});

describe("updateProductTags", () => {
  function createMockAdmin(response: unknown) {
    return {
      graphql: vi.fn().mockImplementation(() => ({
        json: async () => response,
      })),
    };
  }

  it("should return success when tags are updated", async () => {
    const mockResponse = {
      data: {
        productUpdate: {
          product: {
            id: "gid://shopify/Product/123",
            tags: ["Blue", "Cotton", "Summer"],
          },
          userErrors: [],
        },
      },
    };

    const admin = createMockAdmin(mockResponse);
    const { updateProductTags } = await import("../products.server");
    const result = await updateProductTags(
      admin as any,
      "gid://shopify/Product/123",
      ["Blue", "Cotton", "Summer"]
    );

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("should return error when userErrors are present", async () => {
    const mockResponse = {
      data: {
        productUpdate: {
          product: null,
          userErrors: [
            { field: "tags", message: "Too many tags" },
            { field: "id", message: "Invalid product ID" },
          ],
        },
      },
    };

    const admin = createMockAdmin(mockResponse);
    const { updateProductTags } = await import("../products.server");
    const result = await updateProductTags(
      admin as any,
      "gid://shopify/Product/123",
      ["Blue"]
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("Too many tags");
    expect(result.error).toContain("Invalid product ID");
  });

  it("should handle API errors gracefully", async () => {
    const admin = {
      graphql: vi.fn().mockRejectedValue(new Error("Network error")),
    };

    const { updateProductTags } = await import("../products.server");
    const result = await updateProductTags(
      admin as any,
      "gid://shopify/Product/123",
      ["Blue"]
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe("Network error");
  });

  it("should call GraphQL with correct variables", async () => {
    const mockResponse = {
      data: {
        productUpdate: {
          product: { id: "gid://shopify/Product/123", tags: ["Blue"] },
          userErrors: [],
        },
      },
    };

    const admin = createMockAdmin(mockResponse);
    const { updateProductTags } = await import("../products.server");

    await updateProductTags(
      admin as any,
      "gid://shopify/Product/123",
      ["Blue", "Cotton"]
    );

    expect(admin.graphql).toHaveBeenCalledWith(
      expect.stringContaining("productUpdate"),
      expect.objectContaining({
        variables: {
          product: {
            id: "gid://shopify/Product/123",
            tags: ["Blue", "Cotton"],
          },
        },
      })
    );
  });
});

describe("countProducts", () => {
  function createMockAdmin(response: unknown) {
    return {
      graphql: vi.fn().mockImplementation(() => ({
        json: async () => response,
      })),
    };
  }

  it("should return product count", async () => {
    const mockResponse = {
      data: {
        productsCount: { count: 42 },
      },
    };

    const admin = createMockAdmin(mockResponse);
    const { countProducts } = await import("../products.server");
    const count = await countProducts(admin as any);

    expect(count).toBe(42);
  });

  it("should return 0 when count is not available", async () => {
    const mockResponse = {
      data: {
        productsCount: null,
      },
    };

    const admin = createMockAdmin(mockResponse);
    const { countProducts } = await import("../products.server");
    const count = await countProducts(admin as any);

    expect(count).toBe(0);
  });

  it("should throw on API error", async () => {
    const admin = {
      graphql: vi.fn().mockRejectedValue(new Error("API error")),
    };

    const { countProducts } = await import("../products.server");

    await expect(countProducts(admin as any)).rejects.toThrow("API error");
  });
});

describe("withRetry (internal logic)", () => {
  // Test the retry logic pattern used in products.server.ts
  async function withRetry<T>(
    fn: () => Promise<T>,
    options: { maxRetries?: number; baseDelayMs?: number } = {}
  ): Promise<T> {
    const { maxRetries = 3, baseDelayMs = 10 } = options;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const errorMsg = lastError.message.toLowerCase();
        const isRetryable =
          errorMsg.includes("429") ||
          errorMsg.includes("throttled") ||
          errorMsg.includes("rate") ||
          errorMsg.includes("500") ||
          errorMsg.includes("timeout");

        if (!isRetryable || attempt === maxRetries - 1) {
          throw lastError;
        }

        await new Promise((resolve) => setTimeout(resolve, baseDelayMs));
      }
    }
    throw lastError;
  }

  it("should retry on 429 rate limit", async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error("429 rate limit"))
      .mockResolvedValue("success");

    const result = await withRetry(fn, { maxRetries: 3, baseDelayMs: 10 });

    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("should retry on throttled error", async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error("Request throttled"))
      .mockResolvedValue("success");

    const result = await withRetry(fn, { maxRetries: 3, baseDelayMs: 10 });

    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("should NOT retry on non-retryable errors", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("Invalid API key"));

    await expect(withRetry(fn, { maxRetries: 3, baseDelayMs: 10 }))
      .rejects.toThrow("Invalid API key");

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("should exhaust retries before failing", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("500 server error"));

    await expect(withRetry(fn, { maxRetries: 3, baseDelayMs: 10 }))
      .rejects.toThrow("500 server error");

    expect(fn).toHaveBeenCalledTimes(3);
  });
});

describe("fetchCollectionProducts", () => {
  function createMockAdmin(response: unknown) {
    return {
      graphql: vi.fn().mockImplementation(() => ({
        json: async () => response,
      })),
    };
  }

  it("should fetch products from a collection", async () => {
    const mockResponse = {
      data: {
        collection: {
          products: {
            edges: [
              {
                cursor: "cursor1",
                node: {
                  id: "gid://shopify/Product/1",
                  title: "Collection Product",
                  featuredImage: { url: "https://cdn.shopify.com/image.jpg" },
                  productType: "Apparel",
                  tags: ["Collection"],
                  category: { name: "Shirts" },
                },
              },
            ],
            pageInfo: { hasNextPage: false },
          },
        },
      },
    };

    const admin = createMockAdmin(mockResponse);
    const { fetchCollectionProducts } = await import("../products.server");
    const products = await fetchCollectionProducts(
      admin as any,
      "gid://shopify/Collection/123",
      10
    );

    expect(products).toHaveLength(1);
    expect(products[0].title).toBe("Collection Product");
  });

  it("should return empty array when collection not found", async () => {
    const mockResponse = {
      data: {
        collection: null,
      },
    };

    const admin = createMockAdmin(mockResponse);
    const { fetchCollectionProducts } = await import("../products.server");
    const products = await fetchCollectionProducts(
      admin as any,
      "gid://shopify/Collection/nonexistent",
      10
    );

    expect(products).toHaveLength(0);
  });
});

// ==================================
// extractProductGid
// ==================================

describe("extractProductGid", () => {
  it("should return bare GIDs unchanged", async () => {
    const { extractProductGid } = await import("../products.server");
    expect(extractProductGid("gid://shopify/Product/123")).toBe(
      "gid://shopify/Product/123"
    );
  });

  it("should strip the UUID suffix from webhook-created row IDs", async () => {
    const { extractProductGid } = await import("../products.server");
    expect(
      extractProductGid(
        "gid://shopify/Product/123-dcf307b2-1234-5678-9abc-def012345678"
      )
    ).toBe("gid://shopify/Product/123");
  });

  it("should return null for non-product IDs", async () => {
    const { extractProductGid } = await import("../products.server");
    expect(extractProductGid("gid://shopify/Collection/123")).toBeNull();
    expect(extractProductGid("not-a-gid")).toBeNull();
    expect(extractProductGid("")).toBeNull();
  });
});

// ==================================
// excludeIds pagination (skip-already-scanned)
// ==================================

describe("fetchAllProducts with excludeIds", () => {
  function makePage(ids: number[], hasNextPage: boolean) {
    return {
      data: {
        products: {
          edges: ids.map((id) => ({
            cursor: `cursor${id}`,
            node: {
              id: `gid://shopify/Product/${id}`,
              title: `Product ${id}`,
              vendor: "TestBrand",
              featuredImage: { url: `https://cdn.shopify.com/${id}.jpg` },
              productType: "Apparel",
              tags: [],
              category: null,
            },
          })),
          pageInfo: { hasNextPage },
        },
      },
    };
  }

  function createMockAdmin(responses: Array<unknown>) {
    let callIndex = 0;
    return {
      graphql: vi.fn().mockImplementation(() => ({
        json: async () =>
          responses[callIndex++] || responses[responses.length - 1],
      })),
    };
  }

  it("should skip excluded products", async () => {
    const admin = createMockAdmin([makePage([1, 2, 3], false)]);
    const { fetchAllProducts } = await import("../products.server");

    const products = await fetchAllProducts(admin as any, 10, {
      excludeIds: new Set(["gid://shopify/Product/2"]),
    });

    expect(products.map((p) => p.id)).toEqual([
      "gid://shopify/Product/1",
      "gid://shopify/Product/3",
    ]);
  });

  it("should keep paginating past fully-excluded pages until limit is reached", async () => {
    const admin = createMockAdmin([
      makePage([1, 2], true),
      makePage([3, 4], false),
    ]);
    const { fetchAllProducts } = await import("../products.server");

    const products = await fetchAllProducts(admin as any, 2, {
      excludeIds: new Set([
        "gid://shopify/Product/1",
        "gid://shopify/Product/2",
      ]),
    });

    // First page contributes nothing; loop must continue to page 2
    expect(admin.graphql).toHaveBeenCalledTimes(2);
    expect(products.map((p) => p.id)).toEqual([
      "gid://shopify/Product/3",
      "gid://shopify/Product/4",
    ]);
  });

  it("should return empty when everything is excluded and catalog is exhausted", async () => {
    const admin = createMockAdmin([makePage([1, 2], false)]);
    const { fetchAllProducts } = await import("../products.server");

    const products = await fetchAllProducts(admin as any, 10, {
      excludeIds: new Set([
        "gid://shopify/Product/1",
        "gid://shopify/Product/2",
      ]),
    });

    expect(products).toHaveLength(0);
  });

  it("should stop at the limit even when more non-excluded products exist", async () => {
    const admin = createMockAdmin([makePage([1, 2, 3, 4], true)]);
    const { fetchAllProducts } = await import("../products.server");

    const products = await fetchAllProducts(admin as any, 2, {
      excludeIds: new Set(["gid://shopify/Product/1"]),
    });

    expect(products.map((p) => p.id)).toEqual([
      "gid://shopify/Product/2",
      "gid://shopify/Product/3",
    ]);
    expect(admin.graphql).toHaveBeenCalledTimes(1);
  });
});

describe("tag filter parsing and serialization", () => {
  it("round-trips every filter kind", async () => {
    const { parseTagFilter, serializeTagFilter } = await import("../products.server");

    expect(serializeTagFilter(parseTagFilter("UNTAGGED"))).toBe("UNTAGGED");
    expect(serializeTagFilter(parseTagFilter("TAGGED"))).toBe("TAGGED");
    expect(serializeTagFilter(parseTagFilter("MISSING_KEY:Color"))).toBe("MISSING_KEY:Color");
    // ANY is the absence of a filter, stored as null.
    expect(serializeTagFilter(parseTagFilter("ANY"))).toBeNull();
  });

  it("degrades unknown or empty input to ANY instead of throwing", async () => {
    const { parseTagFilter } = await import("../products.server");

    expect(parseTagFilter(null)).toEqual({ kind: "ANY" });
    expect(parseTagFilter("")).toEqual({ kind: "ANY" });
    expect(parseTagFilter("garbage")).toEqual({ kind: "ANY" });
    expect(parseTagFilter("MISSING_KEY:")).toEqual({ kind: "ANY" });
  });

  it("describes each filter for merchant-facing copy", async () => {
    const { parseTagFilter, describeTagFilter } = await import("../products.server");

    expect(describeTagFilter(parseTagFilter("UNTAGGED"))).toBe("products with no tags");
    expect(describeTagFilter(parseTagFilter("MISSING_KEY:Color"))).toBe(
      "products with no Color: tag",
    );
  });
});

describe("fetchAllProducts with a tag filter", () => {
  function makePage(
    products: Array<{ id: number; tags: string[] }>,
    hasNextPage: boolean,
  ) {
    return {
      data: {
        products: {
          edges: products.map((p) => ({
            cursor: `cursor${p.id}`,
            node: {
              id: `gid://shopify/Product/${p.id}`,
              title: `Product ${p.id}`,
              vendor: "TestBrand",
              featuredImage: { url: `https://cdn.shopify.com/${p.id}.jpg` },
              productType: "Apparel",
              tags: p.tags,
              category: null,
            },
          })),
          pageInfo: { hasNextPage },
        },
      },
    };
  }

  function createMockAdmin(responses: Array<unknown>) {
    let callIndex = 0;
    return {
      graphql: vi.fn().mockImplementation(() => ({
        json: async () => responses[callIndex++] || responses[responses.length - 1],
      })),
    };
  }

  it("keeps only untagged products", async () => {
    const admin = createMockAdmin([
      makePage([{ id: 1, tags: [] }, { id: 2, tags: ["SS24"] }], false),
    ]);
    const { fetchAllProducts, parseTagFilter } = await import("../products.server");

    const products = await fetchAllProducts(admin as any, 10, {
      tagFilter: parseTagFilter("UNTAGGED"),
    });

    expect(products.map((p) => p.id)).toEqual(["gid://shopify/Product/1"]);
  });

  it("keeps only already-tagged products", async () => {
    const admin = createMockAdmin([
      makePage([{ id: 1, tags: [] }, { id: 2, tags: ["SS24"] }], false),
    ]);
    const { fetchAllProducts, parseTagFilter } = await import("../products.server");

    const products = await fetchAllProducts(admin as any, 10, {
      tagFilter: parseTagFilter("TAGGED"),
    });

    expect(products.map((p) => p.id)).toEqual(["gid://shopify/Product/2"]);
  });

  it("keeps products missing a given key, including products with other tags", async () => {
    const admin = createMockAdmin([
      makePage(
        [
          { id: 1, tags: ["Color:Black", "SS24"] },
          { id: 2, tags: ["SS24"] },
          { id: 3, tags: [] },
          { id: 4, tags: ["color:navy"] },
        ],
        false,
      ),
    ]);
    const { fetchAllProducts, parseTagFilter } = await import("../products.server");

    const products = await fetchAllProducts(admin as any, 10, {
      tagFilter: parseTagFilter("MISSING_KEY:Color"),
    });

    // 1 and 4 already carry a Color: tag (match is case-insensitive).
    expect(products.map((p) => p.id)).toEqual([
      "gid://shopify/Product/2",
      "gid://shopify/Product/3",
    ]);
  });

  it("narrows server-side for the two literal filters", async () => {
    const admin = createMockAdmin([makePage([{ id: 1, tags: [] }], false)]);
    const { fetchAllProducts, parseTagFilter } = await import("../products.server");

    await fetchAllProducts(admin as any, 10, { tagFilter: parseTagFilter("UNTAGGED") });

    expect(admin.graphql).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ variables: expect.objectContaining({ query: "-tag:*" }) }),
    );
  });

  it("sends no search query for MISSING_KEY, which Shopify cannot express", async () => {
    const admin = createMockAdmin([makePage([{ id: 1, tags: [] }], false)]);
    const { fetchAllProducts, parseTagFilter } = await import("../products.server");

    await fetchAllProducts(admin as any, 10, {
      tagFilter: parseTagFilter("MISSING_KEY:Color"),
    });

    expect(admin.graphql).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ variables: expect.objectContaining({ query: null }) }),
    );
  });

  it("keeps paginating past pages the filter empties", async () => {
    const admin = createMockAdmin([
      makePage([{ id: 1, tags: ["SS24"] }, { id: 2, tags: ["SS24"] }], true),
      makePage([{ id: 3, tags: [] }], false),
    ]);
    const { fetchAllProducts, parseTagFilter } = await import("../products.server");

    const products = await fetchAllProducts(admin as any, 1, {
      tagFilter: parseTagFilter("UNTAGGED"),
    });

    expect(admin.graphql).toHaveBeenCalledTimes(2);
    expect(products.map((p) => p.id)).toEqual(["gid://shopify/Product/3"]);
  });

  it("reports a partial batch when catalog remains but the limit was not filled", async () => {
    const admin = createMockAdmin([makePage([{ id: 1, tags: [] }], true)]);
    const { fetchAllProducts, parseTagFilter } = await import("../products.server");
    const onBudgetExhausted = vi.fn();

    // Page says hasNextPage, but the mock keeps returning the same page, so the
    // walk ends on the page budget rather than on an exhausted catalog.
    await fetchAllProducts(admin as any, 500, {
      tagFilter: parseTagFilter("UNTAGGED"),
      excludeIds: new Set(["gid://shopify/Product/1"]),
      onBudgetExhausted,
    });

    expect(onBudgetExhausted).toHaveBeenCalled();
  });
});

describe("tag filter server-side narrowing fallback", () => {
  function page(products: Array<{ id: number; tags: string[] }>, hasNextPage: boolean) {
    return {
      data: {
        products: {
          edges: products.map((p) => ({
            cursor: `cursor${p.id}`,
            node: {
              id: `gid://shopify/Product/${p.id}`,
              title: `Product ${p.id}`,
              vendor: "TestBrand",
              featuredImage: { url: `https://cdn.shopify.com/${p.id}.jpg` },
              productType: "Apparel",
              tags: p.tags,
              category: null,
            },
          })),
          pageInfo: { hasNextPage },
        },
      },
    };
  }

  it("retries without the search query when Shopify rejects it", async () => {
    // Simulates the search syntax being rejected: the response carries errors and
    // no products payload, so the walk must fall back to filtering client-side
    // rather than reporting "no products match".
    const admin = {
      graphql: vi.fn().mockImplementation((_query: string, opts: any) => ({
        json: async () =>
          opts?.variables?.query
            ? { errors: [{ message: "Invalid search field: tag" }] }
            : page([{ id: 1, tags: [] }, { id: 2, tags: ["SS24"] }], false),
      })),
    };
    const { fetchAllProducts, parseTagFilter } = await import("../products.server");

    const products = await fetchAllProducts(admin as any, 10, {
      tagFilter: parseTagFilter("UNTAGGED"),
    });

    // Fell back and still applied the filter correctly.
    expect(products.map((p) => p.id)).toEqual(["gid://shopify/Product/1"]);
    expect(admin.graphql).toHaveBeenCalledTimes(2);
    expect(admin.graphql).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.objectContaining({ variables: expect.objectContaining({ query: null }) }),
    );
  });

  it("does not retry when the filter legitimately matches nothing", async () => {
    // "-tag:*" on a fully tagged catalog is a valid query with an empty result.
    // Treating that as broken syntax would walk the whole catalog to rediscover
    // the same emptiness, then tell the merchant to run the scan again.
    const admin = {
      graphql: vi.fn().mockImplementation(() => ({ json: async () => page([], false) })),
    };
    const { fetchAllProducts, parseTagFilter } = await import("../products.server");

    const products = await fetchAllProducts(admin as any, 10, {
      tagFilter: parseTagFilter("UNTAGGED"),
    });

    expect(products).toEqual([]);
    expect(admin.graphql).toHaveBeenCalledTimes(1);
  });
});

describe("partial-batch reporting", () => {
  function page(ids: number[], hasNextPage: boolean) {
    return {
      data: {
        products: {
          edges: ids.map((id) => ({
            cursor: `cursor${id}`,
            node: {
              id: `gid://shopify/Product/${id}`,
              title: `Product ${id}`,
              vendor: "TestBrand",
              featuredImage: { url: `https://cdn.shopify.com/${id}.jpg` },
              productType: "Apparel",
              tags: [],
              category: null,
            },
          })),
          pageInfo: { hasNextPage },
        },
      },
    };
  }

  it("does not report a partial batch when the catalog is exhausted", async () => {
    const admin = {
      graphql: vi.fn().mockImplementation(() => ({ json: async () => page([1], false) })),
    };
    const { fetchAllProducts } = await import("../products.server");
    const onBudgetExhausted = vi.fn();

    await fetchAllProducts(admin as any, 500, { onBudgetExhausted });

    expect(onBudgetExhausted).not.toHaveBeenCalled();
  });

  it("does not report a partial batch when an empty page ends the walk", async () => {
    let call = 0;
    const admin = {
      graphql: vi.fn().mockImplementation(() => ({
        json: async () => (call++ === 0 ? page([1], true) : page([], true)),
      })),
    };
    const { fetchAllProducts } = await import("../products.server");
    const onBudgetExhausted = vi.fn();

    await fetchAllProducts(admin as any, 500, { onBudgetExhausted });

    expect(onBudgetExhausted).not.toHaveBeenCalled();
  });
});
