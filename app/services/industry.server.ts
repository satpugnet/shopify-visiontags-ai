/**
 * Industry Service - Industry detection + prompt templates + metafield mappings
 * Auto-detects store industry from product types/categories and builds
 * industry-specific AI prompts and metafield configurations.
 */

import { buildTagPromptFragment, isUsableTagSchema, type TagSchema } from "./tagSchema";

export interface IndustryConfig {
  id: string;
  name: string;
  metafieldKeys: Record<string, { description: string; examples: string[] }>;
  promptFragment: string;
  detectionPatterns: string[];
}

export const INDUSTRIES: Record<string, IndustryConfig> = {
  fashion: {
    id: "fashion",
    name: "Fashion & Apparel",
    metafieldKeys: {
      color: { description: "Primary color name", examples: ["Navy Blue", "Charcoal", "Ivory"] },
      color_hex: { description: "Hex code for the primary color", examples: ["#1F2937", "#FFFFF0"] },
      pattern: { description: "Pattern type", examples: ["Solid", "Striped", "Floral", "Plaid"] },
      material: { description: "Primary material", examples: ["Cotton", "Polyester", "Silk", "Denim"] },
      neckline: { description: "Neckline style (if applicable)", examples: ["Crew", "V-neck", "Scoop", "Collared"] },
      sleeve_length: { description: "Sleeve length (if applicable)", examples: ["Sleeveless", "Short", "3/4", "Long"] },
      fit: { description: "Fit type", examples: ["Slim", "Regular", "Relaxed", "Oversized"] },
      target_gender: { description: "Target gender", examples: ["Female", "Male", "Unisex"] },
      age_group: { description: "Target age group", examples: ["Adult", "Teen", "Kids", "Baby"] },
      product_type: { description: "Suggested product type", examples: ["T-Shirt", "Dress", "Pants", "Jacket"] },
    },
    promptFragment: `Analyze this product for a FASHION store. Focus on apparel attributes.
Only include keys where you can make a confident visual assessment.
If the product is not apparel (e.g., accessories), omit clothing-specific fields like neckline, sleeve_length, fit.`,
    detectionPatterns: ["shirt", "dress", "pants", "jacket", "clothing", "apparel", "sweater", "blouse", "skirt", "jeans", "coat", "hoodie", "shorts", "leggings", "underwear", "socks", "shoes", "boots", "sneakers", "sandals", "heel"],
  },

  electronics: {
    id: "electronics",
    name: "Electronics & Tech",
    metafieldKeys: {
      color: { description: "Primary color", examples: ["Black", "Silver", "White"] },
      material: { description: "Primary material/build", examples: ["Aluminum", "Plastic", "Glass", "Carbon Fiber"] },
      connectivity: { description: "Connectivity type", examples: ["Bluetooth", "WiFi", "USB-C", "Wired"] },
      power_source: { description: "Power source", examples: ["Battery", "USB-C", "AC Adapter", "Solar"] },
      compatibility: { description: "Compatible platforms", examples: ["iOS", "Android", "Windows", "Universal"] },
      form_factor: { description: "Form factor/size class", examples: ["Portable", "Desktop", "In-Ear", "Over-Ear"] },
      product_type: { description: "Suggested product type", examples: ["Headphones", "Charger", "Phone Case", "Laptop Stand"] },
    },
    promptFragment: `Analyze this product for an ELECTRONICS store. Focus on tech specifications visible in the image.
Identify connectivity, form factor, and compatibility where possible.`,
    detectionPatterns: ["phone", "laptop", "cable", "charger", "electronic", "gadget", "headphone", "speaker", "keyboard", "mouse", "monitor", "tablet", "camera", "drone", "smartwatch", "earbuds", "adapter", "usb", "bluetooth", "wireless"],
  },

  home: {
    id: "home",
    name: "Home & Living",
    metafieldKeys: {
      color: { description: "Primary color", examples: ["Oak", "White", "Gray", "Natural"] },
      material: { description: "Primary material", examples: ["Wood", "Metal", "Fabric", "Ceramic", "Glass"] },
      style: { description: "Design style", examples: ["Modern", "Rustic", "Minimalist", "Industrial", "Bohemian"] },
      dimensions_hint: { description: "Approximate size category", examples: ["Small", "Medium", "Large", "Oversized"] },
      room_type: { description: "Intended room/space", examples: ["Living Room", "Bedroom", "Kitchen", "Bathroom", "Office"] },
      product_type: { description: "Suggested product type", examples: ["Throw Pillow", "Table Lamp", "Wall Art", "Vase"] },
    },
    promptFragment: `Analyze this product for a HOME & LIVING store. Focus on decor attributes, materials, and style.
Identify the design style and intended room/space where possible.`,
    detectionPatterns: ["furniture", "lamp", "decor", "pillow", "rug", "table", "chair", "sofa", "couch", "shelf", "curtain", "vase", "candle", "mirror", "frame", "blanket", "bedding", "towel", "kitchen", "dining"],
  },

  beauty: {
    id: "beauty",
    name: "Beauty & Cosmetics",
    metafieldKeys: {
      skin_type: { description: "Suitable skin type", examples: ["All Skin Types", "Oily", "Dry", "Sensitive", "Combination"] },
      ingredients_hint: { description: "Key visible ingredients", examples: ["Vitamin C", "Retinol", "Hyaluronic Acid", "Natural"] },
      scent: { description: "Scent profile (if applicable)", examples: ["Floral", "Citrus", "Unscented", "Woody"] },
      finish: { description: "Finish type", examples: ["Matte", "Glossy", "Satin", "Dewy", "Natural"] },
      application_method: { description: "How to apply", examples: ["Pump", "Dropper", "Spray", "Tube", "Palette"] },
      product_type: { description: "Suggested product type", examples: ["Moisturizer", "Serum", "Lipstick", "Foundation"] },
    },
    promptFragment: `Analyze this product for a BEAUTY store. Focus on cosmetic/skincare attributes.
Identify finish, application method, and likely skin type suitability from packaging and product appearance.`,
    detectionPatterns: ["cream", "serum", "lipstick", "foundation", "skincare", "cosmetic", "mascara", "eyeshadow", "blush", "moisturizer", "cleanser", "toner", "perfume", "fragrance", "shampoo", "conditioner", "nail", "makeup", "beauty", "lotion"],
  },

  food: {
    id: "food",
    name: "Food & Beverage",
    metafieldKeys: {
      flavor: { description: "Primary flavor profile", examples: ["Chocolate", "Vanilla", "Spicy", "Citrus", "Savory"] },
      dietary_info: { description: "Dietary category", examples: ["Vegan", "Gluten-Free", "Organic", "Sugar-Free", "Keto"] },
      serving_suggestion: { description: "How to serve/use", examples: ["Hot", "Cold", "As topping", "Ready to eat"] },
      origin_hint: { description: "Likely origin/style", examples: ["Italian", "Japanese", "Mexican", "American", "French"] },
      product_type: { description: "Suggested product type", examples: ["Coffee", "Tea", "Chocolate", "Sauce", "Snack"] },
    },
    promptFragment: `Analyze this product for a FOOD & BEVERAGE store. Focus on flavor, dietary attributes, and serving style.
Identify flavor profiles and dietary categories from packaging and product appearance.`,
    detectionPatterns: ["coffee", "tea", "snack", "sauce", "chocolate", "spice", "candy", "cookie", "cake", "wine", "beer", "juice", "supplement", "protein", "vitamin", "honey", "jam", "olive", "cheese", "pasta"],
  },

  general: {
    id: "general",
    name: "General",
    metafieldKeys: {
      color: { description: "Primary color", examples: ["Black", "White", "Red", "Blue"] },
      material: { description: "Primary material", examples: ["Metal", "Plastic", "Wood", "Fabric"] },
      style: { description: "Design style", examples: ["Modern", "Classic", "Minimalist", "Bold"] },
      product_type: { description: "Suggested product type", examples: ["Widget", "Tool", "Accessory", "Kit"] },
      use_case: { description: "Primary use case", examples: ["Everyday", "Professional", "Gift", "Travel"] },
    },
    promptFragment: `Analyze this product for an e-commerce store. Identify the most relevant attributes from the image.
Focus on what would help a shopper or AI agent understand and categorize this product.`,
    detectionPatterns: [],
  },
};

