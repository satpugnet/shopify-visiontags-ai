/**
 * Products Update Webhook Handler
 *
 * Re-analyzes products when their images change (Pro feature with auto-sync).
 */

import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { queueProductAnalysis } from "../services/queue.server";
import { hasAvailableCredits, useCredits } from "../services/billing.server";

interface ProductUpdatePayload {
  id: number;
  title: string;
  product_type: string;
  tags: string;
  image?: {
    src: string;
  } | null;
  images?: Array<{
    src: string;
  }>;
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  try {
    console.log(`[VisionTags] Received ${topic} webhook for ${shop}`);

    const productData = payload as ProductUpdatePayload;
    const productId = `gid://shopify/Product/${productData.id}`;

    // Check if shop has auto-sync enabled
    const settings = await prisma.shopSettings.findUnique({
      where: { shop },
    });

    if (!settings?.autoSyncNewProducts) {
      console.log(`[VisionTags] Auto-sync disabled for ${shop}, skipping product update`);
      return new Response();
    }

    // Get the primary image
    const imageUrl = productData.image?.src || productData.images?.[0]?.src;
    if (!imageUrl) {
      console.log(`[VisionTags] Product ${productData.id} has no image, skipping`);
      return new Response();
    }

    // Check if this product was previously analyzed
    const existingProduct = await prisma.product.findFirst({
      where: { id: productId },
      orderBy: { createdAt: "desc" },
    });

    // Only re-analyze if the image changed
    if (existingProduct && existingProduct.imageUrl === imageUrl) {
      console.log(`[VisionTags] Product ${productData.id} image unchanged, skipping`);
      return new Response();
    }

    // Check credits
    const creditCheck = await hasAvailableCredits(shop, 1);
    if (!creditCheck.allowed) {
      console.log(`[VisionTags] Shop ${shop} has no credits, skipping auto-sync`);
      return new Response();
    }

    // Create a new job for this product update
    const job = await prisma.job.create({
      data: {
        shop,
        status: "QUEUED",
        totalItems: 1,
      },
    });

    // Create product record
    await prisma.product.create({
      data: {
        id: `${productId}-${crypto.randomUUID()}`, // Unique ID for re-analysis
        jobId: job.id,
        title: productData.title,
        imageUrl: imageUrl,
        currentCategory: productData.product_type,
        currentTags: productData.tags,
        status: "PENDING",
      },
    });

    // Queue for processing
    try {
      await queueProductAnalysis(job.id, productId, imageUrl, shop);
    } catch (queueError) {
      console.error(`[VisionTags] Failed to queue product update ${productId}:`, queueError);
      await prisma.job.delete({ where: { id: job.id } }).catch(() => {});
      return new Response();
    }

    // Deduct credit
    try {
      await useCredits(shop, 1);
    } catch (creditError) {
      console.error(`[VisionTags] Failed to deduct credit for ${shop}:`, creditError);
    }

    console.log(`[VisionTags] Queued re-analysis for updated product ${productId} in ${shop}`);

    return new Response();
  } catch (error) {
    console.error(`[VisionTags] Error handling ${topic} webhook for ${shop}:`, error);
    return new Response();
  }
};
