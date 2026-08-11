import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies using vi.hoisted
const mocks = vi.hoisted(() => ({
  prisma: {
    job: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    product: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    shopSettings: {
      updateMany: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  authenticate: {
    admin: vi.fn(),
  },
  updateProductMetafields: vi.fn(),
  updateProductTags: vi.fn(),
  updateProductImageAlt: vi.fn(),
  updateProductDescriptionAndSeo: vi.fn(),
  fetchProductDescriptionAndSeo: vi.fn(),
  queueBulkAnalysis: vi.fn(),
  consumeCredits: vi.fn(),
}));

// Mock modules
vi.mock("../../db.server", () => ({
  default: mocks.prisma,
}));

vi.mock("../../shopify.server", () => ({
  authenticate: mocks.authenticate,
}));

vi.mock("../../services/metafields.server", () => ({
  updateProductMetafields: mocks.updateProductMetafields,
}));

vi.mock("../../services/products.server", () => ({
  updateProductTags: mocks.updateProductTags,
  updateProductImageAlt: mocks.updateProductImageAlt,
  updateProductDescriptionAndSeo: mocks.updateProductDescriptionAndSeo,
  fetchProductDescriptionAndSeo: mocks.fetchProductDescriptionAndSeo,
}));

vi.mock("../../services/queue.server", () => ({
  queueBulkAnalysis: mocks.queueBulkAnalysis,
}));

vi.mock("../../services/billing.server", () => ({
  consumeCredits: mocks.consumeCredits,
}));

// Import after mocking
import { action } from "../app.jobs.$id";

// Test fixtures
const mockAdmin = { graphql: vi.fn() };
const mockSession = { shop: "test.myshopify.com" };

const mockAnalyzedProduct = {
  id: "gid://shopify/Product/1",
  title: "Blue T-Shirt",
  status: "ANALYZED",
  currentCategory: "Apparel",
  suggestedMetafields: {
    color: "blue",
    material: "cotton",
    alt_text: "A blue cotton t-shirt on white background",
  },
  suggestedTags: ["blue", "cotton", "t-shirt", "apparel"],
};

const mockPendingProduct = {
  id: "gid://shopify/Product/3",
  title: "Pending Item",
  status: "PENDING",
  currentCategory: "Other",
  suggestedMetafields: null,
  suggestedTags: null,
};

function createSyncRequest(
  productIds: string[],
  options: {
    syncMetafields?: boolean;
    syncTags?: boolean;
    syncAltText?: boolean;
    syncDescription?: boolean;
    edits?: Record<string, unknown>;
  } = {},
) {
  const formData = new FormData();
  formData.append("action", "sync");
  formData.append("syncMetafields", String(options.syncMetafields ?? true));
  formData.append("syncTags", String(options.syncTags ?? true));
  formData.append("syncAltText", String(options.syncAltText ?? true));
  formData.append("syncDescription", String(options.syncDescription ?? true));
  formData.append("edits", JSON.stringify(options.edits ?? {}));
  productIds.forEach((id) => formData.append("productIds", id));
  return new Request("https://app.example.com/app/jobs/job-123", {
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
  // Default: the job exists and belongs to the authenticated shop
  mocks.prisma.job.findFirst.mockResolvedValue({
    id: "job-123",
    shop: "test.myshopify.com",
    status: "COMPLETED",
    totalItems: 2,
    processed: 2,
  });
  // Default: no remaining applicable products after a batch
  mocks.prisma.product.count.mockResolvedValue(0);
  mocks.prisma.product.findMany.mockResolvedValue([]);
  mocks.prisma.$transaction.mockResolvedValue([]);
  mocks.prisma.shopSettings.findUnique.mockResolvedValue({ language: "auto" });
  mocks.queueBulkAnalysis.mockResolvedValue(undefined);
  // Default: fetchProductDescriptionAndSeo returns empty originals
  mocks.fetchProductDescriptionAndSeo.mockResolvedValue({
    descriptionHtml: null,
    seoTitle: null,
    metaDescription: null,
  });
});

describe("app.jobs.$id action", () => {
  it("syncs metafields for selected products", async () => {
    mocks.prisma.product.findUnique.mockResolvedValue(mockAnalyzedProduct);
    mocks.updateProductMetafields.mockResolvedValue({ success: true });
    mocks.updateProductTags.mockResolvedValue({ success: true });
    mocks.updateProductImageAlt.mockResolvedValue({ success: true });
    mocks.updateProductDescriptionAndSeo.mockResolvedValue({ success: true });
    mocks.prisma.product.update.mockResolvedValue({});

    const response = await action({
      request: createSyncRequest(["gid://shopify/Product/1"], {
        syncMetafields: true,
        syncTags: false,
        syncAltText: false,
        syncDescription: false,
      }),
      params: { id: "job-123" },
    } as any);
    const data = await response.json();

    expect(data.success).toBe(true);
    expect(data.synced).toBe(1);
    // Metafields sync should exclude alt_text
    expect(mocks.updateProductMetafields).toHaveBeenCalledWith(
      mockAdmin,
      "gid://shopify/Product/1",
      { color: "blue", material: "cotton" },
    );
    expect(mocks.updateProductTags).not.toHaveBeenCalled();
    expect(mocks.updateProductImageAlt).not.toHaveBeenCalled();
  });

  it("syncs tags for selected products", async () => {
    mocks.prisma.product.findUnique.mockResolvedValue(mockAnalyzedProduct);
    mocks.updateProductMetafields.mockResolvedValue({ success: true });
    mocks.updateProductTags.mockResolvedValue({ success: true });
    mocks.updateProductImageAlt.mockResolvedValue({ success: true });
    mocks.updateProductDescriptionAndSeo.mockResolvedValue({ success: true });
    mocks.prisma.product.update.mockResolvedValue({});

    const response = await action({
      request: createSyncRequest(["gid://shopify/Product/1"], {
        syncMetafields: false,
        syncTags: true,
        syncAltText: false,
        syncDescription: false,
      }),
      params: { id: "job-123" },
    } as any);
    const data = await response.json();

    expect(data.success).toBe(true);
    expect(data.synced).toBe(1);
    expect(mocks.updateProductTags).toHaveBeenCalledWith(
      mockAdmin,
      "gid://shopify/Product/1",
      ["blue", "cotton", "t-shirt", "apparel"],
    );
    expect(mocks.updateProductMetafields).not.toHaveBeenCalled();
    expect(mocks.updateProductImageAlt).not.toHaveBeenCalled();
  });

  it("syncs alt text for selected products", async () => {
    mocks.prisma.product.findUnique.mockResolvedValue(mockAnalyzedProduct);
    mocks.updateProductMetafields.mockResolvedValue({ success: true });
    mocks.updateProductTags.mockResolvedValue({ success: true });
    mocks.updateProductImageAlt.mockResolvedValue({ success: true });
    mocks.updateProductDescriptionAndSeo.mockResolvedValue({ success: true });
    mocks.prisma.product.update.mockResolvedValue({});

    const response = await action({
      request: createSyncRequest(["gid://shopify/Product/1"], {
        syncMetafields: false,
        syncTags: false,
        syncAltText: true,
        syncDescription: false,
      }),
      params: { id: "job-123" },
    } as any);
    const data = await response.json();

    expect(data.success).toBe(true);
    expect(data.synced).toBe(1);
    expect(mocks.updateProductImageAlt).toHaveBeenCalledWith(
      mockAdmin,
      "gid://shopify/Product/1",
      "A blue cotton t-shirt on white background",
    );
    expect(mocks.updateProductMetafields).not.toHaveBeenCalled();
    expect(mocks.updateProductTags).not.toHaveBeenCalled();
  });

  it("merges user edits with original suggestions", async () => {
    mocks.prisma.product.findUnique.mockResolvedValue(mockAnalyzedProduct);
    mocks.updateProductMetafields.mockResolvedValue({ success: true });
    mocks.updateProductTags.mockResolvedValue({ success: true });
    mocks.updateProductImageAlt.mockResolvedValue({ success: true });
    mocks.updateProductDescriptionAndSeo.mockResolvedValue({ success: true });
    mocks.prisma.product.update.mockResolvedValue({});

    const edits = {
      "gid://shopify/Product/1": {
        metafields: { color: "navy blue", style: "casual" },
        tags: ["navy", "premium", "cotton"],
        alt_text: "A navy blue premium cotton t-shirt",
      },
    };

    const response = await action({
      request: createSyncRequest(["gid://shopify/Product/1"], {
        syncMetafields: true,
        syncTags: true,
        syncAltText: true,
        edits,
      }),
      params: { id: "job-123" },
    } as any);
    const data = await response.json();

    expect(data.success).toBe(true);
    expect(data.synced).toBe(1);

    // Metafields should be merged (original + edits), with alt_text excluded
    expect(mocks.updateProductMetafields).toHaveBeenCalledWith(
      mockAdmin,
      "gid://shopify/Product/1",
      { color: "navy blue", material: "cotton", style: "casual" },
    );
    // Tags should use the edited version entirely
    expect(mocks.updateProductTags).toHaveBeenCalledWith(
      mockAdmin,
      "gid://shopify/Product/1",
      ["navy", "premium", "cotton"],
    );
    // Alt text should use the edited version
    expect(mocks.updateProductImageAlt).toHaveBeenCalledWith(
      mockAdmin,
      "gid://shopify/Product/1",
      "A navy blue premium cotton t-shirt",
    );
  });

  it("skips non-ANALYZED products", async () => {
    mocks.prisma.product.findUnique.mockResolvedValue(mockPendingProduct);
    mocks.updateProductDescriptionAndSeo.mockResolvedValue({ success: true });

    const response = await action({
      request: createSyncRequest(["gid://shopify/Product/3"]),
      params: { id: "job-123" },
    } as any);
    const data = await response.json();

    expect(data.success).toBe(true);
    expect(data.synced).toBe(0);
    expect(mocks.updateProductMetafields).not.toHaveBeenCalled();
    expect(mocks.updateProductTags).not.toHaveBeenCalled();
    expect(mocks.updateProductImageAlt).not.toHaveBeenCalled();
    expect(mocks.prisma.product.update).not.toHaveBeenCalled();
  });

  it("returns error for empty selection", async () => {
    const response = await action({
      request: createSyncRequest([]),
      params: { id: "job-123" },
    } as any);
    const data = await response.json();

    expect(data.success).toBe(false);
    expect(data.error).toBe("No products selected");
    expect(mocks.prisma.product.findUnique).not.toHaveBeenCalled();
  });

  it("handles malformed edits JSON", async () => {
    const formData = new FormData();
    formData.append("action", "sync");
    formData.append("syncMetafields", "true");
    formData.append("syncTags", "true");
    formData.append("syncAltText", "true");
    formData.append("edits", "{invalid json{{");
    formData.append("productIds", "gid://shopify/Product/1");
    const request = new Request("https://app.example.com/app/jobs/job-123", {
      method: "POST",
      body: formData,
    });

    const response = await action({
      request,
      params: { id: "job-123" },
    } as any);
    const data = await response.json();

    expect(data.success).toBe(false);
    expect(data.error).toBe("Invalid edits data");
    expect(mocks.prisma.product.findUnique).not.toHaveBeenCalled();
  });
});

describe("app.jobs.$id action - shop scoping and selectAll auto-chain", () => {
  function createSelectAllRequest() {
    const formData = new FormData();
    formData.append("action", "sync");
    formData.append("selectAll", "true");
    formData.append("syncMetafields", "true");
    formData.append("syncTags", "true");
    formData.append("syncAltText", "true");
    formData.append("syncDescription", "true");
    formData.append("edits", JSON.stringify({}));
    return new Request("https://app.example.com/app/jobs/job-123", {
      method: "POST",
      body: formData,
    });
  }

  it("rejects jobs that belong to another shop", async () => {
    mocks.prisma.job.findFirst.mockResolvedValue(null);

    const response = await action({
      request: createSyncRequest(["gid://shopify/Product/1"]),
      params: { id: "job-123" },
    } as any);
    const data = await response.json();

    expect(data.success).toBe(false);
    expect(data.error).toBe("Job not found");
    expect(mocks.prisma.job.findFirst).toHaveBeenCalledWith({
      where: { id: "job-123", shop: "test.myshopify.com" },
    });
    expect(mocks.prisma.product.findUnique).not.toHaveBeenCalled();
  });

  it("selects the batch server-side when selectAll is set and returns remaining", async () => {
    mocks.prisma.product.findMany.mockResolvedValue([
      { id: "gid://shopify/Product/1" },
    ]);
    mocks.prisma.product.findUnique.mockResolvedValue(mockAnalyzedProduct);
    mocks.updateProductMetafields.mockResolvedValue({ success: true });
    mocks.updateProductTags.mockResolvedValue({ success: true });
    mocks.updateProductImageAlt.mockResolvedValue({ success: true });
    mocks.updateProductDescriptionAndSeo.mockResolvedValue({ success: true });
    mocks.prisma.product.update.mockResolvedValue({});
    mocks.prisma.shopSettings.updateMany.mockResolvedValue({});
    mocks.prisma.shopSettings.update.mockResolvedValue({});
    mocks.prisma.product.count.mockResolvedValue(3);

    const response = await action({
      request: createSelectAllRequest(),
      params: { id: "job-123" },
    } as any);
    const data = await response.json();

    expect(mocks.prisma.product.findMany).toHaveBeenCalledWith({
      where: { jobId: "job-123", status: "ANALYZED", error: null },
      orderBy: { createdAt: "asc" },
      take: 50,
      select: { id: true },
    });
    expect(data.success).toBe(true);
    expect(data.synced).toBe(1);
    expect(data.remaining).toBe(3);
  });

  it("returns 'No products ready to apply' when selectAll finds nothing", async () => {
    mocks.prisma.product.findMany.mockResolvedValue([]);

    const response = await action({
      request: createSelectAllRequest(),
      params: { id: "job-123" },
    } as any);
    const data = await response.json();

    expect(data.success).toBe(false);
    expect(data.error).toBe("No products ready to apply");
  });

  it("clears the stored error when a product syncs successfully", async () => {
    mocks.prisma.product.findUnique.mockResolvedValue(mockAnalyzedProduct);
    mocks.updateProductMetafields.mockResolvedValue({ success: true });
    mocks.updateProductTags.mockResolvedValue({ success: true });
    mocks.updateProductImageAlt.mockResolvedValue({ success: true });
    mocks.updateProductDescriptionAndSeo.mockResolvedValue({ success: true });
    mocks.prisma.product.update.mockResolvedValue({});
    mocks.prisma.shopSettings.updateMany.mockResolvedValue({});
    mocks.prisma.shopSettings.update.mockResolvedValue({});

    await action({
      request: createSyncRequest(["gid://shopify/Product/1"]),
      params: { id: "job-123" },
    } as any);

    expect(mocks.prisma.product.update).toHaveBeenCalledWith({
      where: { id: "gid://shopify/Product/1" },
      data: {
        status: "SYNCED",
        syncedAt: expect.any(Date),
        error: null,
      },
    });
  });

  it("skips the originals pre-read when originals were already captured", async () => {
    mocks.prisma.product.findUnique.mockResolvedValue({
      ...mockAnalyzedProduct,
      originalDescription: "<p>Original</p>",
    });
    mocks.updateProductMetafields.mockResolvedValue({ success: true });
    mocks.updateProductTags.mockResolvedValue({ success: true });
    mocks.updateProductImageAlt.mockResolvedValue({ success: true });
    mocks.updateProductDescriptionAndSeo.mockResolvedValue({ success: true });
    mocks.prisma.product.update.mockResolvedValue({});
    mocks.prisma.shopSettings.updateMany.mockResolvedValue({});
    mocks.prisma.shopSettings.update.mockResolvedValue({});

    await action({
      request: createSyncRequest(["gid://shopify/Product/1"]),
      params: { id: "job-123" },
    } as any);

    expect(mocks.fetchProductDescriptionAndSeo).not.toHaveBeenCalled();
  });
});

describe("app.jobs.$id action - retry-failed", () => {
  function createRetryRequest() {
    const formData = new FormData();
    formData.append("action", "retry-failed");
    return new Request("https://app.example.com/app/jobs/job-123", {
      method: "POST",
      body: formData,
    });
  }

  const failedProducts = [
    {
      id: "gid://shopify/Product/7",
      title: "Failed A",
      imageUrl: "https://cdn.shopify.com/a.jpg",
    },
    {
      id: "gid://shopify/Product/8",
      title: "Failed B",
      imageUrl: "https://cdn.shopify.com/b.jpg",
    },
  ];

  it("resets ERROR products, marks job PROCESSING, and re-queues WITHOUT consuming credits", async () => {
    mocks.prisma.job.findFirst.mockResolvedValue({
      id: "job-123",
      shop: "test.myshopify.com",
      status: "COMPLETED",
      totalItems: 10,
      processed: 10,
      industry: "fashion",
    });
    mocks.prisma.product.findMany.mockResolvedValue(failedProducts);

    const response = await action({
      request: createRetryRequest(),
      params: { id: "job-123" },
    } as any);
    const data = await response.json();

    expect(data.success).toBe(true);
    expect(data.retried).toBe(2);
    expect(mocks.prisma.product.updateMany).toHaveBeenCalledWith({
      where: { jobId: "job-123", status: "ERROR" },
      data: { status: "PENDING", error: null },
    });
    expect(mocks.prisma.job.update).toHaveBeenCalledWith({
      where: { id: "job-123" },
      data: { status: "PROCESSING", processed: 8 },
    });
    expect(mocks.queueBulkAnalysis).toHaveBeenCalledWith(
      "job-123",
      [
        {
          id: "gid://shopify/Product/7",
          imageUrl: "https://cdn.shopify.com/a.jpg",
          title: "Failed A",
        },
        {
          id: "gid://shopify/Product/8",
          imageUrl: "https://cdn.shopify.com/b.jpg",
          title: "Failed B",
        },
      ],
      "test.myshopify.com",
      "fashion",
      undefined,
      undefined,
      { bullJobIdSuffix: expect.stringMatching(/^r\d+$/) },
    );
    // The whole point: retries are free
    expect(mocks.consumeCredits).not.toHaveBeenCalled();
  });

  it("rejects retry while the scan is still running", async () => {
    mocks.prisma.job.findFirst.mockResolvedValue({
      id: "job-123",
      shop: "test.myshopify.com",
      status: "PROCESSING",
      totalItems: 10,
      processed: 4,
    });

    const response = await action({
      request: createRetryRequest(),
      params: { id: "job-123" },
    } as any);
    const data = await response.json();

    expect(data.success).toBe(false);
    expect(data.error).toBe("Scan is still in progress");
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
    expect(mocks.queueBulkAnalysis).not.toHaveBeenCalled();
  });

  it("returns error when there are no failed products", async () => {
    mocks.prisma.product.findMany.mockResolvedValue([]);

    const response = await action({
      request: createRetryRequest(),
      params: { id: "job-123" },
    } as any);
    const data = await response.json();

    expect(data.success).toBe(false);
    expect(data.error).toBe("No failed products to retry");
    expect(mocks.queueBulkAnalysis).not.toHaveBeenCalled();
  });

  it("marks job FAILED when re-queueing throws", async () => {
    mocks.prisma.job.findFirst.mockResolvedValue({
      id: "job-123",
      shop: "test.myshopify.com",
      status: "COMPLETED",
      totalItems: 10,
      processed: 10,
      industry: null,
    });
    mocks.prisma.product.findMany.mockResolvedValue(failedProducts);
    mocks.queueBulkAnalysis.mockRejectedValue(new Error("Redis down"));

    const response = await action({
      request: createRetryRequest(),
      params: { id: "job-123" },
    } as any);
    const data = await response.json();

    expect(data.success).toBe(false);
    expect(data.error).toContain("Failed to queue retry");
    expect(mocks.prisma.job.update).toHaveBeenCalledWith({
      where: { id: "job-123" },
      data: { status: "FAILED" },
    });
  });
});
