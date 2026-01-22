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

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);
  console.log("Customer data request payload:", JSON.stringify(payload));

  // VisionTags does not store any customer personal data.
  // We only store:
  // - Shop domain and access tokens (not customer data)
  // - Product information (titles, images, AI-generated tags)
  // - Usage/billing records tied to the shop, not customers
  //
  // Therefore, we acknowledge the request but have no customer data to return.
  // In a real scenario where you store customer data, you would:
  // 1. Query your database for the customer's data
  // 2. Format it appropriately
  // 3. Send it to the shop owner via the provided email

  console.log(`No customer data stored for shop ${shop} - request acknowledged`);

  return new Response(null, { status: 200 });
};
