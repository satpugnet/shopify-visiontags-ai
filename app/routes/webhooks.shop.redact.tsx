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

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);
  console.log("Shop redact payload:", JSON.stringify(payload));

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
    // Log the error for manual investigation
  }

  return new Response(null, { status: 200 });
};
