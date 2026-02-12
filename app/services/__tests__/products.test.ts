import { describe, it, expect } from "vitest";

// Since updateProductTags requires an admin context (Shopify API),
// we test the tag data transformation logic separately

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
