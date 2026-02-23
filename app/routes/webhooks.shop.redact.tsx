/**
 * GDPR Compliance Webhook: shop/redact
 *
 * Triggered 48 hours after a shop uninstalls the app.
 * This webhook requires deletion of ALL shop data from our systems.
 * This is a mandatory compliance requirement for Shopify App Store.
 */

import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { logger } from "../services/logger.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  logger.info("WEBHOOK_RECEIVED", { shop, topic });

  try {
    // Delete all shop data in the correct order (respecting foreign keys)

    // 1. Delete all products (references jobs)
    const deletedProducts = await db.product.deleteMany({
      where: {
        job: {
          shop: shop,
        },
      },
    });
    logger.info("SHOP_REDACT_PROGRESS", { shop, entity: "products", count: deletedProducts.count });

    // 2. Delete all jobs
    const deletedJobs = await db.job.deleteMany({
      where: { shop },
    });
    logger.info("SHOP_REDACT_PROGRESS", { shop, entity: "jobs", count: deletedJobs.count });

    // 3. Delete usage records
    const deletedUsage = await db.usageRecord.deleteMany({
      where: { shop },
    });
    logger.info("SHOP_REDACT_PROGRESS", { shop, entity: "usage_records", count: deletedUsage.count });

    // 4. Delete shop settings
    const deletedSettings = await db.shopSettings.deleteMany({
      where: { shop },
    });
    logger.info("SHOP_REDACT_PROGRESS", { shop, entity: "shop_settings", count: deletedSettings.count });

    // 5. Delete sessions (should already be done by app/uninstalled, but ensure cleanup)
    const deletedSessions = await db.session.deleteMany({
      where: { shop },
    });
    logger.info("SHOP_REDACT_PROGRESS", { shop, entity: "sessions", count: deletedSessions.count });

    logger.info("SHOP_REDACTED", { shop });
  } catch (error) {
    logger.error("SHOP_REDACT_ERROR", {
      shop,
      error: error instanceof Error ? error.message : String(error),
    });
    // Still return 200 to acknowledge receipt - Shopify will retry on failure
  }

  return new Response(null, { status: 200 });
};
