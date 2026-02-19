import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies using vi.hoisted
const mocks = vi.hoisted(() => ({
  prisma: {
    job: {
      create: vi.fn(),
    },
    product: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  authenticate: {
    admin: vi.fn(),
  },
  fetchAllProducts: vi.fn(),
  fetchCollectionProducts: vi.fn(),
  queueBulkAnalysis: vi.fn(),
  hasAvailableCredits: vi.fn(),
  useCredits: vi.fn(),
  getShopBilling: vi.fn(),
  syncPlanFromShopify: vi.fn(),
  getPlanPickerUrl: vi.fn(),
  countProducts: vi.fn(),
  PLANS: {
    FREE: { credits: 50 },
    PRO: { credits: 5000 },
  },
}));

// Mock modules
vi.mock("../../db.server", () => ({
  default: mocks.prisma,
}));

vi.mock("../../shopify.server", () => ({
  authenticate: mocks.authenticate,
}));

vi.mock("../../services/products.server", () => ({
  fetchAllProducts: mocks.fetchAllProducts,
  fetchCollectionProducts: mocks.fetchCollectionProducts,
  countProducts: mocks.countProducts,
}));

vi.mock("../../services/queue.server", () => ({
  queueBulkAnalysis: mocks.queueBulkAnalysis,
}));

vi.mock("../../services/billing.server", () => ({
  hasAvailableCredits: mocks.hasAvailableCredits,
  useCredits: mocks.useCredits,
  getShopBilling: mocks.getShopBilling,
  syncPlanFromShopify: mocks.syncPlanFromShopify,
  getPlanPickerUrl: mocks.getPlanPickerUrl,
  PLANS: mocks.PLANS,
}));

// Import after mocking
import { action } from "../app._index";

// Test fixtures
const mockAdmin = { graphql: vi.fn() };
const mockSession = { shop: "test.myshopify.com" };

const mockProducts = [
  {
    id: "gid://shopify/Product/1",
    title: "Blue T-Shirt",
    imageUrl: "https://cdn.shopify.com/blue-shirt.jpg",
    category: "Apparel",
    tags: ["cotton", "blue"],
  },
  {
    id: "gid://shopify/Product/2",
    title: "Red Sneakers",
    imageUrl: "https://cdn.shopify.com/red-sneakers.jpg",
    category: "Footwear",
    tags: ["leather", "red"],
  },
];

const mockJob = {
  id: "job-abc-123",
  shop: "test.myshopify.com",
  status: "QUEUED",
  totalItems: 2,
};

function createScanRequest(collection = "all") {
  const formData = new FormData();
  formData.append("action", "start-scan");
  formData.append("selectedCollection", collection);
  return new Request("https://app.example.com/app", {
    method: "POST",
    body: formData,
  });
}

function createUnknownActionRequest() {
  const formData = new FormData();
  formData.append("action", "unknown-action");
  return new Request("https://app.example.com/app", {
    method: "POST",
    body: formData,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: authenticate succeeds
  mocks.authenticate.admin.mockResolvedValue({
    admin: mockAdmin,
    session: mockSession,
  });
});

describe("app._index action", () => {
  it("creates job and queues products on start-scan", async () => {
    mocks.fetchAllProducts.mockResolvedValue(mockProducts);
    mocks.hasAvailableCredits.mockResolvedValue({ allowed: true });
    mocks.prisma.job.create.mockResolvedValue(mockJob);
    mocks.prisma.$transaction.mockResolvedValue([{}, {}]);
    mocks.queueBulkAnalysis.mockResolvedValue(undefined);
    mocks.useCredits.mockResolvedValue({ success: true, remaining: 48 });

    const response = await action({ request: createScanRequest() } as any);
    const data = await response.json();

    expect(data.success).toBe(true);
    expect(data.jobId).toBe("job-abc-123");
    expect(mocks.prisma.job.create).toHaveBeenCalledWith({
      data: {
        shop: "test.myshopify.com",
        status: "QUEUED",
        totalItems: 2,
      },
    });
    expect(mocks.queueBulkAnalysis).toHaveBeenCalledWith(
      "job-abc-123",
      [
        { id: "gid://shopify/Product/1", imageUrl: "https://cdn.shopify.com/blue-shirt.jpg" },
        { id: "gid://shopify/Product/2", imageUrl: "https://cdn.shopify.com/red-sneakers.jpg" },
      ],
      "test.myshopify.com",
    );
  });

  it("returns error when no products with images found", async () => {
    mocks.fetchAllProducts.mockResolvedValue([]);

    const response = await action({ request: createScanRequest() } as any);
    const data = await response.json();

    expect(data.success).toBe(false);
    expect(data.error).toBe("No products with images found");
    expect(mocks.prisma.job.create).not.toHaveBeenCalled();
    expect(mocks.queueBulkAnalysis).not.toHaveBeenCalled();
  });

  it("returns error when insufficient credits", async () => {
    mocks.fetchAllProducts.mockResolvedValue(mockProducts);
    mocks.hasAvailableCredits.mockResolvedValue({ allowed: false });
    mocks.getShopBilling.mockResolvedValue({ plan: "FREE" });

    const response = await action({ request: createScanRequest() } as any);
    const data = await response.json();

    expect(data.success).toBe(false);
    expect(data.error).toContain("Not enough credits");
    expect(data.error).toContain("Upgrade to Pro");
    expect(mocks.prisma.job.create).not.toHaveBeenCalled();
  });

  it("deducts correct number of credits (products.length)", async () => {
    mocks.fetchAllProducts.mockResolvedValue(mockProducts);
    mocks.hasAvailableCredits.mockResolvedValue({ allowed: true });
    mocks.prisma.job.create.mockResolvedValue(mockJob);
    mocks.prisma.$transaction.mockResolvedValue([{}, {}]);
    mocks.queueBulkAnalysis.mockResolvedValue(undefined);
    mocks.useCredits.mockResolvedValue({ success: true, remaining: 48 });

    await action({ request: createScanRequest() } as any);

    expect(mocks.useCredits).toHaveBeenCalledWith("test.myshopify.com", 2);
    expect(mocks.hasAvailableCredits).toHaveBeenCalledWith("test.myshopify.com", 2);
  });

  it("respects collection filter (uses fetchCollectionProducts when selected)", async () => {
    mocks.fetchCollectionProducts.mockResolvedValue(mockProducts);
    mocks.hasAvailableCredits.mockResolvedValue({ allowed: true });
    mocks.prisma.job.create.mockResolvedValue(mockJob);
    mocks.prisma.$transaction.mockResolvedValue([{}, {}]);
    mocks.queueBulkAnalysis.mockResolvedValue(undefined);
    mocks.useCredits.mockResolvedValue({ success: true });

    const collectionGid = "gid://shopify/Collection/42";
    await action({ request: createScanRequest(collectionGid) } as any);

    expect(mocks.fetchCollectionProducts).toHaveBeenCalledWith(
      mockAdmin,
      collectionGid,
      100,
    );
    expect(mocks.fetchAllProducts).not.toHaveBeenCalled();
  });

  it("limits to 100 products", async () => {
    mocks.fetchAllProducts.mockResolvedValue(mockProducts);
    mocks.hasAvailableCredits.mockResolvedValue({ allowed: true });
    mocks.prisma.job.create.mockResolvedValue(mockJob);
    mocks.prisma.$transaction.mockResolvedValue([{}, {}]);
    mocks.queueBulkAnalysis.mockResolvedValue(undefined);
    mocks.useCredits.mockResolvedValue({ success: true });

    await action({ request: createScanRequest() } as any);

    // fetchAllProducts is called with limit 100
    expect(mocks.fetchAllProducts).toHaveBeenCalledWith(mockAdmin, 100);
  });

  it("handles queue failure gracefully", async () => {
    mocks.fetchAllProducts.mockResolvedValue(mockProducts);
    mocks.hasAvailableCredits.mockResolvedValue({ allowed: true });
    mocks.prisma.job.create.mockResolvedValue(mockJob);
    mocks.prisma.$transaction.mockResolvedValue([{}, {}]);
    mocks.queueBulkAnalysis.mockRejectedValue(new Error("Redis unavailable"));

    await expect(
      action({ request: createScanRequest() } as any),
    ).rejects.toThrow("Redis unavailable");

    // Credits should not be deducted if queue fails
    expect(mocks.useCredits).not.toHaveBeenCalled();
  });

  it("returns { success: false } for unknown action", async () => {
    const response = await action({
      request: createUnknownActionRequest(),
    } as any);
    const data = await response.json();

    expect(data.success).toBe(false);
    expect(mocks.fetchAllProducts).not.toHaveBeenCalled();
    expect(mocks.prisma.job.create).not.toHaveBeenCalled();
  });
});
