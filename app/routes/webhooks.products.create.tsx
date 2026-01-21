import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { queueProductAnalysis } from "../services/queue.server";
import { hasAvailableCredits, useCredits } from "../services/billing.server";

interface ProductCreatePayload {
  id: number;
  title: string;
  product_type: string;
  tags: string;
  image?: {
    src: string;
  } | null;
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  const productData = payload as ProductCreatePayload;

  // Check if shop has auto-sync enabled
  const settings = await prisma.shopSettings.findUnique({
    where: { shop },
  });

  if (!settings?.autoSyncNewProducts) {
    console.log(`Auto-sync disabled for ${shop}, skipping`);
    return new Response();
  }

  // Check if product has an image
  if (!productData.image?.src) {
    console.log(`Product ${productData.id} has no image, skipping`);
    return new Response();
  }

  // Check credits
  const hasCredits = await hasAvailableCredits(shop);
  if (!hasCredits) {
    console.log(`Shop ${shop} has no credits, skipping auto-sync`);
    return new Response();
  }

  // Create a job for this single product
  const productId = `gid://shopify/Product/${productData.id}`;

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
      id: productId,
      jobId: job.id,
      title: productData.title,
      imageUrl: productData.image.src,
      currentCategory: productData.product_type,
      currentTags: productData.tags,
      status: "PENDING",
    },
  });

  // Queue for processing
  await queueProductAnalysis(job.id, productId, productData.image.src, shop);

  // Use credit
  await useCredits(shop, 1);

  console.log(`Queued auto-analysis for new product ${productId} in ${shop}`);

  return new Response();
};
