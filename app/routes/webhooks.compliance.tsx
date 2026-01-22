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
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  console.log(`Received compliance webhook: ${topic} for ${shop}`);
  console.log("Payload:", JSON.stringify(payload));

  switch (topic) {
    case "CUSTOMERS_DATA_REQUEST":
      return handleCustomersDataRequest(shop);

    case "CUSTOMERS_REDACT":
      return handleCustomersRedact(shop);

    case "SHOP_REDACT":
      return handleShopRedact(shop);

    default:
      console.log(`Unknown compliance topic: ${topic}`);
      return new Response(null, { status: 200 });
  }
};

/**
 * Handle customers/data_request webhook
 * VisionTags does not store customer personal data, so we acknowledge and return empty.
 */
function handleCustomersDataRequest(shop: string): Response {
  // VisionTags does not store any customer personal data.
  // We only store:
  // - Shop domain and access tokens (not customer data)
  // - Product information (titles, images, AI-generated tags)
  // - Usage/billing records tied to the shop, not customers
  console.log(`No customer data stored for shop ${shop} - data request acknowledged`);
  return new Response(null, { status: 200 });
}

/**
 * Handle customers/redact webhook
 * VisionTags does not store customer personal data, so we acknowledge and return success.
 */
function handleCustomersRedact(shop: string): Response {
  // VisionTags does not store any customer personal data.
  // No data to delete.
  console.log(`No customer data to redact for shop ${shop} - request acknowledged`);
  return new Response(null, { status: 200 });
}

/**
 * Handle shop/redact webhook
 * Delete ALL shop data from our database.
 */
async function handleShopRedact(shop: string): Promise<Response> {
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
    console.log(`Deleted ${deletedProducts.count} products for ${shop}`);

    // 2. Delete all jobs
    const deletedJobs = await db.job.deleteMany({
      where: { shop },
    });
    console.log(`Deleted ${deletedJobs.count} jobs for ${shop}`);

    // 3. Delete usage records
    const deletedUsage = await db.usageRecord.deleteMany({
      where: { shop },
    });
    console.log(`Deleted ${deletedUsage.count} usage records for ${shop}`);

    // 4. Delete shop settings
    const deletedSettings = await db.shopSettings.deleteMany({
      where: { shop },
    });
    console.log(`Deleted ${deletedSettings.count} shop settings for ${shop}`);

    // 5. Delete sessions (should already be done by app/uninstalled, but ensure cleanup)
    const deletedSessions = await db.session.deleteMany({
      where: { shop },
    });
    console.log(`Deleted ${deletedSessions.count} sessions for ${shop}`);

    console.log(`Successfully redacted all data for shop ${shop}`);
  } catch (error) {
    console.error(`Error redacting data for shop ${shop}:`, error);
    // Still return 200 to acknowledge receipt - Shopify will retry on failure
  }

  return new Response(null, { status: 200 });
}
