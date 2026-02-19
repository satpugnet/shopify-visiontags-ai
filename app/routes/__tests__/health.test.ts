import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies using vi.hoisted
const mocks = vi.hoisted(() => ({
  prisma: {
    $queryRaw: vi.fn(),
  },
}));

// Mock modules
vi.mock("../../db.server", () => ({
  default: mocks.prisma,
}));

// Import after mocking
import { loader } from "../health";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("health route", () => {
  function createMockRequest() {
    return new Request("https://app.example.com/health", {
      method: "GET",
    });
  }

  it("should return healthy status when database is connected", async () => {
    mocks.prisma.$queryRaw.mockResolvedValue([{ "?column?": 1 }]);

    const response = await loader({ request: createMockRequest() } as any);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe("healthy");
    expect(data.checks.database).toBe("ok");
    expect(data.timestamp).toBeDefined();
  });

  it("should return unhealthy status when database fails", async () => {
    mocks.prisma.$queryRaw.mockRejectedValue(new Error("Connection refused"));

    const response = await loader({ request: createMockRequest() } as any);
    const data = await response.json();

    expect(response.status).toBe(503);
    expect(data.status).toBe("unhealthy");
    expect(data.error).toBe("Connection refused");
    expect(data.timestamp).toBeDefined();
  });

  it("should return JSON content type", async () => {
    mocks.prisma.$queryRaw.mockResolvedValue([{ "?column?": 1 }]);

    const response = await loader({ request: createMockRequest() } as any);

    expect(response.headers.get("Content-Type")).toBe("application/json");
  });

  it("should include timestamp in ISO format", async () => {
    mocks.prisma.$queryRaw.mockResolvedValue([{ "?column?": 1 }]);

    const response = await loader({ request: createMockRequest() } as any);
    const data = await response.json();

    // Check that timestamp is valid ISO date
    const timestamp = new Date(data.timestamp);
    expect(timestamp.toISOString()).toBe(data.timestamp);
  });

  it("should handle unknown error types gracefully", async () => {
    mocks.prisma.$queryRaw.mockRejectedValue("Non-Error object");

    const response = await loader({ request: createMockRequest() } as any);
    const data = await response.json();

    expect(response.status).toBe(503);
    expect(data.status).toBe("unhealthy");
    expect(data.error).toBe("Unknown error");
  });

  it("should call $queryRaw with SELECT 1", async () => {
    mocks.prisma.$queryRaw.mockResolvedValue([{ "?column?": 1 }]);

    await loader({ request: createMockRequest() } as any);

    expect(mocks.prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });
});