/**
 * Detect the most likely industry from a set of products.
 * Counts pattern matches per industry. If no industry exceeds 30%, returns "general".
 */
export function detectIndustry(
  products: Array<{ category?: string; productType?: string }>
): string {
  if (products.length === 0) return "general";

  const scores: Record<string, number> = {};

  for (const product of products) {
    const text = [product.category, product.productType]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    if (!text) continue;

    for (const [industryId, config] of Object.entries(INDUSTRIES)) {
      if (industryId === "general") continue;

      for (const pattern of config.detectionPatterns) {
        if (text.includes(pattern)) {
          scores[industryId] = (scores[industryId] || 0) + 1;
          break; // Only count one match per product per industry
        }
      }
    }
  }

  // Find the industry with the highest score
  let bestIndustry = "general";
  let bestScore = 0;

  for (const [industryId, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      bestIndustry = industryId;
    }
  }

  // Require at least 30% of products to match
  const threshold = products.length * 0.3;
  if (bestScore < threshold) {
    return "general";
  }

  return bestIndustry;
}

/**
 * Build the full vision prompt for a given industry.
 * Base structure always includes: tags, alt_text, description, seo_title, meta_description.
 * Only the metafields{} keys change per industry.
 *
 * @param industryId - The detected industry (fashion, electronics, etc.)
 * @param language - Output language (e.g., "English", "Portuguese", "Spanish")
 * @param storeName - The merchant's store name for context
 */
