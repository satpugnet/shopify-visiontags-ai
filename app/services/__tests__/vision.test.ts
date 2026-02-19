import { describe, it, expect, vi, beforeEach } from "vitest";

// Create mock using vi.hoisted to ensure it's available before mock
const { mockCreate, MockAPIError, MockAuthenticationError, MockRateLimitError } = vi.hoisted(() => {
  class _MockAPIError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
      this.name = "APIError";
    }
  }
  class _MockAuthenticationError extends _MockAPIError {
    constructor(message = "Authentication failed") {
      super(401, message);
      this.name = "AuthenticationError";
    }
  }
  class _MockRateLimitError extends _MockAPIError {
    constructor(message = "Rate limit exceeded") {
      super(429, message);
      this.name = "RateLimitError";
    }
  }
  return {
    mockCreate: vi.fn(),
    MockAPIError: _MockAPIError,
    MockAuthenticationError: _MockAuthenticationError,
    MockRateLimitError: _MockRateLimitError,
  };
});

// Mock Anthropic SDK with a proper class and error types
vi.mock("@anthropic-ai/sdk", () => {
  const MockAnthropic = class {
    messages = {
      create: mockCreate,
    };
    static AuthenticationError = MockAuthenticationError;
    static RateLimitError = MockRateLimitError;
    static APIError = MockAPIError;
  };
  return { default: MockAnthropic };
});

// Import after mocking
import { analyzeProductImage, isVisionError } from "../vision.server";

beforeEach(() => {
  vi.clearAllMocks();
});

// We need to extract the stripMarkdownCodeBlocks function for testing
// For now, we'll duplicate the logic here since it's a private function

function stripMarkdownCodeBlocks(text: string): string {
  let cleaned = text.trim();

  const openingMatch = cleaned.match(/^```(?:json)?\s*\n?/);
  if (openingMatch) {
    cleaned = cleaned.slice(openingMatch[0].length);
  }

  const closingMatch = cleaned.match(/\n?```\s*$/);
  if (closingMatch) {
    cleaned = cleaned.slice(0, -closingMatch[0].length);
  }

  return cleaned.trim();
}

describe("stripMarkdownCodeBlocks", () => {
  it("should return plain JSON unchanged", () => {
    const input = '{"metafields": {}, "tags": []}';
    expect(stripMarkdownCodeBlocks(input)).toBe(input);
  });

  it("should strip ```json code blocks", () => {
    const input = '```json\n{"metafields": {}, "tags": []}\n```';
    expect(stripMarkdownCodeBlocks(input)).toBe('{"metafields": {}, "tags": []}');
  });

  it("should strip ``` code blocks without language", () => {
    const input = '```\n{"metafields": {}, "tags": []}\n```';
    expect(stripMarkdownCodeBlocks(input)).toBe('{"metafields": {}, "tags": []}');
  });

  it("should handle code blocks without newlines", () => {
    const input = '```json{"metafields": {}, "tags": []}```';
    expect(stripMarkdownCodeBlocks(input)).toBe('{"metafields": {}, "tags": []}');
  });

  it("should handle extra whitespace", () => {
    const input = '  ```json\n{"metafields": {}, "tags": []}\n```  ';
    expect(stripMarkdownCodeBlocks(input)).toBe('{"metafields": {}, "tags": []}');
  });

  it("should handle multiline JSON content", () => {
    const input = `\`\`\`json
{
  "metafields": {
    "color": "blue"
  },
  "tags": ["Blue", "Cotton"]
}
\`\`\``;
    const expected = `{
  "metafields": {
    "color": "blue"
  },
  "tags": ["Blue", "Cotton"]
}`;
    expect(stripMarkdownCodeBlocks(input)).toBe(expected);
  });

  it("should not modify JSON with backticks inside strings", () => {
    const input = '{"note": "use `code` here", "tags": []}';
    expect(stripMarkdownCodeBlocks(input)).toBe(input);
  });
});

