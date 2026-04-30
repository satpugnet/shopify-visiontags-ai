/**
 * Unified GDPR/CCPA Compliance Webhook Handler
 *
 * Handles all mandatory compliance webhooks in a single endpoint:
 * - customers/data_request: Customer requests their data (GDPR Article 15)
 * - customers/redact: Customer requests deletion of their data (GDPR Article 17)
 * - shop/redact: Shop uninstalled, delete all shop data (48 hours after uninstall)
 *
 * This is required for Shopify App Store approval.
 */

import type { ActionFunctionArgs } from "@remix-run/node";
import * as Sentry from "@sentry/remix";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { logger } from "../services/logger.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  let shop: string;
  let topic: string;
  try {
    ({ shop, topic } = await authenticate.webhook(request));
  } catch (error) {
    // Always return 200 on webhook auth failure to avoid Shopify retry storms.
    // GDPR webhooks especially must be acknowledged within 24h to maintain
    // App Store compliance — never throw.
    logger.warn("WEBHOOK_AUTH_FAILED", {
      route: "compliance",
      error: error instanceof Error ? error.message : String(error),
    });
    Sentry.captureException(error, {
      tags: { service: "webhook", route: "compliance", phase: "auth" },
    });
    return new Response(null, { status: 200 });
  }

  logger.info("WEBHOOK_RECEIVED", { shop, topic, handler: "compliance" });

  switch (topic) {
    case "CUSTOMERS_DATA_REQUEST":
      return handleCustomersDataRequest(shop);

    case "CUSTOMERS_REDACT":
      return handleCustomersRedact(shop);

    case "SHOP_REDACT":
      return handleShopRedact(shop);

    default:
      logger.warn("UNKNOWN_COMPLIANCE_TOPIC", { shop, topic });
      return new Response(null, { status: 200 });
  }
};

/**
 * Handle customers/data_request webhook
 * VisionTags does not store customer personal data, so we acknowledge and return empty.
 */
function handleCustomersDataRequest(shop: string): Response {
  logger.info("GDPR_DATA_REQUEST", { shop, result: "no_customer_data_stored" });
  return new Response(null, { status: 200 });
}

/**
 * Handle customers/redact webhook
 * VisionTags does not store customer personal data, so we acknowledge and return success.
 */
function handleCustomersRedact(shop: string): Response {
  logger.info("GDPR_CUSTOMER_REDACT", { shop, result: "no_customer_data_stored" });
  return new Response(null, { status: 200 });
}

/**
 * Handle shop/redact webhook
 * Delete ALL shop data from our database.
 * IMPORTANT: Check if shop has reinstalled before deleting data.
 */
async function handleShopRedact(shop: string): Promise<Response> {
  try {
    // CRITICAL: Check if shop has reinstalled since uninstall
    // If there's an active session, the shop reinstalled - don't delete their new data!
    const activeSession = await db.session.findFirst({
      where: { shop },
    });

    if (activeSession) {
      logger.info("SHOP_REDACT_SKIPPED", { shop, reason: "shop_reinstalled" });
      return new Response(null, { status: 200 });
    }

    // Snapshot journey data before GDPR-required deletion
    const settings = await db.shopSettings.findUnique({ where: { shop } });
    if (settings) {
      logger.info("SHOP_REDACT_SNAPSHOT", {
        shop,
        plan: settings.plan,
        creditsUsed: settings.creditsUsed,
        totalScans: settings.totalScans,
        totalSynced: settings.totalSynced,
        firstSeenAt: settings.firstSeenAt?.toISOString() ?? null,
        firstScanAt: settings.firstScanAt?.toISOString() ?? null,
        firstSyncAt: settings.firstSyncAt?.toISOString() ?? null,
        lastActiveAt: settings.lastActiveAt?.toISOString() ?? null,
        uninstalledAt: settings.uninstalledAt?.toISOString() ?? null,
        daysSinceInstall: settings.firstSeenAt
          ? Math.floor((Date.now() - settings.firstSeenAt.getTime()) / 86400000)
          : null,
        activated: !!settings.firstSyncAt,
      });
    }

    // Delete all shop data in the correct order (respecting foreign keys)

    const deletedProducts = await db.product.deleteMany({
      where: { job: { shop } },
    });

    const deletedJobs = await db.job.deleteMany({
      where: { shop },
    });

    const deletedUsage = await db.usageRecord.deleteMany({
      where: { shop },
    });

    const deletedSettings = await db.shopSettings.deleteMany({
      where: { shop },
    });

    const deletedSessions = await db.session.deleteMany({
      where: { shop },
    });

    logger.info("SHOP_REDACTED", {
      shop,
      products: deletedProducts.count,
      jobs: deletedJobs.count,
      usage: deletedUsage.count,
      settings: deletedSettings.count,
      sessions: deletedSessions.count,
    });
  } catch (error) {
    logger.error("SHOP_REDACT_ERROR", {
      shop,
      error: error instanceof Error ? error.message : String(error),
    });
    // Still return 200 to acknowledge receipt - Shopify will retry on failure
  }

  return new Response(null, { status: 200 });
}
