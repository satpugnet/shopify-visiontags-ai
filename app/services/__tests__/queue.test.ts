import { describe, it, expect } from "vitest";
import { sanitizeJobId } from "../queue.server";

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
