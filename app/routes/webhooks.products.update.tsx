/**
 * Products Update Webhook Handler
 *
 * Re-analyzes products when their images change (Pro feature with auto-sync).
 */

import type { ActionFunctionArgs } from "@remix-run/node";
import * as Sentry from "@sentry/remix";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { queueProductAnalysis } from "../services/queue.server";
import { hasAvailableCredits, consumeCredits } from "../services/billing.server";
import { logger } from "../services/logger.server";

interface ProductUpdatePayload {
  id: number;
  title: string;
  vendor: string;
  product_type: string;
  tags: string;
  image?: {
    src: string;
  } | null;
  images?: Array<{
    src: string;
  }>;
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
      route: "products.update",
      error: error instanceof Error ? error.message : String(error),
    });
    Sentry.captureException(error, {
      tags: { service: "webhook", route: "products.update", phase: "auth" },
    });
    return new Response();
  }

  try {
    logger.info("WEBHOOK_RECEIVED", { shop, topic });

    const productData = payload as ProductUpdatePayload;
    const shopifyProductId = `gid://shopify/Product/${productData.id}`;

    // Check if shop has auto-sync enabled
    const settings = await prisma.shopSettings.findUnique({
      where: { shop },
    });

    if (!settings?.autoSyncNewProducts) {
      logger.info("AUTO_SYNC_SKIP", { shop, reason: "disabled", productId: productData.id });
      return new Response();
    }

    // Get the primary image
    const imageUrl = productData.image?.src || productData.images?.[0]?.src;
    if (!imageUrl) {
      logger.info("AUTO_SYNC_SKIP", { shop, productId: productData.id, reason: "no_image" });
      return new Response();
    }

    // Check if this product was previously analyzed - look for any record matching this Shopify product
    const existingProduct = await prisma.product.findFirst({
      where: {
        OR: [
          { id: shopifyProductId },
          { id: { startsWith: `${shopifyProductId}-` } },
        ],
      },
      orderBy: { createdAt: "desc" },
    });

    // Only re-analyze if the image changed
    if (existingProduct && existingProduct.imageUrl === imageUrl) {
      logger.info("AUTO_SYNC_SKIP", { shop, productId: productData.id, reason: "image_unchanged" });
      return new Response();
    }

    // Check credits
    const creditCheck = await hasAvailableCredits(shop, 1);
    if (!creditCheck.allowed) {
      logger.warn("AUTO_SYNC_SKIP", { shop, reason: "no_credits" });
      return new Response();
    }

    // Create a new job for this product update
    const job = await prisma.job.create({
      data: {
        shop,
        status: "QUEUED",
        totalItems: 1,
      },
    });

    // Use UUID-suffixed ID to avoid conflicts
    const dbProductId = `${shopifyProductId}-${crypto.randomUUID()}`;

    // Create product record
    await prisma.product.create({
      data: {
        id: dbProductId,
        jobId: job.id,
        title: productData.title,
        imageUrl: imageUrl,
        currentCategory: productData.product_type,
        currentTags: productData.tags,
        status: "PENDING",
      },
    });

    // Queue for processing - pass the DB record ID (not the Shopify GID)
    try {
      const language = settings.language !== "auto" ? settings.language : undefined;
      await queueProductAnalysis(job.id, dbProductId, imageUrl, shop, undefined, productData.title, productData.vendor, language);
    } catch (queueError) {
      logger.error("QUEUE_ERROR", {
        shop,
        productId: dbProductId,
        error: queueError instanceof Error ? queueError.message : String(queueError),
      });
      await prisma.job.delete({ where: { id: job.id } }).catch(() => {});
      return new Response();
    }

    // Deduct credit
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
      trigger: "products/update",
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
    return new Response();
  }
};
