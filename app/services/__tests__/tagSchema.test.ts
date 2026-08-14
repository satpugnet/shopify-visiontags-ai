import { describe, it, expect } from "vitest";
import {
  validateTagSchema,
  parseTagSchemaText,
  formatTagSchemaText,
  buildTagPromptFragment,
  normalizeTagAttributes,
  isSchemaOwnedTag,
  isUsableTagSchema,
  mergeTags,
  revertTags,
  MAX_KEYS,
  MAX_VALUES_PER_KEY,
  MAX_EMITTED_VALUES_PER_KEY,
  type TagSchema,
} from "../tagSchema";
import { readTagSchema } from "../tagSchema.server";

/** The shape LaFetch described in their request. */
const laFetchSchema: TagSchema = {
  version: 1,
  keys: [
    { key: "Color", values: [{ value: "Black", aliases: [] }, { value: "Navy", aliases: [] }] },
    { key: "Fit", values: [{ value: "Regular Fit", aliases: [] }, { value: "Relaxed Fit", aliases: [] }] },
    { key: "Occasion", values: [{ value: "Dinner", aliases: [] }, { value: "Work", aliases: [] }] },
    { key: "Neckline", values: [] },
  ],
};

describe("validateTagSchema", () => {
  it("accepts a well-formed schema and canonicalises string values", () => {
    const result = validateTagSchema({
      version: 1,
      keys: [{ key: "Color", values: ["Black", "Navy"] }],
    });
    expect(result.errors).toBeUndefined();
    expect(result.schema?.keys[0]).toEqual({
      key: "Color",
      values: [
        { value: "Black", aliases: [] },
        { value: "Navy", aliases: [] },
      ],
    });
  });

  it("treats null and undefined as an empty schema", () => {
    expect(validateTagSchema(null).schema).toEqual({ version: 1, keys: [] });
    expect(validateTagSchema(undefined).schema).toEqual({ version: 1, keys: [] });
  });

  it("rejects a colon inside a key", () => {
    const result = validateTagSchema({ keys: [{ key: "Col:or", values: [] }] });
    expect(result.errors?.[0]).toContain("cannot contain a colon");
  });

  it("strips commas out of keys and values so revert cannot be corrupted", () => {
    // Product.currentTags is stored as tags.join(", ") and split back on ", ".
    const result = validateTagSchema({
      keys: [{ key: "Co,lor", values: ["Bla,ck"] }],
    });
    expect(result.schema?.keys[0].key).toBe("Co lor");
    expect(result.schema?.keys[0].values[0].value).toBe("Bla ck");
  });

  it("rejects duplicate keys case-insensitively", () => {
    const result = validateTagSchema({
      keys: [{ key: "Color", values: [] }, { key: "color", values: [] }],
    });
    expect(result.errors?.[0]).toContain("defined more than once");
  });

  it("rejects empty key names", () => {
    const result = validateTagSchema({ keys: [{ key: "   ", values: [] }] });
    expect(result.errors?.[0]).toContain("cannot be empty");
  });

  it("rejects a non-object schema", () => {
    expect(validateTagSchema("Color: Black").errors).toBeDefined();
  });

  it("rejects a schema with no keys array", () => {
    expect(validateTagSchema({ version: 1 }).errors?.[0]).toContain("`keys` array");
  });

  it("rejects more than MAX_KEYS keys", () => {
    const keys = Array.from({ length: MAX_KEYS + 1 }, (_, i) => ({ key: `K${i}`, values: [] }));
    expect(validateTagSchema({ keys }).errors?.[0]).toContain(`at most ${MAX_KEYS} keys`);
  });

  it("rejects more than MAX_VALUES_PER_KEY values", () => {
    const values = Array.from({ length: MAX_VALUES_PER_KEY + 1 }, (_, i) => `V${i}`);
    expect(validateTagSchema({ keys: [{ key: "Color", values }] }).errors?.[0]).toContain(
      `more than ${MAX_VALUES_PER_KEY} allowed values`,
    );
  });

  it("rejects a value that would exceed Shopify's 255 char tag limit", () => {
    const result = validateTagSchema({
      keys: [{ key: "Color", values: ["x".repeat(260)] }],
    });
    expect(result.errors?.[0]).toContain("255 characters");
  });

  it("accepts alias objects alongside plain strings", () => {
    const result = validateTagSchema({
      keys: [{ key: "Fit", values: ["Regular Fit", { value: "Relaxed Fit", aliases: ["Loose"] }] }],
    });
    expect(result.schema?.keys[0].values[1].aliases).toEqual(["Loose"]);
  });

  it("dedupes values that differ only by case or punctuation", () => {
    const result = validateTagSchema({
      keys: [{ key: "Fit", values: ["Regular Fit", "regular-fit"] }],
    });
    expect(result.schema?.keys[0].values).toHaveLength(1);
  });
});

