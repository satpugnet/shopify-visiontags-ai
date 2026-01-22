/**
 * Script to add sample products to the dev store for testing
 * Run with: DATABASE_URL=$(grep DATABASE_URL .env | cut -d '=' -f2-) npx tsx scripts/add-sample-products.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Sample products with Unsplash images (free to use)
const SAMPLE_PRODUCTS = [
  {
    title: "Classic White T-Shirt",
    description: "A comfortable cotton t-shirt perfect for everyday wear.",
    productType: "Shirts",
    tags: ["cotton", "casual", "basics"],
    image: "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=800",
  },
  {
    title: "Blue Denim Jacket",
    description: "Vintage-style denim jacket with a modern fit.",
    productType: "Outerwear",
    tags: ["denim", "jacket", "vintage"],
    image: "https://images.unsplash.com/photo-1551028719-00167b16eac5?w=800",
  },
  {
    title: "Black Leather Boots",
    description: "Premium leather boots for a stylish look.",
    productType: "Footwear",
    tags: ["leather", "boots", "formal"],
    image: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=800",
  },
  {
    title: "Floral Summer Dress",
    description: "Light and breezy floral print dress for summer days.",
    productType: "Dresses",
    tags: ["floral", "summer", "women"],
    image: "https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?w=800",
  },
  {
    title: "Wool Knit Sweater",
    description: "Cozy wool sweater for cold weather.",
    productType: "Sweaters",
    tags: ["wool", "knit", "winter"],
    image: "https://images.unsplash.com/photo-1434389677669-e08b4cac3105?w=800",
  },
  {
    title: "Canvas Sneakers",
    description: "Classic canvas sneakers in navy blue.",
    productType: "Footwear",
    tags: ["canvas", "sneakers", "casual"],
    image: "https://images.unsplash.com/photo-1525966222134-fcfa99b8ae77?w=800",
  },
  {
    title: "Striped Polo Shirt",
    description: "Smart casual polo with horizontal stripes.",
    productType: "Shirts",
    tags: ["polo", "striped", "smart casual"],
    image: "https://images.unsplash.com/photo-1586363104862-3a5e2ab60d99?w=800",
  },
  {
    title: "High-Waist Jeans",
    description: "Classic high-waist denim jeans.",
    productType: "Pants",
    tags: ["denim", "jeans", "high-waist"],
    image: "https://images.unsplash.com/photo-1541099649105-f69ad21f3246?w=800",
  },
  {
    title: "Silk Scarf",
    description: "Elegant silk scarf with abstract pattern.",
    productType: "Accessories",
    tags: ["silk", "scarf", "elegant"],
    image: "https://images.unsplash.com/photo-1601370690183-1c7796ecec61?w=800",
  },
  {
    title: "Leather Crossbody Bag",
    description: "Compact leather bag for daily essentials.",
    productType: "Accessories",
    tags: ["leather", "bag", "crossbody"],
    image: "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=800",
  },
  {
    title: "Running Shorts",
    description: "Lightweight shorts for running and workouts.",
    productType: "Activewear",
    tags: ["shorts", "running", "athletic"],
    image: "https://images.unsplash.com/photo-1591195853828-11db59a44f6b?w=800",
  },
  {
    title: "Linen Button-Up Shirt",
    description: "Breathable linen shirt for hot weather.",
    productType: "Shirts",
    tags: ["linen", "summer", "casual"],
    image: "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=800",
  },
];

async function createProduct(
  shop: string,
  accessToken: string,
  product: (typeof SAMPLE_PRODUCTS)[0]
) {
  const response = await fetch(
    `https://${shop}/admin/api/2025-01/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken,
      },
      body: JSON.stringify({
        query: `
          mutation createProduct($input: ProductInput!, $media: [CreateMediaInput!]) {
            productCreate(input: $input, media: $media) {
              product {
                id
                title
              }
              userErrors {
                field
                message
              }
            }
          }
        `,
        variables: {
          input: {
            title: product.title,
            descriptionHtml: product.description,
            productType: product.productType,
            tags: product.tags,
            status: "ACTIVE",
          },
          media: [
            {
              originalSource: product.image,
              mediaContentType: "IMAGE",
            },
          ],
        },
      }),
    }
  );

  const data = await response.json();

  if (data.data?.productCreate?.userErrors?.length > 0) {
    console.error(
      `Error creating ${product.title}:`,
      data.data.productCreate.userErrors
    );
    return null;
  }

  return data.data?.productCreate?.product;
}

async function main() {
  // Get session from database
  const session = await prisma.session.findFirst();

  if (!session) {
    console.error("No session found in database");
    return;
  }

  console.log(`Using shop: ${session.shop}`);
  console.log(`Creating ${SAMPLE_PRODUCTS.length} sample products...\n`);

  let created = 0;
  let failed = 0;

  for (const product of SAMPLE_PRODUCTS) {
    try {
      const result = await createProduct(
        session.shop,
        session.accessToken,
        product
      );
      if (result) {
        console.log(`✓ Created: ${result.title}`);
        created++;
      } else {
        failed++;
      }
    } catch (error) {
      console.error(`✗ Failed: ${product.title}`, error);
      failed++;
    }

    // Small delay to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  console.log(`\nDone! Created ${created} products, ${failed} failed.`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
