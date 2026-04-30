/**
 * GDPR Compliance Webhook: customers/data_request
 *
 * Triggered when a customer requests their data (GDPR Article 15).
 * VisionTags does NOT store customer personal data - we only process
 * product images and metadata. This webhook acknowledges the request
 * and returns an empty response since no customer data exists.
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
      route: "customers.data_request",
      error: error instanceof Error ? error.message : String(error),
    });
    Sentry.captureException(error, {
      tags: { service: "webhook", route: "customers.data_request", phase: "auth" },
    });
    return new Response(null, { status: 200 });
  }

  logger.info("WEBHOOK_RECEIVED", { shop, topic });
  logger.info("GDPR_DATA_REQUEST", { shop, result: "no_customer_data_stored" });

  return new Response(null, { status: 200 });
};
