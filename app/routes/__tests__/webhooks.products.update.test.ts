import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies using vi.hoisted
const mocks = vi.hoisted(() => ({
  prisma: {
    shopSettings: {
      findUnique: vi.fn(),
    },
    job: {
      create: vi.fn(),
      delete: vi.fn(),
    },
    product: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  },
  authenticate: {
    webhook: vi.fn(),
  },
  queueProductAnalysis: vi.fn(),
  hasAvailableCredits: vi.fn(),
  useCredits: vi.fn(),
}));

// Mock modules
vi.mock("../../db.server", () => ({
  default: mocks.prisma,
}));

vi.mock("../../shopify.server", () => ({
  authenticate: mocks.authenticate,
}));

vi.mock("../../services/queue.server", () => ({
  queueProductAnalysis: mocks.queueProductAnalysis,
}));

vi.mock("../../services/billing.server", () => ({
  hasAvailableCredits: mocks.hasAvailableCredits,
  useCredits: mocks.useCredits,
}));

// Import after mocking
import { action } from "../webhooks.products.update";

// Test fixtures
const mockShopSettings = {
  id: "settings-1",
  shop: "test-shop.myshopify.com",
  plan: "PRO",
  autoSyncNewProducts: true,
};

const mockProductPayload = {
  id: 123456789,
  title: "Blue Cotton T-Shirt",
  product_type: "Apparel",
  tags: "existing-tag",
  image: {
    src: "https://cdn.shopify.com/image.jpg",
  },
};

const mockProductWithoutImage = {
  ...mockProductPayload,
  image: null,
  images: [],
};

