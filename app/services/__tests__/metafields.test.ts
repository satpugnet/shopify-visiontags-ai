import { describe, it, expect } from "vitest";
import {
  filterMetafieldsByCategory,
  toMetafieldInputs,
  type ProductMetafields,
} from "../metafields.server";

describe("filterMetafieldsByCategory", () => {
  const fullMetafields: ProductMetafields = {
    color: "Navy Blue",
    pattern: "Solid",
    material: "Cotton",
    target_gender: "Male",
    age_group: "Adult",
    neckline: "Crew",
    sleeve_length: "Short",
    fit: "Regular",
  };

  it("should keep all fields for apparel categories", () => {
    const apparelCategories = [
      "Apparel",
      "Clothing",
      "Shirts",
      "Tops",
      "Dresses",
      "Men's Clothing",
      "Women's Tops",
    ];

    for (const category of apparelCategories) {
      const filtered = filterMetafieldsByCategory(fullMetafields, category);
      expect(filtered.neckline).toBe("Crew");
      expect(filtered.sleeve_length).toBe("Short");
      expect(filtered.fit).toBe("Regular");
    }
  });

  it("should remove apparel-specific fields for non-apparel categories", () => {
    const nonApparelCategories = [
      "Electronics",
      "Home & Garden",
      "Accessories",
      "Jewelry",
      "Books",
    ];

    for (const category of nonApparelCategories) {
      const filtered = filterMetafieldsByCategory(fullMetafields, category);
      expect(filtered.neckline).toBeUndefined();
      expect(filtered.sleeve_length).toBeUndefined();
      expect(filtered.fit).toBeUndefined();
      // Should keep common fields
      expect(filtered.color).toBe("Navy Blue");
      expect(filtered.pattern).toBe("Solid");
      expect(filtered.material).toBe("Cotton");
    }
  });

  it("should keep all fields when category is null/undefined", () => {
    const filtered1 = filterMetafieldsByCategory(fullMetafields, null);
    const filtered2 = filterMetafieldsByCategory(fullMetafields, undefined);

    expect(filtered1.neckline).toBe("Crew");
    expect(filtered2.neckline).toBe("Crew");
  });

  it("should remove null and undefined values", () => {
    const metafieldsWithNulls: ProductMetafields = {
      color: "Blue",
      pattern: null as unknown as string,
      material: undefined,
      neckline: null,
    };

    const filtered = filterMetafieldsByCategory(metafieldsWithNulls, "Shirts");
    expect(filtered.color).toBe("Blue");
    expect(filtered.pattern).toBeUndefined();
    expect(filtered.material).toBeUndefined();
    expect(filtered.neckline).toBeUndefined();
  });

  it("should handle empty metafields object", () => {
    const filtered = filterMetafieldsByCategory({}, "Shirts");
    expect(Object.keys(filtered)).toHaveLength(0);
  });
});

describe("toMetafieldInputs", () => {
  it("should convert metafields to Shopify input format", () => {
    const metafields: ProductMetafields = {
      color: "Red",
      pattern: "Striped",
    };

    const inputs = toMetafieldInputs(metafields);

    expect(inputs).toHaveLength(2);
    expect(inputs).toContainEqual({
      namespace: "custom",
      key: "color",
      value: "Red",
      type: "single_line_text_field",
    });
    expect(inputs).toContainEqual({
      namespace: "custom",
      key: "pattern",
      value: "Striped",
      type: "single_line_text_field",
    });
  });

  it("should use 'custom' namespace for all metafields (not reserved 'shopify')", () => {
    const metafields: ProductMetafields = {
      color: "Blue",
      pattern: "Solid",
      material: "Cotton",
      target_gender: "Female",
      age_group: "Adult",
      neckline: "V-neck",
      sleeve_length: "Long",
      fit: "Slim",
    };

    const inputs = toMetafieldInputs(metafields);

    // All inputs should use 'custom' namespace
    for (const input of inputs) {
      expect(input.namespace).toBe("custom");
      expect(input.namespace).not.toBe("shopify"); // shopify is reserved!
    }
  });

  it("should skip null and undefined values", () => {
    const metafields: ProductMetafields = {
      color: "Green",
      pattern: null as unknown as string,
      material: undefined,
    };

    const inputs = toMetafieldInputs(metafields);

    expect(inputs).toHaveLength(1);
    expect(inputs[0].key).toBe("color");
  });

  it("should skip unknown keys not in METAFIELD_MAPPINGS", () => {
    const metafields = {
      color: "Purple",
      unknown_field: "test",
    } as ProductMetafields;

    const inputs = toMetafieldInputs(metafields);

    expect(inputs).toHaveLength(1);
    expect(inputs[0].key).toBe("color");
  });

  it("should convert non-string values to strings", () => {
    // In case AI returns non-string values
    const metafields = {
      color: 123 as unknown as string,
    } as ProductMetafields;

    const inputs = toMetafieldInputs(metafields);

    expect(inputs[0].value).toBe("123");
    expect(typeof inputs[0].value).toBe("string");
  });

  it("should return empty array for empty metafields", () => {
    const inputs = toMetafieldInputs({});
    expect(inputs).toHaveLength(0);
  });

  it("should map all known metafield keys correctly", () => {
    const metafields: ProductMetafields = {
      color: "test",
      pattern: "test",
      material: "test",
      target_gender: "test",
      age_group: "test",
      neckline: "test",
      sleeve_length: "test",
      fit: "test",
    };

    const inputs = toMetafieldInputs(metafields);

    expect(inputs).toHaveLength(8);

    const keys = inputs.map((i) => i.key);
    expect(keys).toContain("color");
    expect(keys).toContain("pattern");
    expect(keys).toContain("material");
    expect(keys).toContain("target_gender");
    expect(keys).toContain("age_group");
    expect(keys).toContain("neckline");
    expect(keys).toContain("sleeve_length");
    expect(keys).toContain("fit");
  });
});

describe("metafield namespace validation", () => {
  it("should never use reserved 'shopify' namespace", () => {
    // This test documents the bug that was fixed
    // The 'shopify' namespace is reserved and cannot be written to by apps
    const metafields: ProductMetafields = {
      color: "Blue",
      pattern: "Solid",
      material: "Cotton",
      target_gender: "Male",
      age_group: "Adult",
    };

    const inputs = toMetafieldInputs(metafields);

    for (const input of inputs) {
      expect(input.namespace).not.toBe("shopify");
      expect(input.namespace).toBe("custom");
    }
  });
});
