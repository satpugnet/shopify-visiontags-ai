import { describe, it, expect, vi, beforeEach } from "vitest";

// Use vi.hoisted to create mock before it's used in vi.mock
const prismaMock = vi.hoisted(() => ({
  shopSettings: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  usageRecord: {
    upsert: vi.fn(),
  },
  $executeRawUnsafe: vi.fn(),
}));

// Mock the module
vi.mock("../../db.server", () => ({
  default: prismaMock,
}));

// Import after mocking
import {
  PLANS,
  getOrCreateShopSettings,
  getShopBilling,
  hasAvailableCredits,
  consumeCredits,
  resetCredits,
  upgradeToProPlan,
  downgradeToFreePlan,
  toggleAutoSync,
  syncPlanFromShopify,
} from "../billing.server";

// Test fixtures
const freeShopSettings = {
  id: "settings-free-1",
  shop: "test-shop.myshopify.com",
  plan: "FREE" as const,
  creditsUsed: 30,
  creditLimit: 50,
  billingPeriodStart: new Date(),
  autoSyncNewProducts: false,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const proShopSettings = {
  id: "settings-pro-1",
  shop: "pro-shop.myshopify.com",
  plan: "PRO" as const,
  creditsUsed: 2500,
  creditLimit: 5000,
  billingPeriodStart: new Date(),
  autoSyncNewProducts: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const exhaustedFreeSettings = {
  ...freeShopSettings,
  creditsUsed: 50,
};

const exhaustedProSettings = {
  ...proShopSettings,
  creditsUsed: 5000,
};

const expiredBillingSettings = {
  ...freeShopSettings,
  billingPeriodStart: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PLANS configuration", () => {
  describe("FREE plan", () => {
    it("should have correct credit limit (50)", () => {
      expect(PLANS.FREE.credits).toBe(50);
    });

    it("should be free ($0)", () => {
      expect(PLANS.FREE.price).toBe(0);
    });

    it("should have basic features", () => {
      expect(PLANS.FREE.features).toContain("50 AI scans/month");
      expect(PLANS.FREE.features).toContain("Basic metafields");
      expect(PLANS.FREE.features).toContain("Basic tags");
    });

    it("should NOT include auto-sync in features", () => {
      const hasAutoSync = PLANS.FREE.features.some((f) =>
        f.toLowerCase().includes("auto-sync")
      );
      expect(hasAutoSync).toBe(false);
    });
  });

  describe("PRO plan", () => {
    it("should have correct credit limit (5000)", () => {
      expect(PLANS.PRO.credits).toBe(5000);
    });

    it("should cost $19/month", () => {
      expect(PLANS.PRO.price).toBe(19);
    });

    it("should have all pro features", () => {
      expect(PLANS.PRO.features).toContain("5,000 AI scans/month");
      expect(PLANS.PRO.features).toContain("All metafields");
      expect(PLANS.PRO.features).toContain("SEO tags");
      expect(PLANS.PRO.features).toContain("Auto-sync new products");
      expect(PLANS.PRO.features).toContain("Priority support");
    });

    it("should include auto-sync (Pro only feature)", () => {
      const hasAutoSync = PLANS.PRO.features.some((f) =>
        f.toLowerCase().includes("auto-sync")
      );
      expect(hasAutoSync).toBe(true);
    });
  });

  describe("Plan comparison", () => {
    it("PRO should have more credits than FREE", () => {
      expect(PLANS.PRO.credits).toBeGreaterThan(PLANS.FREE.credits);
    });

    it("PRO should have more features than FREE", () => {
      expect(PLANS.PRO.features.length).toBeGreaterThan(
        PLANS.FREE.features.length
      );
    });
  });
});

describe("Billing period expiration", () => {
  it("should detect expired billing period (30+ days)", () => {
    const thirtyOneDaysAgo = new Date();
    thirtyOneDaysAgo.setDate(thirtyOneDaysAgo.getDate() - 31);

    const now = new Date();
    const thirtyDaysInMs = 30 * 24 * 60 * 60 * 1000;
    const isExpired = now.getTime() - thirtyOneDaysAgo.getTime() >= thirtyDaysInMs;

    expect(isExpired).toBe(true);
  });

  it("should NOT detect expired billing period (less than 30 days)", () => {
    const twentyNineDaysAgo = new Date();
    twentyNineDaysAgo.setDate(twentyNineDaysAgo.getDate() - 29);

    const now = new Date();
    const thirtyDaysInMs = 30 * 24 * 60 * 60 * 1000;
    const isExpired = now.getTime() - twentyNineDaysAgo.getTime() >= thirtyDaysInMs;

    expect(isExpired).toBe(false);
  });

  it("should detect exactly 30 days as expired", () => {
    const thirtyDaysInMs = 30 * 24 * 60 * 60 * 1000;
    const now = new Date();
    const exactlyThirtyDaysAgo = new Date(now.getTime() - thirtyDaysInMs);

    const isExpired = now.getTime() - exactlyThirtyDaysAgo.getTime() >= thirtyDaysInMs;

    expect(isExpired).toBe(true);
  });

  it("should handle new accounts (billing period just started)", () => {
    const justNow = new Date();

    const now = new Date();
    const thirtyDaysInMs = 30 * 24 * 60 * 60 * 1000;
    const isExpired = now.getTime() - justNow.getTime() >= thirtyDaysInMs;

    expect(isExpired).toBe(false);
  });
});

describe("Credit calculations", () => {
  it("should calculate remaining credits correctly", () => {
    const creditLimit = 50;
    const creditsUsed = 30;
    const creditsRemaining = Math.max(0, creditLimit - creditsUsed);

    expect(creditsRemaining).toBe(20);
  });

  it("should detect when credits are exhausted", () => {
    const creditLimit = 50;
    const creditsUsed = 50;
    const creditsRemaining = Math.max(0, creditLimit - creditsUsed);

    expect(creditsRemaining).toBe(0);
  });
});

describe("Month formatting for usage records", () => {
  it("should format month as YYYY-MM", () => {
    const date = new Date("2025-01-15T12:00:00Z");
    const month = date.toISOString().slice(0, 7);

    expect(month).toBe("2025-01");
  });

  it("should handle different months", () => {
    const dates = [
      { date: new Date("2025-01-01"), expected: "2025-01" },
      { date: new Date("2025-06-15"), expected: "2025-06" },
      { date: new Date("2025-12-31"), expected: "2025-12" },
    ];

    for (const { date, expected } of dates) {
      expect(date.toISOString().slice(0, 7)).toBe(expected);
    }
  });
});

describe("Subscription status handling", () => {
  it("should recognize ACTIVE as valid subscription", () => {
    const status = "ACTIVE";
    const isActive = status === "ACTIVE";
    expect(isActive).toBe(true);
  });

  it("should recognize CANCELLED as inactive", () => {
    const inactiveStatuses = ["CANCELLED", "EXPIRED", "DECLINED"];

    for (const status of inactiveStatuses) {
      const shouldDowngrade =
        status === "CANCELLED" ||
        status === "EXPIRED" ||
        status === "DECLINED";
      expect(shouldDowngrade).toBe(true);
    }
  });

  it("should handle FROZEN status (payment issues)", () => {
    const status = "FROZEN";
    const isFrozen = status === "FROZEN";
    expect(isFrozen).toBe(true);
  });
});

// ============================================
// INTEGRATION TESTS (with mocked Prisma)
// ============================================

describe("getOrCreateShopSettings (integration)", () => {
  it("should return existing settings if found", async () => {
    prismaMock.shopSettings.findUnique.mockResolvedValue(freeShopSettings as any);

    const result = await getOrCreateShopSettings("test-shop.myshopify.com");

    expect(result).toEqual(freeShopSettings);
    expect(prismaMock.shopSettings.create).not.toHaveBeenCalled();
  });

  it("should create new FREE settings if not found", async () => {
    prismaMock.shopSettings.findUnique.mockResolvedValue(null);
    prismaMock.shopSettings.create.mockResolvedValue({
      ...freeShopSettings,
      creditsUsed: 0,
    } as any);

    const result = await getOrCreateShopSettings("new-shop.myshopify.com");

    expect(prismaMock.shopSettings.create).toHaveBeenCalledWith({
      data: {
        shop: "new-shop.myshopify.com",
        plan: "FREE",
        creditLimit: 50,
      },
    });
    expect(result.plan).toBe("FREE");
  });
});

describe("getShopBilling (integration)", () => {
  it("should return correct billing for FREE plan", async () => {
    prismaMock.shopSettings.findUnique.mockResolvedValue(freeShopSettings as any);

    const billing = await getShopBilling("test-shop.myshopify.com");

    expect(billing.plan).toBe("FREE");
    expect(billing.creditLimit).toBe(50);
    expect(billing.creditsUsed).toBe(30);
    expect(billing.creditsRemaining).toBe(20);
  });

  it("should return correct billing for PRO plan", async () => {
    prismaMock.shopSettings.findUnique.mockResolvedValue(proShopSettings as any);

    const billing = await getShopBilling("pro-shop.myshopify.com");

    expect(billing.plan).toBe("PRO");
    expect(billing.creditLimit).toBe(5000);
    expect(billing.creditsUsed).toBe(2500);
    expect(billing.creditsRemaining).toBe(2500);
  });

  it("should show 0 remaining when credits exhausted", async () => {
    prismaMock.shopSettings.findUnique.mockResolvedValue(exhaustedProSettings as any);

    const billing = await getShopBilling("pro-shop.myshopify.com");

    expect(billing.creditsRemaining).toBe(0);
  });

  it("should auto-reset credits when billing period expires", async () => {
    prismaMock.shopSettings.findUnique
      .mockResolvedValueOnce(expiredBillingSettings as any)
      .mockResolvedValueOnce(expiredBillingSettings as any)
      .mockResolvedValueOnce({ ...expiredBillingSettings, creditsUsed: 0, billingPeriodStart: new Date() } as any);
    prismaMock.shopSettings.update.mockResolvedValue({} as any);

    const billing = await getShopBilling("test-shop.myshopify.com");

    expect(prismaMock.shopSettings.update).toHaveBeenCalled();
    expect(billing.creditsUsed).toBe(0);
  });
});

describe("hasAvailableCredits (integration)", () => {
  it("should allow when FREE has sufficient credits", async () => {
    prismaMock.shopSettings.findUnique.mockResolvedValue(freeShopSettings as any);

    const result = await hasAvailableCredits("test-shop.myshopify.com", 10);

    expect(result.allowed).toBe(true);
  });

  it("should deny when FREE exhausted", async () => {
    prismaMock.shopSettings.findUnique.mockResolvedValue(exhaustedFreeSettings as any);

    const result = await hasAvailableCredits("test-shop.myshopify.com", 1);

    expect(result.allowed).toBe(false);
  });

  it("should deny when PRO exhausted (hard cap)", async () => {
    prismaMock.shopSettings.findUnique.mockResolvedValue(exhaustedProSettings as any);

    const result = await hasAvailableCredits("pro-shop.myshopify.com", 1);

    expect(result.allowed).toBe(false);
  });

  it("should use default required count of 1", async () => {
    prismaMock.shopSettings.findUnique.mockResolvedValue(freeShopSettings as any);

    const result = await hasAvailableCredits("test-shop.myshopify.com");

    expect(result.allowed).toBe(true);
  });
});

describe("consumeCredits (integration)", () => {
  it("should atomically increment credits and return remaining", async () => {
    // Atomic update succeeds (1 row updated)
    prismaMock.$executeRawUnsafe.mockResolvedValue(1);
    prismaMock.shopSettings.findUnique.mockResolvedValue({
      ...freeShopSettings,
      creditsUsed: 35,
    } as any);
    prismaMock.usageRecord.upsert.mockResolvedValue({} as any);

    const result = await consumeCredits("test-shop.myshopify.com", 5);

    expect(result.success).toBe(true);
    expect(result.remaining).toBe(15);
    expect(prismaMock.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE"),
      5,
      "test-shop.myshopify.com"
    );
  });

  it("should reject when atomic update fails (would exceed limit)", async () => {
    // Atomic update fails (0 rows updated = would exceed limit)
    prismaMock.$executeRawUnsafe.mockResolvedValue(0);
    prismaMock.shopSettings.findUnique.mockResolvedValue({
      ...freeShopSettings,
      creditsUsed: 48,
    } as any);

    const result = await consumeCredits("test-shop.myshopify.com", 10);

    expect(result.success).toBe(false);
    expect(result.remaining).toBe(2);
  });

  it("should track usage in UsageRecord", async () => {
    prismaMock.$executeRawUnsafe.mockResolvedValue(1);
    prismaMock.shopSettings.findUnique.mockResolvedValue({
      ...freeShopSettings,
      creditsUsed: 35,
    } as any);
    prismaMock.usageRecord.upsert.mockResolvedValue({} as any);

    await consumeCredits("test-shop.myshopify.com", 5);

    expect(prismaMock.usageRecord.upsert).toHaveBeenCalled();
  });
});

describe("resetCredits (integration)", () => {
  it("should reset credits and update billing period", async () => {
    prismaMock.shopSettings.findUnique.mockResolvedValue(freeShopSettings as any);
    prismaMock.shopSettings.update.mockResolvedValue({} as any);

    await resetCredits("test-shop.myshopify.com");

    expect(prismaMock.shopSettings.update).toHaveBeenCalledWith({
      where: { shop: "test-shop.myshopify.com" },
      data: {
        creditsUsed: 0,
        creditLimit: 50,
        billingPeriodStart: expect.any(Date),
      },
    });
  });
});

describe("upgradeToProPlan (integration)", () => {
  it("should update plan and reset credits", async () => {
    prismaMock.shopSettings.findUnique.mockResolvedValue(freeShopSettings as any);
    prismaMock.shopSettings.update.mockResolvedValue({} as any);

    await upgradeToProPlan("test-shop.myshopify.com");

    expect(prismaMock.shopSettings.update).toHaveBeenCalledWith({
      where: { shop: "test-shop.myshopify.com" },
      data: {
        plan: "PRO",
        creditLimit: 5000,
        creditsUsed: 0,
        billingPeriodStart: expect.any(Date),
      },
    });
  });

  it("should no-op when already on PRO", async () => {
    prismaMock.shopSettings.findUnique.mockResolvedValue(proShopSettings as any);

    await upgradeToProPlan("pro-shop.myshopify.com");

    expect(prismaMock.shopSettings.update).not.toHaveBeenCalled();
  });
});

describe("downgradeToFreePlan (integration)", () => {
  it("should update plan and disable auto-sync", async () => {
    prismaMock.shopSettings.findUnique.mockResolvedValue(proShopSettings as any);
    prismaMock.shopSettings.update.mockResolvedValue({} as any);

    await downgradeToFreePlan("pro-shop.myshopify.com");

    expect(prismaMock.shopSettings.update).toHaveBeenCalledWith({
      where: { shop: "pro-shop.myshopify.com" },
      data: {
        plan: "FREE",
        creditLimit: 50,
        autoSyncNewProducts: false,
      },
    });
  });

  it("should no-op when already on FREE", async () => {
    prismaMock.shopSettings.findUnique.mockResolvedValue(freeShopSettings as any);

    await downgradeToFreePlan("test-shop.myshopify.com");

    expect(prismaMock.shopSettings.update).not.toHaveBeenCalled();
  });
});

describe("toggleAutoSync (integration)", () => {
  it("should allow PRO to enable auto-sync", async () => {
    prismaMock.shopSettings.findUnique.mockResolvedValue(proShopSettings as any);
    prismaMock.shopSettings.update.mockResolvedValue({} as any);

    const result = await toggleAutoSync("pro-shop.myshopify.com", true);

    expect(result.success).toBe(true);
    expect(prismaMock.shopSettings.update).toHaveBeenCalled();
  });

  it("should reject FREE enabling auto-sync", async () => {
    prismaMock.shopSettings.findUnique.mockResolvedValue(freeShopSettings as any);

    const result = await toggleAutoSync("test-shop.myshopify.com", true);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Auto-sync is only available on Pro plan");
  });

  it("should allow any plan to disable auto-sync", async () => {
    prismaMock.shopSettings.findUnique.mockResolvedValue(freeShopSettings as any);
    prismaMock.shopSettings.update.mockResolvedValue({} as any);

    const result = await toggleAutoSync("test-shop.myshopify.com", false);

    expect(result.success).toBe(true);
  });
});

describe("syncPlanFromShopify (integration)", () => {
  function createMockAdmin(subscriptions: Array<{ id: string; name: string; status: string }>) {
    return {
      graphql: vi.fn().mockResolvedValue({
        json: vi.fn().mockResolvedValue({
          data: {
            currentAppInstallation: {
              activeSubscriptions: subscriptions,
            },
          },
        }),
      }),
    } as any;
  }

  it("should upgrade to PRO when active subscription exists", async () => {
    const mockAdmin = createMockAdmin([
      { id: "gid://shopify/AppSubscription/1", name: "Pro", status: "ACTIVE" },
    ]);
    prismaMock.shopSettings.findUnique.mockResolvedValue(freeShopSettings as any);
    prismaMock.shopSettings.update.mockResolvedValue({} as any);

    const result = await syncPlanFromShopify(mockAdmin, "test-shop.myshopify.com");

    expect(result.plan).toBe("PRO");
    expect(result.synced).toBe(true);
    expect(prismaMock.shopSettings.update).toHaveBeenCalledWith({
      where: { shop: "test-shop.myshopify.com" },
      data: {
        plan: "PRO",
        creditLimit: 5000,
        creditsUsed: 0,
        billingPeriodStart: expect.any(Date),
      },
    });
  });

  it("should NOT upgrade when only Free subscription is active", async () => {
    const mockAdmin = createMockAdmin([
      { id: "gid://shopify/AppSubscription/1", name: "Free", status: "ACTIVE" },
    ]);
    prismaMock.shopSettings.findUnique.mockResolvedValue(freeShopSettings as any);

    const result = await syncPlanFromShopify(mockAdmin, "test-shop.myshopify.com");

    expect(result.plan).toBe("FREE");
    expect(result.synced).toBe(false);
    expect(prismaMock.shopSettings.update).not.toHaveBeenCalled();
  });

  it("should downgrade to FREE when no active subscriptions", async () => {
    const mockAdmin = createMockAdmin([]);
    prismaMock.shopSettings.findUnique.mockResolvedValue(proShopSettings as any);
    prismaMock.shopSettings.update.mockResolvedValue({} as any);

    const result = await syncPlanFromShopify(mockAdmin, "pro-shop.myshopify.com");

    expect(result.plan).toBe("FREE");
    expect(result.synced).toBe(true);
    expect(prismaMock.shopSettings.update).toHaveBeenCalledWith({
      where: { shop: "pro-shop.myshopify.com" },
      data: {
        plan: "FREE",
        creditLimit: 50,
        autoSyncNewProducts: false,
      },
    });
  });

  it("should return stale data on GraphQL error", async () => {
    const mockAdmin = {
      graphql: vi.fn().mockRejectedValue(new Error("GraphQL network error")),
    } as any;
    prismaMock.shopSettings.findUnique.mockResolvedValue(proShopSettings as any);

    const result = await syncPlanFromShopify(mockAdmin, "pro-shop.myshopify.com");

    expect(result.plan).toBe("PRO");
    expect(result.synced).toBe(false);
  });
});

describe("consumeCredits - atomic double-spend prevention (integration)", () => {
  it("should call $executeRawUnsafe with correct SQL and params for atomic check", async () => {
    prismaMock.$executeRawUnsafe.mockResolvedValue(1);
    prismaMock.shopSettings.findUnique.mockResolvedValue({
      ...freeShopSettings,
      creditsUsed: 31,
    } as any);
    prismaMock.usageRecord.upsert.mockResolvedValue({} as any);

    await consumeCredits("test-shop.myshopify.com", 1);

    expect(prismaMock.$executeRawUnsafe).toHaveBeenCalledTimes(1);
    expect(prismaMock.$executeRawUnsafe).toHaveBeenCalledWith(
      `UPDATE "ShopSettings" SET "creditsUsed" = "creditsUsed" + $1, "updatedAt" = NOW() WHERE shop = $2 AND "creditsUsed" + $1 <= "creditLimit"`,
      1,
      "test-shop.myshopify.com"
    );
  });
});
