import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";
import type * as ProductsServer from "../../services/products.server";

// Mock dependencies using vi.hoisted
const mocks = vi.hoisted(() => ({
  prisma: {
    job: {
      create: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    product: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
    },
    shopSettings: {
      updateMany: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
    },
    scannedProduct: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  authenticate: {
    admin: vi.fn(),
  },
  fetchAllProducts: vi.fn(),
  fetchCollectionProducts: vi.fn(),
  queueBulkAnalysis: vi.fn(),
  cleanupStaleJobs: vi.fn(),
  hasAvailableCredits: vi.fn(),
  consumeCredits: vi.fn(),
  getShopBilling: vi.fn(),
  syncPlanFromShopify: vi.fn(),
  getPlanPickerUrl: vi.fn(),
  countProducts: vi.fn(),
  detectIndustry: vi.fn(),
  PLANS: {
    FREE: { credits: 50, scanLimit: 50 },
    PRO: { credits: 5000, scanLimit: 500 },
    SCALE: { credits: 15000, scanLimit: 2000 },
  },
}));

// Mock modules
vi.mock("../../db.server", () => ({
  default: mocks.prisma,
}));

vi.mock("../../shopify.server", () => ({
  authenticate: mocks.authenticate,
}));

// Partial mock: only the Shopify-calling fetchers are stubbed. The tag-filter
// helpers are pure and are exercised for real so the assertions below pin actual
// filter behaviour rather than a stub's.
vi.mock("../../services/products.server", async (importOriginal) => ({
  ...(await importOriginal<typeof ProductsServer>()),
  fetchAllProducts: mocks.fetchAllProducts,
  fetchCollectionProducts: mocks.fetchCollectionProducts,
  countProducts: mocks.countProducts,
}));

vi.mock("../../services/queue.server", () => ({
  queueBulkAnalysis: mocks.queueBulkAnalysis,
  cleanupStaleJobs: mocks.cleanupStaleJobs,
}));

vi.mock("../../services/billing.server", () => ({
  hasAvailableCredits: mocks.hasAvailableCredits,
  consumeCredits: mocks.consumeCredits,
  getShopBilling: mocks.getShopBilling,
  syncPlanFromShopify: mocks.syncPlanFromShopify,
  getPlanPickerUrl: mocks.getPlanPickerUrl,
  PLANS: mocks.PLANS,
}));

vi.mock("../../services/industry.server", () => ({
  detectIndustry: mocks.detectIndustry,
}));

// Import after mocking
import { action, loader } from "../app._index";

// Test fixtures
const mockAdmin = { graphql: vi.fn() };
const mockSession = { shop: "test.myshopify.com" };

const mockProducts = [
  {
    id: "gid://shopify/Product/1",
    title: "Blue T-Shirt",
    vendor: "TestBrand",
    imageUrl: "https://cdn.shopify.com/blue-shirt.jpg",
    category: "Apparel",
    tags: ["cotton", "blue"],
  },
  {
    id: "gid://shopify/Product/2",
    title: "Red Sneakers",
    vendor: "ShoeCo",
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

function createScanRequest(collection = "all", includeScanned = false, tagFilter?: string) {
  const formData = new FormData();
  formData.append("action", "start-scan");
  formData.append("selectedCollection", collection);
  if (includeScanned) {
    formData.append("includeScanned", "true");
  }
  if (tagFilter) {
    formData.append("tagFilter", tagFilter);
  }
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
  // Default: Free plan billing
  mocks.getShopBilling.mockResolvedValue({
    plan: "FREE",
    creditsUsed: 0,
    creditLimit: 50,
    creditsRemaining: 50,
    billingPeriodStart: new Date(),
    autoSyncEnabled: false,
  });
  // Default: no active jobs (concurrent scan check)
  mocks.prisma.job.findMany.mockResolvedValue([]);
  // Default: industry detection returns general
  mocks.detectIndustry.mockReturnValue("general");
  // Default: shopSettings.update resolves (for industry caching)
  mocks.prisma.shopSettings.update.mockResolvedValue({});
  // Default: empty scan ledger
  mocks.prisma.scannedProduct.findMany.mockResolvedValue([]);
  mocks.prisma.scannedProduct.count.mockResolvedValue(0);
  // Default: language setting is auto
  mocks.prisma.shopSettings.findUnique.mockResolvedValue({ language: "auto" });
  // Default: admin.graphql returns locale and shop name
  mockAdmin.graphql.mockResolvedValue({
    json: () => Promise.resolve({ data: { shop: { primaryLocale: { isoCode: "en" }, name: "Test Store" } } }),
  });
});

describe("app._index action", () => {
  it("creates job and queues products on start-scan", async () => {
    mocks.fetchAllProducts.mockResolvedValue(mockProducts);
    mocks.hasAvailableCredits.mockResolvedValue({ allowed: true });
    mocks.prisma.job.create.mockResolvedValue(mockJob);
    mocks.prisma.$transaction.mockResolvedValue([{}, {}]);
    mocks.queueBulkAnalysis.mockResolvedValue(undefined);
    mocks.consumeCredits.mockResolvedValue({ success: true, remaining: 48 });

    const response = await action({ request: createScanRequest() } as any);
    const data = await response.json();

    expect(data.success).toBe(true);
    expect(data.jobId).toBe("job-abc-123");
    expect(mocks.prisma.job.create).toHaveBeenCalledWith({
      data: {
        shop: "test.myshopify.com",
        collectionId: null,
        status: "QUEUED",
        totalItems: 2,
        industry: "general",
        tagFormat: "FREEFORM",
        tagSchema: Prisma.DbNull,
        tagFilter: null,
      },
    });
    expect(mocks.queueBulkAnalysis).toHaveBeenCalledWith(
      "job-abc-123",
      [
        { id: "gid://shopify/Product/1", imageUrl: "https://cdn.shopify.com/blue-shirt.jpg", title: "Blue T-Shirt", vendor: "TestBrand" },
        { id: "gid://shopify/Product/2", imageUrl: "https://cdn.shopify.com/red-sneakers.jpg", title: "Red Sneakers", vendor: "ShoeCo" },
      ],
      "test.myshopify.com",
      "general",
      "English",
      "Test Store",
    );
  });

  it("passes the tag filter through to the fetcher and records it on the job", async () => {
    mocks.fetchAllProducts.mockResolvedValue(mockProducts);
    mocks.hasAvailableCredits.mockResolvedValue({ allowed: true });
    mocks.prisma.job.create.mockResolvedValue(mockJob);
    mocks.prisma.$transaction.mockResolvedValue([{}, {}]);
    mocks.queueBulkAnalysis.mockResolvedValue(undefined);
    mocks.consumeCredits.mockResolvedValue({ success: true, remaining: 48 });

    await action({
      request: createScanRequest("all", false, "MISSING_KEY:Color"),
    } as any);

    expect(mocks.fetchAllProducts).toHaveBeenCalledWith(
      mockAdmin,
      50,
      expect.objectContaining({ tagFilter: { kind: "MISSING_KEY", key: "Color" } }),
    );
    expect(mocks.prisma.job.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tagFilter: "MISSING_KEY:Color" }),
      }),
    );
  });

  it("explains an empty result in terms of the tag filter, not the scan ledger", async () => {
    mocks.fetchAllProducts.mockResolvedValue([]);
    mocks.prisma.scannedProduct.findMany.mockResolvedValue([
      { productId: "gid://shopify/Product/1" },
    ]);

    const response = await action({
      request: createScanRequest("all", false, "UNTAGGED"),
    } as any);
    const data = await response.json();

    expect(data.success).toBe(false);
    expect(data.error).toContain("products with no tags");
    expect(data.error).not.toContain("already been scanned");
  });

  it("falls back to ANY for an unrecognised tag filter rather than failing the scan", async () => {
    mocks.fetchAllProducts.mockResolvedValue(mockProducts);
    mocks.hasAvailableCredits.mockResolvedValue({ allowed: true });
    mocks.prisma.job.create.mockResolvedValue(mockJob);
    mocks.prisma.$transaction.mockResolvedValue([{}, {}]);
    mocks.queueBulkAnalysis.mockResolvedValue(undefined);
    mocks.consumeCredits.mockResolvedValue({ success: true, remaining: 48 });

    await action({
      request: createScanRequest("all", false, "NONSENSE"),
    } as any);

    expect(mocks.fetchAllProducts).toHaveBeenCalledWith(
      mockAdmin,
      50,
      expect.objectContaining({ tagFilter: { kind: "ANY" } }),
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
    mocks.consumeCredits.mockResolvedValue({ success: true, remaining: 48 });

    await action({ request: createScanRequest() } as any);

    expect(mocks.consumeCredits).toHaveBeenCalledWith("test.myshopify.com", 2);
    expect(mocks.hasAvailableCredits).toHaveBeenCalledWith("test.myshopify.com", 2);
  });

  it("respects collection filter (uses fetchCollectionProducts when selected)", async () => {
    mocks.fetchCollectionProducts.mockResolvedValue(mockProducts);
    mocks.hasAvailableCredits.mockResolvedValue({ allowed: true });
    mocks.prisma.job.create.mockResolvedValue(mockJob);
    mocks.prisma.$transaction.mockResolvedValue([{}, {}]);
    mocks.queueBulkAnalysis.mockResolvedValue(undefined);
    mocks.consumeCredits.mockResolvedValue({ success: true });

    const collectionGid = "gid://shopify/Collection/42";
    await action({ request: createScanRequest(collectionGid) } as any);

    expect(mocks.fetchCollectionProducts).toHaveBeenCalledWith(
      mockAdmin,
      collectionGid,
      50,
      expect.objectContaining({ excludeIds: undefined, tagFilter: { kind: "ANY" } }),
    );
    expect(mocks.fetchAllProducts).not.toHaveBeenCalled();
  });

  it("limits scan to plan-based cap (50 Free, 500 Pro, 2000 Scale)", async () => {
    const planCases = [
      { plan: "FREE", creditLimit: 50, expectedLimit: 50 },
      { plan: "PRO", creditLimit: 5000, expectedLimit: 500 },
      { plan: "SCALE", creditLimit: 15000, expectedLimit: 2000 },
    ];

    for (const { plan, creditLimit, expectedLimit } of planCases) {
      vi.clearAllMocks();
      mocks.authenticate.admin.mockResolvedValue({ admin: mockAdmin, session: mockSession });
      mocks.getShopBilling.mockResolvedValue({
        plan,
        creditsUsed: 0,
        creditLimit,
        creditsRemaining: creditLimit,
        billingPeriodStart: new Date(),
        autoSyncEnabled: false,
      });
      mocks.prisma.job.findMany.mockResolvedValue([]);
      mocks.detectIndustry.mockReturnValue("general");
      mocks.fetchAllProducts.mockResolvedValue(mockProducts);
      mocks.hasAvailableCredits.mockResolvedValue({ allowed: true });
      mocks.prisma.job.create.mockResolvedValue(mockJob);
      mocks.prisma.$transaction.mockResolvedValue([{}, {}]);
      mocks.queueBulkAnalysis.mockResolvedValue(undefined);
      mocks.consumeCredits.mockResolvedValue({ success: true });

      await action({ request: createScanRequest() } as any);
      expect(mocks.fetchAllProducts).toHaveBeenCalledWith(
        mockAdmin,
        expectedLimit,
        expect.objectContaining({ excludeIds: undefined, tagFilter: { kind: "ANY" } }),
      );
    }
  });

  it("caps the run at remaining credits (effectiveLimit = min(scanLimit, creditsRemaining))", async () => {
    mocks.getShopBilling.mockResolvedValue({
      plan: "PRO",
      creditsUsed: 4990,
      creditLimit: 5000,
      creditsRemaining: 10,
      billingPeriodStart: new Date(),
      autoSyncEnabled: false,
    });
    mocks.fetchAllProducts.mockResolvedValue(mockProducts);
    mocks.hasAvailableCredits.mockResolvedValue({ allowed: true });
    mocks.prisma.job.create.mockResolvedValue(mockJob);
    mocks.prisma.$transaction.mockResolvedValue([{}, {}]);
    mocks.queueBulkAnalysis.mockResolvedValue(undefined);
    mocks.consumeCredits.mockResolvedValue({ success: true });

    await action({ request: createScanRequest() } as any);

    expect(mocks.fetchAllProducts).toHaveBeenCalledWith(mockAdmin, 10, expect.objectContaining({
      excludeIds: undefined,
      tagFilter: { kind: "ANY" },
    }));
  });

  it("returns credit error before fetching when no credits remain", async () => {
    mocks.getShopBilling.mockResolvedValue({
      plan: "PRO",
      creditsUsed: 5000,
      creditLimit: 5000,
      creditsRemaining: 0,
      billingPeriodStart: new Date(),
      autoSyncEnabled: false,
    });

    const response = await action({ request: createScanRequest() } as any);
    const data = await response.json();

    expect(data.success).toBe(false);
    expect(data.error).toContain("Not enough credits");
    expect(mocks.fetchAllProducts).not.toHaveBeenCalled();
    expect(mocks.prisma.scannedProduct.findMany).not.toHaveBeenCalled();
  });

  it("passes already-scanned product IDs as excludeIds", async () => {
    mocks.prisma.scannedProduct.findMany.mockResolvedValue([
      { productId: "gid://shopify/Product/1" },
      { productId: "gid://shopify/Product/9" },
    ]);
    mocks.fetchAllProducts.mockResolvedValue(mockProducts);
    mocks.hasAvailableCredits.mockResolvedValue({ allowed: true });
    mocks.prisma.job.create.mockResolvedValue(mockJob);
    mocks.prisma.$transaction.mockResolvedValue([{}, {}]);
    mocks.queueBulkAnalysis.mockResolvedValue(undefined);
    mocks.consumeCredits.mockResolvedValue({ success: true });

    await action({ request: createScanRequest() } as any);

    expect(mocks.fetchAllProducts).toHaveBeenCalledWith(mockAdmin, 50, expect.objectContaining({
      excludeIds: new Set([
        "gid://shopify/Product/1",
        "gid://shopify/Product/9",
      ]),
      tagFilter: { kind: "ANY" },
    }));
  });

  it("bypasses the ledger when includeScanned is set", async () => {
    mocks.prisma.scannedProduct.findMany.mockResolvedValue([
      { productId: "gid://shopify/Product/1" },
    ]);
    mocks.fetchAllProducts.mockResolvedValue(mockProducts);
    mocks.hasAvailableCredits.mockResolvedValue({ allowed: true });
    mocks.prisma.job.create.mockResolvedValue(mockJob);
    mocks.prisma.$transaction.mockResolvedValue([{}, {}]);
    mocks.queueBulkAnalysis.mockResolvedValue(undefined);
    mocks.consumeCredits.mockResolvedValue({ success: true });

    await action({ request: createScanRequest("all", true) } as any);

    expect(mocks.prisma.scannedProduct.findMany).not.toHaveBeenCalled();
    expect(mocks.fetchAllProducts).toHaveBeenCalledWith(mockAdmin, 50, expect.objectContaining({
      excludeIds: undefined,
      tagFilter: { kind: "ANY" },
    }));
  });

  it("returns all-scanned message when every product is already in the ledger", async () => {
    mocks.prisma.scannedProduct.findMany.mockResolvedValue([
      { productId: "gid://shopify/Product/1" },
      { productId: "gid://shopify/Product/2" },
    ]);
    mocks.fetchAllProducts.mockResolvedValue([]);

    const response = await action({ request: createScanRequest() } as any);
    const data = await response.json();

    expect(data.success).toBe(false);
    expect(data.error).toContain("already been scanned");
    expect(mocks.prisma.job.create).not.toHaveBeenCalled();
  });

  it("handles queue failure gracefully", async () => {
    mocks.fetchAllProducts.mockResolvedValue(mockProducts);
    mocks.hasAvailableCredits.mockResolvedValue({ allowed: true });
    mocks.prisma.job.create.mockResolvedValue(mockJob);
    mocks.prisma.$transaction.mockResolvedValue([{}, {}]);
    mocks.prisma.job.update.mockResolvedValue({} as any);
    mocks.queueBulkAnalysis.mockRejectedValue(new Error("Redis unavailable"));

    const response = await action({ request: createScanRequest() } as any);
    const data = await response.json();

    expect(data.success).toBe(false);
    expect(data.error).toContain("Failed to start scan");
    // Credits should not be deducted if queue fails
    expect(mocks.consumeCredits).not.toHaveBeenCalled();
    // Job should be marked as FAILED
    expect(mocks.prisma.job.update).toHaveBeenCalledWith({
      where: { id: "job-abc-123" },
      data: { status: "FAILED" },
    });
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

describe("app._index loader", () => {
  function createLoaderRequest() {
    return new Request("https://app.example.com/app", { method: "GET" });
  }

  beforeEach(() => {
    // Loader calls syncPlanFromShopify, cleanupStaleJobs, countProducts, getShopBilling, getPlanPickerUrl
    mocks.syncPlanFromShopify.mockResolvedValue({ plan: "FREE", synced: false });
    mocks.cleanupStaleJobs.mockResolvedValue(undefined);
    mocks.countProducts.mockResolvedValue(10);
    mocks.getShopBilling.mockResolvedValue({
      plan: "FREE",
      creditsUsed: 5,
      creditLimit: 50,
      creditsRemaining: 45,
      billingPeriodStart: new Date(),
      autoSyncEnabled: false,
    });
    mocks.getPlanPickerUrl.mockReturnValue("https://admin.shopify.com/store/test/charges/visiontags/pricing_plans");
    mocks.prisma.job.findMany.mockResolvedValue([]);
    mocks.prisma.product.groupBy.mockResolvedValue([]);
    mocks.prisma.shopSettings.updateMany.mockResolvedValue({ count: 0 });
    mocks.prisma.shopSettings.update.mockResolvedValue({});
  });

  it("returns collections from GraphQL in loader response", async () => {
    mockAdmin.graphql.mockResolvedValue({
      json: () => Promise.resolve({
        data: {
          collections: {
            nodes: [
              { id: "gid://shopify/Collection/1", title: "Summer Sale", productsCount: { count: 15 } },
              { id: "gid://shopify/Collection/2", title: "New Arrivals", productsCount: { count: 8 } },
            ],
          },
        },
      }),
    });

    const response = await loader({ request: createLoaderRequest() } as any);
    const data = await response.json();

    expect(data.collections).toEqual([
      { id: "gid://shopify/Collection/1", title: "Summer Sale", productsCount: 15 },
      { id: "gid://shopify/Collection/2", title: "New Arrivals", productsCount: 8 },
    ]);
  });

  it("returns empty collections when GraphQL query fails", async () => {
    mockAdmin.graphql.mockRejectedValue(new Error("Field 'productsCount' doesn't accept argument 'limit'"));

    const response = await loader({ request: createLoaderRequest() } as any);
    const data = await response.json();

    expect(data.collections).toEqual([]);
    // Loader should still return other data successfully
    expect(data.productCount).toBe(10);
    expect(data.billing.plan).toBe("FREE");
  });

  it("does not break dashboard when countProducts throws (first-run resilience)", async () => {
    // Regression test: a transient Shopify GraphQL failure on countProducts must
    // not propagate out of the loader. Otherwise the merchant sees a broken
    // iframe on first install and uninstalls (observed for vis24druck and
    // jvzgd4-dh on 2026-04-05 and 2026-04-25).
    mocks.countProducts.mockRejectedValue(new Error("Throttled"));
    mockAdmin.graphql.mockResolvedValue({
      json: () => Promise.resolve({ data: { collections: { nodes: [] } } }),
    });

    const response = await loader({ request: createLoaderRequest() } as any);
    const data = await response.json();

    expect(data.productCount).toBe(0);
    expect(data.billing.plan).toBe("FREE");
    expect(data.collections).toEqual([]);
  });

  it("does not break dashboard when cleanupStaleJobs throws", async () => {
    mocks.cleanupStaleJobs.mockRejectedValue(new Error("DB connection error"));
    mockAdmin.graphql.mockResolvedValue({
      json: () => Promise.resolve({ data: { collections: { nodes: [] } } }),
    });

    const response = await loader({ request: createLoaderRequest() } as any);
    const data = await response.json();

    expect(data.productCount).toBe(10);
    expect(data.billing.plan).toBe("FREE");
  });

  it("returns pendingSyncCount and syncedCount for completed job with unsynced products", async () => {
    mockAdmin.graphql.mockResolvedValue({
      json: () => Promise.resolve({ data: { collections: { nodes: [] } } }),
    });
    mocks.prisma.job.findMany.mockResolvedValue([
      { id: "job-completed-1", status: "COMPLETED", totalItems: 10, processed: 10, createdAt: new Date(), _count: { products: 10 } },
    ]);
    mocks.prisma.product.groupBy.mockResolvedValue([
      { jobId: "job-completed-1", _count: 2 },
    ]);
    mocks.prisma.product.count.mockResolvedValue(8);

    const response = await loader({ request: createLoaderRequest() } as any);
    const data = await response.json();

    expect(data.pendingSyncCount).toBe(8);
    expect(data.recentJobId).toBe("job-completed-1");
    expect(data.jobs[0].syncedCount).toBe(2);
    expect(mocks.prisma.product.count).toHaveBeenCalledWith({
      where: { jobId: "job-completed-1", status: "ANALYZED" },
    });
    expect(mocks.prisma.product.groupBy).toHaveBeenCalledWith({
      by: ['jobId'],
      where: { jobId: { in: ["job-completed-1"] }, status: 'SYNCED' },
      _count: true,
    });
  });

  it("returns pendingSyncCount 0 and empty jobs when no completed jobs", async () => {
    mockAdmin.graphql.mockResolvedValue({
      json: () => Promise.resolve({ data: { collections: { nodes: [] } } }),
    });
    mocks.prisma.job.findMany.mockResolvedValue([]);

    const response = await loader({ request: createLoaderRequest() } as any);
    const data = await response.json();

    expect(data.pendingSyncCount).toBe(0);
    expect(data.recentJobId).toBeNull();
    expect(data.jobs).toEqual([]);
  });
});
