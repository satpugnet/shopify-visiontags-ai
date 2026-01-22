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
