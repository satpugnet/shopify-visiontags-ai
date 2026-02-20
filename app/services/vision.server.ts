/**
 * Vision Service - Claude API for image analysis
 * Analyzes product images and returns metafields + tags
 */

import Anthropic from "@anthropic-ai/sdk";

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

/**
 * Retry a function with exponential backoff
 * Handles rate limits (429) and transient errors
 */
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

      // Check if this is a rate limit error (429) or server error (5xx)
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

      // Exponential backoff with jitter
      const delay = Math.min(
        baseDelayMs * Math.pow(2, attempt) + Math.random() * 1000,
        maxDelayMs
      );
      console.log(`[VisionTags] Retry ${attempt + 1}/${maxRetries} after ${Math.round(delay)}ms`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

// The AI prompt for hybrid metafields + tags + alt text output
const VISION_PROMPT = `Analyze this product image for an e-commerce store.
Return a JSON object with THREE sections:

{
  "metafields": {
    // Strict, objective data for Shopify Standard Taxonomy filters
    // Only include keys where you can make a confident visual assessment
    "target_gender": "Female" | "Male" | "Unisex",
    "age_group": "Adult" | "Teen" | "Kids" | "Baby",
    "color": "Primary color name (e.g., Navy Blue)",
    "color_hex": "#XXXXXX (hex code for the primary color)",
    "pattern": "Solid" | "Striped" | "Floral" | "Plaid" | "Paisley" | "Animal Print" | "Geometric" | "Abstract",
    "material": "Cotton" | "Polyester" | "Silk" | "Wool" | "Denim" | "Leather" | "Linen" | "Synthetic",
    "neckline": "Crew" | "V-neck" | "Scoop" | "Boat" | "Turtleneck" | "Off-shoulder" | "Halter" | "Collared" | null,
    "sleeve_length": "Sleeveless" | "Short" | "3/4" | "Long" | null,
    "fit": "Slim" | "Regular" | "Relaxed" | "Oversized",
    "product_type": "Suggested Shopify product type (e.g., T-Shirt, Dress, Pants, Jacket, Bag, Shoes)"
  },
  "tags": [
    // SEO keywords and vibe/occasion strings (Title Case)
    // Include: color, pattern, material as keywords
    // Add: 3-5 descriptive vibe/occasion words
    // Examples: "Navy Blue", "Striped", "Cotton", "Summer Vibes", "Business Casual", "Resort Wear"
  ],
  "alt_text": "Descriptive alt text for accessibility and SEO, max 125 characters. Describe what the product looks like.",
  "description": "2-4 sentence product description for the storefront. Describe what the product looks like based on the image. Include key attributes (color, material, style) naturally. Write in a professional e-commerce tone. Plain text only, no HTML.",
  "seo_title": "SEO page title, max 60 characters. Format: [Key Attribute] [Product Type]. Example: 'Navy Blue Cotton Crew Neck T-Shirt'",
  "meta_description": "Meta description for search results, max 155 characters. Compelling summary with key product attributes. Include a subtle call to action."
}

IMPORTANT RULES:
1. Only include metafield keys where you can make a confident visual assessment
2. If the product is not apparel (e.g., accessories, home goods), omit clothing-specific fields like neckline, sleeve_length
3. Tags should be Title Case and include both factual (color, material) and vibe/mood keywords
4. alt_text should be descriptive and accessibility-friendly, describing the product visually
5. Return valid JSON only - no markdown, no explanation
6. description should be plain text (no HTML, no markdown). seo_title max 60 chars. meta_description max 155 chars.

Return valid JSON only.`;

export interface VisionResult {
  metafields: {
    target_gender?: string;
    age_group?: string;
    color?: string;
    color_hex?: string;
    pattern?: string;
    material?: string;
    neckline?: string | null;
    sleeve_length?: string | null;
    fit?: string;
    product_type?: string;
  };
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
  imageUrl: string
): Promise<VisionResponse> {
  try {
    // Optimize image URL to save tokens
    const optimizedUrl = optimizeImageUrl(imageUrl);

    // Call Claude API with retry logic for rate limits
    const response = await withRetry(
      () =>
        anthropic.messages.create({
          model: "claude-haiku-4-5-20251001",
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
                  text: VISION_PROMPT,
                },
              ],
            },
          ],
        }),
      { maxRetries: 3, baseDelayMs: 2000 }
    );

    // Extract text content from response
    const textContent = response.content.find((block) => block.type === "text");
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
    console.error("Vision API error:", error);

    if (error instanceof Anthropic.AuthenticationError) {
      return {
        error: "Anthropic API authentication failed - check API key",
        code: "API_ERROR",
      };
    }

    if (error instanceof Anthropic.RateLimitError) {
      return {
        error: "Anthropic API rate limit exceeded - try again later",
        code: "API_ERROR",
      };
    }

    if (error instanceof Anthropic.APIError) {
      return {
        error: `Anthropic API error (${error.status}): ${error.message}`,
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
  imageUrls: string[]
): Promise<Map<string, VisionResponse>> {
  const results = new Map<string, VisionResponse>();

  for (const url of imageUrls) {
    const result = await analyzeProductImage(url);
    results.set(url, result);

    // Small delay between requests to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  return results;
}
