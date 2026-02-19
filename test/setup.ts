/**
 * Global Test Setup
 * Configures mocks for Prisma, BullMQ, and other external dependencies
 */

import { vi, beforeEach, afterEach } from "vitest";

// Create a simple mock of PrismaClient (individual tests can override)
export const prismaMock = {
  shopSettings: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  session: {
    findFirst: vi.fn(),
    deleteMany: vi.fn(),
  },
  job: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
  },
  product: {
    create: vi.fn(),
    findFirst: vi.fn(),
    deleteMany: vi.fn(),
  },
  usageRecord: {
    upsert: vi.fn(),
  },
  $transaction: vi.fn((fn: (prisma: typeof prismaMock) => Promise<unknown>) => fn(prismaMock)),
};

// Mock the db.server module
vi.mock("../app/db.server", () => ({
  default: prismaMock,
}));

// Mock BullMQ to prevent Redis connection attempts
vi.mock("bullmq", () => ({
  Queue: vi.fn().mockImplementation(() => ({
    add: vi.fn().mockResolvedValue({ id: "mock-job-id" }),
    addBulk: vi.fn().mockResolvedValue([]),
    getWaitingCount: vi.fn().mockResolvedValue(0),
    getActiveCount: vi.fn().mockResolvedValue(0),
    getCompletedCount: vi.fn().mockResolvedValue(0),
    getFailedCount: vi.fn().mockResolvedValue(0),
    close: vi.fn().mockResolvedValue(undefined),
  })),
  Worker: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined),
  })),
  Job: vi.fn(),
}));

// Mock Anthropic SDK with a proper class constructor
const MockAnthropicClass = class {
  messages = {
    create: vi.fn().mockResolvedValue({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            metafields: {
              color: "Navy Blue",
              pattern: "Solid",
              material: "Cotton",
            },
            tags: ["Navy Blue", "Cotton", "Summer"],
          }),
        },
      ],
    }),
  };
};

vi.mock("@anthropic-ai/sdk", () => ({
  default: MockAnthropicClass,
}));

// Reset all mocks between tests
beforeEach(() => {
  vi.clearAllMocks();
});

// Clean up after all tests
afterEach(() => {
  vi.restoreAllMocks();
});

// Export for use in tests
export { vi };
