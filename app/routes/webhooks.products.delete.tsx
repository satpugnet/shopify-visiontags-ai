/**
 * Products Delete Webhook Handler
 *
 * Cleans up orphaned product records when products are deleted from Shopify.
 */

import type { ActionFunctionArgs } from "@remix-run/node";
import * as Sentry from "@sentry/remix";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { logger } from "../services/logger.server";

interface ProductDeletePayload {
  id: number;
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
      route: "products.delete",
      error: error instanceof Error ? error.message : String(error),
    });
    Sentry.captureException(error, {
      tags: { service: "webhook", route: "products.delete", phase: "auth" },
    });
    return new Response();
  }

  try {
    logger.info("WEBHOOK_RECEIVED", { shop, topic });

    const productData = payload as ProductDeletePayload;
    const productId = `gid://shopify/Product/${productData.id}`;

    // Delete all product records with this Shopify product ID
    // Note: We use startsWith because re-analysis creates IDs like "gid://.../{id}-{uuid}"
    const deleted = await prisma.product.deleteMany({
      where: {
        OR: [
          { id: productId },
          { id: { startsWith: `${productId}-` } },
        ],
        job: {
          shop: shop,
        },
      },
    });

    if (deleted.count > 0) {
      logger.info("PRODUCT_RECORDS_DELETED", { shop, productId, count: deleted.count });
    }

    // Remove from the cross-run scan ledger so progress counts stay honest
    await prisma.scannedProduct.deleteMany({
      where: { shop, productId },
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
