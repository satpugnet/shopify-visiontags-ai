/**
 * Tag Schema Service - merchant-defined Key:Value tag vocabularies.
 *
 * Merchants can switch tag output from free-form phrases ("Black Blazer") to
 * structured Key:Value pairs ("Color:Black", "Fit:Regular Fit") driven by a
 * schema they define: a list of keys, each optionally constrained to a list of
 * allowed values.
 *
 * The AI is asked for a `tag_attributes` OBJECT rather than pre-joined strings,
 * so the model never has to produce the separator itself. Everything the model
 * returns is then snapped back onto the merchant's vocabulary here - canonical
 * casing always comes from the schema, never from the model.
 *
 * Zero dependencies (this repo has no validation library and does not need one
 * for a single file).
 *
 * Pure and isomorphic on purpose: the settings page parses and previews a schema
 * in the browser as the merchant types. Database-facing helpers live in
 * tagSchema.server.ts.
 */

export type TagFormat = "FREEFORM" | "KEY_VALUE";

export const TAG_FORMAT_FREEFORM: TagFormat = "FREEFORM";
export const TAG_FORMAT_KEY_VALUE: TagFormat = "KEY_VALUE";

/** One allowed value, plus any spellings that should snap onto it. */
export interface TagValueDef {
  value: string;
  aliases: string[];
}

/** One schema key. An empty `values` list means the key is open-ended. */
export interface TagKeyDef {
  key: string;
  values: TagValueDef[];
}

export interface TagSchema {
  version: 1;
  keys: TagKeyDef[];
}

/** Raw `tag_attributes` as returned by the model, before normalization. */
export type TagAttributes = Record<string, unknown>;

export interface NormalizedTags {
  tags: string[];
  /** Values the model proposed that the schema rejected, keyed by schema key. */
  rejected: Record<string, string[]>;
}

export const TAG_SEPARATOR = ":";

// Schema size caps. These are cost controls, not arbitrary limits: the schema is
// injected into the prompt for every single product, so a 12-key x 40-value
// schema is roughly 1.5-2.5k input tokens per product (20-30M on a 12k catalog)
// while the merchant pays a flat credit per product.
export const MAX_KEYS = 20;
export const MAX_VALUES_PER_KEY = 50;
export const MAX_SCHEMA_BYTES = 4096;
export const MAX_KEY_LENGTH = 60;

/** Shopify's per-tag character limit. */
export const MAX_TAG_LENGTH = 255;

/** Hard cap on values emitted for a single key, so one key cannot flood a product. */
export const MAX_EMITTED_VALUES_PER_KEY = 5;

/**
 * Values that mean "the model had nothing to say". Dropped rather than emitted
 * as a literal tag.
 */
const NULL_VALUES = new Set([
  "",
  "unknown",
  "n/a",
  "na",
  "none",
  "null",
  "undefined",
  "not applicable",
  "not visible",
  "unspecified",
]);

/**
 * Loose comparison form: lowercase, punctuation-stripped, whitespace-collapsed.
 * "Regular-Fit" and "regular fit" both become "regular fit".
 */