describe("readTagSchema", () => {
  it("returns null for malformed stored data instead of throwing", () => {
    expect(readTagSchema("garbage")).toBeNull();
    expect(readTagSchema({ keys: [{ key: "Col:on" }] })).toBeNull();
  });

  it("returns null for a schema with no keys", () => {
    expect(readTagSchema({ version: 1, keys: [] })).toBeNull();
  });

  it("returns the schema when valid", () => {
    expect(readTagSchema(laFetchSchema)?.keys).toHaveLength(4);
  });
});

describe("isUsableTagSchema", () => {
  it("is false for null and for an empty key list", () => {
    expect(isUsableTagSchema(null)).toBe(false);
    expect(isUsableTagSchema({ version: 1, keys: [] })).toBe(false);
  });

  it("is true when at least one key is defined", () => {
    expect(isUsableTagSchema(laFetchSchema)).toBe(true);
  });
});

describe("parseTagSchemaText", () => {
  it("parses the bulk editor format", () => {
    const result = parseTagSchemaText("Color: Black, Navy, Ecru\nFit: Regular Fit");
    expect(result.schema?.keys).toHaveLength(2);
    expect(result.schema?.keys[0].values.map((v) => v.value)).toEqual(["Black", "Navy", "Ecru"]);
  });

  it("treats a bare key as open-ended", () => {
    const result = parseTagSchemaText("Neckline");
    expect(result.schema?.keys[0]).toEqual({ key: "Neckline", values: [] });
  });

  it("ignores blank lines and comments", () => {
    const result = parseTagSchemaText("# my schema\n\nColor: Black\n\n");
    expect(result.schema?.keys).toHaveLength(1);
  });

  it("splits on the first colon only", () => {
    const result = parseTagSchemaText("Color: Black: Jet, Navy");
    expect(result.schema?.keys[0].key).toBe("Color");
    expect(result.schema?.keys[0].values.map((v) => v.value)).toEqual(["Black: Jet", "Navy"]);
  });

  it("surfaces validation errors from the parsed result", () => {
    expect(parseTagSchemaText("Color: Black\ncolor: Navy").errors).toBeDefined();
  });

  it("round-trips through formatTagSchemaText", () => {
    const text = "Color: Black, Navy\nNeckline";
    const parsed = parseTagSchemaText(text);
    expect(formatTagSchemaText(parsed.schema)).toBe(text);
  });
});

describe("formatTagSchemaText", () => {
  it("returns an empty string for an unusable schema", () => {
    expect(formatTagSchemaText(null)).toBe("");
    expect(formatTagSchemaText({ version: 1, keys: [] })).toBe("");
  });
});

describe("buildTagPromptFragment", () => {
  it("lists allowed values for constrained keys", () => {
    const fragment = buildTagPromptFragment(laFetchSchema);
    expect(fragment).toContain('"Color": one of "Black" | "Navy"');
  });

  it("marks keys with no allowed values as open-ended", () => {
    expect(buildTagPromptFragment(laFetchSchema)).toContain(
      '"Neckline": any short value',
    );
  });

  it("forbids translation, which the surrounding language rule would otherwise force", () => {
    const fragment = buildTagPromptFragment(laFetchSchema);
    expect(fragment).toContain("Never translate");
  });
});

