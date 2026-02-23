/**
 * GDPR Compliance Webhook: customers/data_request
 *
 * Triggered when a customer requests their data (GDPR Article 15).
 * VisionTags does NOT store customer personal data - we only process
 * product images and metadata. This webhook acknowledges the request
 * and returns an empty response since no customer data exists.
 */

import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { logger } from "../services/logger.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);

  logger.info("WEBHOOK_RECEIVED", { shop, topic });
  logger.info("GDPR_DATA_REQUEST", { shop, result: "no_customer_data_stored" });

  return new Response(null, { status: 200 });
};
