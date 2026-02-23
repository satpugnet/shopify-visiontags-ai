import { useEffect, useState, useCallback } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher, useNavigate, useRevalidator } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Badge,
  Button,
  ProgressBar,
  IndexTable,
  Thumbnail,
  useIndexResourceState,
  Checkbox,
  Collapsible,
  Box,
  Tag,
  Divider,
  Banner,
  TextField,
  List,
} from "@shopify/polaris";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { logger } from "../services/logger.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const { id } = params;

  if (!id) {
    throw new Response("Job ID required", { status: 400 });
  }

  const job = await prisma.job.findUnique({
    where: { id },
    include: {
      products: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!job) {
    throw new Response("Job not found", { status: 404 });
  }

  const analyzedCount = job.products.filter((p) => p.status === "ANALYZED").length;
  const syncedCount = job.products.filter((p) => p.status === "SYNCED").length;
  logger.info("JOB_DETAIL_VIEWED", {
    shop,
    jobId: id,
    jobStatus: job.status,
    totalItems: job.totalItems,
    analyzed: analyzedCount,
    synced: syncedCount,
  });

  return json({
    job: {
      id: job.id,
      status: job.status,
      totalItems: job.totalItems,
      processed: job.processed,
      createdAt: job.createdAt.toISOString(),
    },
    products: job.products.map((p) => ({
      id: p.id,
      title: p.title,
      imageUrl: p.imageUrl,
      status: p.status,
      currentCategory: p.currentCategory,
      currentTags: p.currentTags,
      suggestedMetafields: p.suggestedMetafields as Record<string, string> | null,
      suggestedTags: p.suggestedTags as string[] | null,
      suggestedDescription: p.suggestedDescription,
      suggestedSeoTitle: p.suggestedSeoTitle,
      suggestedMetaDescription: p.suggestedMetaDescription,
      syncedAt: p.syncedAt?.toISOString() || null,
      error: p.error,
    })),
  });
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const { id } = params;
  const formData = await request.formData();
  const action = formData.get("action");

  if (action === "sync") {
    const productIds = formData.getAll("productIds") as string[];
    const syncMetafields = formData.get("syncMetafields") === "true";
    const syncTags = formData.get("syncTags") === "true";
    const syncAltText = formData.get("syncAltText") === "true";
    const syncDescription = formData.get("syncDescription") === "true";
    const editsJson = formData.get("edits") as string;
    let edits: Record<string, unknown> = {};
    if (editsJson) {
      try {
        edits = JSON.parse(editsJson);
      } catch {
        return json({ error: "Invalid edits data", success: false });
      }
    }

    if (productIds.length === 0) {
      return json({ error: "No products selected", success: false });
    }

    // Import services
    const { updateProductMetafields } = await import(
      "../services/metafields.server"
    );
    const { updateProductTags, updateProductImageAlt, updateProductDescriptionAndSeo } = await import("../services/products.server");

    let synced = 0;
    let errors = 0;
    const errorMessages: string[] = [];

    for (const productId of productIds) {
      const product = await prisma.product.findUnique({
        where: { id: productId },
      });

      if (!product || product.status !== "ANALYZED") {
        logger.warn("SYNC_PRODUCT_SKIPPED", { shop, productId, reason: !product ? "not_found" : "not_analyzed", status: product?.status });
        continue;
      }

      const originalMetafields = product.suggestedMetafields as Record<
        string,
        string
      > | null;
      const originalTags = product.suggestedTags as string[] | null;

      // Merge edits with original suggestions
      const productEdits = edits[productId];
      const suggestedMetafields = productEdits?.metafields
        ? { ...originalMetafields, ...productEdits.metafields }
        : originalMetafields;
      const suggestedTags = productEdits?.tags ?? originalTags;
      const altText = productEdits?.alt_text ?? originalMetafields?.alt_text;

      let metaSuccess = true;
      let tagSuccess = true;
      let altTextSuccess = true;
      let descSuccess = true;
      let metaError: string | undefined;
      let tagError: string | undefined;
      let altTextError: string | undefined;
      let descError: string | undefined;

      // Sync metafields (exclude alt_text from metafields sync)
      if (syncMetafields && suggestedMetafields) {
        const { alt_text: _, ...metafieldsWithoutAlt } = suggestedMetafields;
        logger.info("SYNC_METAFIELDS_START", { shop, productId, title: product.title });
        const result = await updateProductMetafields(
          admin,
          productId,
          metafieldsWithoutAlt,
          product.currentCategory
        );
        metaSuccess = result.success;
        metaError = result.error;
        if (!metaSuccess) {
          logger.error("SYNC_METAFIELDS_FAILED", { shop, productId, title: product.title, error: metaError });
        }
      }

      // Sync tags
      if (syncTags && suggestedTags) {
        logger.info("SYNC_TAGS_START", { shop, productId, title: product.title });
        const result = await updateProductTags(admin, productId, suggestedTags);
        tagSuccess = result.success;
        tagError = result.error;
        if (!tagSuccess) {
          logger.error("SYNC_TAGS_FAILED", { shop, productId, title: product.title, error: tagError });
        }
      }

      // Sync alt text (use edited alt text if available)
      if (syncAltText && altText) {
        logger.info("SYNC_ALT_TEXT_START", { shop, productId, title: product.title });
        const result = await updateProductImageAlt(
          admin,
          productId,
          altText
        );
        altTextSuccess = result.success;
        altTextError = result.error;
        if (!altTextSuccess) {
          logger.error("SYNC_ALT_TEXT_FAILED", { shop, productId, title: product.title, error: altTextError });
        }
      }

      // Sync description & SEO
      if (syncDescription) {
        const description = productEdits?.description ?? product.suggestedDescription;
        const seoTitle = productEdits?.seo_title ?? product.suggestedSeoTitle;
        const metaDescription = productEdits?.meta_description ?? product.suggestedMetaDescription;

        if (description || seoTitle || metaDescription) {
          logger.info("SYNC_DESCRIPTION_SEO_START", { shop, productId, title: product.title });
          const result = await updateProductDescriptionAndSeo(
            admin,
            productId,
            description,
            seoTitle,
            metaDescription
          );
          descSuccess = result.success;
          descError = result.error;
          if (!descSuccess) {
            logger.error("SYNC_DESCRIPTION_SEO_FAILED", { shop, productId, title: product.title, error: descError });
          }
        }
      }

      if (metaSuccess && tagSuccess && altTextSuccess && descSuccess) {
        await prisma.product.update({
          where: { id: productId },
          data: {
            status: "SYNCED",
            syncedAt: new Date(),
          },
        });
        synced++;
      } else {
        errors++;
        const errMsg = [metaError, tagError, altTextError, descError].filter(Boolean).join("; ");
        errorMessages.push(`${product.title}: ${errMsg}`);
        // Store error in database
        await prisma.product.update({
          where: { id: productId },
          data: {
            error: errMsg,
          },
        });
      }
    }

    const message = errors > 0 && errorMessages.length > 0
      ? `Synced ${synced} products, ${errors} failed: ${errorMessages[0]}`
      : `Synced ${synced} products${errors > 0 ? `, ${errors} failed` : ""}`;

    logger.info("SYNC_COMPLETE", { shop, jobId: id, synced, errors, errorCount: errorMessages.length });

    return json({
      success: true,
      synced,
      errors,
      message,
      errorDetails: errorMessages,
    });
  }

  return json({ success: false });
};

type ActionData = {
  success: boolean;
  message?: string;
  error?: string;
};

export default function JobDetail() {
  const { job, products } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<ActionData>();
  const navigate = useNavigate();
  const shopify = useAppBridge();
  const revalidator = useRevalidator();

  const [syncMetafields, setSyncMetafields] = useState(true);
  const [syncTags, setSyncTags] = useState(true);
  const [syncAltText, setSyncAltText] = useState(true);
  const [syncDescription, setSyncDescription] = useState(true);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [newTagInputs, setNewTagInputs] = useState<Record<string, string>>({});

  // Track edits per product
  const [edits, setEdits] = useState<Record<string, {
    metafields?: Record<string, string>;
    tags?: string[];
    alt_text?: string;
    description?: string;
    seo_title?: string;
    meta_description?: string;
  }>>({});

  // Helper to get current metafield value (edited or original)
  const getMetafieldValue = (productId: string, key: string, original: string | undefined) => {
    return edits[productId]?.metafields?.[key] ?? original ?? "";
  };

  // Helper to get current tags (edited or original)
  const getTags = (productId: string, original: string[] | null): string[] => {
    return edits[productId]?.tags ?? original ?? [];
  };

  // Helper to get alt text (edited or original)
  const getAltText = (productId: string, original: string | undefined): string => {
    return edits[productId]?.alt_text ?? original ?? "";
  };

  // Helper to get description (edited or original)
  const getDescription = (productId: string, original: string | null | undefined): string => {
    return edits[productId]?.description ?? original ?? "";
  };

  // Helper to get SEO title (edited or original)
  const getSeoTitle = (productId: string, original: string | null | undefined): string => {
    return edits[productId]?.seo_title ?? original ?? "";
  };

  // Helper to get meta description (edited or original)
  const getMetaDescription = (productId: string, original: string | null | undefined): string => {
    return edits[productId]?.meta_description ?? original ?? "";
  };

  // Update a metafield edit
  const updateMetafieldEdit = (productId: string, key: string, value: string) => {
    setEdits(prev => ({
      ...prev,
      [productId]: {
        ...prev[productId],
        metafields: {
          ...prev[productId]?.metafields,
          [key]: value,
        },
      },
    }));
  };

  // Update alt text edit
  const updateAltTextEdit = (productId: string, value: string) => {
    setEdits(prev => ({
      ...prev,
      [productId]: {
        ...prev[productId],
        alt_text: value,
      },
    }));
  };

  // Update description edit
  const updateDescriptionEdit = (productId: string, value: string) => {
    setEdits(prev => ({
      ...prev,
      [productId]: {
        ...prev[productId],
        description: value,
      },
    }));
  };

  // Update SEO title edit
  const updateSeoTitleEdit = (productId: string, value: string) => {
    setEdits(prev => ({
      ...prev,
      [productId]: {
        ...prev[productId],
        seo_title: value,
      },
    }));
  };

  // Update meta description edit
  const updateMetaDescriptionEdit = (productId: string, value: string) => {
    setEdits(prev => ({
      ...prev,
      [productId]: {
        ...prev[productId],
        meta_description: value,
      },
    }));
  };

  // Add a tag
  const addTag = (productId: string, product: typeof products[0]) => {
    const newTag = newTagInputs[productId]?.trim();
    if (!newTag) return;

    const currentTags = getTags(productId, product.suggestedTags);
    if (currentTags.includes(newTag)) return;

    setEdits(prev => ({
      ...prev,
      [productId]: {
        ...prev[productId],
        tags: [...currentTags, newTag],
      },
    }));
    setNewTagInputs(prev => ({ ...prev, [productId]: "" }));
  };

  // Remove a tag
  const removeTag = (productId: string, tagIndex: number, product: typeof products[0]) => {
    const currentTags = getTags(productId, product.suggestedTags);
    const newTags = currentTags.filter((_, idx) => idx !== tagIndex);
    setEdits(prev => ({
      ...prev,
      [productId]: {
        ...prev[productId],
        tags: newTags,
      },
    }));
  };

  const analyzedProducts = products.filter((p) => p.status === "ANALYZED");
  const resourceName = { singular: "product", plural: "products" };

  const { selectedResources, allResourcesSelected, handleSelectionChange } =
    useIndexResourceState(analyzedProducts as { id: string }[]);

  const isSyncing = fetcher.state === "submitting";
  const isProcessing = job.status === "QUEUED" || job.status === "PROCESSING";

  // Auto-refresh while job is processing
  useEffect(() => {
    if (!isProcessing) return;

    const interval = setInterval(() => {
      if (revalidator.state === "idle") {
        revalidator.revalidate();
      }
    }, 3000); // Refresh every 3 seconds

    return () => clearInterval(interval);
  }, [isProcessing, revalidator]);

  useEffect(() => {
    if (fetcher.data?.success && fetcher.data?.message) {
      shopify.toast.show(fetcher.data.message);
    } else if (fetcher.data?.error) {
      shopify.toast.show(fetcher.data.error, { isError: true });
    }
  }, [fetcher.data, shopify]);

  const handleSync = () => {
    const formData = new FormData();
    formData.append("action", "sync");
    formData.append("syncMetafields", String(syncMetafields));
    formData.append("syncTags", String(syncTags));
    formData.append("syncAltText", String(syncAltText));
    formData.append("syncDescription", String(syncDescription));
    formData.append("edits", JSON.stringify(edits));
    selectedResources.forEach((id) => formData.append("productIds", id));
    fetcher.submit(formData, { method: "POST" });
  };

  const toggleRow = useCallback((id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const progress = Math.round((job.processed / job.totalItems) * 100);

  const rowMarkup = products.map((product, index) => {
    const isExpanded = expandedRows.has(product.id);
    const isAnalyzed = product.status === "ANALYZED";

    return (
      <IndexTable.Row
        id={product.id}
        key={product.id}
        position={index}
        selected={selectedResources.includes(product.id)}
        disabled={!isAnalyzed}
      >
        <IndexTable.Cell>
          <Thumbnail
            source={product.imageUrl}
            alt={product.title}
            size="small"
          />
        </IndexTable.Cell>
        <IndexTable.Cell>
          <BlockStack gap="100">
            <Text variant="bodyMd" fontWeight="semibold" as="span">
              {product.title}
            </Text>
            {product.currentCategory && (
              <Text variant="bodySm" tone="subdued" as="span">
                {product.currentCategory}
              </Text>
            )}
          </BlockStack>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Badge
            tone={
              product.status === "SYNCED"
                ? "success"
                : product.status === "ANALYZED"
                  ? "attention"
                  : product.status === "ERROR"
                    ? "critical"
                    : "info"
            }
          >
            {product.status}
          </Badge>
        </IndexTable.Cell>
        <IndexTable.Cell>
          {isAnalyzed && (
            <Button
              variant="plain"
              onClick={() => toggleRow(product.id)}
              ariaExpanded={isExpanded}
            >
              {isExpanded ? "Hide details" : "Show details"}
            </Button>
          )}
          {product.error && (
            <Text as="span" tone="critical" variant="bodySm">
              {product.error}
            </Text>
          )}
        </IndexTable.Cell>
      </IndexTable.Row>
    );
  });

  return (
    <Page
      backAction={{ content: "Dashboard", onAction: () => navigate("/app") }}
      title={`Job ${job.id.slice(0, 8)}...`}
      subtitle={`Created ${new Date(job.createdAt).toLocaleString()}`}
    >
      <TitleBar title="Job Details" />

      <Box paddingBlockEnd="800">
        <BlockStack gap="500">
          {/* Job Status Card */}
        <Card>
          <BlockStack gap="400">
            <InlineStack align="space-between">
              <Text as="h2" variant="headingMd">
                Job Status
              </Text>
              <Badge
                tone={
                  job.status === "COMPLETED"
                    ? "success"
                    : job.status === "FAILED"
                      ? "critical"
                      : job.status === "PROCESSING"
                        ? "attention"
                        : "info"
                }
              >
                {job.status}
              </Badge>
            </InlineStack>

            <BlockStack gap="200">
              <InlineStack align="space-between">
                <Text as="span" variant="bodyMd">
                  Progress
                </Text>
                <Text as="span" variant="bodyMd">
                  {job.processed} / {job.totalItems} products
                </Text>
              </InlineStack>
              <ProgressBar progress={progress} size="small" />
            </BlockStack>
          </BlockStack>
        </Card>

        {/* Error Summary */}
        {products.filter((p) => p.status === "ERROR").length > 0 && (
          <Banner
            title={`${products.filter((p) => p.status === "ERROR").length} product(s) failed to scan`}
            tone="critical"
          >
            <BlockStack gap="100">
              {products
                .filter((p) => p.status === "ERROR")
                .slice(0, 3)
                .map((p) => (
                  <Text as="p" variant="bodySm" key={p.id}>
                    {p.title}: {p.error || "Unknown error"}
                  </Text>
                ))}
              {products.filter((p) => p.status === "ERROR").length > 3 && (
                <Text as="p" variant="bodySm" tone="subdued">
                  And {products.filter((p) => p.status === "ERROR").length - 3}{" "}
                  more...
                </Text>
              )}
            </BlockStack>
          </Banner>
        )}

        {/* Sync Guide */}
        {analyzedProducts.length > 0 && (
          <Banner
            title="Your AI suggestions are ready to apply"
            tone="info"
          >
            <List type="number">
              <List.Item>Click "Show details" on any product to review or edit suggestions (details appear below the table)</List.Item>
              <List.Item>Select the products you want to update using the checkboxes</List.Item>
              <List.Item>Click "Sync" below to apply the changes to your Shopify store</List.Item>
            </List>
          </Banner>
        )}

        {/* Apply to Shopify */}
        {analyzedProducts.length > 0 && (
          <Card>
            <BlockStack gap="400">
              <BlockStack gap="100">
                <Text as="h2" variant="headingMd">
                  Apply to Shopify
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Choose which data types to write to your selected products.
                </Text>
              </BlockStack>

              <InlineStack gap="400" wrap>
                <Checkbox
                  label="Metafields (color, material, pattern, etc.)"
                  checked={syncMetafields}
                  onChange={setSyncMetafields}
                />
                <Checkbox
                  label="Tags (SEO + vibe keywords)"
                  checked={syncTags}
                  onChange={setSyncTags}
                />
                <Checkbox
                  label="Alt Text (image accessibility)"
                  checked={syncAltText}
                  onChange={setSyncAltText}
                />
                <Checkbox
                  label="Description & SEO (product description, page title, meta description)"
                  checked={syncDescription}
                  onChange={setSyncDescription}
                />
              </InlineStack>

              <InlineStack gap="300">
                <Button
                  variant="primary"
                  onClick={handleSync}
                  loading={isSyncing}
                  disabled={
                    selectedResources.length === 0 ||
                    (!syncMetafields && !syncTags && !syncAltText && !syncDescription)
                  }
                >
                  {`Sync ${selectedResources.length} Selected Products`}
                </Button>
                <Text as="span" variant="bodySm" tone="subdued">
                  {selectedResources.length === 0
                    ? "Select products from the table below to get started"
                    : `${analyzedProducts.length} products ready to sync`}
                </Text>
              </InlineStack>
            </BlockStack>
          </Card>
        )}

        {/* Products Table */}
        <Card padding="0">
          <IndexTable
            resourceName={resourceName}
            itemCount={products.length}
            selectedItemsCount={
              allResourcesSelected ? "All" : selectedResources.length
            }
            onSelectionChange={handleSelectionChange}
            headings={[
              { title: "Image" },
              { title: "Product" },
              { title: "Status" },
              { title: "Details" },
            ]}
            selectable={analyzedProducts.length > 0}
          >
            {rowMarkup}
          </IndexTable>
        </Card>

        {/* Expanded Details */}
        {products.map((product) => {
          if (!expandedRows.has(product.id) || product.status !== "ANALYZED") {
            return null;
          }

          return (
            <Card key={`detail-${product.id}`}>
              <BlockStack gap="400">
                <Text as="h3" variant="headingMd">
                  {product.title} - AI Suggestions
                </Text>

                <Layout>
                  <Layout.Section variant="oneHalf">
                    <BlockStack gap="300">
                      <Text as="h4" variant="headingSm">
                        Suggested Metafields
                      </Text>
                      {product.suggestedMetafields ? (
                        <BlockStack gap="200">
                          {Object.entries(product.suggestedMetafields)
                            .filter(([key]) => key !== "alt_text")
                            .map(([key, value]) => (
                              <TextField
                                key={key}
                                label={key.replace(/_/g, " ")}
                                value={getMetafieldValue(product.id, key, value)}
                                onChange={(newValue) => updateMetafieldEdit(product.id, key, newValue)}
                                autoComplete="off"
                                size="slim"
                              />
                            ))}
                        </BlockStack>
                      ) : (
                        <Text as="p" variant="bodySm" tone="subdued">
                          No metafields suggested
                        </Text>
                      )}

                      {(product.suggestedMetafields?.alt_text || edits[product.id]?.alt_text) && (
                        <BlockStack gap="200">
                          <Divider />
                          <TextField
                            label="Alt Text"
                            value={getAltText(product.id, product.suggestedMetafields?.alt_text)}
                            onChange={(newValue) => updateAltTextEdit(product.id, newValue)}
                            autoComplete="off"
                            multiline={2}
                            helpText="Max 125 characters for accessibility"
                          />
                        </BlockStack>
                      )}
                    </BlockStack>
                  </Layout.Section>

                  <Layout.Section variant="oneHalf">
                    <BlockStack gap="300">
                      <Text as="h4" variant="headingSm">
                        Suggested Tags
                      </Text>
                      <InlineStack gap="100" wrap>
                        {getTags(product.id, product.suggestedTags).map((tag, i) => (
                          <Tag
                            key={i}
                            onRemove={() => removeTag(product.id, i, product)}
                          >
                            {tag}
                          </Tag>
                        ))}
                      </InlineStack>

                      <InlineStack gap="200" blockAlign="end">
                        <div style={{ flex: 1 }}>
                          <TextField
                            label="Add tag"
                            labelHidden
                            placeholder="Add new tag..."
                            value={newTagInputs[product.id] || ""}
                            onChange={(value) => setNewTagInputs(prev => ({ ...prev, [product.id]: value }))}
                            autoComplete="off"
                            size="slim"
                            connectedRight={
                              <Button
                                onClick={() => addTag(product.id, product)}
                              >
                                Add
                              </Button>
                            }
                          />
                        </div>
                      </InlineStack>

                      {product.currentTags && (
                        <>
                          <Divider />
                          <Text as="h4" variant="headingSm">
                            Current Tags
                          </Text>
                          <Text as="p" variant="bodySm" tone="subdued">
                            {product.currentTags || "None"}
                          </Text>
                        </>
                      )}
                    </BlockStack>
                  </Layout.Section>
                </Layout>

                {/* Description & SEO - only show if product has description/SEO data */}
                {(product.suggestedDescription || product.suggestedSeoTitle || product.suggestedMetaDescription) && (
                  <>
                    <Divider />
                    <Text as="h4" variant="headingSm">
                      Description & SEO
                    </Text>
                    <BlockStack gap="200">
                      {product.suggestedDescription != null && (
                        <TextField
                          label="Product Description"
                          value={getDescription(product.id, product.suggestedDescription)}
                          onChange={(v) => updateDescriptionEdit(product.id, v)}
                          autoComplete="off"
                          multiline={4}
                          helpText="Syncs to your product's main description"
                        />
                      )}
                      {product.suggestedSeoTitle != null && (
                        <TextField
                          label="SEO Title"
                          value={getSeoTitle(product.id, product.suggestedSeoTitle)}
                          onChange={(v) => updateSeoTitleEdit(product.id, v)}
                          autoComplete="off"
                          helpText={`${getSeoTitle(product.id, product.suggestedSeoTitle).length}/70 characters`}
                        />
                      )}
                      {product.suggestedMetaDescription != null && (
                        <TextField
                          label="Meta Description"
                          value={getMetaDescription(product.id, product.suggestedMetaDescription)}
                          onChange={(v) => updateMetaDescriptionEdit(product.id, v)}
                          autoComplete="off"
                          multiline={2}
                          helpText={`${getMetaDescription(product.id, product.suggestedMetaDescription).length}/160 characters`}
                        />
                      )}
                    </BlockStack>
                  </>
                )}
              </BlockStack>
            </Card>
          );
        })}
        </BlockStack>
      </Box>
    </Page>
  );
}
