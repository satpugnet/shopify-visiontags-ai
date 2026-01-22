import { describe, it, expect } from "vitest";

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
