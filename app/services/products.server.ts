/**
 * Products Service - Shopify Product Operations
 * Handles fetching products, updating tags, and syncing data
 */

import type { AdminApiContext } from "@shopify/shopify-app-remix/server";

export interface ShopifyProduct {
  id: string;
  title: string;
  featuredImage?: {
    url: string;
  } | null;
  productType: string;
  tags: string[];
  category?: {
    name: string;
  } | null;
}

export interface ProductWithImage {
  id: string;
  title: string;
  imageUrl: string;
  category?: string;
  tags: string[];
}

/**
 * Fetch all products with images from a shop
 * Uses cursor-based pagination
 */
export async function fetchAllProducts(
  admin: AdminApiContext,
  limit: number = 250
): Promise<ProductWithImage[]> {
  const products: ProductWithImage[] = [];
  let hasNextPage = true;
  let cursor: string | null = null;

  while (hasNextPage && products.length < limit) {
    const response = await admin.graphql(
      `#graphql
      query getProducts($first: Int!, $after: String) {
        products(first: $first, after: $after) {
          edges {
            cursor
            node {
              id
              title
              featuredImage {
                url
              }
              productType
              tags
              category {
                name
              }
            }
          }
          pageInfo {
            hasNextPage
          }
        }
      }`,
      {
        variables: {
          first: Math.min(50, limit - products.length),
          after: cursor,
        },
      }
    );

    const data: any = await response.json();
    const edges: any[] = data.data?.products?.edges || [];
    const pageInfo = data.data?.products?.pageInfo;

    for (const edge of edges) {
      const product = edge.node as ShopifyProduct;

      // Only include products with images
      if (product.featuredImage?.url) {
        products.push({
          id: product.id,
          title: product.title,
          imageUrl: product.featuredImage.url,
          category: product.category?.name || product.productType,
          tags: product.tags,
        });
      }
    }

    hasNextPage = pageInfo?.hasNextPage || false;
    cursor = edges.length > 0 ? edges[edges.length - 1].cursor : null;
  }

  return products;
}

/**
 * Get a single product by ID
 */
export async function getProduct(
  admin: AdminApiContext,
  productId: string
): Promise<ProductWithImage | null> {
  const response = await admin.graphql(
    `#graphql
    query getProduct($id: ID!) {
      product(id: $id) {
        id
        title
        featuredImage {
          url
        }
        productType
        tags
        category {
          name
        }
      }
    }`,
    {
      variables: { id: productId },
    }
  );

  const data = await response.json();
  const product = data.data?.product as ShopifyProduct | null;

  if (!product || !product.featuredImage?.url) {
    return null;
  }

  return {
    id: product.id,
    title: product.title,
    imageUrl: product.featuredImage.url,
    category: product.category?.name || product.productType,
    tags: product.tags,
  };
}

/**
 * Update product tags
 */