const mockJob = {
  id: "job-123",
  shop: "test-shop.myshopify.com",
  status: "QUEUED",
  totalItems: 1,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("webhooks.products.update", () => {
  function createMockRequest() {
    return new Request("https://app.example.com/webhooks/products/update", {
      method: "POST",
      body: JSON.stringify(mockProductPayload),
    });
  }

  it("should skip when auto-sync is disabled", async () => {
    mocks.authenticate.webhook.mockResolvedValue({
      shop: "test-shop.myshopify.com",
      topic: "PRODUCTS_UPDATE",
      payload: mockProductPayload,
    });
    mocks.prisma.shopSettings.findUnique.mockResolvedValue({
      ...mockShopSettings,
      autoSyncNewProducts: false,
    });

    const response = await action({ request: createMockRequest() } as any);

    expect(response.status).toBe(200);
    expect(mocks.prisma.job.create).not.toHaveBeenCalled();
    expect(mocks.queueProductAnalysis).not.toHaveBeenCalled();
  });

  it("should skip when shop settings not found", async () => {
    mocks.authenticate.webhook.mockResolvedValue({
      shop: "test-shop.myshopify.com",
      topic: "PRODUCTS_UPDATE",
      payload: mockProductPayload,
    });
    mocks.prisma.shopSettings.findUnique.mockResolvedValue(null);

    const response = await action({ request: createMockRequest() } as any);

    expect(response.status).toBe(200);
    expect(mocks.prisma.job.create).not.toHaveBeenCalled();
  });

  it("should skip products without images", async () => {
    mocks.authenticate.webhook.mockResolvedValue({
      shop: "test-shop.myshopify.com",
      topic: "PRODUCTS_UPDATE",
      payload: mockProductWithoutImage,
    });
    mocks.prisma.shopSettings.findUnique.mockResolvedValue(mockShopSettings);

    const response = await action({ request: createMockRequest() } as any);

    expect(response.status).toBe(200);
    expect(mocks.hasAvailableCredits).not.toHaveBeenCalled();
    expect(mocks.prisma.job.create).not.toHaveBeenCalled();
  });

  it("should skip when image URL unchanged", async () => {
    mocks.authenticate.webhook.mockResolvedValue({
      shop: "test-shop.myshopify.com",
      topic: "PRODUCTS_UPDATE",
      payload: mockProductPayload,
    });
    mocks.prisma.shopSettings.findUnique.mockResolvedValue(mockShopSettings);
    mocks.prisma.product.findFirst.mockResolvedValue({
      id: "gid://shopify/Product/123456789",
      imageUrl: "https://cdn.shopify.com/image.jpg", // same as payload
    });

    const response = await action({ request: createMockRequest() } as any);

    expect(response.status).toBe(200);
    expect(mocks.hasAvailableCredits).not.toHaveBeenCalled();
    expect(mocks.prisma.job.create).not.toHaveBeenCalled();
  });

  it("should skip when no credits available", async () => {
    mocks.authenticate.webhook.mockResolvedValue({
      shop: "test-shop.myshopify.com",
      topic: "PRODUCTS_UPDATE",
      payload: mockProductPayload,
    });
    mocks.prisma.shopSettings.findUnique.mockResolvedValue(mockShopSettings);
    mocks.prisma.product.findFirst.mockResolvedValue({
      id: "gid://shopify/Product/123456789",
      imageUrl: "https://cdn.shopify.com/old-image.jpg", // different from payload
    });
    mocks.hasAvailableCredits.mockResolvedValue({
      allowed: false,
      useOverage: false,
      overageCount: 0,
    });

    const response = await action({ request: createMockRequest() } as any);

    expect(response.status).toBe(200);
    expect(mocks.prisma.job.create).not.toHaveBeenCalled();
  });

  it("should create job and queue when image changed", async () => {
    mocks.authenticate.webhook.mockResolvedValue({
      shop: "test-shop.myshopify.com",
      topic: "PRODUCTS_UPDATE",
      payload: mockProductPayload,
    });
    mocks.prisma.shopSettings.findUnique.mockResolvedValue(mockShopSettings);
    mocks.prisma.product.findFirst.mockResolvedValue({
      id: "gid://shopify/Product/123456789",
      imageUrl: "https://cdn.shopify.com/old-image.jpg", // different from payload
    });
    mocks.hasAvailableCredits.mockResolvedValue({
      allowed: true,
      useOverage: false,
      overageCount: 0,
    });
    mocks.prisma.job.create.mockResolvedValue(mockJob);
    mocks.prisma.product.create.mockResolvedValue({});
    mocks.queueProductAnalysis.mockResolvedValue({});
    mocks.useCredits.mockResolvedValue({ success: true, remaining: 10 });

    const response = await action({ request: createMockRequest() } as any);

    expect(response.status).toBe(200);
    expect(mocks.prisma.job.create).toHaveBeenCalledWith({
      data: {
        shop: "test-shop.myshopify.com",
        status: "QUEUED",
        totalItems: 1,
      },
    });
    // product.create uses a UUID suffix, so check with objectContaining
    expect(mocks.prisma.product.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        jobId: mockJob.id,
        title: mockProductPayload.title,
        imageUrl: mockProductPayload.image.src,
        currentCategory: mockProductPayload.product_type,
        currentTags: mockProductPayload.tags,
        status: "PENDING",
      }),
    });
    expect(mocks.queueProductAnalysis).toHaveBeenCalledWith(
      mockJob.id,
      expect.stringContaining("gid://shopify/Product/123456789"),
      mockProductPayload.image.src,
      "test-shop.myshopify.com"
    );
    expect(mocks.useCredits).toHaveBeenCalledWith("test-shop.myshopify.com", 1);
  });

  it("should return 200 even when internal error occurs", async () => {
    mocks.authenticate.webhook.mockResolvedValue({
      shop: "test-shop.myshopify.com",
      topic: "PRODUCTS_UPDATE",
      payload: mockProductPayload,
    });
    // Simulate an internal error after auth
    mocks.prisma.shopSettings.findUnique.mockRejectedValue(
      new Error("Database error")
    );

    const response = await action({ request: createMockRequest() } as any);

    // The action catches errors and returns 200 to prevent Shopify retries
    expect(response.status).toBe(200);
  });
});
