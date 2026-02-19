import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies using vi.hoisted
const mocks = vi.hoisted(() => ({
  prisma: {
    session: {
      deleteMany: vi.fn(),
    },
  },
  authenticate: {
    webhook: vi.fn(),
  },
}));

// Mock modules
vi.mock("../../db.server", () => ({
  default: mocks.prisma,
}));

vi.mock("../../shopify.server", () => ({
  authenticate: mocks.authenticate,
}));

// Import after mocking
import { action } from "../webhooks.app.uninstalled";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("webhooks.app.uninstalled", () => {
  function createMockRequest() {
    return new Request("https://app.example.com/webhooks/app/uninstalled", {
      method: "POST",
      body: JSON.stringify({}),
    });
  }

  it("should delete session on uninstall", async () => {
    mocks.authenticate.webhook.mockResolvedValue({
      shop: "test-shop.myshopify.com",
      session: { id: "session-123", shop: "test-shop.myshopify.com" },
      topic: "APP_UNINSTALLED",
    });
    mocks.prisma.session.deleteMany.mockResolvedValue({ count: 1 });

    const response = await action({ request: createMockRequest() } as any);

    expect(response.status).toBe(200);
    expect(mocks.prisma.session.deleteMany).toHaveBeenCalledWith({
      where: { shop: "test-shop.myshopify.com" },
    });
  });

  it("should handle missing session gracefully", async () => {
    mocks.authenticate.webhook.mockResolvedValue({
      shop: "test-shop.myshopify.com",
      session: undefined,
      topic: "APP_UNINSTALLED",
    });

    const response = await action({ request: createMockRequest() } as any);

    expect(response.status).toBe(200);
    // When session is falsy, deleteMany should NOT be called
    expect(mocks.prisma.session.deleteMany).not.toHaveBeenCalled();
  });

  it("should return 200 even when internal error occurs", async () => {
    mocks.authenticate.webhook.mockResolvedValue({
      shop: "test-shop.myshopify.com",
      session: { id: "session-123", shop: "test-shop.myshopify.com" },
      topic: "APP_UNINSTALLED",
    });
    mocks.prisma.session.deleteMany.mockRejectedValue(
      new Error("Database error")
    );

    const response = await action({ request: createMockRequest() } as any);

    // The action catches errors and returns 200 to prevent Shopify retries
    expect(response.status).toBe(200);
  });
});
