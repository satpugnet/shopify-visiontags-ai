import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies using vi.hoisted
const mocks = vi.hoisted(() => ({
  prisma: {
    product: {
      deleteMany: vi.fn(),
    },
    scannedProduct: {
      deleteMany: vi.fn(),
    },
  },
  authenticate: {
    webhook: vi.fn(),
  },
}));

// Mock modules
vi.mock("../../db.server", () => ({
  default: mocks.prisma,
}));

vi.mock("../../shopify.server", () => ({
  authenticate: mocks.authenticate,
}));

// Import after mocking
import { action } from "../webhooks.products.delete";

// Test fixtures
const mockProductPayload = {
  id: 123456789,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("webhooks.products.delete", () => {
  function createMockRequest() {
    return new Request("https://app.example.com/webhooks/products/delete", {
      method: "POST",
      body: JSON.stringify(mockProductPayload),
    });
  }

  it("should delete product records by exact ID match", async () => {
    mocks.authenticate.webhook.mockResolvedValue({
      shop: "test-shop.myshopify.com",
      topic: "PRODUCTS_DELETE",
      payload: mockProductPayload,
    });
    mocks.prisma.product.deleteMany.mockResolvedValue({ count: 1 });

    const response = await action({ request: createMockRequest() } as any);

    expect(response.status).toBe(200);
    expect(mocks.prisma.product.deleteMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { id: "gid://shopify/Product/123456789" },
          { id: { startsWith: "gid://shopify/Product/123456789-" } },
        ],
        job: {
          shop: "test-shop.myshopify.com",
        },
      },
    });
    expect(mocks.prisma.scannedProduct.deleteMany).toHaveBeenCalledWith({
      where: {
        shop: "test-shop.myshopify.com",
        productId: "gid://shopify/Product/123456789",
      },
    });
  });

  it("should delete re-analysis records using startsWith pattern", async () => {
    mocks.authenticate.webhook.mockResolvedValue({
      shop: "test-shop.myshopify.com",
      topic: "PRODUCTS_DELETE",
      payload: mockProductPayload,
    });
    mocks.prisma.product.deleteMany.mockResolvedValue({ count: 3 });

    const response = await action({ request: createMockRequest() } as any);

    expect(response.status).toBe(200);
    // The OR clause includes startsWith to catch re-analysis records (e.g., "gid://.../{id}-{uuid}")
    const deleteCall = mocks.prisma.product.deleteMany.mock.calls[0][0];
    expect(deleteCall.where.OR).toEqual(
      expect.arrayContaining([
        { id: { startsWith: "gid://shopify/Product/123456789-" } },
      ])
    );
  });

  it("should scope deletion to the shop", async () => {
    mocks.authenticate.webhook.mockResolvedValue({
      shop: "other-shop.myshopify.com",
      topic: "PRODUCTS_DELETE",
      payload: mockProductPayload,
    });
    mocks.prisma.product.deleteMany.mockResolvedValue({ count: 0 });

    const response = await action({ request: createMockRequest() } as any);

    expect(response.status).toBe(200);
    const deleteCall = mocks.prisma.product.deleteMany.mock.calls[0][0];
    expect(deleteCall.where.job).toEqual({ shop: "other-shop.myshopify.com" });
  });

  it("should return 200 even when internal error occurs", async () => {
    mocks.authenticate.webhook.mockResolvedValue({
      shop: "test-shop.myshopify.com",
      topic: "PRODUCTS_DELETE",
      payload: mockProductPayload,
    });
    mocks.prisma.product.deleteMany.mockRejectedValue(
      new Error("Database error")
    );

    const response = await action({ request: createMockRequest() } as any);

    // The action catches errors and returns 200 to prevent Shopify retries
    expect(response.status).toBe(200);
  });

  it("should return 200 when webhook auth fails (avoid Shopify retry storms)", async () => {
    mocks.authenticate.webhook.mockRejectedValue(
      new Error("Invalid HMAC signature")
    );

    const response = await action({ request: createMockRequest() } as any);

    expect(response.status).toBe(200);
    expect(mocks.prisma.product.deleteMany).not.toHaveBeenCalled();
  });
});
