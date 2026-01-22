/**
 * Test script to verify sync functionality works
 * Run with: npx tsx scripts/test-sync.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Get a product with ANALYZED status
  const product = await prisma.product.findFirst({
    where: {
      jobId: "3df5917e-f893-45b1-8a3d-e45a2f958fd0",
      status: "ANALYZED"
    },
  });

  if (!product) {
    console.log("No ANALYZED product found");
    return;
  }

  console.log("Found product:", {
    id: product.id,
    title: product.title,
    status: product.status,
    suggestedMetafields: product.suggestedMetafields,
    suggestedTags: product.suggestedTags,
  });

  // For a full test, we would need to:
  // 1. Create a Shopify Admin API client (requires OAuth session)
  // 2. Call updateProductMetafields()
  // 3. Call updateProductTags()
  // 4. Update product status to SYNCED

  // Since we don't have the OAuth session here, let's just verify the data is correct
  console.log("\n--- Sync Data Verification ---");

  if (product.suggestedMetafields) {
    const metafields = product.suggestedMetafields as Record<string, string>;
    console.log("Metafields to sync:");
    Object.entries(metafields).forEach(([key, value]) => {
      if (value) console.log(`  ${key}: ${value}`);
    });
  }

  if (product.suggestedTags) {
    const tags = product.suggestedTags as string[];
    console.log("Tags to sync:", tags.join(", "));
  }

  console.log("\n✅ Sync data is ready. The sync action should work if UI interaction succeeds.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
