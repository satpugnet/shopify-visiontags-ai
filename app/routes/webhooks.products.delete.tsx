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
  const { shop, topic, payload } = await authenticate.webhook(request);

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