export function buildVisionPrompt(
  industryId: string,
  language?: string,
  storeName?: string,
  tagSchema?: TagSchema | null,
): string {
  const config = INDUSTRIES[industryId] || INDUSTRIES.general;
  const lang = language || "English";
  const store = storeName || "an e-commerce store";
  const schema = isUsableTagSchema(tagSchema) ? tagSchema : null;

  const metafieldEntries = Object.entries(config.metafieldKeys)
    .map(([key, info]) => `    "${key}": "${info.description} (e.g., ${info.examples.slice(0, 3).join(", ")})"`)
    .join(",\n");

  // With a merchant tag schema, tags come back as a structured object that is
  // snapped onto their vocabulary afterwards, rather than as free-form phrases.
  const tagsLine = schema
    ? `  "tag_attributes": { "Key": "Value" },`
    : `  "tags": ["Title Case tags mixing factual attributes and discovery keywords"],`;

  const tagsRule = schema
    ? `2. Tags: see the TAG ATTRIBUTES section below. Do NOT return a "tags" field.`
    : `2. Tags: Title Case, mix of factual attributes and discovery keywords.`;

  // Rule 6 tells the model to write everything in the merchant's language. Tag
  // attributes are the one exception: they are the merchant's own vocabulary, and
  // a translated key or value would be rejected during normalization.
  const languageRule = schema
    ? `6. Write in ${lang}. All text fields (description, seo_title, meta_description, alt_text) must be in ${lang}. The keys and values in tag_attributes are the ONLY exception: leave them exactly as given.`
    : `6. Write in ${lang}. All text fields (description, seo_title, meta_description, alt_text, tags) must be in ${lang}.`;

  const tagSchemaSection = schema ? `\n\n${buildTagPromptFragment(schema)}` : "";

  return `You are writing product content for ${store}.
Write ALL output in ${lang}.

${config.promptFragment}

Analyze the product image and return JSON:

{
  "metafields": {
${metafieldEntries}
  },
${tagsLine}
  "alt_text": "Describe what is visible in the image. Max 125 chars.",
  "description": "2-4 sentences. Describe THIS specific product, not a generic category. Preserve the brand name, model name, and any collaboration names from the product title. Mention specific visual details from the image (colors, textures, design elements). No filler phrases. Plain text only, no HTML.",
  "seo_title": "Max 60 chars. Keep the brand and model name from the product title. Format: [Brand] [Model] [Product Type].",
  "meta_description": "Max 155 chars. Compelling summary with key product attributes and a subtle call to action."
}

RULES:
1. Only include metafield keys where you can make a confident visual assessment.
${tagsRule}
3. alt_text: Describe what is visible in the image. Max 125 characters.
4. NEVER use these phrases: "perfect for", "ideal for", "everyday wear", "versatile addition", "any wardrobe", "statement-making", "eye-catching", "must-have", "elevate your". Be specific, not generic.
5. Preserve brand names, model names, and collaboration names from the product title in the description and SEO title. Do not replace them with generic terms.
${languageRule}
7. Return valid JSON only. No markdown, no explanation.${tagSchemaSection}`;
}

/**
 * Get the metafield key-to-Shopify mapping for an industry.
 * Maps industry metafield keys to {namespace: "custom", key, type: "single_line_text_field"}.
 */
export function getMetafieldMappings(
  industryId: string
): Record<string, { namespace: string; key: string; type: string }> {
  const config = INDUSTRIES[industryId] || INDUSTRIES.general;
  const mappings: Record<string, { namespace: string; key: string; type: string }> = {};

  for (const key of Object.keys(config.metafieldKeys)) {
    mappings[key] = {
      namespace: "custom",
      key,
      type: "single_line_text_field",
    };
  }

  return mappings;
}
