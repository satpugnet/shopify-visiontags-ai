/**
 * Products Delete Webhook Handler
 *
 * Cleans up orphaned product records when products are deleted from Shopify.
 */

import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

interface ProductDeletePayload {
  id: number;
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  try {
    console.log(`[VisionTags] Received ${topic} webhook for ${shop}`);

    const productData = payload as ProductDeletePayload;
    const productId = `gid://shopify/Product/${productData.id}`;

    // Delete all product records with this Shopify product ID
    // Note: We use startsWith because re-analysis creates IDs like "gid://.../{id}-{timestamp}"
    const deleted = await prisma.product.deleteMany({
      where: {
        OR: [
          { id: productId },
          { id: { startsWith: `${productId}-` } },
        ],
        job: {
          shop: shop,
        },
      },
    });

    if (deleted.count > 0) {
      console.log(`[VisionTags] Deleted ${deleted.count} product record(s) for ${productId} in ${shop}`);
    }

    return new Response();
  } catch (error) {
    console.error(`[VisionTags] Error handling ${topic} webhook for ${shop}:`, error);
    return new Response();
  }
};
