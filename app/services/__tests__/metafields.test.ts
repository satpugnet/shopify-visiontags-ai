import { describe, it, expect } from "vitest";
import { toMetafieldInputs } from "../metafields.server";

describe("toMetafieldInputs", () => {
  it("should convert metafields to Shopify input format", () => {
    const metafields = {
      color: "Red",
      pattern: "Striped",
    };

    const inputs = toMetafieldInputs(metafields, "fashion");

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
    const metafields = {
      color: "Blue",
      material: "Cotton",
      product_type: "T-Shirt",
    };

    const inputs = toMetafieldInputs(metafields, "fashion");

    for (const input of inputs) {
      expect(input.namespace).toBe("custom");
      expect(input.namespace).not.toBe("shopify");
    }
  });

  it("should skip null and undefined values", () => {
    const metafields: Record<string, string | null | undefined> = {
      color: "Green",
      pattern: null,
      material: undefined,
    };

    const inputs = toMetafieldInputs(metafields, "fashion");

    expect(inputs).toHaveLength(1);
    expect(inputs[0].key).toBe("color");
  });

  it("should skip unknown keys not in industry config", () => {
    const metafields = {
      color: "Purple",
      unknown_field: "test",
      totally_made_up: "value",
    };

    const inputs = toMetafieldInputs(metafields, "fashion");

    expect(inputs).toHaveLength(1);
    expect(inputs[0].key).toBe("color");
  });

  it("should accept all keys from a given industry config", () => {
    const fashionMetafields = {
      color: "Blue",
      color_hex: "#0000FF",
      pattern: "Solid",
      material: "Cotton",
      neckline: "Crew",
      sleeve_length: "Short",
      fit: "Regular",
      target_gender: "Male",
      age_group: "Adult",
      product_type: "T-Shirt",
    };

    const inputs = toMetafieldInputs(fashionMetafields, "fashion");
    expect(inputs).toHaveLength(10);

    const keys = inputs.map((i) => i.key);
    expect(keys).toContain("color");
    expect(keys).toContain("color_hex");
    expect(keys).toContain("pattern");
    expect(keys).toContain("material");
    expect(keys).toContain("neckline");
    expect(keys).toContain("sleeve_length");
    expect(keys).toContain("fit");
    expect(keys).toContain("target_gender");
    expect(keys).toContain("age_group");
    expect(keys).toContain("product_type");
  });

  it("should accept electronics industry keys", () => {
    const electronicsMetafields = {
      color: "Black",
      connectivity: "Bluetooth",
      power_source: "Battery",
    };

    const inputs = toMetafieldInputs(electronicsMetafields, "electronics");
    expect(inputs).toHaveLength(3);
  });

  it("should use general industry when no industryId provided", () => {
    const metafields = {
      color: "Red",
      material: "Wood",
      style: "Modern",
    };

    const inputs = toMetafieldInputs(metafields);
    expect(inputs).toHaveLength(3);
  });

  it("should convert non-string values to strings", () => {
    const metafields = {
      color: 123 as unknown as string,
    };

    const inputs = toMetafieldInputs(metafields, "general");

    expect(inputs[0].value).toBe("123");
    expect(typeof inputs[0].value).toBe("string");
  });

  it("should return empty array for empty metafields", () => {
    const inputs = toMetafieldInputs({}, "fashion");
    expect(inputs).toHaveLength(0);
  });
});

describe("metafield namespace validation", () => {
  it("should never use reserved 'shopify' namespace", () => {
    const metafields = {
      color: "Blue",
      pattern: "Solid",
      material: "Cotton",
    };

    const inputs = toMetafieldInputs(metafields, "fashion");

    for (const input of inputs) {
      expect(input.namespace).not.toBe("shopify");
      expect(input.namespace).toBe("custom");
    }
  });
});
