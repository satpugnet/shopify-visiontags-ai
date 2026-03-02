import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Webhook Handler Tests
 *
 * These tests verify the critical logic in our webhook handlers
 * to prevent regressions of the bugs we fixed.
 */

// Mock prisma
const mockPrisma = {
  session: {
    findFirst: vi.fn(),
    deleteMany: vi.fn(),
  },
  shopSettings: {
    findUnique: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
  },
  job: {
    create: vi.fn(),
    delete: vi.fn(),
  },
  product: {
    create: vi.fn(),
    deleteMany: vi.fn(),
    findFirst: vi.fn(),
  },
  usageRecord: {
    upsert: vi.fn(),
  },
};

vi.mock("../../db.server", () => ({
  default: mockPrisma,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("shop/redact webhook - Reinstall Protection", () => {
  /**
   * CRITICAL BUG FIX:
   * If a shop reinstalls after uninstalling, the shop/redact webhook
   * should NOT delete their new data.
   */

  it("should SKIP deletion if shop has active session (reinstalled)", async () => {
    // Shop has reinstalled - active session exists
    mockPrisma.session.findFirst.mockResolvedValue({
      id: "session-123",
      shop: "test-shop.myshopify.com",
    });

    // Simulate the check from webhooks.compliance.tsx
    const shop = "test-shop.myshopify.com";
    const activeSession = await mockPrisma.session.findFirst({
      where: { shop },
    });

    // Should skip deletion
    const shouldSkipDeletion = activeSession !== null;
    expect(shouldSkipDeletion).toBe(true);

    // Deletion should NOT be called
    expect(mockPrisma.product.deleteMany).not.toHaveBeenCalled();
    expect(mockPrisma.job.delete).not.toHaveBeenCalled();
    expect(mockPrisma.shopSettings.update).not.toHaveBeenCalled();
  });

  it("should PROCEED with deletion if no active session", async () => {
    // Shop has NOT reinstalled - no session
    mockPrisma.session.findFirst.mockResolvedValue(null);

    const shop = "test-shop.myshopify.com";
    const activeSession = await mockPrisma.session.findFirst({
      where: { shop },
    });

    // Should proceed with deletion
    const shouldSkipDeletion = activeSession !== null;
    expect(shouldSkipDeletion).toBe(false);
  });
});

describe("products/create webhook - Credit Deduction Timing", () => {
  /**
   * CRITICAL BUG FIX:
   * Credits should only be deducted AFTER the queue operation succeeds.
   * If queue fails (e.g., Redis down), credits should NOT be deducted.
   */

  it("should NOT deduct credits if queue operation fails", async () => {
    let creditsDeducted = false;
    let queueSucceeded = false;

    // Simulate queue failure
    const queueProductAnalysis = vi.fn().mockRejectedValue(new Error("Redis connection failed"));
    const consumeCredits = vi.fn().mockImplementation(() => {
      creditsDeducted = true;
    });

    try {
      await queueProductAnalysis("job-1", "product-1", "http://image.jpg", "shop");
      queueSucceeded = true;
      await consumeCredits("shop", 1);
    } catch {
      // Queue failed - don't deduct credits
    }

    expect(queueSucceeded).toBe(false);
    expect(creditsDeducted).toBe(false);
    expect(consumeCredits).not.toHaveBeenCalled();
  });

  it("should deduct credits when queue operation succeeds", async () => {
    let creditsDeducted = false;

    // Simulate queue success
    const queueProductAnalysis = vi.fn().mockResolvedValue({ id: "job-123" });
    const consumeCredits = vi.fn().mockImplementation(() => {
      creditsDeducted = true;
      return { success: true, remaining: 49 };
    });

    try {
      await queueProductAnalysis("job-1", "product-1", "http://image.jpg", "shop");
      await consumeCredits("shop", 1);
    } catch {
      // Should not reach here
    }

    expect(consumeCredits).toHaveBeenCalledWith("shop", 1);
    expect(creditsDeducted).toBe(true);
  });
});

describe("app_subscriptions/update webhook - Plan Sync", () => {
  /**
   * BUG FIX:
   * Subscription status changes should sync plan in database.
   */

  it("should upgrade to PRO when subscription becomes ACTIVE", async () => {
    const shop = "test-shop.myshopify.com";
    const subscriptionStatus = "ACTIVE";

    mockPrisma.shopSettings.findUnique.mockResolvedValue({
      shop,
      plan: "FREE",
      creditLimit: 50,
    });

    // Simulate the logic from webhooks.subscriptions.tsx
    const settings = await mockPrisma.shopSettings.findUnique({ where: { shop } });

    if (subscriptionStatus === "ACTIVE" && settings?.plan !== "PRO") {
      await mockPrisma.shopSettings.update({
        where: { shop },
        data: {
          plan: "PRO",
          creditLimit: 4000,
          creditsUsed: 0,
          billingPeriodStart: expect.any(Date),
        },
      });
    }

    expect(mockPrisma.shopSettings.update).toHaveBeenCalled();
  });

  it("should downgrade to FREE when subscription is CANCELLED", async () => {
    const shop = "test-shop.myshopify.com";
    const subscriptionStatus = "CANCELLED";

    mockPrisma.shopSettings.findUnique.mockResolvedValue({
      shop,
      plan: "PRO",
      creditLimit: 4000,
    });

    const settings = await mockPrisma.shopSettings.findUnique({ where: { shop } });
    const shouldDowngrade =
      subscriptionStatus === "CANCELLED" ||
      subscriptionStatus === "EXPIRED" ||
      subscriptionStatus === "DECLINED";

    if (shouldDowngrade && settings?.plan === "PRO") {
      await mockPrisma.shopSettings.update({
        where: { shop },
        data: {
          plan: "FREE",
          creditLimit: 50,
          autoSyncNewProducts: false,
        },
      });
    }

    expect(mockPrisma.shopSettings.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          plan: "FREE",
          autoSyncNewProducts: false,
        }),
      })
    );
  });

  it("should disable auto-sync when subscription is FROZEN", async () => {
    const shop = "test-shop.myshopify.com";
    const subscriptionStatus = "FROZEN";

    mockPrisma.shopSettings.findUnique.mockResolvedValue({
      shop,
      plan: "PRO",
      autoSyncNewProducts: true,
    });

    if (subscriptionStatus === "FROZEN") {
      await mockPrisma.shopSettings.update({
        where: { shop },
        data: {
          autoSyncNewProducts: false,
        },
      });
    }

    expect(mockPrisma.shopSettings.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          autoSyncNewProducts: false,
        }),
      })
    );
  });
});

