/**
 * Script to add complete sample products with inventory, variants, and pricing
 * Run with: DATABASE_URL=$(grep DATABASE_URL .env | cut -d '=' -f2-) npx tsx scripts/add-complete-products.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// More comprehensive sample products
const SAMPLE_PRODUCTS = [
  {
    title: "Premium Cotton Hoodie",
    description: "<p>Ultra-soft premium cotton hoodie with kangaroo pocket. Perfect for layering or wearing on its own.</p><ul><li>100% organic cotton</li><li>Relaxed fit</li><li>Machine washable</li></ul>",
    vendor: "VisionTags Apparel",
    productType: "Hoodies",
    tags: ["cotton", "hoodie", "casual", "unisex", "bestseller"],
    image: "https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=800",
    price: "59.99",
    compareAtPrice: "79.99",
  },
  {
    title: "Vintage Graphic Tee",
    description: "<p>Retro-inspired graphic t-shirt with distressed print. A wardrobe essential.</p>",
    vendor: "VisionTags Apparel",
    productType: "T-Shirts",
    tags: ["vintage", "graphic", "cotton", "casual"],
    image: "https://images.unsplash.com/photo-1503341504253-dff4815485f1?w=800",
    price: "34.99",
    compareAtPrice: null,
  },
  {
    title: "Slim Fit Chinos",
    description: "<p>Modern slim fit chinos in stretch cotton twill. Versatile enough for work or weekend.</p>",
    vendor: "VisionTags Apparel",
    productType: "Pants",
    tags: ["chinos", "slim fit", "cotton", "smart casual"],
    image: "https://images.unsplash.com/photo-1473966968600-fa801b869a1a?w=800",
    price: "69.99",
    compareAtPrice: "89.99",
  },
  {
    title: "Oversized Blazer",
    description: "<p>Contemporary oversized blazer with structured shoulders. Elevate any outfit instantly.</p>",
    vendor: "VisionTags Apparel",
    productType: "Blazers",
    tags: ["blazer", "oversized", "formal", "women"],
    image: "https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=800",
    price: "149.99",
    compareAtPrice: "199.99",
  },
  {
    title: "Athletic Performance Tank",
    description: "<p>Moisture-wicking tank top for high-intensity workouts. Stay cool and dry.</p>",
    vendor: "VisionTags Active",
    productType: "Activewear",
    tags: ["athletic", "tank top", "performance", "gym"],
    image: "https://images.unsplash.com/photo-1571902943202-507ec2618e8f?w=800",
    price: "29.99",
    compareAtPrice: null,
  },
  {
    title: "Cashmere Blend Cardigan",
    description: "<p>Luxuriously soft cashmere blend cardigan. Timeless elegance for cooler days.</p>",
    vendor: "VisionTags Premium",
    productType: "Sweaters",
    tags: ["cashmere", "cardigan", "luxury", "winter"],
    image: "https://images.unsplash.com/photo-1434389677669-e08b4cac3105?w=800",
    price: "189.99",
    compareAtPrice: "249.99",
  },
  {
    title: "Distressed Skinny Jeans",
    description: "<p>Fashion-forward distressed jeans with authentic worn-in details.</p>",
    vendor: "VisionTags Denim",
    productType: "Jeans",
    tags: ["denim", "skinny", "distressed", "trendy"],
    image: "https://images.unsplash.com/photo-1542272604-787c3835535d?w=800",
    price: "79.99",
    compareAtPrice: null,
  },
  {
    title: "Pleated Midi Skirt",
    description: "<p>Elegant pleated midi skirt in flowing fabric. Perfect for day to night transitions.</p>",
    vendor: "VisionTags Apparel",
    productType: "Skirts",
    tags: ["pleated", "midi", "elegant", "women"],
    image: "https://images.unsplash.com/photo-1583496661160-fb5886a0uj88?w=800",
    price: "54.99",
    compareAtPrice: "69.99",
  },
  {
    title: "Puffer Jacket",
    description: "<p>Lightweight yet warm puffer jacket with water-resistant shell. Essential winter outerwear.</p>",
    vendor: "VisionTags Outerwear",
    productType: "Jackets",
    tags: ["puffer", "winter", "water-resistant", "warm"],
    image: "https://images.unsplash.com/photo-1544923246-77307dd628b4?w=800",
    price: "129.99",
    compareAtPrice: "169.99",
  },
  {
    title: "Leather Belt",
    description: "<p>Genuine leather belt with brushed metal buckle. A timeless accessory.</p>",
    vendor: "VisionTags Accessories",
    productType: "Accessories",
    tags: ["leather", "belt", "accessory", "classic"],
    image: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=800",
    price: "44.99",
    compareAtPrice: null,
  },
  {
    title: "Wrap Maxi Dress",
    description: "<p>Flattering wrap silhouette maxi dress. Effortlessly chic for any occasion.</p>",
    vendor: "VisionTags Apparel",
    productType: "Dresses",
    tags: ["wrap", "maxi", "elegant", "women", "summer"],
    image: "https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=800",
    price: "89.99",
    compareAtPrice: "119.99",
  },
  {
    title: "Quilted Crossbody Bag",
    description: "<p>Sophisticated quilted crossbody bag with chain strap. Compact yet spacious.</p>",
    vendor: "VisionTags Accessories",
    productType: "Bags",
    tags: ["quilted", "crossbody", "bag", "women"],
    image: "https://images.unsplash.com/photo-1566150905458-1bf1fc113f0d?w=800",
    price: "74.99",
    compareAtPrice: "99.99",
  },
  {
    title: "Wool Fedora Hat",
    description: "<p>Classic wool fedora with grosgrain ribbon trim. Make a statement.</p>",
    vendor: "VisionTags Accessories",
    productType: "Hats",
    tags: ["wool", "fedora", "hat", "classic"],
    image: "https://images.unsplash.com/photo-1514327605112-b887c0e61c0a?w=800",
    price: "49.99",
    compareAtPrice: null,
  },
  {
    title: "Chunky Knit Beanie",
    description: "<p>Cozy chunky knit beanie to keep you warm in style.</p>",
    vendor: "VisionTags Accessories",
    productType: "Hats",
    tags: ["knit", "beanie", "winter", "cozy"],
    image: "https://images.unsplash.com/photo-1576871337622-98d48d1cf531?w=800",
    price: "24.99",
    compareAtPrice: "34.99",
  },
  {
    title: "Lace-Up Oxford Shoes",
    description: "<p>Classic leather oxford shoes with brogue detailing. Timeless sophistication.</p>",
    vendor: "VisionTags Footwear",
    productType: "Shoes",
    tags: ["leather", "oxford", "formal", "classic"],
    image: "https://images.unsplash.com/photo-1614252369475-531eba835eb1?w=800",
    price: "139.99",
    compareAtPrice: "179.99",
  },
  {
    title: "Platform Sandals",
    description: "<p>Trendy platform sandals with adjustable ankle strap. Summer ready.</p>",
    vendor: "VisionTags Footwear",
    productType: "Sandals",
    tags: ["platform", "sandals", "summer", "women"],
    image: "https://images.unsplash.com/photo-1603487742131-4160ec999306?w=800",
    price: "64.99",
    compareAtPrice: null,
  },
  {
    title: "Aviator Sunglasses",
    description: "<p>Classic aviator sunglasses with polarized lenses. UV400 protection.</p>",
    vendor: "VisionTags Accessories",
    productType: "Sunglasses",
    tags: ["aviator", "sunglasses", "polarized", "classic"],
    image: "https://images.unsplash.com/photo-1511499767150-a48a237f0083?w=800",
    price: "89.99",
    compareAtPrice: "119.99",
  },
  {
    title: "Silk Necktie",
    description: "<p>Luxurious silk necktie with subtle pattern. Elevate your formal look.</p>",
    vendor: "VisionTags Accessories",
    productType: "Ties",
    tags: ["silk", "tie", "formal", "men"],
    image: "https://images.unsplash.com/photo-1589756823695-278bc923f962?w=800",
    price: "59.99",
    compareAtPrice: null,
  },
  {
    title: "Sports Bra",
    description: "<p>High-support sports bra for intense workouts. Breathable and comfortable.</p>",
    vendor: "VisionTags Active",
    productType: "Activewear",
    tags: ["sports bra", "athletic", "support", "women"],
    image: "https://images.unsplash.com/photo-1620799140408-edc6dcb6d633?w=800",
    price: "44.99",
    compareAtPrice: "54.99",
  },
  {
    title: "Cargo Joggers",
    description: "<p>Utility-inspired cargo joggers with multiple pockets. Style meets function.</p>",
    vendor: "VisionTags Apparel",
    productType: "Pants",
    tags: ["cargo", "joggers", "casual", "utility"],
    image: "https://images.unsplash.com/photo-1624378439575-d8705ad7ae80?w=800",
    price: "59.99",
    compareAtPrice: "79.99",
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
                variants(first: 1) {
                  edges {
                    node {
                      id
                    }
                  }
                }
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
            vendor: product.vendor,
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

  const createdProduct = data.data?.productCreate?.product;

  if (createdProduct) {
    // Update variant with price and inventory
    const variantId = createdProduct.variants?.edges?.[0]?.node?.id;
    if (variantId) {
      await updateVariant(shop, accessToken, variantId, product);
    }
  }

  return createdProduct;
}

async function updateVariant(
  shop: string,
  accessToken: string,
  variantId: string,
  product: (typeof SAMPLE_PRODUCTS)[0]
) {
  // Update price
  await fetch(
    `https://${shop}/admin/api/2025-01/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken,
      },
      body: JSON.stringify({
        query: `
          mutation productVariantUpdate($input: ProductVariantInput!) {
            productVariantUpdate(input: $input) {
              productVariant {
                id
                price
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
            id: variantId,
            price: product.price,
            compareAtPrice: product.compareAtPrice,
          },
        },
      }),
    }
  );

  // Get inventory item ID and set inventory
  const variantResponse = await fetch(
    `https://${shop}/admin/api/2025-01/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken,
      },
      body: JSON.stringify({
        query: `
          query getVariant($id: ID!) {
            productVariant(id: $id) {
              inventoryItem {
                id
              }
            }
          }
        `,
        variables: { id: variantId },
      }),
    }
  );

  const variantData = await variantResponse.json();
  const inventoryItemId = variantData.data?.productVariant?.inventoryItem?.id;

  if (inventoryItemId) {
    // Get location ID
    const locationResponse = await fetch(
      `https://${shop}/admin/api/2025-01/graphql.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": accessToken,
        },
        body: JSON.stringify({
          query: `{ locations(first: 1) { edges { node { id } } } }`,
        }),
      }
    );

    const locationData = await locationResponse.json();
    const locationId = locationData.data?.locations?.edges?.[0]?.node?.id;

    if (locationId) {
      // Set inventory quantity (random between 10-100)
      const quantity = Math.floor(Math.random() * 90) + 10;

      await fetch(
        `https://${shop}/admin/api/2025-01/graphql.json`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": accessToken,
          },
          body: JSON.stringify({
            query: `
              mutation inventorySetOnHandQuantities($input: InventorySetOnHandQuantitiesInput!) {
                inventorySetOnHandQuantities(input: $input) {
                  userErrors {
                    field
                    message
                  }
                }
              }
            `,
            variables: {
              input: {
                reason: "correction",
                setQuantities: [
                  {
                    inventoryItemId,
                    locationId,
                    quantity,
                  },
                ],
              },
            },
          }),
        }
      );
    }
  }
}

async function main() {
  const session = await prisma.session.findFirst({
    where: { shop: 'visiontags-dev.myshopify.com' }
  });

  if (!session) {
    console.error("No session found in database");
    return;
  }

  console.log(`Using shop: ${session.shop}`);
  console.log(`Creating ${SAMPLE_PRODUCTS.length} complete products with pricing & inventory...\n`);

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
        console.log(`✓ Created: ${result.title} ($${product.price})`);
        created++;
      } else {
        console.log(`✗ Failed: ${product.title}`);
        failed++;
      }
    } catch (error) {
      console.error(`✗ Error: ${product.title}`, error);
      failed++;
    }

    // Small delay to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 800));
  }

  console.log(`\nDone! Created ${created} products, ${failed} failed.`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
