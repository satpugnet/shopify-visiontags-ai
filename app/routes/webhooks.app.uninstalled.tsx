import type { ActionFunctionArgs } from "@remix-run/node";
import * as Sentry from "@sentry/remix";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { logger } from "../services/logger.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, session, topic } = await authenticate.webhook(request);

  try {
    logger.info("WEBHOOK_RECEIVED", { shop, topic });

    // Webhook requests can trigger multiple times and after an app has already been uninstalled.
    // If this webhook already ran, the session may have been deleted previously.
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