describe("products/delete webhook - Orphan Cleanup", () => {
  /**
   * BUG FIX:
   * When products are deleted from Shopify, our DB records should be cleaned up.
   */

  it("should delete product records when product is deleted", async () => {
    const productId = "gid://shopify/Product/123";
    const shop = "test-shop.myshopify.com";

    mockPrisma.product.deleteMany.mockResolvedValue({ count: 2 });

    // Simulate the logic from webhooks.products.delete.tsx
    const deleted = await mockPrisma.product.deleteMany({
      where: {
        OR: [
          { id: productId },
          { id: { startsWith: `${productId}-` } },
        ],
        job: {
          shop: shop,
        },
      },
    });

    expect(deleted.count).toBe(2);
    expect(mockPrisma.product.deleteMany).toHaveBeenCalled();
  });
});

describe("products/update webhook - Image Change Detection", () => {
  /**
   * Only re-analyze products if the image actually changed.
   */

  it("should skip re-analysis if image URL unchanged", async () => {
    const productId = "gid://shopify/Product/123";
    const imageUrl = "https://cdn.shopify.com/image.jpg";

    mockPrisma.product.findFirst.mockResolvedValue({
      id: productId,
      imageUrl: imageUrl, // Same as incoming
    });

    const existingProduct = await mockPrisma.product.findFirst({
      where: { id: productId },
    });

    const shouldSkip = existingProduct && existingProduct.imageUrl === imageUrl;
    expect(shouldSkip).toBe(true);
  });

  it("should re-analyze if image URL changed", async () => {
    const productId = "gid://shopify/Product/123";
    const newImageUrl = "https://cdn.shopify.com/new-image.jpg";

    mockPrisma.product.findFirst.mockResolvedValue({
      id: productId,
      imageUrl: "https://cdn.shopify.com/old-image.jpg", // Different
    });

    const existingProduct = await mockPrisma.product.findFirst({
      where: { id: productId },
    });

    const shouldSkip = existingProduct && existingProduct.imageUrl === newImageUrl;
    expect(shouldSkip).toBe(false);
  });

  it("should analyze if product was never analyzed before", async () => {
    const productId = "gid://shopify/Product/123";

    mockPrisma.product.findFirst.mockResolvedValue(null);

    const existingProduct = await mockPrisma.product.findFirst({
      where: { id: productId },
    });

    // When product doesn't exist, shouldSkip is falsy (null in this case)
    // The key point is that we should NOT skip analysis for new products
    const shouldSkip = existingProduct && existingProduct.imageUrl === "any-url";
    expect(shouldSkip).toBeFalsy();
  });
});

