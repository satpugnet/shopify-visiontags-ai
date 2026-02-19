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

// Mock ioredis
const mockRedisInstance = vi.hoisted(() => ({
  ping: vi.fn().mockResolvedValue("PONG"),
  quit: vi.fn().mockResolvedValue("OK"),
}));

vi.mock("ioredis", () => {
  // ioredis uses module.exports = Redis, so the default import maps to this
  function MockRedis() {
    return mockRedisInstance;
  }
  MockRedis.prototype = {};
  return { default: MockRedis };
});

// Import after mocking
import { loader } from "../health";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("REDIS_URL", "redis://localhost:6379");
});

describe("health route", () => {
  function createMockRequest() {
    return new Request("https://app.example.com/health", {
      method: "GET",
    });
  }

  it("should return healthy status when database and redis are connected", async () => {
    mocks.prisma.$queryRaw.mockResolvedValue([{ "?column?": 1 }]);

    const response = await loader({ request: createMockRequest() } as any);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe("healthy");
    expect(data.checks.database).toBe("ok");
    expect(data.checks.redis).toBe("ok");
    expect(data.timestamp).toBeDefined();
  });

  it("should return unhealthy status when database fails", async () => {
    mocks.prisma.$queryRaw.mockRejectedValue(new Error("Connection refused"));

    const response = await loader({ request: createMockRequest() } as any);
    const data = await response.json();

    expect(response.status).toBe(503);
    expect(data.status).toBe("unhealthy");
    expect(data.checks.database).toBe("error");
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

  it("should return degraded when DB is ok but redis is not configured", async () => {
    vi.stubEnv("REDIS_URL", "");
    mocks.prisma.$queryRaw.mockResolvedValue([{ "?column?": 1 }]);

    const response = await loader({ request: createMockRequest() } as any);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe("degraded");
    expect(data.checks.database).toBe("ok");
    expect(data.checks.redis).toBe("not_configured");
  });

  it("should call $queryRaw with SELECT 1", async () => {
    mocks.prisma.$queryRaw.mockResolvedValue([{ "?column?": 1 }]);

    await loader({ request: createMockRequest() } as any);

    expect(mocks.prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });
});