function loose(value: string): string {
  return value
    .toLowerCase()
    .replace(/[-/&_.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Commas are a correctness hazard, not a style preference: Product.currentTags is
 * stored as `tags.join(", ")` and split back on ", " during revert, so a comma
 * inside a tag silently corrupts the revert path.
 */
function sanitizeTagText(value: string): string {
  return value.replace(/,/g, " ").replace(/\s+/g, " ").trim();
}

/** Shortest value that may take part in containment matching. */
const MIN_CONTAINMENT_LENGTH = 3;

/** True when `needle` appears in `haystack` on whole-word boundaries. */
function containsWord(haystack: string, needle: string): boolean {
  return ` ${haystack} `.includes(` ${needle} `);
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type ValidationResult =
  | { schema: TagSchema; errors?: undefined }
  | { schema?: undefined; errors: string[] };

function coerceValueDef(raw: unknown): TagValueDef | null {
  if (typeof raw === "string") {
    const value = sanitizeTagText(raw);
    return value ? { value, aliases: [] } : null;
  }
  if (raw && typeof raw === "object") {
    const obj = raw as { value?: unknown; aliases?: unknown };
    if (typeof obj.value !== "string") return null;
    const value = sanitizeTagText(obj.value);
    if (!value) return null;
    const aliases = Array.isArray(obj.aliases)
      ? obj.aliases
          .filter((a): a is string => typeof a === "string")
          .map(sanitizeTagText)
          .filter(Boolean)
      : [];
    return { value, aliases };
  }
  return null;
}

/**
 * Validate and canonicalise a tag schema from any source (settings form, stored
 * JSON blob written by an older version, hand-edited data).
 *
 * Returns either a clean schema or the list of human-readable problems. Never
 * throws.
 */
export function validateTagSchema(raw: unknown): ValidationResult {
  const errors: string[] = [];

  if (raw === null || raw === undefined) {
    return { schema: { version: 1, keys: [] } };
  }
  if (typeof raw !== "object") {
    return { errors: ["Tag schema must be an object."] };
  }

  const rawKeys = (raw as { keys?: unknown }).keys;
  if (!Array.isArray(rawKeys)) {
    return { errors: ["Tag schema must have a `keys` array."] };
  }

  const keys: TagKeyDef[] = [];
  const seen = new Set<string>();

  for (const entry of rawKeys) {
    if (!entry || typeof entry !== "object") {
      errors.push("Each key must be an object with a `key` field.");
      continue;
    }
    const rawKey = (entry as { key?: unknown }).key;
    if (typeof rawKey !== "string") {
      errors.push("Each key must have a string `key` field.");
      continue;
    }

    const key = sanitizeTagText(rawKey);
    if (!key) {
      errors.push("Key names cannot be empty.");
      continue;
    }
    if (key.includes(TAG_SEPARATOR)) {
      errors.push(`Key "${key}" cannot contain a colon.`);
      continue;
    }
    if (key.length > MAX_KEY_LENGTH) {
      errors.push(`Key "${key}" is longer than ${MAX_KEY_LENGTH} characters.`);
      continue;
    }
    const dedupeKey = key.toLowerCase();
    if (seen.has(dedupeKey)) {
      errors.push(`Key "${key}" is defined more than once.`);
      continue;
    }
    seen.add(dedupeKey);

    const rawValues = (entry as { values?: unknown }).values;
    const values: TagValueDef[] = [];
    const seenValues = new Set<string>();

    if (Array.isArray(rawValues)) {
      for (const rawValue of rawValues) {
        const def = coerceValueDef(rawValue);
        if (!def) continue;
        if (key.length + TAG_SEPARATOR.length + def.value.length > MAX_TAG_LENGTH) {
          errors.push(
            `Value "${def.value}" makes the tag "${key}${TAG_SEPARATOR}${def.value}" longer than ${MAX_TAG_LENGTH} characters.`,
          );
          continue;
        }
        const dedupeValue = loose(def.value);
        if (seenValues.has(dedupeValue)) continue;
        seenValues.add(dedupeValue);
        values.push(def);
        if (values.length > MAX_VALUES_PER_KEY) {
          errors.push(
            `Key "${key}" has more than ${MAX_VALUES_PER_KEY} allowed values.`,
          );
          break;
        }
      }
    }

    keys.push({ key, values: values.slice(0, MAX_VALUES_PER_KEY) });
    if (keys.length > MAX_KEYS) {
      errors.push(`A tag schema can define at most ${MAX_KEYS} keys.`);
      break;
    }
  }

  if (errors.length > 0) {
    return { errors };
  }

  const schema: TagSchema = { version: 1, keys: keys.slice(0, MAX_KEYS) };

  const size = JSON.stringify(schema).length;
  if (size > MAX_SCHEMA_BYTES) {
    return {
      errors: [
        `Tag schema is too large (${size} characters, limit ${MAX_SCHEMA_BYTES}). Remove some values.`,
      ],
    };
  }

  return { schema };
}

/** True when the schema defines at least one key, i.e. it can drive tag output. */
export function isUsableTagSchema(schema: TagSchema | null | undefined): schema is TagSchema {
  return !!schema && Array.isArray(schema.keys) && schema.keys.length > 0;
}


// ---------------------------------------------------------------------------
// Text form (the settings page editor)
// ---------------------------------------------------------------------------

/**
 * Parse the bulk editor format: one key per line, optional comma-separated
 * allowed values after a colon.
 *
 *   Color: Black, Navy, Ecru
 *   Fit: Regular Fit, Relaxed Fit
 *   Neckline
 *
 * A key with no values is open-ended: the AI fills it freely.
 */
export function parseTagSchemaText(text: string): ValidationResult {
  const keys: Array<{ key: string; values: string[] }> = [];

  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf(TAG_SEPARATOR);
    const key = separatorIndex === -1 ? trimmed : trimmed.slice(0, separatorIndex);
    const valuePart = separatorIndex === -1 ? "" : trimmed.slice(separatorIndex + 1);

    const values = valuePart
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);

    keys.push({ key: key.trim(), values });
  }

  return validateTagSchema({ version: 1, keys });
}

/** Render a schema back into the bulk editor format. */
export function formatTagSchemaText(schema: TagSchema | null | undefined): string {
  if (!isUsableTagSchema(schema)) return "";
  return schema.keys
    .map((k) =>
      k.values.length > 0
        ? `${k.key}${TAG_SEPARATOR} ${k.values.map((v) => v.value).join(", ")}`
        : k.key,
    )
    .join("\n");
}

/**
 * Infer a starting schema from a shop's existing tag vocabulary.
 *
 * Merchants who already use a Key:Value convention should not have to retype it.
 * Only tags containing a separator contribute, split on the FIRST colon so a
 * value may itself contain one.
 */
export function suggestTagSchemaFromTags(tags: string[]): TagSchema {
  const byKey = new Map<string, { key: string; values: Map<string, string> }>();

  for (const tag of tags) {
    const separatorIndex = tag.indexOf(TAG_SEPARATOR);
    if (separatorIndex <= 0) continue;

    const key = sanitizeTagText(tag.slice(0, separatorIndex));
    const value = sanitizeTagText(tag.slice(separatorIndex + 1));
    if (!key || !value || key.length > MAX_KEY_LENGTH) continue;

    const looseKey = loose(key);
    const entry = byKey.get(looseKey) ?? { key, values: new Map<string, string>() };
    if (!entry.values.has(loose(value))) {
      entry.values.set(loose(value), value);
    }
    byKey.set(looseKey, entry);
  }

  // A key seen exactly once whose name contains a space is almost certainly a
  // sentence that happens to contain a colon ("Summer 2026: Drop 3"), not a key.
  const candidates = [...byKey.values()]
    .filter((entry) => !(entry.values.size === 1 && entry.key.includes(" ")))
    .sort((a, b) => b.values.size - a.values.size)
    .slice(0, MAX_KEYS)
    .map((entry) => ({
      key: entry.key,
      values: [...entry.values.values()]
        .slice(0, MAX_VALUES_PER_KEY)
        .map((value) => ({ value, aliases: [] })),
    }));

  // Keep the suggestion within the size budget, richest keys first. Suggesting a
  // schema that then fails to save with "too large" and no indication of what to
  // cut would be worse than suggesting a smaller one.
  const keys: TagKeyDef[] = [];
  for (const candidate of candidates) {
    const next = [...keys, candidate];
    if (JSON.stringify({ version: 1, keys: next }).length > MAX_SCHEMA_BYTES) break;
    keys.push(candidate);
  }

  return { version: 1, keys };
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

/**
 * Render the schema into the block that replaces the free-form tag instructions
 * in the vision prompt.
 *
 * The verbatim-copy rule is load-bearing: the surrounding prompt tells the model
 * to write ALL output in the merchant's language, which would otherwise turn
 * "Color" into "Couleur" for a French store and cause every attribute to be
 * rejected during normalization.
 */
export function buildTagPromptFragment(schema: TagSchema): string {
  const lines = schema.keys.map((k) => {
    if (k.values.length === 0) {
      return `- "${k.key}": any short value you can read from the image`;
    }
    return `- "${k.key}": one of ${k.values.map((v) => `"${v.value}"`).join(" | ")}`;
  });

  return `TAG ATTRIBUTES:
Return "tag_attributes" as an object using ONLY these keys:

${lines.join("\n")}

- Include a key only when the image supports a confident answer. Omit the rest.
- Use a single string per key, or an array of strings when several clearly apply.
- Copy keys and listed values EXACTLY as written above, character for character.
- Never translate or rephrase a key or a listed value, in any language. These are the merchant's own vocabulary, not text to localise.
- Never invent a new value for a key that lists allowed values. If none of them fit, omit the key.`;
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

interface ResolvedKey {
  def: TagKeyDef;
  looseToCanonical: Map<string, string>;
}

function indexKey(def: TagKeyDef): ResolvedKey {
  const looseToCanonical = new Map<string, string>();
  for (const value of def.values) {
    looseToCanonical.set(loose(value.value), value.value);
    for (const alias of value.aliases) {
      const key = loose(alias);
      if (!looseToCanonical.has(key)) looseToCanonical.set(key, value.value);
    }
  }
  return { def, looseToCanonical };
}

/**
 * Resolve one model-proposed value against a key's allowed vocabulary.
 *
 * Falls through exact match, loose match, then unambiguous containment. The
 * containment step matters more than it looks: a merchant lists "Regular Fit"
 * and the model answers "Regular". Strict matching alone would silently drop
 * that across an entire catalog with no diagnostic.
 */
function resolveValue(resolved: ResolvedKey, candidate: string): string | null {
  if (resolved.def.values.length === 0) {
    return candidate;
  }

  const exact = resolved.def.values.find((v) => v.value === candidate);
  if (exact) return exact.value;

  const looseCandidate = loose(candidate);
  const direct = resolved.looseToCanonical.get(looseCandidate);
  if (direct) return direct;

  // Containment is a deliberate last resort and is whole-word only. Plain
  // substring matching silently mis-resolves short values: with sizes
  // XS/S/M/L/XL, "Extra Large" contains "l" and nothing else, so it would
  // resolve to L. Requiring word boundaries and a minimum length keeps
  // "Regular" -> "Regular Fit" working without inventing matches like that.
  if (looseCandidate.length < MIN_CONTAINMENT_LENGTH) return null;

  const contained = [...resolved.looseToCanonical.entries()].filter(
    ([allowed]) =>
      allowed.length >= MIN_CONTAINMENT_LENGTH &&
      (containsWord(allowed, looseCandidate) || containsWord(looseCandidate, allowed)),
  );
  const unique = new Set(contained.map(([, canonical]) => canonical));
  if (unique.size === 1) {
    return [...unique][0];
  }

  return null;
}

function toCandidateList(raw: unknown): string[] {
  if (typeof raw === "string") return [raw];
  if (typeof raw === "number" || typeof raw === "boolean") return [String(raw)];
  if (Array.isArray(raw)) {
    return raw.flatMap((item) =>
      typeof item === "string" || typeof item === "number" || typeof item === "boolean"
        ? [String(item)]
        : [],
    );
  }
  return [];
}

/**
 * Turn the model's `tag_attributes` object into a flat `Key:Value` tag list,
 * constrained to the merchant's schema.
 *
 * Anything dropped is recorded in `rejected` so the merchant can later be shown
 * "the AI proposed 340 values you don't allow" without re-running the analysis.
 */
export function normalizeTagAttributes(
  schema: TagSchema,
  raw: TagAttributes | null | undefined,
): NormalizedTags {
  const tags: string[] = [];
  const rejected: Record<string, string[]> = {};
  const emitted = new Set<string>();

  if (!raw || typeof raw !== "object") {
    return { tags, rejected };
  }

  const byLooseKey = new Map<string, ResolvedKey>();
  for (const def of schema.keys) {
    byLooseKey.set(loose(def.key), indexKey(def));
  }

  for (const [rawKey, rawValue] of Object.entries(raw)) {
    const resolved = byLooseKey.get(loose(rawKey));
    if (!resolved) continue;

    let emittedForKey = 0;

    for (const rawCandidate of toCandidateList(rawValue)) {
      if (emittedForKey >= MAX_EMITTED_VALUES_PER_KEY) break;

      const candidate = sanitizeTagText(rawCandidate);
      if (!candidate || NULL_VALUES.has(candidate.toLowerCase())) continue;

      const value = resolveValue(resolved, candidate);
      if (!value) {
        (rejected[resolved.def.key] ||= []).push(candidate);
        continue;
      }

      const tag = `${resolved.def.key}${TAG_SEPARATOR}${value}`;
      if (tag.length > MAX_TAG_LENGTH) {
        (rejected[resolved.def.key] ||= []).push(candidate);
        continue;
      }

      const dedupeKey = tag.toLowerCase();
      if (emitted.has(dedupeKey)) continue;
      emitted.add(dedupeKey);
      tags.push(tag);
      emittedForKey++;
    }
  }

  return { tags, rejected };
}

// ---------------------------------------------------------------------------
// Merge / revert
// ---------------------------------------------------------------------------

function dedupePreservingOrder(tags: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const tag of tags) {
    const key = tag.toLowerCase();
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    result.push(tag);
  }
  return result;
}

/** True when `tag` is a `Key:Value` pair whose key belongs to the schema. */
export function isSchemaOwnedTag(schema: TagSchema, tag: string): boolean {
  const lower = tag.toLowerCase();
  return schema.keys.some((k) => lower.startsWith(`${k.key.toLowerCase()}${TAG_SEPARATOR}`));
}

/**
 * Merge AI tags into a product's live tag list without destroying tags we do not
 * own.
 *
 * KEY_VALUE: a key's existing tags are replaced only when the AI actually
 * returned a value for that key. The prompt tells the model to omit keys it
 * cannot assess from the image, so treating "no answer" as "delete what's
 * there" would routinely destroy attributes the merchant had already filled in.
 * FREEFORM: union, so nothing is ever removed.
 */
export function mergeTags(options: {
  existing: string[];
  incoming: string[];
  format: TagFormat;
  schema?: TagSchema | null;
}): string[] {
  const { existing, incoming, format, schema } = options;

  if (format === TAG_FORMAT_KEY_VALUE && isUsableTagSchema(schema)) {
    // Only the keys present in `incoming` are being rewritten.
    const replacedPrefixes = schema.keys
      .map((k) => `${k.key.toLowerCase()}${TAG_SEPARATOR}`)
      .filter((prefix) => incoming.some((tag) => tag.toLowerCase().startsWith(prefix)));

    const kept = existing.filter(
      (tag) => !replacedPrefixes.some((prefix) => tag.toLowerCase().startsWith(prefix)),
    );
    return dedupePreservingOrder([...kept, ...incoming]);
  }

  return dedupePreservingOrder([...existing, ...incoming]);
}

/**
 * Undo exactly the delta a previous apply introduced, leaving anything the
 * merchant changed in the meantime alone.
 *
 * `applied` is the exact list we last wrote; `snapshot` is the product's tags
 * before we wrote it. A full replace back to `snapshot` would wipe every tag the
 * merchant added between apply and revert.
 */
export function revertTags(options: {
  live: string[];
  applied: string[];
  snapshot: string[];
}): string[] {
  const { live, applied, snapshot } = options;

  const snapshotKeys = new Set(snapshot.map((t) => t.toLowerCase()));
  const appliedKeys = new Set(applied.map((t) => t.toLowerCase()));

  const addedByUs = new Set(
    applied.filter((tag) => !snapshotKeys.has(tag.toLowerCase())).map((t) => t.toLowerCase()),
  );
  const removedByUs = snapshot.filter((tag) => !appliedKeys.has(tag.toLowerCase()));

  const kept = live.filter((tag) => !addedByUs.has(tag.toLowerCase()));
  return dedupePreservingOrder([...kept, ...removedByUs]);
}