// Duplicate retry logic for testing (matches implementation in vision.server.ts)
async function withRetry<T>(
  fn: () => Promise<T>,
  options: { maxRetries?: number; baseDelayMs?: number; maxDelayMs?: number } = {}
): Promise<T> {
  const { maxRetries = 3, baseDelayMs = 1000, maxDelayMs = 30000 } = options;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      const isRetryable =
        lastError.message.includes("429") ||
        lastError.message.includes("rate") ||
        lastError.message.includes("500") ||
        lastError.message.includes("502") ||
        lastError.message.includes("503") ||
        lastError.message.includes("timeout");

      if (!isRetryable || attempt === maxRetries - 1) {
        throw lastError;
      }

      // Exponential backoff with jitter (reduced for tests)
      const delay = Math.min(
        baseDelayMs * Math.pow(2, attempt) + Math.random() * 100,
        maxDelayMs
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

describe("withRetry", () => {
  it("should return result on first success", async () => {
    const fn = vi.fn().mockResolvedValue("success");

    const result = await withRetry(fn, { maxRetries: 3, baseDelayMs: 10 });

    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("should retry on rate limit error (429)", async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error("429 rate limit exceeded"))
      .mockResolvedValue("success after retry");

    const result = await withRetry(fn, { maxRetries: 3, baseDelayMs: 10 });

    expect(result).toBe("success after retry");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("should retry on server error (500)", async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error("500 internal server error"))
      .mockResolvedValue("success");

    const result = await withRetry(fn, { maxRetries: 3, baseDelayMs: 10 });

    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("should retry on timeout error", async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValue("success");

    const result = await withRetry(fn, { maxRetries: 3, baseDelayMs: 10 });

    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("should NOT retry on non-retryable errors", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("Invalid API key"));

    await expect(withRetry(fn, { maxRetries: 3, baseDelayMs: 10 }))
      .rejects.toThrow("Invalid API key");

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("should exhaust all retries before failing", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("429 rate limit"));

    await expect(withRetry(fn, { maxRetries: 3, baseDelayMs: 10 }))
      .rejects.toThrow("429 rate limit");

    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("should succeed on last retry", async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error("429"))
      .mockRejectedValueOnce(new Error("429"))
      .mockResolvedValue("success on third try");

    const result = await withRetry(fn, { maxRetries: 3, baseDelayMs: 10 });

    expect(result).toBe("success on third try");
    expect(fn).toHaveBeenCalledTimes(3);
  });
});

describe("Image URL optimization", () => {
  // Duplicate the logic from vision.server.ts for testing
  function optimizeImageUrl(imageUrl: string): string {
    const urlWithoutParams = imageUrl.split("?")[0];
    const params = imageUrl.includes("?") ? imageUrl.split("?")[1] : "";

    if (/_\d+x\d+\./.test(urlWithoutParams)) {
      return imageUrl;
    }

    const lastDotIndex = urlWithoutParams.lastIndexOf(".");
    if (lastDotIndex === -1) {
      return imageUrl;
    }

    const optimizedUrl =
      urlWithoutParams.slice(0, lastDotIndex) +
      "_800x800" +
      urlWithoutParams.slice(lastDotIndex);

    return params ? `${optimizedUrl}?${params}` : optimizedUrl;
  }

  it("should add _800x800 suffix to Shopify image URLs", () => {
    const input = "https://cdn.shopify.com/s/files/1/0123/image.jpg";
    const expected = "https://cdn.shopify.com/s/files/1/0123/image_800x800.jpg";
    expect(optimizeImageUrl(input)).toBe(expected);
  });

  it("should preserve query parameters", () => {
    const input = "https://cdn.shopify.com/image.jpg?v=123";
    const expected = "https://cdn.shopify.com/image_800x800.jpg?v=123";
    expect(optimizeImageUrl(input)).toBe(expected);
  });

  it("should NOT add suffix if already present", () => {
    const input = "https://cdn.shopify.com/image_400x400.jpg";
    expect(optimizeImageUrl(input)).toBe(input);
  });

  it("should handle PNG files", () => {
    const input = "https://cdn.shopify.com/image.png";
    const expected = "https://cdn.shopify.com/image_800x800.png";
    expect(optimizeImageUrl(input)).toBe(expected);
  });

  it("should handle URLs without extension (known limitation)", () => {
    // Note: Current implementation looks for last '.' which can match domain
    // Real Shopify image URLs always have file extensions so this is acceptable
    const input = "https://example/image";
    expect(optimizeImageUrl(input)).toBe(input);
  });
});

describe("VisionResult structure validation", () => {
  interface VisionResult {
    metafields: Record<string, string>;
    tags: string[];
  }

  function isValidVisionResult(result: unknown): result is VisionResult {
    if (typeof result !== "object" || result === null) return false;
    const obj = result as Record<string, unknown>;
    return (
      typeof obj.metafields === "object" &&
      obj.metafields !== null &&
      Array.isArray(obj.tags)
    );
  }

  it("should validate correct structure", () => {
    const valid = {
      metafields: { color: "blue", material: "cotton" },
      tags: ["Blue", "Cotton", "Summer"],
    };
    expect(isValidVisionResult(valid)).toBe(true);
  });

  it("should reject missing metafields", () => {
    const invalid = {
      tags: ["Blue"],
    };
    expect(isValidVisionResult(invalid)).toBe(false);
  });

  it("should reject missing tags", () => {
    const invalid = {
      metafields: { color: "blue" },
    };
    expect(isValidVisionResult(invalid)).toBe(false);
  });

  it("should reject tags as non-array", () => {
    const invalid = {
      metafields: { color: "blue" },
      tags: "Blue, Cotton",
    };
    expect(isValidVisionResult(invalid)).toBe(false);
  });

  it("should accept empty metafields and tags", () => {
    const valid = {
      metafields: {},
      tags: [],
    };
    expect(isValidVisionResult(valid)).toBe(true);
  });
});

// ============================================
// INTEGRATION TESTS (with mocked Anthropic)
// ============================================

describe("analyzeProductImage (integration)", () => {
  const validResponse = {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          metafields: {
            color: "Navy Blue",
            pattern: "Solid",
            material: "Cotton",
            target_gender: "Male",
            age_group: "Adult",
          },
          tags: ["Navy Blue", "Cotton", "Summer Vibes", "Business Casual"],
        }),
      },
    ],
  };

  it("should return parsed result on success", async () => {
    mockCreate.mockResolvedValue(validResponse);

    const result = await analyzeProductImage(
      "https://cdn.shopify.com/image.jpg"
    );

    expect(isVisionError(result)).toBe(false);
    if (!isVisionError(result)) {
      expect(result.metafields.color).toBe("Navy Blue");
      expect(result.tags).toContain("Navy Blue");
      expect(result.tags).toContain("Cotton");
    }
  });

  it("should optimize image URL to 800x800", async () => {
    mockCreate.mockResolvedValue(validResponse);

    await analyzeProductImage("https://cdn.shopify.com/image.jpg");

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({
            content: expect.arrayContaining([
              expect.objectContaining({
                type: "image",
                source: expect.objectContaining({
                  url: expect.stringContaining("_800x800"),
                }),
              }),
            ]),
          }),
        ]),
      })
    );
  });

  it("should strip markdown code blocks from response", async () => {
    mockCreate.mockResolvedValue({
      content: [
        {
          type: "text",
          text: `\`\`\`json
{
  "metafields": {"color": "Red"},
  "tags": ["Red"]
}
\`\`\``,
        },
      ],
    });

    const result = await analyzeProductImage(
      "https://cdn.shopify.com/image.jpg"
    );

    expect(isVisionError(result)).toBe(false);
    if (!isVisionError(result)) {
      expect(result.metafields.color).toBe("Red");
    }
  });

  it("should return PARSE_ERROR for invalid JSON", async () => {
    mockCreate.mockResolvedValue({
      content: [
        {
          type: "text",
          text: "This is not valid JSON",
        },
      ],
    });

    const result = await analyzeProductImage(
      "https://cdn.shopify.com/image.jpg"
    );

    expect(isVisionError(result)).toBe(true);
    if (isVisionError(result)) {
      expect(result.code).toBe("PARSE_ERROR");
    }
  });

  it("should return PARSE_ERROR when response missing metafields", async () => {
    mockCreate.mockResolvedValue({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            tags: ["Red"],
          }),
        },
      ],
    });

    const result = await analyzeProductImage(
      "https://cdn.shopify.com/image.jpg"
    );

    expect(isVisionError(result)).toBe(true);
    if (isVisionError(result)) {
      expect(result.code).toBe("PARSE_ERROR");
      expect(result.error).toBe("Invalid response structure");
    }
  });

  it("should return PARSE_ERROR when response missing tags", async () => {
    mockCreate.mockResolvedValue({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            metafields: { color: "Blue" },
          }),
        },
      ],
    });

    const result = await analyzeProductImage(
      "https://cdn.shopify.com/image.jpg"
    );

    expect(isVisionError(result)).toBe(true);
    if (isVisionError(result)) {
      expect(result.code).toBe("PARSE_ERROR");
    }
  });

  it("should return API_ERROR when no text content in response", async () => {
    mockCreate.mockResolvedValue({
      content: [
        {
          type: "image",
          source: {},
        },
      ],
    });

    const result = await analyzeProductImage(
      "https://cdn.shopify.com/image.jpg"
    );

    expect(isVisionError(result)).toBe(true);
    if (isVisionError(result)) {
      expect(result.code).toBe("API_ERROR");
      expect(result.error).toBe("No text response from Claude");
    }
  });

  it("should return API_ERROR when API throws", async () => {
    mockCreate.mockRejectedValue(new Error("API key invalid"));

    const result = await analyzeProductImage(
      "https://cdn.shopify.com/image.jpg"
    );

    expect(isVisionError(result)).toBe(true);
    if (isVisionError(result)) {
      expect(result.code).toBe("API_ERROR");
      expect(result.error).toBe("API key invalid");
    }
  });

  it("should use claude-haiku-4-5-20251001 model", async () => {
    mockCreate.mockResolvedValue(validResponse);

    await analyzeProductImage("https://cdn.shopify.com/image.jpg");

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "claude-haiku-4-5-20251001",
      })
    );
  });
});

describe("isVisionError", () => {
  it("should return true for error response", () => {
    const error = { error: "Something went wrong", code: "API_ERROR" as const };
    expect(isVisionError(error)).toBe(true);
  });

  it("should return false for success response", () => {
    const success = {
      metafields: { color: "Blue" },
      tags: ["Blue"],
    };
    expect(isVisionError(success)).toBe(false);
  });
});
