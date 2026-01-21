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

    for (const productId of productIds) {
      const product = await prisma.product.findUnique({
        where: { id: productId },
      });

      if (!product || product.status !== "ANALYZED") continue;

      const suggestedMetafields = product.suggestedMetafields as Record<
        string,
        string
      > | null;
      const suggestedTags = product.suggestedTags as string[] | null;

      let metaSuccess = true;
      let tagSuccess = true;

      // Sync metafields
      if (syncMetafields && suggestedMetafields) {
        const result = await updateProductMetafields(
          admin,
          productId,
          suggestedMetafields,
          product.currentCategory
        );
        metaSuccess = result.success;
      }

      // Sync tags
      if (syncTags && suggestedTags) {
        const result = await updateProductTags(admin, productId, suggestedTags);
        tagSuccess = result.success;
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
      }
    }

    return json({
      success: true,
      synced,
      errors,
      message: `Synced ${synced} products${errors > 0 ? `, ${errors} failed` : ""}`,
    });
  }

  return json({ success: false });
};

export default function JobDetail() {
  const { job, products } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const navigate = useNavigate();
  const shopify = useAppBridge();

  const [syncMetafields, setSyncMetafields] = useState(true);
  const [syncTags, setSyncTags] = useState(true);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const analyzedProducts = products.filter((p) => p.status === "ANALYZED");
  const resourceName = { singular: "product", plural: "products" };

  const { selectedResources, allResourcesSelected, handleSelectionChange } =
    useIndexResourceState(analyzedProducts.map((p) => p.id));

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
                  Sync {selectedResources.length} Selected Products
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
    </Page>
  );
}
