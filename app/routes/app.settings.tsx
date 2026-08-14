import { useEffect, useMemo, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher, useNavigate } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Button,
  Box,
  Banner,
  Tag,
  TextField,
  ChoiceList,
  List,
} from "@shopify/polaris";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { logger } from "../services/logger.server";
import {
  parseTagSchemaText,
  formatTagSchemaText,
  suggestTagSchemaFromTags,
  MAX_KEYS,
  MAX_VALUES_PER_KEY,
  type TagSchema,
} from "../services/tagSchema";
// Server-only: used by the loader and action, stripped from the client bundle.
import { readTagSchema, writeTagSchema } from "../services/tagSchema.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const settings = await prisma.shopSettings.findUnique({
    where: { shop },
    select: { tagFormat: true, tagSchema: true },
  });

  return json({
    tagFormat: settings?.tagFormat === "KEY_VALUE" ? "KEY_VALUE" : "FREEFORM",
    schemaText: formatTagSchemaText(readTagSchema(settings?.tagSchema)),
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const intent = formData.get("intent");

  // Read the shop's existing tags and propose a schema from any Key:Value pairs
  // already in use, so a merchant with a convention does not retype it.
  if (intent === "prefill") {
    try {
      const { fetchProductTagVocabulary } = await import("../services/products.server");
      const tags = await fetchProductTagVocabulary(admin);
      const suggested = suggestTagSchemaFromTags(tags);

      logger.info("TAG_SCHEMA_PREFILL", {
        shop,
        tagsScanned: tags.length,
        keysFound: suggested.keys.length,
      });

      if (suggested.keys.length === 0) {
        return json({
          success: false,
          error: `Scanned ${tags.length} existing tags but found no "Key:Value" pairs to learn from. Add your keys below instead.`,
        });
      }

      return json({
        success: true,
        schemaText: formatTagSchemaText(suggested),
        message: `Found ${suggested.keys.length} ${suggested.keys.length === 1 ? "key" : "keys"} in ${tags.length} existing tags. Review before saving.`,
      });
    } catch (error) {
      logger.error("TAG_SCHEMA_PREFILL_FAILED", {
        shop,
        error: error instanceof Error ? error.message : String(error),
      });
      return json({ success: false, error: "Could not read your existing tags. Try again." });
    }
  }

  if (intent === "save") {
    const tagFormat = formData.get("tagFormat") === "KEY_VALUE" ? "KEY_VALUE" : "FREEFORM";
    const schemaText = (formData.get("schemaText") as string) ?? "";

    const parsed = parseTagSchemaText(schemaText);
    if (parsed.errors) {
      return json({ success: false, errors: parsed.errors });
    }

    const schema: TagSchema | null = parsed.schema.keys.length > 0 ? parsed.schema : null;

    if (tagFormat === "KEY_VALUE" && !schema) {
      return json({
        success: false,
        errors: ["Add at least one key before switching to Key:Value tags."],
      });
    }

    await prisma.shopSettings.upsert({
      where: { shop },
      update: { tagFormat, tagSchema: writeTagSchema(schema) },
      create: { shop, tagFormat, tagSchema: writeTagSchema(schema) },
    });

    logger.info("TAG_SETTINGS_SAVED", { shop, tagFormat, keyCount: schema?.keys.length ?? 0 });

    return json({ success: true, message: "Tag settings saved" });
  }

  return json({ success: false });
};

type ActionData = {
  success: boolean;
  message?: string;
  error?: string;
  errors?: string[];
  schemaText?: string;
};

export default function Settings() {
  const { tagFormat: savedFormat, schemaText: savedSchemaText } =
    useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const shopify = useAppBridge();
  const fetcher = useFetcher<ActionData>();

  const [tagFormat, setTagFormat] = useState(savedFormat);
  const [schemaText, setSchemaText] = useState(savedSchemaText);

  const isBusy = fetcher.state !== "idle";

  useEffect(() => {
    const data = fetcher.data;
    if (!data) return;
    if (data.schemaText !== undefined) {
      setSchemaText(data.schemaText);
      setTagFormat("KEY_VALUE");
    }
    if (data.message) shopify.toast.show(data.message);
    if (data.error) shopify.toast.show(data.error, { isError: true });
  }, [fetcher.data, shopify]);

  // Parse on every keystroke so the merchant sees exactly what the AI will be
  // given, rather than finding out at save time.
  const preview = useMemo(() => parseTagSchemaText(schemaText), [schemaText]);
  const previewKeys = preview.schema?.keys ?? [];

  const save = () => {
    fetcher.submit({ intent: "save", tagFormat, schemaText }, { method: "POST" });
  };

  const prefill = () => {
    fetcher.submit({ intent: "prefill" }, { method: "POST" });
  };

  const serverErrors = fetcher.data?.errors ?? [];

  return (
    <Page
      backAction={{ content: "Dashboard", onAction: () => navigate("/app") }}
      title="Settings"
    >
      <TitleBar title="Settings" />
      <Box paddingBlockEnd="800">
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="500">
                <BlockStack gap="200">
                  <Text as="h2" variant="headingMd">
                    Tag format
                  </Text>
                  <Text as="p" tone="subdued">
                    Choose how the AI writes tags. This applies to new scans; tags already
                    applied to products are not changed.
                  </Text>
                </BlockStack>

                <ChoiceList
                  title="Tag format"
                  titleHidden
                  choices={[
                    {
                      label: "Descriptive phrases",
                      value: "FREEFORM",
                      helpText:
                        'Free-form tags such as "Black Blazer" or "Modern Tailoring". Good for discovery and search.',
                    },
                    {
                      label: "Key:Value pairs",
                      value: "KEY_VALUE",
                      helpText:
                        'Structured tags such as "Color:Black" or "Fit:Regular Fit", built from the keys you define below. Good for storefront filtering.',
                    },
                  ]}
                  selected={[tagFormat]}
                  onChange={(value) => setTagFormat(value[0] as "FREEFORM" | "KEY_VALUE")}
                />
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section>
            <Card>
              <BlockStack gap="500">
                <BlockStack gap="200">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text as="h2" variant="headingMd">
                      Your tag keys
                    </Text>
                    <Button onClick={prefill} loading={isBusy} variant="tertiary">
                      Prefill from my catalog
                    </Button>
                  </InlineStack>
                  <Text as="p" tone="subdued">
                    One key per line. Add a colon and a comma-separated list to restrict a key
                    to your own vocabulary, and the AI will pick from that list instead of
                    inventing its own wording. Leave the list off and the AI fills the key
                    freely. Up to {MAX_KEYS} keys, {MAX_VALUES_PER_KEY} values each.
                  </Text>
                </BlockStack>

                <TextField
                  label="Tag keys"
                  labelHidden
                  value={schemaText}
                  onChange={setSchemaText}
                  multiline={8}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={"Color: Black, Navy, Ecru\nFit: Regular Fit, Relaxed Fit\nOccasion: Dinner, Work, Weekend\nNeckline"}
                  error={preview.errors?.[0]}
                />

                {serverErrors.length > 0 && (
                  <Banner tone="critical" title="Fix these before saving">
                    <List>
                      {serverErrors.map((error, i) => (
                        <List.Item key={i}>{error}</List.Item>
                      ))}
                    </List>
                  </Banner>
                )}

                {previewKeys.length > 0 && (
                  <BlockStack gap="300">
                    <Text as="h3" variant="headingSm">
                      Preview
                    </Text>
                    {previewKeys.map((key) => (
                      <BlockStack gap="150" key={key.key}>
                        <Text as="p" variant="bodySm" fontWeight="semibold">
                          {key.key}
                          {key.values.length === 0 && (
                            <Text as="span" tone="subdued" fontWeight="regular">
                              {"  "}(AI decides the value)
                            </Text>
                          )}
                        </Text>
                        {key.values.length > 0 && (
                          <InlineStack gap="100" wrap>
                            {key.values.map((value) => (
                              <Tag key={value.value}>{`${key.key}:${value.value}`}</Tag>
                            ))}
                          </InlineStack>
                        )}
                      </BlockStack>
                    ))}
                  </BlockStack>
                )}

                <InlineStack gap="300">
                  <Button variant="primary" onClick={save} loading={isBusy}>
                    Save
                  </Button>
                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section>
            <Banner tone="info" title="How tags are written">
              <Text as="p">
                Applying a scan never removes tags VisionTags does not own. In Key:Value mode
                a tag is replaced only when its key is one of yours, so{" "}
                <Text as="span" fontWeight="semibold">
                  Color:Black
                </Text>{" "}
                becomes{" "}
                <Text as="span" fontWeight="semibold">
                  Color:Navy
                </Text>{" "}
                while your seasonal and merchandising tags stay untouched.
              </Text>
            </Banner>
          </Layout.Section>
        </Layout>
      </Box>
    </Page>
  );
}
