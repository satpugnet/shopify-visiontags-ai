import type { ActionFunctionArgs } from "@remix-run/node";
import * as Sentry from "@sentry/remix";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { queueProductAnalysis } from "../services/queue.server";
import { hasAvailableCredits, consumeCredits } from "../services/billing.server";
import { logger } from "../services/logger.server";

interface ProductCreatePayload {
  id: number;
  title: string;
  product_type: string;
  tags: string;
  image?: {
    src: string;
  } | null;
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

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

    const job = await prisma.job.create({
      data: {
        shop,
        status: "QUEUED",
        totalItems: 1,
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
      await queueProductAnalysis(job.id, dbProductId, productData.image.src, shop, industryId);
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
