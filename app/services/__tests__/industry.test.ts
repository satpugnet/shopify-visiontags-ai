import { describe, it, expect } from "vitest";
import {
  detectIndustry,
  buildVisionPrompt,
  getMetafieldMappings,
  INDUSTRIES,
} from "../industry.server";

describe("detectIndustry", () => {
  it("should detect fashion from clothing product types", () => {
    const products = [
      { productType: "T-Shirt" },
      { productType: "Dress" },
      { productType: "Pants" },
      { productType: "Jacket" },
    ];
    expect(detectIndustry(products)).toBe("fashion");
  });

  it("should detect electronics from tech product types", () => {
    const products = [
      { productType: "Phone Case" },
      { productType: "Charger" },
      { productType: "Headphone" },
      { productType: "USB Cable" },
    ];
    expect(detectIndustry(products)).toBe("electronics");
  });

  it("should detect home from furniture/decor product types", () => {
    const products = [
      { productType: "Table Lamp" },
      { productType: "Throw Pillow" },
      { productType: "Rug" },
      { category: "Furniture" },
    ];
    expect(detectIndustry(products)).toBe("home");
  });

  it("should detect beauty from cosmetics product types", () => {
    const products = [
      { productType: "Moisturizer" },
      { productType: "Lipstick" },
      { productType: "Serum" },
    ];
    expect(detectIndustry(products)).toBe("beauty");
  });

  it("should detect food from food product types", () => {
    const products = [
      { productType: "Coffee" },
      { productType: "Chocolate" },
      { productType: "Tea" },
    ];
    expect(detectIndustry(products)).toBe("food");
  });

  it("should return 'general' for mixed stores below 30% threshold", () => {
    const products = [
      { productType: "T-Shirt" },
      { productType: "Phone Case" },
      { productType: "Table Lamp" },
      { productType: "Moisturizer" },
      { productType: "Coffee" },
      { productType: "Widget" },
      { productType: "Gadget" },
      { productType: "Thing" },
      { productType: "Stuff" },
      { productType: "Other" },
    ];
    expect(detectIndustry(products)).toBe("general");
  });

  it("should return 'general' for empty products array", () => {
    expect(detectIndustry([])).toBe("general");
  });

  it("should return 'general' when no product types are set", () => {
    const products = [
      { productType: "" },
      { productType: "" },
      { productType: "" },
    ];
    expect(detectIndustry(products)).toBe("general");
  });

  it("should use category as fallback for detection", () => {
    const products = [
      { category: "Clothing" },
      { category: "Apparel" },
      { category: "Shirts" },
    ];
    expect(detectIndustry(products)).toBe("fashion");
  });

  it("should handle case-insensitive matching", () => {
    const products = [
      { productType: "CHARGER" },
      { productType: "Laptop" },
      { productType: "wireless speaker" },
    ];
    expect(detectIndustry(products)).toBe("electronics");
  });
});

describe("buildVisionPrompt", () => {
  it("should include industry-specific metafield keys", () => {
    const fashionPrompt = buildVisionPrompt("fashion");
    expect(fashionPrompt).toContain("neckline");
    expect(fashionPrompt).toContain("sleeve_length");
    expect(fashionPrompt).toContain("FASHION");

    const electronicsPrompt = buildVisionPrompt("electronics");
    expect(electronicsPrompt).toContain("connectivity");
    expect(electronicsPrompt).toContain("power_source");
    expect(electronicsPrompt).toContain("ELECTRONICS");
  });

  it("should always include base fields (tags, alt_text, description, seo)", () => {
    for (const industryId of Object.keys(INDUSTRIES)) {
      const prompt = buildVisionPrompt(industryId);
      expect(prompt).toContain("tags");
      expect(prompt).toContain("alt_text");
      expect(prompt).toContain("description");
      expect(prompt).toContain("seo_title");
      expect(prompt).toContain("meta_description");
    }
  });

  it("should fallback to general for unknown industry", () => {
    const prompt = buildVisionPrompt("nonexistent");
    expect(prompt).toContain("e-commerce store");
  });

  it("should return valid prompt with JSON structure instructions", () => {
    const prompt = buildVisionPrompt("general");
    expect(prompt).toContain("metafields");
    expect(prompt).toContain("Return valid JSON only");
  });

  it("should include language instruction when language is passed", () => {
    const prompt = buildVisionPrompt("fashion", "Portuguese");
    expect(prompt).toContain("Write ALL output in Portuguese");
    expect(prompt).toContain("must be in Portuguese");
  });

  it("should include store name when passed", () => {
    const prompt = buildVisionPrompt("fashion", undefined, "MyStore");
    expect(prompt).toContain("writing product content for MyStore");
  });

  it("should include both language and store name", () => {
    const prompt = buildVisionPrompt("fashion", "Portuguese", "MyStore");
    expect(prompt).toContain("writing product content for MyStore");
    expect(prompt).toContain("Write ALL output in Portuguese");
  });

  it("should default to English when no language is passed", () => {
    const prompt = buildVisionPrompt("general");
    expect(prompt).toContain("Write ALL output in English");
  });

  it("should include banned phrases list", () => {
    const prompt = buildVisionPrompt("general");
    expect(prompt).toContain("perfect for");
    expect(prompt).toContain("ideal for");
    expect(prompt).toContain("everyday wear");
    expect(prompt).toContain("must-have");
    expect(prompt).toContain("NEVER use these phrases");
  });

  it("should include brand preservation rule", () => {
    const prompt = buildVisionPrompt("general");
    expect(prompt).toContain("Preserve brand names");
    expect(prompt).toContain("collaboration names");
  });
});

describe("getMetafieldMappings", () => {
  it("should return mappings for all keys in an industry", () => {
    const fashionMappings = getMetafieldMappings("fashion");

    expect(fashionMappings.color).toEqual({
      namespace: "custom",
      key: "color",
      type: "single_line_text_field",
    });
    expect(fashionMappings.neckline).toBeDefined();
    expect(fashionMappings.sleeve_length).toBeDefined();
  });

  it("should use custom namespace for all mappings", () => {
    for (const industryId of Object.keys(INDUSTRIES)) {
      const mappings = getMetafieldMappings(industryId);
      for (const mapping of Object.values(mappings)) {
        expect(mapping.namespace).toBe("custom");
      }
    }
  });

  it("should fallback to general for unknown industry", () => {
    const mappings = getMetafieldMappings("nonexistent");
    expect(mappings.color).toBeDefined();
    expect(mappings.material).toBeDefined();
  });

  it("should not include keys from other industries", () => {
    const electronicsMappings = getMetafieldMappings("electronics");
    expect(electronicsMappings.neckline).toBeUndefined();
    expect(electronicsMappings.sleeve_length).toBeUndefined();

    const fashionMappings = getMetafieldMappings("fashion");
    expect(fashionMappings.connectivity).toBeUndefined();
    expect(fashionMappings.power_source).toBeUndefined();
  });
});