export async function updateProductTags(
  admin: AdminApiContext,
  productId: string,
  tags: string[]
): Promise<{ success: boolean; error?: string }> {
  try {
    console.log(`[Tags] Setting ${tags.length} tags for ${productId}:`, tags);

    const response = await admin.graphql(
      `#graphql
      mutation productUpdate($product: ProductUpdateInput!) {
        productUpdate(product: $product) {
          product {
            id
            tags
          }
          userErrors {
            field
            message
          }
        }
      }`,
      {
        variables: {
          product: {
            id: productId,
            tags,
          },
        },
      }
    );

    const data = await response.json();

    console.log(`[Tags] API response for ${productId}:`, JSON.stringify(data, null, 2));

    if (data.data?.productUpdate?.userErrors?.length > 0) {
      const errors = data.data.productUpdate.userErrors
        .map((e: { message: string }) => e.message)
        .join(", ");
      console.error(`[Tags] Error for ${productId}:`, errors);
      return { success: false, error: errors };
    }

    const updatedTags = data.data?.productUpdate?.product?.tags || [];
    console.log(`[Tags] Successfully set ${updatedTags.length} tags for ${productId}`);

    return { success: true };
  } catch (error) {
    console.error("[Tags] Error updating tags:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Count total products in a shop
 */
export async function countProducts(admin: AdminApiContext): Promise<number> {
  const response = await admin.graphql(
    `#graphql
    query countProducts {
      productsCount {
        count
      }
    }`
  );

  const data = await response.json();
  return data.data?.productsCount?.count || 0;
}

/**
 * Fetch products from a specific collection
 */
export async function fetchCollectionProducts(
  admin: AdminApiContext,
  collectionId: string,
  limit: number = 250
): Promise<ProductWithImage[]> {
  const products: ProductWithImage[] = [];
  let hasNextPage = true;
  let cursor: string | null = null;

  while (hasNextPage && products.length < limit) {
    const response = await admin.graphql(
      `#graphql
      query getCollectionProducts($id: ID!, $first: Int!, $after: String) {
        collection(id: $id) {
          products(first: $first, after: $after) {
            edges {
              cursor
              node {
                id
                title
                featuredImage {
                  url
                }
                productType
                tags
                category {
                  name
                }
              }
            }
            pageInfo {
              hasNextPage
            }
          }
        }
      }`,
      {
        variables: {
          id: collectionId,
          first: Math.min(50, limit - products.length),
          after: cursor,
        },
      }
    );

    const data: any = await response.json();
    const edges: any[] = data.data?.collection?.products?.edges || [];
    const pageInfo = data.data?.collection?.products?.pageInfo;

    for (const edge of edges) {
      const product = edge.node as ShopifyProduct;

      if (product.featuredImage?.url) {
        products.push({
          id: product.id,
          title: product.title,
          imageUrl: product.featuredImage.url,
          category: product.category?.name || product.productType,
          tags: product.tags,
        });
      }
    }

    hasNextPage = pageInfo?.hasNextPage || false;
    cursor = edges.length > 0 ? edges[edges.length - 1].cursor : null;
  }

  return products;
}

interface ProductUpdateMediaResponse {
  data?: {
    productUpdateMedia?: {
      media?: Array<{
        id: string;
        alt: string | null;
      }>;
      mediaUserErrors?: Array<{
        field: string[];
        message: string;
      }>;
    };
  };
}

interface ProductMediaQueryResponse {
  data?: {
    product?: {
      media?: {
        nodes: Array<{
          id: string;
          mediaContentType: string;
          alt: string | null;
        }>;
      };
    };
  };
}

/**
 * Update alt text for a product's first image
 */
export async function updateProductImageAlt(
  admin: AdminApiContext,
  productId: string,
  altText: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // First, get the product's first image media ID
    const mediaResponse = await admin.graphql(
      `#graphql
      query getProductMedia($id: ID!) {
        product(id: $id) {
          media(first: 1) {
            nodes {
              id
              mediaContentType
              alt
            }
          }
        }
      }`,
      {
        variables: { id: productId },
      }
    );

    const mediaData = (await mediaResponse.json()) as ProductMediaQueryResponse;
    const mediaNodes = mediaData.data?.product?.media?.nodes || [];

    if (mediaNodes.length === 0) {
      return { success: false, error: "No media found for product" };
    }

    const mediaId = mediaNodes[0].id;
    console.log(`[VisionTags] Updating alt text for media ${mediaId} on product ${productId}`);

    // Update the media alt text using productUpdateMedia mutation
    const response = await admin.graphql(
      `#graphql
      mutation productUpdateMedia($productId: ID!, $media: [UpdateMediaInput!]!) {
        productUpdateMedia(productId: $productId, media: $media) {
          media {
            alt
          }
          mediaUserErrors {
            field
            message
          }
        }
      }`,
      {
        variables: {
          productId,
          media: [
            {
              id: mediaId,
              alt: altText,
            },
          ],
        },
      }
    );

    const data = (await response.json()) as ProductUpdateMediaResponse;

    if (data.data?.productUpdateMedia?.mediaUserErrors?.length) {
      const errors = data.data.productUpdateMedia.mediaUserErrors
        .map((e) => e.message)
        .join(", ");
      console.error(`[VisionTags] Alt text error for ${productId}:`, errors);
      return { success: false, error: errors };
    }

    console.log(`[VisionTags] Alt text updated for ${productId}`);
    return { success: true };
  } catch (error) {
    console.error(`[VisionTags] Error updating alt text for ${productId}:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
