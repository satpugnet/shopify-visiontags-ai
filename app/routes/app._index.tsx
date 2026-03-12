import { useEffect, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher, Link as RemixLink, useNavigate, useRevalidator } from "@remix-run/react";
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
import { logger } from "../services/logger.server";

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

  logger.info("DASHBOARD_VIEWED", { shop });

  // Track journey milestone: first dashboard visit + last activity
  const now = new Date();
  await prisma.shopSettings.updateMany({
    where: { shop, firstSeenAt: null },
    data: { firstSeenAt: now },
  });
  await prisma.shopSettings.update({
    where: { shop },
    data: { lastActiveAt: now },
  }).catch(() => {/* shop settings may not exist yet */});

  // Sync plan status from Shopify (Managed Pricing)
  await syncPlanFromShopify(admin, shop);

  // Clean up stale jobs (stuck > 15 min)
  const { cleanupStaleJobs } = await import("../services/queue.server");
  await cleanupStaleJobs(shop);

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
    logger.error("COLLECTIONS_FETCH_FAILED", {
      shop,
      error: error instanceof Error ? error.message : String(error),
    });
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

  // Get synced product counts per job
  const syncedCounts = await prisma.product.groupBy({
    by: ['jobId'],
    where: { jobId: { in: jobs.map(j => j.id) }, status: 'SYNCED' },
    _count: true,
  });
  const syncedMap = Object.fromEntries(
    syncedCounts.map(r => [r.jobId, r._count])
  );

  // Check if most recent completed job has unsynced products
  const recentJob = jobs[0];
  let pendingSyncCount = 0;
  if (recentJob && recentJob.status === "COMPLETED") {
    pendingSyncCount = await prisma.product.count({
      where: { jobId: recentJob.id, status: "ANALYZED" },
    });
  }

  // Get language setting
  const shopSettings = await prisma.shopSettings.findUnique({
    where: { shop },
    select: { language: true },
  });
  const language = shopSettings?.language ?? "auto";

  return json({
    shop,
    productCount,
    billing,
    proFeatures: PLANS.PRO.features,
    proPrice: PLANS.PRO.price,
    planPickerUrl,
    collections,
    pendingSyncCount,
    recentJobId: recentJob?.id ?? null,
    language,
    jobs: jobs.map((job) => ({
      id: job.id,
      status: job.status,
      totalItems: job.totalItems,
      processed: job.processed,
      createdAt: job.createdAt.toISOString(),
      productCount: job._count.products,
      syncedCount: syncedMap[job.id] ?? 0,
    })),
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const action = formData.get("action");

  if (action === "save-language") {
    const language = formData.get("language") as string;
    if (language) {
      await prisma.shopSettings.upsert({
        where: { shop },
        update: { language },
        create: { shop, language },
      });
    }
    return json({ success: true });
  }

  if (action === "start-scan") {
    // Import services
    const { fetchAllProducts, fetchCollectionProducts } = await import("../services/products.server");
    const { queueBulkAnalysis } = await import("../services/queue.server");
    const { hasAvailableCredits, consumeCredits } = await import(
      "../services/billing.server"
    );
    const { detectIndustry } = await import("../services/industry.server");

    // Check for active scans (prevent concurrent scan race condition)
    const activeJobs = await prisma.job.findMany({
      where: {
        shop,
        status: { in: ["QUEUED", "PROCESSING"] },
      },
    });

    if (activeJobs.length > 0) {
      logger.warn("SCAN_BLOCKED_CONCURRENT", {
        shop,
        activeJobIds: activeJobs.map((j) => j.id),
        activeJobCount: activeJobs.length,
      });
      return json({
        error: "A scan is already in progress. Please wait for it to complete before starting another.",
        success: false,
      });
    }

    // Get selected collection (if any)
    const selectedCollection = formData.get("selectedCollection") as string;

    // Fetch products with images (limit based on plan)
    const billing = await getShopBilling(shop);
    const scanLimit = billing.plan === "PRO" ? 500 : 50;
    const products = selectedCollection && selectedCollection !== "all"
      ? await fetchCollectionProducts(admin, selectedCollection, scanLimit)
      : await fetchAllProducts(admin, scanLimit);

    const collection = selectedCollection && selectedCollection !== "all" ? selectedCollection : "all";
    logger.info("SCAN_PRODUCTS_FETCHED", {
      shop,
      productCount: products.length,
      scanLimit,
      collection,
    });

    if (products.length === 0) {
      logger.info("SCAN_BLOCKED_NO_PRODUCTS", { shop });
      return json({
        error: "No products with images found",
        success: false,
      });
    }

    // Detect industry from fetched products and cache it
    const industryId = detectIndustry(
      products.map((p) => ({ category: p.category, productType: p.productType }))
    );
    await prisma.shopSettings.update({
      where: { shop },
      data: { industry: industryId },
    }).catch(() => {/* ignore if shop settings don't exist yet */});

    logger.info("INDUSTRY_DETECTED", { shop, industryId, productCount: products.length });

    // Resolve language and store name for AI prompt context
    const shopSettingsForScan = await prisma.shopSettings.findUnique({
      where: { shop },
      select: { language: true },
    });
    let resolvedLanguage: string | undefined;
    const langSetting = shopSettingsForScan?.language ?? "auto";
    if (langSetting !== "auto") {
      resolvedLanguage = langSetting;
    } else {
      // Auto-detect from Shopify shop locale
      try {
        const localeResponse = await admin.graphql(`
          query getShopLocale {
            shop {
              primaryLocale { isoCode }
            }
          }
        `);
        const localeData = (await localeResponse.json()) as {
          data?: { shop?: { primaryLocale?: { isoCode?: string } } };
        };
        const isoCode = localeData.data?.shop?.primaryLocale?.isoCode;
        if (isoCode) {
          // Extract language from locale (e.g., "pt-BR" -> "pt", "en" -> "en")
          resolvedLanguage = isoCode.split("-")[0];
        }
      } catch {
        // Fall through to undefined (will default to English in prompt)
      }
    }

    // Fetch store name
    let storeName: string | undefined;
    try {
      const shopResponse = await admin.graphql(`
        query getShopName {
          shop { name }
        }
      `);
      const shopData = (await shopResponse.json()) as {
        data?: { shop?: { name?: string } };
      };
      storeName = shopData.data?.shop?.name || undefined;
    } catch {
      // Fall through to undefined
    }

    // Map language codes to full names for the prompt
    const languageNames: Record<string, string> = {
      en: "English", pt: "Portuguese", es: "Spanish", fr: "French",
      de: "German", it: "Italian", nl: "Dutch", ja: "Japanese",
      ko: "Korean", zh: "Chinese", ar: "Arabic", ru: "Russian",
      tr: "Turkish", pl: "Polish", sv: "Swedish", da: "Danish",
      fi: "Finnish", nb: "Norwegian", cs: "Czech", ro: "Romanian",
      hu: "Hungarian", th: "Thai", vi: "Vietnamese", he: "Hebrew",
    };
    const languageForPrompt = resolvedLanguage
      ? languageNames[resolvedLanguage] || resolvedLanguage
      : undefined;

    // Check credits
    const creditCheck = await hasAvailableCredits(shop, products.length);
    if (!creditCheck.allowed) {
      const currentBilling = await getShopBilling(shop);
      logger.warn("SCAN_BLOCKED_NO_CREDITS", {
        shop,
        needed: products.length,
        remaining: currentBilling.creditsRemaining,
        plan: currentBilling.plan,
      });
      const errorMessage = currentBilling.plan === "PRO"
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
        industry: industryId,
      },
    });

    // Create or update product records using a transaction
    // Only delete products from COMPLETED/FAILED jobs (never from active ones)
    const productIds = products.map((p) => p.id);

    await prisma.$transaction([
      prisma.product.deleteMany({
        where: {
          id: { in: productIds },
          job: {
            status: { in: ["COMPLETED", "FAILED"] },
          },
        },
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

    // Queue for processing (wrapped in try-catch to avoid deducting credits on failure)
    try {
      await queueBulkAnalysis(
        job.id,
        products.map((p) => ({ id: p.id, imageUrl: p.imageUrl, title: p.title, vendor: p.vendor })),
        shop,
        industryId,
        languageForPrompt,
        storeName,
      );
    } catch (queueError) {
      logger.error("QUEUE_ERROR", {
        shop,
        jobId: job.id,
        error: queueError instanceof Error ? queueError.message : String(queueError),
      });
      // Mark job as FAILED so it doesn't block future scans
      await prisma.job.update({
        where: { id: job.id },
        data: { status: "FAILED" },
      });
      return json({
        error: "Failed to start scan. Please try again.",
        success: false,
      });
    }

    // Queue succeeded, now deduct credits
    await consumeCredits(shop, products.length);

    // Track journey milestone: first scan + total scans
    const scanNow = new Date();
    await prisma.shopSettings.updateMany({
      where: { shop, firstScanAt: null },
      data: { firstScanAt: scanNow },
    });
    await prisma.shopSettings.update({
      where: { shop },
      data: {
        totalScans: { increment: 1 },
        lastActiveAt: scanNow,
      },
    });

    logger.info("SCAN_STARTED", {
      shop,
      jobId: job.id,
      productCount: products.length,
      plan: billing.plan,
      collection,
    });

    return json({ success: true, jobId: job.id });
  }

  return json({ success: false });
};

type ActionData = {
  success: boolean;
  jobId?: string;
  error?: string;
};

function jobDisplayStatus(job: { status: string; totalItems: number; syncedCount: number }) {
  if (job.status === "QUEUED" || job.status === "PROCESSING") return { label: "Scanning...", tone: "info" as const };
  if (job.status === "FAILED") return { label: "Failed", tone: "critical" as const };
  // COMPLETED
  if (job.syncedCount >= job.totalItems) return { label: "Applied", tone: "success" as const };
  return { label: "Ready to Apply", tone: "attention" as const };
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(dateStr).toLocaleDateString("en-US");
}

export default function Dashboard() {
  const { productCount, billing, jobs, proFeatures, proPrice, planPickerUrl, collections, pendingSyncCount, recentJobId, language } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<ActionData>();
  const languageFetcher = useFetcher();
  const shopify = useAppBridge();
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  const [selectedCollection, setSelectedCollection] = useState("all");
  const [selectedLanguage, setSelectedLanguage] = useState(language);

  const isScanning =
    fetcher.state === "submitting" && fetcher.formData?.get("action") === "start-scan";

  const hasActiveJob = jobs.some(
    (job) => job.status === "QUEUED" || job.status === "PROCESSING"
  );

  // Auto-redirect to job detail after scan starts
  useEffect(() => {
    if (fetcher.data?.success && fetcher.data?.jobId) {
      shopify.toast.show("AI scan started");
      navigate(`/app/jobs/${fetcher.data.jobId}`);
    } else if (fetcher.data?.error) {
      shopify.toast.show(fetcher.data.error, { isError: true });
    }
  }, [fetcher.data, shopify, navigate]);

  // Auto-refresh dashboard while a scan is active
  useEffect(() => {
    if (!hasActiveJob) return;
    const interval = setInterval(() => {
      if (revalidator.state === "idle") {
        revalidator.revalidate();
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [hasActiveJob, revalidator]);

  const startScan = () => {
    fetcher.submit(
      { action: "start-scan", selectedCollection },
      { method: "POST" }
    );
  };

  const collectionOptions = [
    { label: `All products (${productCount})`, value: "all" },
    ...collections.map((c) => ({
      label: `${c.title} (${c.productsCount} ${c.productsCount === 1 ? "product" : "products"})`,
      value: c.id,
    })),
  ];

  const creditPercentage = Math.round(
    (billing.creditsUsed / billing.creditLimit) * 100
  );

  const jobRows = jobs.map((job) => {
    const display = jobDisplayStatus(job);
    return [
      <RemixLink to={`/app/jobs/${job.id}`} key={job.id}>
        {job.status === "COMPLETED" ? "View Results" :
         job.status === "PROCESSING" || job.status === "QUEUED" ? "View Progress" :
         "View Details"}
      </RemixLink>,
      <Badge
        key={`status-${job.id}`}
        tone={display.tone}
      >
        {display.label}
      </Badge>,
      `${job.processed}/${job.totalItems}`,
      relativeTime(job.createdAt),
    ];
  });

  return (
    <Page>
      <TitleBar title="VisionTags Dashboard">
        <button variant="primary" onClick={startScan} disabled={isScanning || hasActiveJob}>
          {isScanning ? "Starting..." : hasActiveJob ? "Scan in progress..." : "Scan & Apply"}
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

        {hasActiveJob && (
          <Banner
            title="Scan in progress"
            tone="info"
          >
            <p>
              A scan is currently running. You can view its progress below or wait for it to complete before starting a new one.
            </p>
          </Banner>
        )}

        {pendingSyncCount > 0 && recentJobId && (
          <Banner
            title={`${pendingSyncCount} products are ready to apply!`}
            tone="success"
            action={{
              content: "Review & Apply Results",
              onAction: () => navigate(`/app/jobs/${recentJobId}`),
            }}
          >
            <p>Your AI scan is complete. Review the suggestions and apply them to your Shopify store.</p>
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

                <Select
                  label="Output language"
                  options={[
                    { label: "Auto-detect from store", value: "auto" },
                    { label: "English", value: "en" },
                    { label: "Portuguese", value: "pt" },
                    { label: "Spanish", value: "es" },
                    { label: "French", value: "fr" },
                    { label: "German", value: "de" },
                    { label: "Italian", value: "it" },
                    { label: "Dutch", value: "nl" },
                    { label: "Japanese", value: "ja" },
                    { label: "Korean", value: "ko" },
                    { label: "Chinese", value: "zh" },
                  ]}
                  value={selectedLanguage}
                  onChange={(value) => {
                    setSelectedLanguage(value);
                    languageFetcher.submit(
                      { action: "save-language", language: value },
                      { method: "POST" },
                    );
                  }}
                />

                <InlineStack gap="300">
                  <Button
                    variant="primary"
                    onClick={startScan}
                    loading={isScanning}
                    disabled={billing.creditsRemaining === 0 || hasActiveJob}
                  >
                    {hasActiveJob ? "Scan in progress..." : "Scan & Apply"}
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
                    1. Click "Scan & Apply" to analyze your product images
                  </Text>
                  <Text as="p" variant="bodyMd">
                    2. AI fills metafields, tags, descriptions, and SEO
                  </Text>
                  <Text as="p" variant="bodyMd">
                    3. Confirm with "Apply All" to update your Shopify store
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
                headings={["", "Status", "Progress", "Created"]}
                rows={jobRows}
              />
            )}
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="h2" variant="headingMd">
                AI Readiness Score
              </Text>
              <Badge tone="info">Free</Badge>
            </InlineStack>
            <Text as="p" variant="bodyMd">
              Check how ready your products are for ChatGPT Shopping, Google AI Mode, and other AI agents.
            </Text>
            <Button onClick={() => navigate("/app/readiness")}>Check AI Readiness</Button>
          </BlockStack>
        </Card>

        <Banner tone="info" title="Make your products visible to AI shopping agents">
          <BlockStack gap="200">
            <p>
              ChatGPT Shopping, Google AI, and Perplexity recommend products based on structured data, not how your store looks. Enable Product JSON-LD to add a machine-readable product card to every product page.
            </p>
            <p>
              Go to <strong>Online Store &rarr; Themes &rarr; Customize &rarr; App embeds</strong> and toggle on <strong>VisionTags Structured Data</strong>.
            </p>
          </BlockStack>
        </Banner>

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
