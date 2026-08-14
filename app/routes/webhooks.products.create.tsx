import type { ActionFunctionArgs } from "@remix-run/node";
import * as Sentry from "@sentry/remix";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { queueProductAnalysis } from "../services/queue.server";
import { readTagSchema, writeTagSchema } from "../services/tagSchema.server";
import { hasAvailableCredits, consumeCredits } from "../services/billing.server";
import { logger } from "../services/logger.server";

interface ProductCreatePayload {
  id: number;
  title: string;
  vendor: string;
  product_type: string;
  tags: string;
  image?: {
    src: string;
  } | null;
}

export const action = async ({ request }: ActionFunctionArgs) => {
  let shop: string;
  let topic: string;
  let payload: unknown;
  try {
    ({ shop, topic, payload } = await authenticate.webhook(request));
  } catch (error) {
    // Always return 200 on webhook auth failure to avoid Shopify retry storms
    // that can eventually auto-disable the subscription. The error is still
    // captured in Sentry for visibility.
    logger.warn("WEBHOOK_AUTH_FAILED", {
      route: "products.create",
      error: error instanceof Error ? error.message : String(error),
    });
    Sentry.captureException(error, {
      tags: { service: "webhook", route: "products.create", phase: "auth" },
    });
    return new Response();
  }

  try {
    logger.info("WEBHOOK_RECEIVED", { shop, topic });

    const productData = payload as ProductCreatePayload;

    // Check if shop has auto-sync enabled
    const settings = await prisma.shopSettings.findUnique({
      where: { shop },
    });

    if (!settings?.autoSyncNewProducts) {
      logger.info("AUTO_SYNC_SKIP", { shop, reason: "disabled" });
      return new Response();
    }

    // Check if product has an image
    if (!productData.image?.src) {
      logger.info("AUTO_SYNC_SKIP", { shop, productId: productData.id, reason: "no_image" });
      return new Response();
    }

    // Check credits
    const creditCheck = await hasAvailableCredits(shop, 1);
    if (!creditCheck.allowed) {
      logger.warn("AUTO_SYNC_SKIP", { shop, reason: "no_credits" });
      return new Response();
    }

    // Create a job for this single product
    const shopifyProductId = `gid://shopify/Product/${productData.id}`;
    // Use UUID-suffixed ID to avoid conflicts with existing product records from manual scans
    const dbProductId = `${shopifyProductId}-${crypto.randomUUID()}`;

    // Snapshot the shop's tag settings onto the job, exactly like a manual scan:
    // the worker reads tag config from the Job only, never from ShopSettings.
    const autoTagSchema = readTagSchema(settings.tagSchema);

    const job = await prisma.job.create({
      data: {
        shop,
        status: "QUEUED",
        totalItems: 1,
        tagFormat: settings.tagFormat === "KEY_VALUE" && autoTagSchema ? "KEY_VALUE" : "FREEFORM",
        tagSchema: writeTagSchema(autoTagSchema),
      },
    });

    // Create product record
    await prisma.product.create({
      data: {
        id: dbProductId,
        jobId: job.id,
        title: productData.title,
        imageUrl: productData.image.src,
        currentCategory: productData.product_type,
        currentTags: productData.tags,
        status: "PENDING",
      },
    });

    // Queue for processing - pass the DB record ID (not the Shopify GID)
    // Use cached industry from shop settings, fallback to "general"
    const industryId = settings.industry || "general";
    try {
      const language = settings.language !== "auto" ? settings.language : undefined;
      await queueProductAnalysis(job.id, dbProductId, productData.image.src, shop, industryId, productData.title, productData.vendor, language);
    } catch (queueError) {
      // Queue failed - don't deduct credits, clean up the job record
      logger.error("QUEUE_ERROR", {
        shop,
        productId: dbProductId,
        error: queueError instanceof Error ? queueError.message : String(queueError),
      });
      await prisma.job.delete({ where: { id: job.id } }).catch(() => {});
      return new Response();
    }

    // Queue succeeded - now deduct credit
    // Even if this fails, the analysis will still happen (better to over-serve than under-charge)
    try {
      await consumeCredits(shop, 1);
    } catch (creditError) {
      logger.error("CREDIT_DEDUCT_FAILED", {
        shop,
        error: creditError instanceof Error ? creditError.message : String(creditError),
      });
    }

    logger.info("AUTO_SYNC_QUEUED", {
      shop,
      productId: dbProductId,
      shopifyProductId,
      jobId: job.id,
      trigger: "products/create",
    });

    return new Response();
  } catch (error) {
    logger.error("WEBHOOK_ERROR", {
      shop,
      topic,
      error: error instanceof Error ? error.message : String(error),
    });
    Sentry.captureException(error, {
      tags: { service: "webhook", topic, shop },
    });
    // Always return 200 to prevent Shopify retries
    return new Response();
  }
};
