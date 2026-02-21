import { useEffect, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher, Link as RemixLink } from "@remix-run/react";
import {
  Page,
  Layout,
  Text,
  Card,
  Button,
  BlockStack,
  Box,
  InlineStack,
  ProgressBar,
  Banner,
  Badge,
  DataTable,
  EmptyState,
  Select,
} from "@shopify/polaris";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { countProducts } from "../services/products.server";
import {
  getShopBilling,
  syncPlanFromShopify,
  getPlanPickerUrl,
  PLANS,
} from "../services/billing.server";

interface CollectionsQueryResponse {
  data?: {
    collections?: {
      nodes: Array<{
        id: string;
        title: string;
        productsCount?: {
          count: number;
        };
      }>;
    };
  };
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  // Sync plan status from Shopify (Managed Pricing)
  await syncPlanFromShopify(admin, shop);

  // Get product count
  const productCount = await countProducts(admin);

  // Get billing info
  const billing = await getShopBilling(shop);

  // Get plan picker URL for upgrade buttons
  const planPickerUrl = getPlanPickerUrl(shop);

  // Get collections for dropdown (wrapped in try-catch for safety)
  let collections: Array<{ id: string; title: string; productsCount: number }> = [];
  try {
    const collectionsResponse = await admin.graphql(`
      query getCollections {
        collections(first: 50) {
          nodes {
            id
            title
            productsCount {
              count
            }
          }
        }
      }
    `);
    const collectionsData = (await collectionsResponse.json()) as CollectionsQueryResponse;
    collections = (collectionsData.data?.collections?.nodes || []).map((c) => ({
      id: c.id,
      title: c.title,
      productsCount: c.productsCount?.count ?? 0,
    }));
  } catch (error) {
    console.error("[VisionTags] Failed to fetch collections:", error);
    // Continue without collections - not critical
  }

  // Get recent jobs
  const jobs = await prisma.job.findMany({
    where: { shop },
    orderBy: { createdAt: "desc" },
    take: 5,
    include: {
      _count: {
        select: { products: true },
      },
    },
  });

