/**
 * GDPR Compliance Webhook: customers/redact
 *
 * Triggered when a customer requests deletion of their data (GDPR Article 17).
 * VisionTags does NOT store customer personal data - we only process
 * product images and metadata. This webhook acknowledges the request
 * and returns success since no customer data exists to delete.
 */

import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);
  console.log("Customer redact payload:", JSON.stringify(payload));

  // VisionTags does not store any customer personal data.
  // We only store:
  // - Shop domain and access tokens (not customer data)
  // - Product information (titles, images, AI-generated tags)
  // - Usage/billing records tied to the shop, not customers
  //
  // Therefore, we acknowledge the request but have no customer data to delete.
  // In a real scenario where you store customer data, you would:
  // 1. Identify all data associated with the customer
  // 2. Delete or anonymize that data
  // 3. Log the deletion for compliance records

  console.log(`No customer data to redact for shop ${shop} - request acknowledged`);

  return new Response(null, { status: 200 });
};
