/**
 * Vision Service - Claude API for image analysis
 * Analyzes product images and returns metafields + tags
 */

import Anthropic from "@anthropic-ai/sdk";
import * as Sentry from "@sentry/remix";
import { logger } from "./logger.server";
import { withRetry } from "./retry.server";
import { buildVisionPrompt } from "./industry.server";

// Initialize Anthropic client via OpenRouter's Anthropic Skin
const anthropic = new Anthropic({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api",
  defaultHeaders: {
    "HTTP-Referer": "https://apps.shopify.com/visiontags-ai",
    "X-Title": "VisionTags",
  },
});

export interface VisionResult {
  metafields: Record<string, string | null>;
  tags: string[];
  alt_text?: string;
  description?: string;
  seo_title?: string;
  meta_description?: string;
}

export interface VisionError {
  error: string;
  code: "FLAGGED_CONTENT" | "INVALID_IMAGE" | "API_ERROR" | "PARSE_ERROR";
}

export type VisionResponse = VisionResult | VisionError;

/**
 * Strip markdown code blocks from Claude's response
 * Claude sometimes wraps JSON in ```json ... ``` despite instructions
 */
function stripMarkdownCodeBlocks(text: string): string {
  // Remove ```json or ``` at the start and ``` at the end
  let cleaned = text.trim();

  // Match opening code fence with optional language
  const openingMatch = cleaned.match(/^```(?:json)?\s*\n?/);
  if (openingMatch) {
    cleaned = cleaned.slice(openingMatch[0].length);
  }

  // Match closing code fence
  const closingMatch = cleaned.match(/\n?```\s*$/);
  if (closingMatch) {
    cleaned = cleaned.slice(0, -closingMatch[0].length);
  }

  return cleaned.trim();
}

/**
 * Optimize Shopify image URL by appending size suffix
 * This reduces tokens and bandwidth
 */
function optimizeImageUrl(imageUrl: string): string {
  // Only apply size optimization to Shopify CDN URLs
  if (!imageUrl.includes("cdn.shopify.com")) {
    return imageUrl;
  }

  // Shopify CDN supports size suffixes like _800x800
  // Insert before the file extension
  const urlWithoutParams = imageUrl.split("?")[0];
  const params = imageUrl.includes("?") ? imageUrl.split("?")[1] : "";

  // Check if already has a size suffix
  if (/_\d+x\d+\./.test(urlWithoutParams)) {
    return imageUrl;
  }

  // Insert _800x800 before the extension
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

/**
 * Analyze a product image using Claude Vision
 * Includes retry logic for rate limits and transient errors
 */
export async function analyzeProductImage(
  imageUrl: string,
  industryId?: string,
  productTitle?: string,
  language?: string,
  storeName?: string,
  vendor?: string,
): Promise<VisionResponse> {
  let prompt = buildVisionPrompt(industryId || "general", language, storeName);

  // Prepend product-level context
  const contextLines: string[] = [];
  if (productTitle) {
    contextLines.push(`Product title: "${productTitle}"`);
  }
  if (vendor) {
    contextLines.push(`Brand/Vendor: "${vendor}"`);
  }
  if (contextLines.length > 0) {
    prompt = `${contextLines.join("\n")}\n\n${prompt}`;
  }

  // Dry run mode for stress testing (skips real API call)
  if (process.env.VISION_DRY_RUN === "true") {
    await new Promise((r) => setTimeout(r, 200));
    return {
      metafields: { color: "Test Blue", material: "Cotton", product_type: "T-Shirt" },
      tags: ["Test", "Dry Run", "Stress Test"],
      alt_text: "Dry run test image",
      description: "This is a dry run test product description.",
      seo_title: "Test Product - Dry Run",
      meta_description: "Dry run test meta description for stress testing.",
    };
  }

  try {
    // Optimize image URL to save tokens
    const optimizedUrl = optimizeImageUrl(imageUrl);

    // Call Claude API with retry logic for rate limits
    const response = await withRetry(
      () =>
        anthropic.messages.create({
          model: "anthropic/claude-haiku-4.5",
          max_tokens: 1024,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "image",
                  source: {
                    type: "url",
                    url: optimizedUrl,
                  },
                },
                {
                  type: "text",
                  text: prompt,
                },
              ],
            },
          ],
        }),
      { maxRetries: 3, baseDelayMs: 2000, logEvent: "VISION_API_RETRY" }
    );

    // Extract text content from response. Defensive null guard: OpenRouter
    // can return responses without a `content` array on rare upstream errors,
    // which previously surfaced as "Cannot read properties of undefined" in
    // Product.error (4 such failures observed on 2026-03-12).
    const textContent = response.content?.find((block) => block.type === "text");
    if (!textContent || textContent.type !== "text") {
      return {
        error: "No text response from Claude",
        code: "API_ERROR",
      };
    }

    // Parse JSON response (strip markdown code blocks if present)
    try {
      const cleanedText = stripMarkdownCodeBlocks(textContent.text);
      const result = JSON.parse(cleanedText) as VisionResult;

      // Validate structure
      if (!result.metafields || !result.tags) {
        return {
          error: "Invalid response structure",
          code: "PARSE_ERROR",
        };
      }

      return result;
    } catch (parseError) {
      return {
        error: `Failed to parse JSON: ${parseError}`,
        code: "PARSE_ERROR",
      };
    }
  } catch (error) {
    logger.error("VISION_API_ERROR", { imageUrl, error: error instanceof Error ? error.message : String(error) });
    Sentry.captureException(error, {
      tags: { service: "vision" },
      extra: { imageUrl },
    });

    if (error instanceof Anthropic.AuthenticationError) {
      return {
        error: "AI API authentication failed - check API key",
        code: "API_ERROR",
      };
    }

    if (error instanceof Anthropic.RateLimitError) {
      return {
        error: "AI API rate limit exceeded - try again later",
        code: "API_ERROR",
      };
    }

    if (error instanceof Anthropic.APIError) {
      return {
        error: `AI API error (${error.status}): ${error.message}`,
        code: "API_ERROR",
      };
    }

    return {
      error: error instanceof Error ? error.message : "Unknown error",
      code: "API_ERROR",
    };
  }
}

/**
 * Check if the response is an error
 */
export function isVisionError(response: VisionResponse): response is VisionError {
  return "error" in response && "code" in response;
}

/**
 * Batch analyze multiple images
 * Processes sequentially to respect rate limits
 */
export async function analyzeProductImages(
  imageUrls: string[],
  industryId?: string
): Promise<Map<string, VisionResponse>> {
  const results = new Map<string, VisionResponse>();

  for (const url of imageUrls) {
    const result = await analyzeProductImage(url, industryId);
    results.set(url, result);

    // Small delay between requests to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  return results;
}
