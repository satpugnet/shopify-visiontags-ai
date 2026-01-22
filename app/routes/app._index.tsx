import { useEffect } from "react";
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
} from "@shopify/polaris";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { countProducts } from "../services/products.server";
import { getShopBilling, PLANS } from "../services/billing.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  // Get product count
  const productCount = await countProducts(admin);

  // Get billing info
  const billing = await getShopBilling(shop);

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
    const { fetchAllProducts } = await import("../services/products.server");
    const { queueBulkAnalysis } = await import("../services/queue.server");
    const { hasAvailableCredits, useCredits } = await import(
      "../services/billing.server"
    );

    // Fetch products with images
    const products = await fetchAllProducts(admin, 100); // Limit to 100 for V1

    if (products.length === 0) {
      return json({
        error: "No products with images found",
        success: false,
      });
    }

    // Check credits
    const hasCredits = await hasAvailableCredits(shop, products.length);
    if (!hasCredits) {
      return json({
        error: "Not enough credits. Please upgrade to Pro plan.",
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

    // Create product records
    await prisma.product.createMany({
      data: products.map((p) => ({
        id: p.id,
        jobId: job.id,
        title: p.title,
        imageUrl: p.imageUrl,
        currentCategory: p.category,
        currentTags: p.tags.join(", "),
        status: "PENDING",
      })),
    });

    // Queue for processing
    await queueBulkAnalysis(
      job.id,
      products.map((p) => ({ id: p.id, imageUrl: p.imageUrl })),
      shop
    );

    // Use credits
    await useCredits(shop, products.length);

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
  const { shop, productCount, billing, jobs, proFeatures, proPrice } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<ActionData>();
  const shopify = useAppBridge();

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
    fetcher.submit({ action: "start-scan" }, { method: "POST" });
  };

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

      <BlockStack gap="500">
        {billing.plan === "FREE" && billing.creditsRemaining < 10 && (
          <Banner
            title="Running low on credits"
            tone="warning"
            action={{ content: "Upgrade to Pro", url: "/app/billing" }}
          >
            <p>
              You have {billing.creditsRemaining} credits remaining this month.
              Upgrade to Pro for 2,000 credits/month.
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
                    <Button url="/app/billing">Upgrade to Pro</Button>
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
                    2. AI fills metafields (color, material, pattern) and
                    generates SEO tags
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
                  Start your first AI scan to auto-fill metafields and generate
                  SEO tags for your products.
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
                  <Button url="/app/billing">
                    {`Upgrade for $${proPrice}/month`}
                  </Button>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
