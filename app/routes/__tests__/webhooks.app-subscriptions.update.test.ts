import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies using vi.hoisted
const mocks = vi.hoisted(() => ({
  authenticate: {
    webhook: vi.fn(),
  },
  unauthenticated: {
    admin: vi.fn(),
  },
  setPlan: vi.fn(),
  mockGraphql: vi.fn(),
}));

// Mock modules
vi.mock("../../shopify.server", () => ({
  authenticate: mocks.authenticate,
  unauthenticated: mocks.unauthenticated,
}));

// Prevent the real billing.server from pulling in the Prisma client
vi.mock("../../db.server", () => ({
  default: {},
}));

// Mock setPlan but keep the real name→plan resolvers so these tests
// exercise the actual resolution logic end-to-end.
vi.mock("../../services/billing.server", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    setPlan: mocks.setPlan,
  };
});

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
  mocks.setPlan.mockResolvedValue(undefined);
});

describe("webhooks.app-subscriptions.update", () => {
  it("should set PRO when Shopify confirms active Pro subscription", async () => {
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
    expect(mocks.setPlan).toHaveBeenCalledWith("test-shop.myshopify.com", "PRO");
  });

  it("should set SCALE when Shopify confirms active Scale subscription", async () => {
    mocks.authenticate.webhook.mockResolvedValue({
      shop: "test-shop.myshopify.com",
      topic: "APP_SUBSCRIPTIONS_UPDATE",
      payload: makeSubscriptionPayload("ACTIVE", "Scale"),
    });
    mockShopifySubscriptions([
      { id: "gid://shopify/AppSubscription/789", name: "Scale", status: "ACTIVE" },
    ]);

    const response = await action({ request: createMockRequest() } as any);

    expect(response.status).toBe(200);
    expect(mocks.setPlan).toHaveBeenCalledWith("test-shop.myshopify.com", "SCALE");
  });

  it("should resolve to the highest plan when old and new subscriptions are both reported active", async () => {
    mocks.authenticate.webhook.mockResolvedValue({
      shop: "test-shop.myshopify.com",
      topic: "APP_SUBSCRIPTIONS_UPDATE",
      payload: makeSubscriptionPayload("ACTIVE", "Scale"),
    });
    mockShopifySubscriptions([
      { id: "gid://shopify/AppSubscription/123", name: "Pro", status: "ACTIVE" },
      { id: "gid://shopify/AppSubscription/789", name: "Scale", status: "ACTIVE" },
    ]);

    const response = await action({ request: createMockRequest() } as any);

    expect(response.status).toBe(200);
    expect(mocks.setPlan).toHaveBeenCalledWith("test-shop.myshopify.com", "SCALE");
  });

  it("should set FREE when only Free subscription is active", async () => {
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
    expect(mocks.setPlan).toHaveBeenCalledWith("test-shop.myshopify.com", "FREE");
  });

  it("should set FREE when Shopify confirms no active subscriptions", async () => {
    mocks.authenticate.webhook.mockResolvedValue({
      shop: "test-shop.myshopify.com",
      topic: "APP_SUBSCRIPTIONS_UPDATE",
      payload: makeSubscriptionPayload("CANCELLED"),
    });
    mockShopifySubscriptions([]);

    const response = await action({ request: createMockRequest() } as any);

    expect(response.status).toBe(200);
    expect(mocks.setPlan).toHaveBeenCalledWith("test-shop.myshopify.com", "FREE");
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
    // Should resolve to Pro, NOT Free, despite CANCELLED webhook
    expect(mocks.setPlan).toHaveBeenCalledWith("test-shop.myshopify.com", "PRO");
  });

  it("should fall back to webhook payload when Shopify query fails (ACTIVE Pro)", async () => {
    mocks.authenticate.webhook.mockResolvedValue({
      shop: "test-shop.myshopify.com",
      topic: "APP_SUBSCRIPTIONS_UPDATE",
      payload: makeSubscriptionPayload("ACTIVE"),
    });
    // Simulate Shopify API failure
    mocks.unauthenticated.admin.mockRejectedValue(new Error("Token expired"));

    const response = await action({ request: createMockRequest() } as any);

    expect(response.status).toBe(200);
    expect(mocks.setPlan).toHaveBeenCalledWith("test-shop.myshopify.com", "PRO");
  });

  it("should fall back to webhook payload when Shopify query fails (ACTIVE Scale)", async () => {
    mocks.authenticate.webhook.mockResolvedValue({
      shop: "test-shop.myshopify.com",
      topic: "APP_SUBSCRIPTIONS_UPDATE",
      payload: makeSubscriptionPayload("ACTIVE", "Scale"),
    });
    mocks.unauthenticated.admin.mockRejectedValue(new Error("Token expired"));

    const response = await action({ request: createMockRequest() } as any);

    expect(response.status).toBe(200);
    expect(mocks.setPlan).toHaveBeenCalledWith("test-shop.myshopify.com", "SCALE");
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
    expect(mocks.setPlan).toHaveBeenCalledWith("test-shop.myshopify.com", "FREE");
  });

  it("should set FREE when status is unrecognized and no active subscriptions", async () => {
    mocks.authenticate.webhook.mockResolvedValue({
      shop: "test-shop.myshopify.com",
      topic: "APP_SUBSCRIPTIONS_UPDATE",
      payload: makeSubscriptionPayload("PENDING"),
    });
    mockShopifySubscriptions([]);

    const response = await action({ request: createMockRequest() } as any);

    expect(response.status).toBe(200);
    // No active subscriptions → Free
    expect(mocks.setPlan).toHaveBeenCalledWith("test-shop.myshopify.com", "FREE");
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
    // No active subscriptions → Free
    expect(mocks.setPlan).toHaveBeenCalledWith("test-shop.myshopify.com", "FREE");
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
    expect(mocks.setPlan).not.toHaveBeenCalled();
  });

  it("should handle EXPIRED and DECLINED via Shopify query (no active subs)", async () => {
    for (const status of ["EXPIRED", "DECLINED"]) {
      vi.clearAllMocks();
      mocks.setPlan.mockResolvedValue(undefined);

      mocks.authenticate.webhook.mockResolvedValue({
        shop: "test-shop.myshopify.com",
        topic: "APP_SUBSCRIPTIONS_UPDATE",
        payload: makeSubscriptionPayload(status),
      });
      mockShopifySubscriptions([]);

      const response = await action({ request: createMockRequest() } as any);

      expect(response.status).toBe(200);
      expect(mocks.setPlan).toHaveBeenCalledWith("test-shop.myshopify.com", "FREE");
    }
  });

  it("should return 200 when webhook auth fails (avoid Shopify retry storms)", async () => {
    mocks.authenticate.webhook.mockRejectedValue(
      new Error("Invalid HMAC signature")
    );

    const response = await action({ request: createMockRequest() } as any);

    expect(response.status).toBe(200);
    expect(mocks.setPlan).not.toHaveBeenCalled();
  });
});
