import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies using vi.hoisted
const mocks = vi.hoisted(() => ({
  authenticate: {
    webhook: vi.fn(),
  },
  unauthenticated: {
    admin: vi.fn(),
  },
  upgradeToProPlan: vi.fn(),
  downgradeToFreePlan: vi.fn(),
  mockGraphql: vi.fn(),
}));

// Mock modules
vi.mock("../../shopify.server", () => ({
  authenticate: mocks.authenticate,
  unauthenticated: mocks.unauthenticated,
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

function mockShopifySubscriptions(subscriptions: Array<{ id: string; name: string; status: string }>) {
  mocks.mockGraphql.mockResolvedValue({
    json: () => Promise.resolve({
      data: {
        currentAppInstallation: {
          activeSubscriptions: subscriptions,
        },
      },
    }),
  });
  mocks.unauthenticated.admin.mockResolvedValue({
    admin: { graphql: mocks.mockGraphql },
  });
}

function createMockRequest() {
  return new Request(
    "https://app.example.com/webhooks/app-subscriptions/update",
    {
      method: "POST",
      body: JSON.stringify(makeSubscriptionPayload("ACTIVE")),
    }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.upgradeToProPlan.mockResolvedValue(undefined);
  mocks.downgradeToFreePlan.mockResolvedValue(undefined);
});

describe("webhooks.app-subscriptions.update", () => {
  it("should upgrade to PRO when Shopify confirms active subscription", async () => {
    mocks.authenticate.webhook.mockResolvedValue({
      shop: "test-shop.myshopify.com",
      topic: "APP_SUBSCRIPTIONS_UPDATE",
      payload: makeSubscriptionPayload("ACTIVE"),
    });
    mockShopifySubscriptions([
      { id: "gid://shopify/AppSubscription/123", name: "Pro", status: "ACTIVE" },
    ]);

    const response = await action({ request: createMockRequest() } as any);

    expect(response.status).toBe(200);
    expect(mocks.upgradeToProPlan).toHaveBeenCalledWith("test-shop.myshopify.com");
    expect(mocks.downgradeToFreePlan).not.toHaveBeenCalled();
  });

  it("should downgrade to FREE when only Free subscription is active", async () => {
    mocks.authenticate.webhook.mockResolvedValue({
      shop: "test-shop.myshopify.com",
      topic: "APP_SUBSCRIPTIONS_UPDATE",
      payload: makeSubscriptionPayload("ACTIVE", "Free"),
    });
    mockShopifySubscriptions([
      { id: "gid://shopify/AppSubscription/1", name: "Free", status: "ACTIVE" },
    ]);

    const response = await action({ request: createMockRequest() } as any);

    expect(response.status).toBe(200);
    expect(mocks.downgradeToFreePlan).toHaveBeenCalledWith("test-shop.myshopify.com");
    expect(mocks.upgradeToProPlan).not.toHaveBeenCalled();
  });

  it("should downgrade to FREE when Shopify confirms no active subscriptions", async () => {
    mocks.authenticate.webhook.mockResolvedValue({
      shop: "test-shop.myshopify.com",
      topic: "APP_SUBSCRIPTIONS_UPDATE",
      payload: makeSubscriptionPayload("CANCELLED"),
    });
    mockShopifySubscriptions([]);

    const response = await action({ request: createMockRequest() } as any);

    expect(response.status).toBe(200);
    expect(mocks.downgradeToFreePlan).toHaveBeenCalledWith("test-shop.myshopify.com");
    expect(mocks.upgradeToProPlan).not.toHaveBeenCalled();
  });

  it("should stay on PRO when CANCELLED webhook arrives but another subscription is still active (race condition)", async () => {
    // This is the critical race condition test:
    // Old subscription CANCELLED, but new subscription is already ACTIVE
    mocks.authenticate.webhook.mockResolvedValue({
      shop: "test-shop.myshopify.com",
      topic: "APP_SUBSCRIPTIONS_UPDATE",
      payload: makeSubscriptionPayload("CANCELLED"),
    });
    // Shopify still shows an active subscription (the new one)
    mockShopifySubscriptions([
      { id: "gid://shopify/AppSubscription/456", name: "Pro", status: "ACTIVE" },
    ]);

    const response = await action({ request: createMockRequest() } as any);

    expect(response.status).toBe(200);
    // Should upgrade (stay on Pro), NOT downgrade despite CANCELLED webhook
    expect(mocks.upgradeToProPlan).toHaveBeenCalledWith("test-shop.myshopify.com");
    expect(mocks.downgradeToFreePlan).not.toHaveBeenCalled();
  });

  it("should fall back to webhook payload when Shopify query fails (ACTIVE)", async () => {
    mocks.authenticate.webhook.mockResolvedValue({
      shop: "test-shop.myshopify.com",
      topic: "APP_SUBSCRIPTIONS_UPDATE",
      payload: makeSubscriptionPayload("ACTIVE"),
    });
    // Simulate Shopify API failure
    mocks.unauthenticated.admin.mockRejectedValue(new Error("Token expired"));

    const response = await action({ request: createMockRequest() } as any);

    expect(response.status).toBe(200);
    expect(mocks.upgradeToProPlan).toHaveBeenCalledWith("test-shop.myshopify.com");
    expect(mocks.downgradeToFreePlan).not.toHaveBeenCalled();
  });

  it("should fall back to webhook payload when Shopify query fails (CANCELLED)", async () => {
    mocks.authenticate.webhook.mockResolvedValue({
      shop: "test-shop.myshopify.com",
      topic: "APP_SUBSCRIPTIONS_UPDATE",
      payload: makeSubscriptionPayload("CANCELLED"),
    });
    mocks.unauthenticated.admin.mockRejectedValue(new Error("Token expired"));

    const response = await action({ request: createMockRequest() } as any);

    expect(response.status).toBe(200);
    expect(mocks.downgradeToFreePlan).toHaveBeenCalledWith("test-shop.myshopify.com");
    expect(mocks.upgradeToProPlan).not.toHaveBeenCalled();
  });

  it("should not change plan when status is unrecognized and no active subscriptions", async () => {
    mocks.authenticate.webhook.mockResolvedValue({
      shop: "test-shop.myshopify.com",
      topic: "APP_SUBSCRIPTIONS_UPDATE",
      payload: makeSubscriptionPayload("PENDING"),
    });
    mockShopifySubscriptions([]);

    const response = await action({ request: createMockRequest() } as any);

    expect(response.status).toBe(200);
    // No active subscriptions → downgrade
    expect(mocks.downgradeToFreePlan).toHaveBeenCalledWith("test-shop.myshopify.com");
  });

  it("should handle missing or empty payload gracefully", async () => {
    mocks.authenticate.webhook.mockResolvedValue({
      shop: "test-shop.myshopify.com",
      topic: "APP_SUBSCRIPTIONS_UPDATE",
      payload: {},
    });
    mockShopifySubscriptions([]);

    const response = await action({ request: createMockRequest() } as any);

    expect(response.status).toBe(200);
    // No active subscriptions → downgrade to Free
    expect(mocks.downgradeToFreePlan).toHaveBeenCalledWith("test-shop.myshopify.com");
  });

  it("should fall back gracefully when Shopify query fails with empty payload", async () => {
    mocks.authenticate.webhook.mockResolvedValue({
      shop: "test-shop.myshopify.com",
      topic: "APP_SUBSCRIPTIONS_UPDATE",
      payload: {},
    });
    mocks.unauthenticated.admin.mockRejectedValue(new Error("Token expired"));

    const response = await action({ request: createMockRequest() } as any);

    expect(response.status).toBe(200);
    // No status in payload + fallback → no action taken
    expect(mocks.upgradeToProPlan).not.toHaveBeenCalled();
    expect(mocks.downgradeToFreePlan).not.toHaveBeenCalled();
  });

  it("should handle EXPIRED and DECLINED via Shopify query (no active subs)", async () => {
    for (const status of ["EXPIRED", "DECLINED"]) {
      vi.clearAllMocks();
      mocks.upgradeToProPlan.mockResolvedValue(undefined);
      mocks.downgradeToFreePlan.mockResolvedValue(undefined);

      mocks.authenticate.webhook.mockResolvedValue({
        shop: "test-shop.myshopify.com",
        topic: "APP_SUBSCRIPTIONS_UPDATE",
        payload: makeSubscriptionPayload(status),
      });
      mockShopifySubscriptions([]);

      const response = await action({ request: createMockRequest() } as any);

      expect(response.status).toBe(200);
      expect(mocks.downgradeToFreePlan).toHaveBeenCalledWith("test-shop.myshopify.com");
      expect(mocks.upgradeToProPlan).not.toHaveBeenCalled();
    }
  });

  it("should return 200 when webhook auth fails (avoid Shopify retry storms)", async () => {
    mocks.authenticate.webhook.mockRejectedValue(
      new Error("Invalid HMAC signature")
    );

    const response = await action({ request: createMockRequest() } as any);

    expect(response.status).toBe(200);
    expect(mocks.upgradeToProPlan).not.toHaveBeenCalled();
    expect(mocks.downgradeToFreePlan).not.toHaveBeenCalled();
  });
});
