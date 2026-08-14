import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  prisma: {
    shopSettings: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
  authenticate: {
    admin: vi.fn(),
  },
  fetchProductTagVocabulary: vi.fn(),
}));

vi.mock("../../db.server", () => ({ default: mocks.prisma }));
vi.mock("../../shopify.server", () => ({ authenticate: mocks.authenticate }));
vi.mock("../../services/products.server", () => ({
  fetchProductTagVocabulary: mocks.fetchProductTagVocabulary,
}));

import { action, loader } from "../app.settings";

const mockAdmin = { graphql: vi.fn() };
const mockSession = { shop: "test.myshopify.com" };

function post(fields: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) formData.append(key, value);
  return new Request("https://app.example.com/app/settings", {
    method: "POST",
    body: formData,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authenticate.admin.mockResolvedValue({ admin: mockAdmin, session: mockSession });
  mocks.prisma.shopSettings.upsert.mockResolvedValue({});
});

describe("app.settings loader", () => {
  it("renders the stored schema back into the editor format", async () => {
    mocks.prisma.shopSettings.findUnique.mockResolvedValue({
      tagFormat: "KEY_VALUE",
      tagSchema: { version: 1, keys: [{ key: "Color", values: ["Black", "Navy"] }] },
    });

    const data = await (await loader({ request: post({}) } as never)).json();

    expect(data.tagFormat).toBe("KEY_VALUE");
    expect(data.schemaText).toBe("Color: Black, Navy");
  });

  it("defaults to free-form with an empty editor for a new shop", async () => {
    mocks.prisma.shopSettings.findUnique.mockResolvedValue(null);

    const data = await (await loader({ request: post({}) } as never)).json();

    expect(data.tagFormat).toBe("FREEFORM");
    expect(data.schemaText).toBe("");
  });
});

describe("app.settings action - save", () => {
  it("persists a parsed schema", async () => {
    const response = await action({
      request: post({
        intent: "save",
        tagFormat: "KEY_VALUE",
        schemaText: "Color: Black, Navy\nNeckline",
      }),
    } as never);
    const data = await response.json();

    expect(data.success).toBe(true);
    expect(mocks.prisma.shopSettings.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { shop: "test.myshopify.com" },
        update: {
          tagFormat: "KEY_VALUE",
          tagSchema: {
            version: 1,
            keys: [
              {
                key: "Color",
                values: [
                  { value: "Black", aliases: [] },
                  { value: "Navy", aliases: [] },
                ],
              },
              { key: "Neckline", values: [] },
            ],
          },
        },
      }),
    );
  });

  it("rejects Key:Value mode with no keys rather than silently producing no tags", async () => {
    const response = await action({
      request: post({ intent: "save", tagFormat: "KEY_VALUE", schemaText: "" }),
    } as never);
    const data = await response.json();

    expect(data.success).toBe(false);
    expect(data.errors?.[0]).toContain("at least one key");
    expect(mocks.prisma.shopSettings.upsert).not.toHaveBeenCalled();
  });

  it("returns validation errors without saving", async () => {
    const response = await action({
      request: post({ intent: "save", tagFormat: "KEY_VALUE", schemaText: "Color: Black\ncolor: Navy" }),
    } as never);
    const data = await response.json();

    expect(data.success).toBe(false);
    expect(data.errors?.[0]).toContain("more than once");
    expect(mocks.prisma.shopSettings.upsert).not.toHaveBeenCalled();
  });

  it("clears the schema when switching back to free-form with an empty editor", async () => {
    const response = await action({
      request: post({ intent: "save", tagFormat: "FREEFORM", schemaText: "" }),
    } as never);
    const data = await response.json();

    expect(data.success).toBe(true);
    expect(mocks.prisma.shopSettings.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: { tagFormat: "FREEFORM", tagSchema: Prisma.DbNull },
      }),
    );
  });
});

describe("app.settings action - prefill", () => {
  it("proposes a schema from existing Key:Value tags", async () => {
    mocks.fetchProductTagVocabulary.mockResolvedValue([
      "Color:Black",
      "Color:Navy",
      "Fit:Regular Fit",
      "Fit:Relaxed Fit",
      "SS24",
      "clearance",
    ]);

    const response = await action({ request: post({ intent: "prefill" }) } as never);
    const data = await response.json();

    expect(data.success).toBe(true);
    expect(data.schemaText).toBe("Color: Black, Navy\nFit: Regular Fit, Relaxed Fit");
  });

  it("explains itself when the catalog has no Key:Value tags to learn from", async () => {
    mocks.fetchProductTagVocabulary.mockResolvedValue(["SS24", "clearance"]);

    const response = await action({ request: post({ intent: "prefill" }) } as never);
    const data = await response.json();

    expect(data.success).toBe(false);
    expect(data.error).toContain("no \"Key:Value\" pairs");
  });

  it("surfaces a readable error when Shopify fails", async () => {
    mocks.fetchProductTagVocabulary.mockRejectedValue(new Error("Throttled"));

    const response = await action({ request: post({ intent: "prefill" }) } as never);
    const data = await response.json();

    expect(data.success).toBe(false);
    expect(data.error).toContain("Could not read your existing tags");
  });
});
