/**
 * GDPR Compliance Webhook: customers/redact
 *
 * Triggered when a customer requests deletion of their data (GDPR Article 17).
 * VisionTags does NOT store customer personal data - we only process
 * product images and metadata. This webhook acknowledges the request
 * and returns success since no customer data exists to delete.
 */

import type { ActionFunctionArgs } from "@remix-run/node";
import * as Sentry from "@sentry/remix";
import { authenticate } from "../shopify.server";
import { logger } from "../services/logger.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  let shop: string;
  let topic: string;
  try {
    ({ shop, topic } = await authenticate.webhook(request));
  } catch (error) {
    // Always return 200 on webhook auth failure. GDPR webhooks especially
    // must be acknowledged within 24h to maintain App Store compliance.
    logger.warn("WEBHOOK_AUTH_FAILED", {
      route: "customers.redact",
      error: error instanceof Error ? error.message : String(error),
    });
    Sentry.captureException(error, {
      tags: { service: "webhook", route: "customers.redact", phase: "auth" },
    });
    return new Response(null, { status: 200 });
  }

  try {
    logger.info("WEBHOOK_RECEIVED", { shop, topic });
    logger.info("GDPR_CUSTOMER_REDACT", { shop, result: "no_customer_data_stored" });

    return new Response(null, { status: 200 });
  } catch (error) {
    logger.error("WEBHOOK_ERROR", {
      shop,
      topic,
      error: error instanceof Error ? error.message : String(error),
    });
    // Always return 200 to prevent Shopify retries
    return new Response(null, { status: 200 });
  }
};