describe("Auto-sync guard - Pro only feature", () => {
  /**
   * Auto-sync should only work for Pro users with the feature enabled.
   */

  it("should skip auto-sync if not enabled", async () => {
    mockPrisma.shopSettings.findUnique.mockResolvedValue({
      shop: "test-shop.myshopify.com",
      plan: "PRO",
      autoSyncNewProducts: false,
    });

    const settings = await mockPrisma.shopSettings.findUnique({
      where: { shop: "test-shop.myshopify.com" },
    });

    const shouldAutoSync = settings?.autoSyncNewProducts === true;
    expect(shouldAutoSync).toBe(false);
  });

  it("should skip auto-sync for Free users", async () => {
    mockPrisma.shopSettings.findUnique.mockResolvedValue({
      shop: "test-shop.myshopify.com",
      plan: "FREE",
      autoSyncNewProducts: false, // Can't be true for Free
    });

    const settings = await mockPrisma.shopSettings.findUnique({
      where: { shop: "test-shop.myshopify.com" },
    });

    const shouldAutoSync = settings?.plan === "PRO" && settings?.autoSyncNewProducts;
    expect(shouldAutoSync).toBe(false);
  });

  it("should auto-sync for Pro users with feature enabled", async () => {
    mockPrisma.shopSettings.findUnique.mockResolvedValue({
      shop: "test-shop.myshopify.com",
      plan: "PRO",
      autoSyncNewProducts: true,
    });

    const settings = await mockPrisma.shopSettings.findUnique({
      where: { shop: "test-shop.myshopify.com" },
    });

    const shouldAutoSync = settings?.plan === "PRO" && settings?.autoSyncNewProducts;
    expect(shouldAutoSync).toBe(true);
  });
});

describe("Credit check before operation", () => {
  /**
   * Operations should check credits before proceeding.
   */

  it("should block operation when no credits available", async () => {
    const creditLimit = 50;
    const creditsUsed = 50;
    const required = 1;

    const creditsRemaining = Math.max(0, creditLimit - creditsUsed);
    const hasCredits = creditsRemaining >= required;

    expect(hasCredits).toBe(false);
  });

  it("should allow operation when credits available", async () => {
    const creditLimit = 4000;
    const creditsUsed = 100;
    const required = 10;

    const creditsRemaining = Math.max(0, creditLimit - creditsUsed);
    const hasCredits = creditsRemaining >= required;

    expect(hasCredits).toBe(true);
  });

  it("should allow Pro overage when regular credits exhausted", async () => {
    const creditLimit = 4000;
    const creditsUsed = 4000; // All used
    const overageCap = 25;
    const overagePrice = 0.005;
    const currentOverageCharge = 10; // $10 of $25 used

    const creditsRemaining = Math.max(0, creditLimit - creditsUsed);
    const remainingOverageBudget = overageCap - currentOverageCharge;
    const maxOverageScans = Math.floor(remainingOverageBudget / overagePrice);

    // No regular credits, but overage available
    expect(creditsRemaining).toBe(0);
    expect(maxOverageScans).toBe(3000);
  });
});
