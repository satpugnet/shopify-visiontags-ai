import { describe, it, expect } from "vitest";
import { PLANS, getPlanPickerUrl } from "../billing.server";

describe("PLANS configuration", () => {
  describe("FREE plan", () => {
    it("should have correct credit limit", () => {
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
    it("should have correct credit limit", () => {
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

describe("Credit calculations (unit logic)", () => {
  // These test the logic that would be used in billing functions
  // Actual database operations require integration tests

  it("should calculate remaining credits correctly", () => {
    const creditLimit = 50;
    const creditsUsed = 30;
    const creditsRemaining = creditLimit - creditsUsed;

    expect(creditsRemaining).toBe(20);
  });

  it("should detect when credits are exhausted", () => {
    const creditLimit = 50;
    const creditsUsed = 50;
    const creditsRemaining = creditLimit - creditsUsed;

    expect(creditsRemaining).toBe(0);
    expect(creditsRemaining >= 1).toBe(false); // Cannot use more credits
  });

  it("should detect when not enough credits for bulk operation", () => {
    const creditLimit = 50;
    const creditsUsed = 45;
    const creditsRemaining = creditLimit - creditsUsed;
    const requiredCredits = 10;

    expect(creditsRemaining >= requiredCredits).toBe(false);
  });

  it("should allow operations when enough credits available", () => {
    const creditLimit = 2000; // PRO plan
    const creditsUsed = 100;
    const creditsRemaining = creditLimit - creditsUsed;
    const requiredCredits = 50;

    expect(creditsRemaining >= requiredCredits).toBe(true);
  });
});

describe("getPlanPickerUrl", () => {
  it("should construct correct URL from shop domain", () => {
    const url = getPlanPickerUrl("cool-store.myshopify.com");
    expect(url).toContain("https://admin.shopify.com/store/cool-store/charges/");
    expect(url).toContain("/pricing_plans");
  });

  it("should extract store handle correctly", () => {
    const url = getPlanPickerUrl("my-test-shop.myshopify.com");
    expect(url).toContain("/store/my-test-shop/");
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