describe("normalizeTagAttributes", () => {
  it("emits Key:Value pairs for exact matches", () => {
    const { tags } = normalizeTagAttributes(laFetchSchema, { Color: "Black" });
    expect(tags).toEqual(["Color:Black"]);
  });

  it("snaps canonical casing from the schema, not the model", () => {
    const { tags } = normalizeTagAttributes(laFetchSchema, { color: "navy" });
    expect(tags).toEqual(["Color:Navy"]);
  });

  it("resolves a partial value onto the allowed value it uniquely matches", () => {
    // The merchant lists "Regular Fit"; Haiku answers "Regular".
    const { tags } = normalizeTagAttributes(laFetchSchema, { Fit: "Regular" });
    expect(tags).toEqual(["Fit:Regular Fit"]);
  });

  it("ignores punctuation differences", () => {
    const { tags } = normalizeTagAttributes(laFetchSchema, { Fit: "relaxed-fit" });
    expect(tags).toEqual(["Fit:Relaxed Fit"]);
  });

  it("resolves aliases", () => {
    const schema = readTagSchema({
      keys: [{ key: "Fit", values: [{ value: "Relaxed Fit", aliases: ["Loose"] }] }],
    })!;
    expect(normalizeTagAttributes(schema, { Fit: "Loose" }).tags).toEqual(["Fit:Relaxed Fit"]);
  });

  it("does not mis-resolve a long answer onto a short allowed value", () => {
    // "Extra Large" plain-substring-contains "l" and nothing else, which would
    // uniquely (and wrongly) resolve to Size:L.
    const schema = readTagSchema({
      keys: [{ key: "Size", values: ["XS", "S", "M", "L", "XL"] }],
    })!;
    const { tags, rejected } = normalizeTagAttributes(schema, { Size: "Extra Large" });
    expect(tags).toEqual([]);
    expect(rejected.Size).toEqual(["Extra Large"]);
  });

  it("does not resolve punctuation-only answers onto a single allowed value", () => {
    const schema = readTagSchema({ keys: [{ key: "Fit", values: ["Regular Fit"] }] })!;
    expect(normalizeTagAttributes(schema, { Fit: "-" }).tags).toEqual([]);
  });

  it("only matches on whole words, not mid-word fragments", () => {
    const schema = readTagSchema({ keys: [{ key: "Material", values: ["Cotton Blend"] }] })!;
    // "Cot" is a fragment of "Cotton", not a word in "Cotton Blend".
    expect(normalizeTagAttributes(schema, { Material: "Cot" }).tags).toEqual([]);
    // A whole word still resolves.
    expect(normalizeTagAttributes(schema, { Material: "Cotton" }).tags).toEqual([
      "Material:Cotton Blend",
    ]);
  });

  it("rejects an ambiguous partial match rather than guessing", () => {
    const schema = readTagSchema({
      keys: [{ key: "Fit", values: ["Regular Fit", "Regular Long Fit"] }],
    })!;
    const { tags, rejected } = normalizeTagAttributes(schema, { Fit: "Regular" });
    expect(tags).toEqual([]);
    expect(rejected.Fit).toEqual(["Regular"]);
  });

  it("accepts arrays for keys where several values apply", () => {
    const { tags } = normalizeTagAttributes(laFetchSchema, { Occasion: ["Dinner", "Work"] });
    expect(tags).toEqual(["Occasion:Dinner", "Occasion:Work"]);
  });

  it("caps how many values a single key can emit", () => {
    const schema = readTagSchema({ keys: [{ key: "Occasion", values: [] }] })!;
    const many = Array.from({ length: MAX_EMITTED_VALUES_PER_KEY + 3 }, (_, i) => `V${i}`);
    expect(normalizeTagAttributes(schema, { Occasion: many }).tags).toHaveLength(
      MAX_EMITTED_VALUES_PER_KEY,
    );
  });

  it("passes through any value for an open-ended key", () => {
    const { tags, rejected } = normalizeTagAttributes(laFetchSchema, { Neckline: "Boat Neck" });
    expect(tags).toEqual(["Neckline:Boat Neck"]);
    expect(rejected).toEqual({});
  });

  it("drops keys that are not in the schema", () => {
    const { tags, rejected } = normalizeTagAttributes(laFetchSchema, { Vibe: "Cool" });
    expect(tags).toEqual([]);
    expect(rejected).toEqual({});
  });

  it("records unlisted values so they can be surfaced to the merchant later", () => {
    const { tags, rejected } = normalizeTagAttributes(laFetchSchema, { Color: "Chartreuse" });
    expect(tags).toEqual([]);
    expect(rejected).toEqual({ Color: ["Chartreuse"] });
  });

  it("drops placeholder values without recording them as rejections", () => {
    const { tags, rejected } = normalizeTagAttributes(laFetchSchema, {
      Color: "unknown",
      Fit: "N/A",
      Neckline: "",
    });
    expect(tags).toEqual([]);
    expect(rejected).toEqual({});
  });

  it("strips commas out of open-ended values", () => {
    const { tags } = normalizeTagAttributes(laFetchSchema, { Neckline: "Boat, wide" });
    expect(tags).toEqual(["Neckline:Boat wide"]);
  });

  it("dedupes values that resolve to the same tag", () => {
    const { tags } = normalizeTagAttributes(laFetchSchema, { Fit: ["Regular", "regular fit"] });
    expect(tags).toEqual(["Fit:Regular Fit"]);
  });

  it("returns empty output for null, undefined and non-objects", () => {
    expect(normalizeTagAttributes(laFetchSchema, null).tags).toEqual([]);
    expect(normalizeTagAttributes(laFetchSchema, undefined).tags).toEqual([]);
    expect(normalizeTagAttributes(laFetchSchema, "Color:Black" as never).tags).toEqual([]);
  });

  it("coerces numeric values", () => {
    const schema = readTagSchema({ keys: [{ key: "Sleeve", values: [] }] })!;
    expect(normalizeTagAttributes(schema, { Sleeve: 34 }).tags).toEqual(["Sleeve:34"]);
  });
});

