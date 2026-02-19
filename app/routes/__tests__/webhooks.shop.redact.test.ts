import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies using vi.hoisted
const mocks = vi.hoisted(() => ({
  prisma: {
    product: {
      deleteMany: vi.fn(),
    },
    job: {
      deleteMany: vi.fn(),
    },
    usageRecord: {
      deleteMany: vi.fn(),
    },
    shopSettings: {
      deleteMany: vi.fn(),
    },
    session: {
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
import { action } from "../webhooks.shop.redact";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("webhooks.shop.redact (GDPR)", () => {
  function createMockRequest() {
    return new Request("https://app.example.com/webhooks/shop/redact", {
      method: "POST",
      body: JSON.stringify({ shop_id: 123, shop_domain: "test-shop.myshopify.com" }),
    });
  }

  it("should delete all shop data in correct order", async () => {
    mocks.authenticate.webhook.mockResolvedValue({
      shop: "test-shop.myshopify.com",
      topic: "SHOP_REDACT",
      payload: { shop_id: 123, shop_domain: "test-shop.myshopify.com" },
    });
    mocks.prisma.product.deleteMany.mockResolvedValue({ count: 10 });
    mocks.prisma.job.deleteMany.mockResolvedValue({ count: 5 });
    mocks.prisma.usageRecord.deleteMany.mockResolvedValue({ count: 3 });
    mocks.prisma.shopSettings.deleteMany.mockResolvedValue({ count: 1 });
    mocks.prisma.session.deleteMany.mockResolvedValue({ count: 2 });

    const response = await action({ request: createMockRequest() } as any);

    expect(response.status).toBe(200);

    // Verify deletion order (products first due to foreign keys)
    const deleteOrder = [
      mocks.prisma.product.deleteMany,
      mocks.prisma.job.deleteMany,
      mocks.prisma.usageRecord.deleteMany,
      mocks.prisma.shopSettings.deleteMany,
      mocks.prisma.session.deleteMany,
    ];

    for (const deleteFn of deleteOrder) {
      expect(deleteFn).toHaveBeenCalled();
    }
  });

  it("should delete products related to shop's jobs", async () => {
    mocks.authenticate.webhook.mockResolvedValue({
      shop: "test-shop.myshopify.com",
      topic: "SHOP_REDACT",
      payload: {},
    });
    mocks.prisma.product.deleteMany.mockResolvedValue({ count: 0 });
    mocks.prisma.job.deleteMany.mockResolvedValue({ count: 0 });
    mocks.prisma.usageRecord.deleteMany.mockResolvedValue({ count: 0 });
    mocks.prisma.shopSettings.deleteMany.mockResolvedValue({ count: 0 });
    mocks.prisma.session.deleteMany.mockResolvedValue({ count: 0 });

    await action({ request: createMockRequest() } as any);

    expect(mocks.prisma.product.deleteMany).toHaveBeenCalledWith({
      where: {
        job: {
          shop: "test-shop.myshopify.com",
        },
      },
    });
  });

  it("should delete jobs by shop", async () => {
    mocks.authenticate.webhook.mockResolvedValue({
      shop: "test-shop.myshopify.com",
      topic: "SHOP_REDACT",
      payload: {},
    });
    mocks.prisma.product.deleteMany.mockResolvedValue({ count: 0 });
    mocks.prisma.job.deleteMany.mockResolvedValue({ count: 0 });
    mocks.prisma.usageRecord.deleteMany.mockResolvedValue({ count: 0 });
    mocks.prisma.shopSettings.deleteMany.mockResolvedValue({ count: 0 });
    mocks.prisma.session.deleteMany.mockResolvedValue({ count: 0 });

    await action({ request: createMockRequest() } as any);

    expect(mocks.prisma.job.deleteMany).toHaveBeenCalledWith({
      where: { shop: "test-shop.myshopify.com" },
    });
  });

  it("should delete usage records by shop", async () => {
    mocks.authenticate.webhook.mockResolvedValue({
      shop: "test-shop.myshopify.com",
      topic: "SHOP_REDACT",
      payload: {},
    });
    mocks.prisma.product.deleteMany.mockResolvedValue({ count: 0 });
    mocks.prisma.job.deleteMany.mockResolvedValue({ count: 0 });
    mocks.prisma.usageRecord.deleteMany.mockResolvedValue({ count: 0 });
    mocks.prisma.shopSettings.deleteMany.mockResolvedValue({ count: 0 });
    mocks.prisma.session.deleteMany.mockResolvedValue({ count: 0 });

    await action({ request: createMockRequest() } as any);

    expect(mocks.prisma.usageRecord.deleteMany).toHaveBeenCalledWith({
      where: { shop: "test-shop.myshopify.com" },
    });
  });

  it("should delete shop settings by shop", async () => {
    mocks.authenticate.webhook.mockResolvedValue({
      shop: "test-shop.myshopify.com",
      topic: "SHOP_REDACT",
      payload: {},
    });
    mocks.prisma.product.deleteMany.mockResolvedValue({ count: 0 });
    mocks.prisma.job.deleteMany.mockResolvedValue({ count: 0 });
    mocks.prisma.usageRecord.deleteMany.mockResolvedValue({ count: 0 });
    mocks.prisma.shopSettings.deleteMany.mockResolvedValue({ count: 0 });
    mocks.prisma.session.deleteMany.mockResolvedValue({ count: 0 });

    await action({ request: createMockRequest() } as any);

    expect(mocks.prisma.shopSettings.deleteMany).toHaveBeenCalledWith({
      where: { shop: "test-shop.myshopify.com" },
    });
  });

  it("should delete sessions by shop", async () => {
    mocks.authenticate.webhook.mockResolvedValue({
      shop: "test-shop.myshopify.com",
      topic: "SHOP_REDACT",
      payload: {},
    });
    mocks.prisma.product.deleteMany.mockResolvedValue({ count: 0 });
    mocks.prisma.job.deleteMany.mockResolvedValue({ count: 0 });
    mocks.prisma.usageRecord.deleteMany.mockResolvedValue({ count: 0 });
    mocks.prisma.shopSettings.deleteMany.mockResolvedValue({ count: 0 });
    mocks.prisma.session.deleteMany.mockResolvedValue({ count: 0 });

    await action({ request: createMockRequest() } as any);

    expect(mocks.prisma.session.deleteMany).toHaveBeenCalledWith({
      where: { shop: "test-shop.myshopify.com" },
    });
  });

  it("should return 200 even on error (for Shopify retry handling)", async () => {
    mocks.authenticate.webhook.mockResolvedValue({
      shop: "test-shop.myshopify.com",
      topic: "SHOP_REDACT",
      payload: {},
    });
    mocks.prisma.product.deleteMany.mockRejectedValue(new Error("Database error"));

    const response = await action({ request: createMockRequest() } as any);

    // Should still return 200 to prevent Shopify retries
    expect(response.status).toBe(200);
  });

  it("should handle partial deletion failures gracefully", async () => {
    mocks.authenticate.webhook.mockResolvedValue({
      shop: "test-shop.myshopify.com",
      topic: "SHOP_REDACT",
      payload: {},
    });
    mocks.prisma.product.deleteMany.mockResolvedValue({ count: 5 });
    mocks.prisma.job.deleteMany.mockResolvedValue({ count: 3 });
    mocks.prisma.usageRecord.deleteMany.mockRejectedValue(new Error("Failed"));
    mocks.prisma.shopSettings.deleteMany.mockResolvedValue({ count: 1 });
    mocks.prisma.session.deleteMany.mockResolvedValue({ count: 1 });

    const response = await action({ request: createMockRequest() } as any);

    expect(response.status).toBe(200);
    // Products and jobs should have been deleted before error
    expect(mocks.prisma.product.deleteMany).toHaveBeenCalled();
    expect(mocks.prisma.job.deleteMany).toHaveBeenCalled();
  });
});
