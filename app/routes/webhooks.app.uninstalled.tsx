import type { ActionFunctionArgs } from "@remix-run/node";
import * as Sentry from "@sentry/remix";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { logger } from "../services/logger.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, session, topic } = await authenticate.webhook(request);

  try {
    logger.info("WEBHOOK_RECEIVED", { shop, topic });

    // Snapshot the merchant's journey state before cleanup
    const settings = await db.shopSettings.findUnique({ where: { shop } });
    if (settings) {
      // Mark as uninstalled (preserve ShopSettings for analytics)
      await db.shopSettings.update({
        where: { shop },
        data: { uninstalledAt: new Date() },
      });

      logger.info("SHOP_UNINSTALLED_SNAPSHOT", {
        shop,
        plan: settings.plan,
        creditsUsed: settings.creditsUsed,
        totalScans: settings.totalScans,
        totalSynced: settings.totalSynced,
        firstSeenAt: settings.firstSeenAt?.toISOString() ?? null,
        firstScanAt: settings.firstScanAt?.toISOString() ?? null,
        firstSyncAt: settings.firstSyncAt?.toISOString() ?? null,
        lastActiveAt: settings.lastActiveAt?.toISOString() ?? null,
        daysSinceInstall: settings.firstSeenAt
          ? Math.floor((Date.now() - settings.firstSeenAt.getTime()) / 86400000)
          : null,
        activated: !!settings.firstSyncAt,
      });
    }

    // Delete sessions (auth tokens) but keep ShopSettings for analytics
    if (session) {
      const deleted = await db.session.deleteMany({ where: { shop } });
      logger.info("SHOP_UNINSTALLED", { shop, sessionsDeleted: deleted.count });
    } else {
      logger.info("SHOP_UNINSTALLED", { shop, sessionsDeleted: 0, duplicate: true });
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
    // Always return 200 to prevent Shopify retries
    return new Response();
  }
};