  return json({
    shop,
    productCount,
    billing,
    proFeatures: PLANS.PRO.features,
    proPrice: PLANS.PRO.price,
    planPickerUrl,
    collections,
    jobs: jobs.map((job) => ({
      id: job.id,
      status: job.status,
      totalItems: job.totalItems,
      processed: job.processed,
      createdAt: job.createdAt.toISOString(),
      productCount: job._count.products,
    })),
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const action = formData.get("action");

  if (action === "start-scan") {
    // Import services
    const { fetchAllProducts, fetchCollectionProducts } = await import("../services/products.server");
    const { queueBulkAnalysis } = await import("../services/queue.server");
    const { hasAvailableCredits, useCredits } = await import(
      "../services/billing.server"
    );

    // Get selected collection (if any)
    const selectedCollection = formData.get("selectedCollection") as string;

    // Fetch products with images (limit based on plan)
    const billing = await getShopBilling(shop);
    const scanLimit = billing.plan === "PRO" ? 500 : 50;
    const products = selectedCollection && selectedCollection !== "all"
      ? await fetchCollectionProducts(admin, selectedCollection, scanLimit)
      : await fetchAllProducts(admin, scanLimit);

    const collection = selectedCollection && selectedCollection !== "all" ? selectedCollection : "all";
    console.log(`[VisionTags] Fetched ${products.length} products for ${shop} (limit: ${scanLimit}, collection: ${collection})`);

    if (products.length === 0) {
      console.log(`[VisionTags] Scan aborted for ${shop}: no products with images`);
      return json({
        error: "No products with images found",
        success: false,
      });
    }

    // Check credits
    const creditCheck = await hasAvailableCredits(shop, products.length);
    if (!creditCheck.allowed) {
      const billing = await getShopBilling(shop);
      console.log(`[VisionTags] Scan aborted for ${shop}: insufficient credits (needed: ${products.length}, remaining: ${billing.creditsRemaining}, plan: ${billing.plan})`);
      const errorMessage = billing.plan === "PRO"
        ? "Not enough credits. Credits will reset at the start of your next billing cycle."
        : "Not enough credits. Upgrade to Pro for 5,000 credits/month.";
      return json({
        error: errorMessage,
        success: false,
      });
    }

    // Create job
    const job = await prisma.job.create({
      data: {
        shop,
        status: "QUEUED",
        totalItems: products.length,
      },
    });

    // Create or update product records using a transaction
    // First delete existing products, then create new ones (simpler than upsert)
    const productIds = products.map((p) => p.id);

    await prisma.$transaction([
      // Delete existing products that will be rescanned
      prisma.product.deleteMany({
        where: { id: { in: productIds } },
      }),
      // Create fresh product records
      prisma.product.createMany({
        data: products.map((p) => ({
          id: p.id,
          jobId: job.id,
          title: p.title,
          imageUrl: p.imageUrl,
          currentCategory: p.category,
          currentTags: p.tags.join(", "),
          status: "PENDING",
        })),
      }),
    ]);

    // Queue for processing
    await queueBulkAnalysis(
      job.id,
      products.map((p) => ({ id: p.id, imageUrl: p.imageUrl })),
      shop
    );

    // Use credits
    await useCredits(shop, products.length);

    console.log(`[VisionTags] Scan started for ${shop}: ${products.length} products (plan: ${billing.plan}, collection: ${collection}, jobId: ${job.id})`);

    return json({ success: true, jobId: job.id });
  }

  return json({ success: false });
};

type ActionData = {
  success: boolean;
  jobId?: string;
  error?: string;
};

export default function Dashboard() {
  const { shop, productCount, billing, jobs, proFeatures, proPrice, planPickerUrl, collections } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<ActionData>();
  const shopify = useAppBridge();
  const [selectedCollection, setSelectedCollection] = useState("all");

  const isScanning =
    fetcher.state === "submitting" && fetcher.formData?.get("action") === "start-scan";

  useEffect(() => {
    if (fetcher.data?.success && fetcher.data?.jobId) {
      shopify.toast.show("AI scan started");
    } else if (fetcher.data?.error) {
      shopify.toast.show(fetcher.data.error, { isError: true });
    }
  }, [fetcher.data, shopify]);

  const startScan = () => {
    fetcher.submit(
      { action: "start-scan", selectedCollection },
      { method: "POST" }
    );
  };

  const collectionOptions = [
    { label: "All products", value: "all" },
    ...collections.map((c) => ({
      label: `${c.title} (${c.productsCount} products)`,
      value: c.id,
    })),
  ];

  const creditPercentage = Math.round(
    (billing.creditsUsed / billing.creditLimit) * 100
  );

  const jobRows = jobs.map((job) => [
    <RemixLink to={`/app/jobs/${job.id}`} key={job.id}>
      {job.id.slice(0, 8)}...
    </RemixLink>,
    <Badge
      key={`status-${job.id}`}
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
    </Badge>,
    `${job.processed}/${job.totalItems}`,
    new Date(job.createdAt).toLocaleDateString(),
  ]);

  return (
    <Page>
      <TitleBar title="VisionTags Dashboard">
        <button variant="primary" onClick={startScan} disabled={isScanning}>
          {isScanning ? "Starting..." : "Start AI Scan"}
        </button>
      </TitleBar>

      <Box paddingBlockEnd="800">
        <BlockStack gap="500">
          {billing.plan === "FREE" && billing.creditsRemaining < 10 && (
          <Banner
            title="Running low on credits"
            tone="warning"
            action={{ content: "Upgrade to Pro", onAction: () => window.open(planPickerUrl, "_top") }}
          >
            <p>
              You have {billing.creditsRemaining} credits remaining this month.
              Upgrade to Pro for 5,000 credits/month.
            </p>
          </Banner>
        )}

        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between">
                  <Text as="h2" variant="headingMd">
                    Your Store
                  </Text>
                  <Badge tone={billing.plan === "PRO" ? "success" : "info"}>
                    {`${billing.plan} Plan`}
                  </Badge>
                </InlineStack>

                <BlockStack gap="200">
                  <InlineStack align="space-between">
                    <Text as="span" variant="bodyMd">
                      Products with images
                    </Text>
                    <Text as="span" variant="bodyMd" fontWeight="semibold">
                      {productCount}
                    </Text>
                  </InlineStack>

                  <InlineStack align="space-between">
                    <Text as="span" variant="bodyMd">
                      Credits used this month
                    </Text>
                    <Text as="span" variant="bodyMd" fontWeight="semibold">
                      {billing.creditsUsed} / {billing.creditLimit}
                    </Text>
                  </InlineStack>
                </BlockStack>

                <Box>
                  <ProgressBar
                    progress={creditPercentage}
                    tone={creditPercentage > 90 ? "critical" : "primary"}
                    size="small"
                  />
                </Box>

                <Select
                  label="Products to scan"
                  options={collectionOptions}
                  value={selectedCollection}
                  onChange={setSelectedCollection}
                />

                <InlineStack gap="300">
                  <Button
                    variant="primary"
                    onClick={startScan}
                    loading={isScanning}
                    disabled={billing.creditsRemaining === 0}
                  >
                    Start AI Scan
                  </Button>
                  {billing.plan === "FREE" && (
                    <Button onClick={() => window.open(planPickerUrl, "_top")}>Upgrade to Pro</Button>
                  )}
                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  How It Works
                </Text>
                <BlockStack gap="200">
                  <Text as="p" variant="bodyMd">
                    1. Click "Start AI Scan" to analyze your product images
                  </Text>
                  <Text as="p" variant="bodyMd">
                    2. AI fills metafields, generates SEO tags, and writes
                    product descriptions
                  </Text>
                  <Text as="p" variant="bodyMd">
                    3. Review suggestions and click "Sync" to update Shopify
                  </Text>
                </BlockStack>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">
              Recent Scan Jobs
            </Text>

            {jobs.length === 0 ? (
              <EmptyState
                heading="No scans yet"
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>
                  Start your first AI scan to auto-fill metafields, generate
                  SEO tags, and write product descriptions.
                </p>
              </EmptyState>
            ) : (
              <DataTable
                columnContentTypes={["text", "text", "text", "text"]}
                headings={["Job ID", "Status", "Progress", "Created"]}
                rows={jobRows}
              />
            )}
          </BlockStack>
        </Card>

        <Layout>
          <Layout.Section variant="oneHalf">
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">
                  What We Fill
                </Text>
                <BlockStack gap="100">
                  <Text as="p" variant="bodyMd">
                    <strong>Metafields:</strong> Color, Pattern, Material,
                    Target Gender, Age Group, Neckline, Sleeve Length, Fit
                  </Text>
                  <Text as="p" variant="bodyMd">
                    <strong>Tags:</strong> SEO keywords + vibe/occasion tags
                    (e.g., "Summer Vibes", "Business Casual")
                  </Text>
                  <Text as="p" variant="bodyMd">
                    <strong>Description & SEO:</strong> Product description, SEO
                    page title, meta description
                  </Text>
                </BlockStack>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section variant="oneHalf">
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">
                  {billing.plan === "FREE" ? "Upgrade to Pro" : "Pro Features"}
                </Text>
                <BlockStack gap="100">
                  {proFeatures.map((feature, i) => (
                    <Text as="p" variant="bodyMd" key={i}>
                      {feature}
                    </Text>
                  ))}
                </BlockStack>
                {billing.plan === "FREE" && (
                  <Button onClick={() => window.open(planPickerUrl, "_top")}>
                    {`Upgrade for $${proPrice}/month`}
                  </Button>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
        </BlockStack>
      </Box>
    </Page>
  );
}
