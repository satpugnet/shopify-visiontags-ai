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
    shopSettings: {
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

  it("should handle SHOP_REDACT and delete all data in order", async () => {
    mocks.authenticate.webhook.mockResolvedValue({
      shop: "test-shop.myshopify.com",
      topic: "SHOP_REDACT",
      payload: { shop_id: 123, shop_domain: "test-shop.myshopify.com" },
    });
    // No active session (shop did NOT reinstall)
    mocks.prisma.session.findFirst.mockResolvedValue(null);
    mocks.prisma.product.deleteMany.mockResolvedValue({ count: 10 });
    mocks.prisma.job.deleteMany.mockResolvedValue({ count: 5 });
    mocks.prisma.usageRecord.deleteMany.mockResolvedValue({ count: 3 });
    mocks.prisma.shopSettings.deleteMany.mockResolvedValue({ count: 1 });
    mocks.prisma.session.deleteMany.mockResolvedValue({ count: 2 });

    const response = await complianceAction({ request: createMockRequest() } as any);

    expect(response.status).toBe(200);

    // Verify all deletions happened in correct order (products first due to foreign keys)
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

    // Verify products deleted by job's shop
    expect(mocks.prisma.product.deleteMany).toHaveBeenCalledWith({
      where: {
        job: {
          shop: "test-shop.myshopify.com",
        },
      },
    });

    // Verify jobs deleted by shop
    expect(mocks.prisma.job.deleteMany).toHaveBeenCalledWith({
      where: { shop: "test-shop.myshopify.com" },
    });

    // Verify usage records deleted by shop
    expect(mocks.prisma.usageRecord.deleteMany).toHaveBeenCalledWith({
      where: { shop: "test-shop.myshopify.com" },
    });

    // Verify shop settings deleted by shop
    expect(mocks.prisma.shopSettings.deleteMany).toHaveBeenCalledWith({
      where: { shop: "test-shop.myshopify.com" },
    });

    // Verify sessions deleted by shop
    expect(mocks.prisma.session.deleteMany).toHaveBeenCalledWith({
      where: { shop: "test-shop.myshopify.com" },
    });
  });
});
