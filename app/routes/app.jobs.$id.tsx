import { useEffect, useState, useCallback } from "react";
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
} from "@shopify/polaris";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
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
      syncedAt: p.syncedAt?.toISOString() || null,
      error: p.error,
    })),
  });
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const { id } = params;
  const formData = await request.formData();
  const action = formData.get("action");

  if (action === "sync") {
    const productIds = formData.getAll("productIds") as string[];
    const syncMetafields = formData.get("syncMetafields") === "true";
    const syncTags = formData.get("syncTags") === "true";

    if (productIds.length === 0) {
      return json({ error: "No products selected", success: false });
    }

    // Import services
    const { updateProductMetafields } = await import(
      "../services/metafields.server"
    );
    const { updateProductTags } = await import("../services/products.server");

    let synced = 0;
    let errors = 0;
    const errorMessages: string[] = [];

    for (const productId of productIds) {
      const product = await prisma.product.findUnique({
        where: { id: productId },
      });

      if (!product || product.status !== "ANALYZED") {
        console.log(`Skipping product ${productId}: not found or not ANALYZED (status: ${product?.status})`);
        continue;
      }

      const suggestedMetafields = product.suggestedMetafields as Record<
        string,
        string
      > | null;
      const suggestedTags = product.suggestedTags as string[] | null;

      let metaSuccess = true;
      let tagSuccess = true;
      let metaError: string | undefined;
      let tagError: string | undefined;

      // Sync metafields
      if (syncMetafields && suggestedMetafields) {
        console.log(`Syncing metafields for ${product.title}:`, suggestedMetafields);
        const result = await updateProductMetafields(
          admin,
          productId,
          suggestedMetafields,
          product.currentCategory
        );
        metaSuccess = result.success;
        metaError = result.error;
        if (!metaSuccess) {
          console.error(`Metafield sync failed for ${product.title}:`, metaError);
        }
      }

      // Sync tags
      if (syncTags && suggestedTags) {
        console.log(`Syncing tags for ${product.title}:`, suggestedTags);
        const result = await updateProductTags(admin, productId, suggestedTags);
        tagSuccess = result.success;
        tagError = result.error;
        if (!tagSuccess) {
          console.error(`Tag sync failed for ${product.title}:`, tagError);
        }
      }

      if (metaSuccess && tagSuccess) {
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
        const errMsg = [metaError, tagError].filter(Boolean).join("; ");
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

    console.log("Sync complete:", { synced, errors, errorMessages });

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

  const [syncMetafields, setSyncMetafields] = useState(true);
  const [syncTags, setSyncTags] = useState(true);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const analyzedProducts = products.filter((p) => p.status === "ANALYZED");
  const resourceName = { singular: "product", plural: "products" };

  const { selectedResources, allResourcesSelected, handleSelectionChange } =
    useIndexResourceState(analyzedProducts as { id: string }[]);

  const isSyncing = fetcher.state === "submitting";

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

        {/* Sync Options */}
        {analyzedProducts.length > 0 && (
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                Sync Options
              </Text>

              <InlineStack gap="400">
                <Checkbox
                  label="Sync Metafields (color, material, pattern, etc.)"
                  checked={syncMetafields}
                  onChange={setSyncMetafields}
                />
                <Checkbox
                  label="Sync Tags (SEO + vibe keywords)"
                  checked={syncTags}
                  onChange={setSyncTags}
                />
              </InlineStack>

              <InlineStack gap="300">
                <Button
                  variant="primary"
                  onClick={handleSync}
                  loading={isSyncing}
                  disabled={
                    selectedResources.length === 0 ||
                    (!syncMetafields && !syncTags)
                  }
                >
                  {`Sync ${selectedResources.length} Selected Products`}
                </Button>
                <Text as="span" variant="bodySm" tone="subdued">
                  {analyzedProducts.length} products ready to sync
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
                        <BlockStack gap="100">
                          {Object.entries(product.suggestedMetafields).map(
                            ([key, value]) =>
                              value && (
                                <InlineStack
                                  key={key}
                                  align="space-between"
                                  gap="200"
                                >
                                  <Text as="span" variant="bodySm" tone="subdued">
                                    {key.replace(/_/g, " ")}:
                                  </Text>
                                  <Text as="span" variant="bodySm">
                                    {value}
                                  </Text>
                                </InlineStack>
                              )
                          )}
                        </BlockStack>
                      ) : (
                        <Text as="p" variant="bodySm" tone="subdued">
                          No metafields suggested
                        </Text>
                      )}
                    </BlockStack>
                  </Layout.Section>

                  <Layout.Section variant="oneHalf">
                    <BlockStack gap="300">
                      <Text as="h4" variant="headingSm">
                        Suggested Tags
                      </Text>
                      {product.suggestedTags && product.suggestedTags.length > 0 ? (
                        <InlineStack gap="100" wrap>
                          {product.suggestedTags.map((tag, i) => (
                            <Tag key={i}>{tag}</Tag>
                          ))}
                        </InlineStack>
                      ) : (
                        <Text as="p" variant="bodySm" tone="subdued">
                          No tags suggested
                        </Text>
                      )}

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
              </BlockStack>
            </Card>
          );
        })}
        </BlockStack>
      </Box>
    </Page>
  );
}
