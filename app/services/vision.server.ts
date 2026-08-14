/**
 * Vision Service - Claude API for image analysis
 * Analyzes product images and returns metafields + tags
 */

import Anthropic from "@anthropic-ai/sdk";
import * as Sentry from "@sentry/remix";
import { logger } from "./logger.server";
import { withRetry } from "./retry.server";
import { buildVisionPrompt } from "./industry.server";
import {
  isUsableTagSchema,
  normalizeTagAttributes,
  type TagSchema,
} from "./tagSchema";

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
  /**
   * Raw Key/Value attributes, only requested when the merchant has a tag schema.
   * Asking for an object rather than pre-joined "Key:Value" strings keeps the
   * separator out of the model's hands. Normalized into `tags` before this
   * result leaves the service, so everything downstream still sees a flat list.
   */
  tag_attributes?: Record<string, unknown>;
  /** Values the model proposed that the merchant's schema rejected. */
  rejected_tag_attributes?: Record<string, string[]>;
  alt_text?: string;
  description?: string;
  seo_title?: string;
  meta_description?: string;
}

export interface AnalyzeProductImageOptions {
  imageUrl: string;
  industryId?: string;
  productTitle?: string;
  language?: string;
  storeName?: string;
  vendor?: string;
  /** When set (and non-empty), tags are emitted as Key:Value pairs from this schema. */
  tagSchema?: TagSchema | null;
}

export interface VisionError {
  error: string;
  code: "FLAGGED_CONTENT" | "INVALID_IMAGE" | "API_ERROR" | "PARSE_ERROR";
}

export type VisionResponse = VisionResult | VisionError;

// Maps shop language codes to the full names used in the vision prompt
export const LANGUAGE_NAMES: Record<string, string> = {
  en: "English", pt: "Portuguese", es: "Spanish", fr: "French",
  de: "German", it: "Italian", nl: "Dutch", ja: "Japanese",
  ko: "Korean", zh: "Chinese", ar: "Arabic", ru: "Russian",
  tr: "Turkish", pl: "Polish", sv: "Swedish", da: "Danish",
  fi: "Finnish", nb: "Norwegian", cs: "Czech", ro: "Romanian",
  hu: "Hungarian", th: "Thai", vi: "Vietnamese", he: "Hebrew",
};

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
 * Snap the model's raw tag_attributes onto the merchant's vocabulary and flatten
 * them into the flat `tags` list the rest of the app expects.
 */
function applyTagSchema(
  schema: TagSchema,
  attributes: Record<string, unknown>,
): Pick<VisionResult, "tags" | "tag_attributes" | "rejected_tag_attributes"> {
  const { tags, rejected } = normalizeTagAttributes(schema, attributes);
  return {
    tags,
    tag_attributes: attributes,
    rejected_tag_attributes: Object.keys(rejected).length > 0 ? rejected : undefined,
  };
}

/**
 * Analyze a product image using Claude Vision
 * Includes retry logic for rate limits and transient errors
 */
export async function analyzeProductImage(
  options: AnalyzeProductImageOptions,
): Promise<VisionResponse> {
  const { imageUrl, industryId, productTitle, language, storeName, vendor } = options;
  const tagSchema = isUsableTagSchema(options.tagSchema) ? options.tagSchema : null;

  let prompt = buildVisionPrompt(industryId || "general", language, storeName, tagSchema);

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

  // Dry run mode for stress testing (skips real API call).
  // Mirrors the real response shape for the active tag mode, otherwise a dry run
  // would silently exercise the free-form path and hide normalization bugs.
  if (process.env.VISION_DRY_RUN === "true") {
    await new Promise((r) => setTimeout(r, 200));
    const base = {
      metafields: { color: "Test Blue", material: "Cotton", product_type: "T-Shirt" },
      alt_text: "Dry run test image",
      description: "This is a dry run test product description.",
      seo_title: "Test Product - Dry Run",
      meta_description: "Dry run test meta description for stress testing.",
    };
    if (tagSchema) {
      // Answer with the first allowed value of each key, as a real scan would.
      const attributes: Record<string, string> = {};
      for (const key of tagSchema.keys) {
        attributes[key.key] = key.values[0]?.value ?? "Dry Run";
      }
      return { ...base, ...applyTagSchema(tagSchema, attributes) };
    }
    return { ...base, tags: ["Test", "Dry Run", "Stress Test"] };
  }

  try {
    // Optimize image URL to save tokens
    const optimizedUrl = optimizeImageUrl(imageUrl);

    // Call Claude API with retry logic for rate limits
    const response = await withRetry(
      () =>
        anthropic.messages.create({
          model: "anthropic/claude-haiku-4.5",
          // A cap, not a charge. Headroom so a merchant tag schema with many keys
          // cannot truncate the JSON, which would surface only as a PARSE_ERROR.
          max_tokens: 2048,
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

      // Validate structure. Which tag field is required depends on the mode: in
      // Key:Value mode the model is asked for tag_attributes and returns no
      // `tags` key at all.
      if (!result.metafields) {
        return {
          error: "Invalid response structure",
          code: "PARSE_ERROR",
        };
      }

      if (tagSchema) {
        if (!result.tag_attributes) {
          return {
            error: "Invalid response structure",
            code: "PARSE_ERROR",
          };
        }
        return { ...result, ...applyTagSchema(tagSchema, result.tag_attributes) };
      }

      if (!result.tags) {
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
    const result = await analyzeProductImage({ imageUrl: url, industryId });
    results.set(url, result);

    // Small delay between requests to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  return results;
}
