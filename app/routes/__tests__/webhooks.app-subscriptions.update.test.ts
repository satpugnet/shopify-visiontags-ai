import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies using vi.hoisted
const mocks = vi.hoisted(() => ({
  authenticate: {
    webhook: vi.fn(),
  },
  upgradeToProPlan: vi.fn(),
  downgradeToFreePlan: vi.fn(),
}));

// Mock modules
vi.mock("../../shopify.server", () => ({
  authenticate: mocks.authenticate,
}));

vi.mock("../../services/billing.server", () => ({
  upgradeToProPlan: mocks.upgradeToProPlan,
  downgradeToFreePlan: mocks.downgradeToFreePlan,
}));

// Import after mocking
import { action } from "../webhooks.app-subscriptions.update";

// Test fixtures
const makeSubscriptionPayload = (status: string, name = "Pro") => ({
  app_subscription: {
    admin_graphql_api_id: "gid://shopify/AppSubscription/123",
    name,
    status,
  },
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("webhooks.app-subscriptions.update", () => {
  function createMockRequest() {
    return new Request(
      "https://app.example.com/webhooks/app-subscriptions/update",
      {
        method: "POST",
        body: JSON.stringify(makeSubscriptionPayload("ACTIVE")),
      }
    );
  }

  it("should upgrade to PRO when status is ACTIVE", async () => {
    mocks.authenticate.webhook.mockResolvedValue({
      shop: "test-shop.myshopify.com",
      topic: "APP_SUBSCRIPTIONS_UPDATE",
      payload: makeSubscriptionPayload("ACTIVE"),
    });
    mocks.upgradeToProPlan.mockResolvedValue(undefined);

    const response = await action({ request: createMockRequest() } as any);

    expect(response.status).toBe(200);
    expect(mocks.upgradeToProPlan).toHaveBeenCalledWith(
      "test-shop.myshopify.com"
    );
    expect(mocks.downgradeToFreePlan).not.toHaveBeenCalled();
  });

  it("should downgrade to FREE when status changes away from ACTIVE", async () => {
    for (const status of ["CANCELLED", "EXPIRED", "DECLINED"]) {
      vi.clearAllMocks();

      mocks.authenticate.webhook.mockResolvedValue({
        shop: "test-shop.myshopify.com",
        topic: "APP_SUBSCRIPTIONS_UPDATE",
        payload: makeSubscriptionPayload(status),
      });
      mocks.downgradeToFreePlan.mockResolvedValue(undefined);

      const response = await action({ request: createMockRequest() } as any);

      expect(response.status).toBe(200);
      expect(mocks.downgradeToFreePlan).toHaveBeenCalledWith(
        "test-shop.myshopify.com"
      );
      expect(mocks.upgradeToProPlan).not.toHaveBeenCalled();
    }
  });

  it("should not change plan when status is unrecognized", async () => {
    mocks.authenticate.webhook.mockResolvedValue({
      shop: "test-shop.myshopify.com",
      topic: "APP_SUBSCRIPTIONS_UPDATE",
      payload: makeSubscriptionPayload("PENDING"),
    });

    const response = await action({ request: createMockRequest() } as any);

    expect(response.status).toBe(200);
    expect(mocks.upgradeToProPlan).not.toHaveBeenCalled();
    expect(mocks.downgradeToFreePlan).not.toHaveBeenCalled();
  });

  it("should handle missing or empty payload gracefully", async () => {
    mocks.authenticate.webhook.mockResolvedValue({
      shop: "test-shop.myshopify.com",
      topic: "APP_SUBSCRIPTIONS_UPDATE",
      payload: {},
    });

    const response = await action({ request: createMockRequest() } as any);

    expect(response.status).toBe(200);
    expect(mocks.upgradeToProPlan).not.toHaveBeenCalled();
    expect(mocks.downgradeToFreePlan).not.toHaveBeenCalled();
  });

  it("should propagate error when internal error occurs (no try-catch)", async () => {
    mocks.authenticate.webhook.mockResolvedValue({
      shop: "test-shop.myshopify.com",
      topic: "APP_SUBSCRIPTIONS_UPDATE",
      payload: makeSubscriptionPayload("ACTIVE"),
    });
    mocks.upgradeToProPlan.mockRejectedValue(new Error("Database error"));

    // This handler has no try-catch, so errors propagate
    await expect(
      action({ request: createMockRequest() } as any)
    ).rejects.toThrow("Database error");
  });
});
