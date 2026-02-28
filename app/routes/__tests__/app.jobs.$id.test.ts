import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies using vi.hoisted
const mocks = vi.hoisted(() => ({
  prisma: {
    product: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    shopSettings: {
      updateMany: vi.fn(),
      update: vi.fn(),
    },
  },
  authenticate: {
    admin: vi.fn(),
  },
  updateProductMetafields: vi.fn(),
  updateProductTags: vi.fn(),
  updateProductImageAlt: vi.fn(),
  updateProductDescriptionAndSeo: vi.fn(),
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
      "Apparel",
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
      "Apparel",
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
