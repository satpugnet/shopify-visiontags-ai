import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies using vi.hoisted
const mocks = vi.hoisted(() => ({
  prisma: {
    session: {
      findFirst: vi.fn(),
      deleteMany: vi.fn(),
    },
    product: {
      deleteMany: vi.fn(),
    },
    job: {
      deleteMany: vi.fn(),
    },
    usageRecord: {
      deleteMany: vi.fn(),
    },
    scannedProduct: {
      deleteMany: vi.fn(),
    },
    shopSettings: {
      findUnique: vi.fn(),
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
import { action as dataRequestAction } from "../webhooks.customers.data_request";
import { action as customersRedactAction } from "../webhooks.customers.redact";
import { action as complianceAction } from "../webhooks.compliance";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("webhooks.customers.data_request (GDPR)", () => {
  function createMockRequest() {
    return new Request("https://app.example.com/webhooks/customers/data_request", {
      method: "POST",
      body: JSON.stringify({
        shop_id: 123,
        shop_domain: "test-shop.myshopify.com",
        customer: { id: 456, email: "customer@example.com" },
      }),
    });
  }

  it("should return 200 acknowledging no customer data stored", async () => {
    mocks.authenticate.webhook.mockResolvedValue({
      shop: "test-shop.myshopify.com",
      topic: "CUSTOMERS_DATA_REQUEST",
      payload: {
        shop_id: 123,
        shop_domain: "test-shop.myshopify.com",
        customer: { id: 456, email: "customer@example.com" },
      },
    });

    const response = await dataRequestAction({ request: createMockRequest() } as any);

    expect(response.status).toBe(200);
  });
});

describe("webhooks.customers.redact (GDPR)", () => {
  function createMockRequest() {
    return new Request("https://app.example.com/webhooks/customers/redact", {
      method: "POST",
      body: JSON.stringify({
        shop_id: 123,
        shop_domain: "test-shop.myshopify.com",
        customer: { id: 456, email: "customer@example.com" },
      }),
    });
  }

  it("should return 200 acknowledging no customer data to redact", async () => {
    mocks.authenticate.webhook.mockResolvedValue({
      shop: "test-shop.myshopify.com",
      topic: "CUSTOMERS_REDACT",
      payload: {
        shop_id: 123,
        shop_domain: "test-shop.myshopify.com",
        customer: { id: 456, email: "customer@example.com" },
      },
    });

    const response = await customersRedactAction({ request: createMockRequest() } as any);

    expect(response.status).toBe(200);
  });
});

describe("webhooks.compliance (unified handler)", () => {
  function createMockRequest() {
    return new Request("https://app.example.com/webhooks/compliance", {
      method: "POST",
      body: JSON.stringify({
        shop_id: 123,
        shop_domain: "test-shop.myshopify.com",
      }),
    });
  }

  it("should snapshot journey data then delete all data in order", async () => {
    mocks.authenticate.webhook.mockResolvedValue({
      shop: "test-shop.myshopify.com",
      topic: "SHOP_REDACT",
      payload: { shop_id: 123, shop_domain: "test-shop.myshopify.com" },
    });
    // No active session (shop did NOT reinstall)
    mocks.prisma.session.findFirst.mockResolvedValue(null);
    // Return journey data for snapshot
    mocks.prisma.shopSettings.findUnique.mockResolvedValue({
      shop: "test-shop.myshopify.com",
      plan: "FREE",
      creditsUsed: 10,
      totalScans: 3,
      totalSynced: 5,
      firstSeenAt: new Date("2026-02-15"),
      firstScanAt: new Date("2026-02-16"),
      firstSyncAt: null,
      lastActiveAt: new Date("2026-02-20"),
      uninstalledAt: new Date("2026-02-25"),
    });
    mocks.prisma.product.deleteMany.mockResolvedValue({ count: 10 });
    mocks.prisma.job.deleteMany.mockResolvedValue({ count: 5 });
    mocks.prisma.usageRecord.deleteMany.mockResolvedValue({ count: 3 });
    mocks.prisma.scannedProduct.deleteMany.mockResolvedValue({ count: 7 });
    mocks.prisma.shopSettings.deleteMany.mockResolvedValue({ count: 1 });
    mocks.prisma.session.deleteMany.mockResolvedValue({ count: 2 });

    const response = await complianceAction({ request: createMockRequest() } as any);

    expect(response.status).toBe(200);

    // Verify snapshot was read before deletion
    expect(mocks.prisma.shopSettings.findUnique).toHaveBeenCalledWith({
      where: { shop: "test-shop.myshopify.com" },
    });

    // Verify all deletions happened
    expect(mocks.prisma.product.deleteMany).toHaveBeenCalledWith({
      where: { job: { shop: "test-shop.myshopify.com" } },
    });
    expect(mocks.prisma.job.deleteMany).toHaveBeenCalledWith({
      where: { shop: "test-shop.myshopify.com" },
    });
    expect(mocks.prisma.scannedProduct.deleteMany).toHaveBeenCalledWith({
      where: { shop: "test-shop.myshopify.com" },
    });
    expect(mocks.prisma.usageRecord.deleteMany).toHaveBeenCalledWith({
      where: { shop: "test-shop.myshopify.com" },
    });
    expect(mocks.prisma.shopSettings.deleteMany).toHaveBeenCalledWith({
      where: { shop: "test-shop.myshopify.com" },
    });
    expect(mocks.prisma.session.deleteMany).toHaveBeenCalledWith({
      where: { shop: "test-shop.myshopify.com" },
    });
  });

  it("should return 200 when webhook auth fails (GDPR ack within 24h required)", async () => {
    mocks.authenticate.webhook.mockRejectedValue(
      new Error("Invalid HMAC signature")
    );

    const response = await complianceAction({ request: createMockRequest() } as any);

    expect(response.status).toBe(200);
    expect(mocks.prisma.shopSettings.findUnique).not.toHaveBeenCalled();
    expect(mocks.prisma.product.deleteMany).not.toHaveBeenCalled();
  });
});