describe("isSchemaOwnedTag", () => {
  it("matches tags whose key is in the schema, case-insensitively", () => {
    expect(isSchemaOwnedTag(laFetchSchema, "Color:Black")).toBe(true);
    expect(isSchemaOwnedTag(laFetchSchema, "color:anything")).toBe(true);
  });

  it("does not match unrelated tags or bare key names", () => {
    expect(isSchemaOwnedTag(laFetchSchema, "SS24")).toBe(false);
    expect(isSchemaOwnedTag(laFetchSchema, "Colorful")).toBe(false);
    expect(isSchemaOwnedTag(laFetchSchema, "Color")).toBe(false);
  });
});

describe("mergeTags", () => {
  it("replaces schema-owned keys and keeps every other merchant tag", () => {
    const result = mergeTags({
      existing: ["Color:Black", "SS24", "clearance"],
      incoming: ["Color:Navy", "Fit:Regular Fit"],
      format: "KEY_VALUE",
      schema: laFetchSchema,
    });
    expect(result).toEqual(["SS24", "clearance", "Color:Navy", "Fit:Regular Fit"]);
  });

  it("keeps a key's existing tag when the AI returned no value for that key", () => {
    // The prompt tells the model to omit keys it cannot assess, so "no answer"
    // must never mean "delete the value the merchant already had".
    const result = mergeTags({
      existing: ["Color:Black", "Fit:Regular Fit", "SS24"],
      incoming: ["Color:Navy"],
      format: "KEY_VALUE",
      schema: laFetchSchema,
    });
    expect(result).toEqual(["Fit:Regular Fit", "SS24", "Color:Navy"]);
  });

  it("changes nothing when the AI returned no tags at all", () => {
    const result = mergeTags({
      existing: ["Color:Black", "SS24"],
      incoming: [],
      format: "KEY_VALUE",
      schema: laFetchSchema,
    });
    expect(result).toEqual(["Color:Black", "SS24"]);
  });

  it("replaces every existing tag for a key the AI did answer", () => {
    // Multi-value keys must not accumulate stale values across runs.
    const result = mergeTags({
      existing: ["Occasion:Dinner", "Occasion:Work", "SS24"],
      incoming: ["Occasion:Work"],
      format: "KEY_VALUE",
      schema: laFetchSchema,
    });
    expect(result).toEqual(["SS24", "Occasion:Work"]);
  });

  it("unions without removing anything in free-form mode", () => {
    const result = mergeTags({
      existing: ["Color:Black", "SS24"],
      incoming: ["Black Blazer"],
      format: "FREEFORM",
    });
    expect(result).toEqual(["Color:Black", "SS24", "Black Blazer"]);
  });

  it("falls back to a union when KEY_VALUE is set but no schema exists", () => {
    const result = mergeTags({
      existing: ["SS24"],
      incoming: ["Black Blazer"],
      format: "KEY_VALUE",
      schema: null,
    });
    expect(result).toEqual(["SS24", "Black Blazer"]);
  });

  it("dedupes case-insensitively", () => {
    const result = mergeTags({
      existing: ["SS24"],
      incoming: ["ss24", "New"],
      format: "FREEFORM",
    });
    expect(result).toEqual(["SS24", "New"]);
  });
});

describe("revertTags", () => {
  it("removes only what we added and restores only what we removed", () => {
    const result = revertTags({
      live: ["SS24", "clearance", "Color:Navy", "merchant-added-later"],
      applied: ["SS24", "clearance", "Color:Navy"],
      snapshot: ["SS24", "clearance", "Color:Black"],
    });
    expect(result).toEqual(["SS24", "clearance", "merchant-added-later", "Color:Black"]);
  });

  it("leaves tags the merchant added after apply untouched", () => {
    const result = revertTags({
      live: ["Color:Navy", "brand-new"],
      applied: ["Color:Navy"],
      snapshot: [],
    });
    expect(result).toEqual(["brand-new"]);
  });

  it("is a no-op when nothing changed", () => {
    const result = revertTags({
      live: ["SS24"],
      applied: ["SS24"],
      snapshot: ["SS24"],
    });
    expect(result).toEqual(["SS24"]);
  });

  it("does not resurrect a tag the merchant deleted after apply", () => {
    const result = revertTags({
      live: ["SS24"],
      applied: ["SS24", "Color:Navy"],
      snapshot: ["SS24", "Color:Black"],
    });
    expect(result).toEqual(["SS24", "Color:Black"]);
  });
});
