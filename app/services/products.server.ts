/**
 * Products Service - Shopify Product Operations
 * Handles fetching products, updating tags, and syncing data
 */

import type { AdminApiContext } from "@shopify/shopify-app-remix/server";

/**
 * Retry a function with exponential backoff
 * Handles Shopify API rate limits (429) and transient errors
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  options: { maxRetries?: number; baseDelayMs?: number; maxDelayMs?: number } = {}
): Promise<T> {
  const { maxRetries = 3, baseDelayMs = 1000, maxDelayMs = 30000 } = options;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if this is a rate limit error or server error
      const errorMsg = lastError.message.toLowerCase();
      const isRetryable =
        errorMsg.includes("429") ||
        errorMsg.includes("throttled") ||
        errorMsg.includes("rate") ||
        errorMsg.includes("500") ||
        errorMsg.includes("502") ||
        errorMsg.includes("503") ||
        errorMsg.includes("timeout") ||
        errorMsg.includes("econnreset");

      if (!isRetryable || attempt === maxRetries - 1) {
        throw lastError;
      }

      // Exponential backoff with jitter
      const delay = Math.min(
        baseDelayMs * Math.pow(2, attempt) + Math.random() * 1000,
        maxDelayMs
      );
      console.log(`[VisionTags] Shopify API retry ${attempt + 1}/${maxRetries} after ${Math.round(delay)}ms`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

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

// GraphQL Response Types
interface ProductEdge {
  cursor: string;
  node: ShopifyProduct;
}

interface PageInfo {
  hasNextPage: boolean;
}

interface ProductsQueryResponse {
  data?: {
    products?: {
      edges: ProductEdge[];
      pageInfo: PageInfo;
    };
  };
}

interface ProductQueryResponse {
  data?: {
    product: ShopifyProduct | null;
  };
}

interface ProductUpdateResponse {
  data?: {
    productUpdate?: {
      product?: {
        id: string;
        tags: string[];
      };
      userErrors?: Array<{
        field: string;
        message: string;
      }>;
    };
  };
}

interface ProductsCountResponse {
  data?: {
    productsCount?: {
      count: number;
    };
  };
}

interface CollectionProductsResponse {
  data?: {
    collection?: {
      products?: {
        edges: ProductEdge[];
        pageInfo: PageInfo;
      };
    };
  };
}

/**
 * Fetch all products with images from a shop
 * Uses cursor-based pagination
 */
export async function fetchAllProducts(
  admin: AdminApiContext,
  limit: number = 250
): Promise<ProductWithImage[]> {
  try {
    const products: ProductWithImage[] = [];
    let hasNextPage = true;
    let cursor: string | null = null;
    const MAX_PAGES = 100; // Safety guard: max 100 pages × 50 = 5000 products

    for (let page = 0; hasNextPage && products.length < limit && page < MAX_PAGES; page++) {
      // Wrap GraphQL call with retry logic for rate limits
      const response = await withRetry(
        () =>
          admin.graphql(
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
          ),
        { maxRetries: 3, baseDelayMs: 1000 }
      );

      const data = (await response.json()) as ProductsQueryResponse;
      const edges: ProductEdge[] = data.data?.products?.edges || [];
      const pageInfo = data.data?.products?.pageInfo;

      // Break if no edges returned (prevents infinite loop)
      if (edges.length === 0) break;

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
  } catch (error) {
    console.error("[VisionTags] Error fetching products:", error);
    throw error;
  }
}

/**
 * Get a single product by ID
 */
export async function getProduct(
  admin: AdminApiContext,
  productId: string
): Promise<ProductWithImage | null> {
  try {
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

    const data = (await response.json()) as ProductQueryResponse;
    const product = data.data?.product;

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
  } catch (error) {
    console.error(`[VisionTags] Error fetching product ${productId}:`, error);
    throw error;
  }
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
    console.log(`[VisionTags] Setting ${tags.length} tags for ${productId}:`, tags);

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

    const data = (await response.json()) as ProductUpdateResponse;

    console.log(`[VisionTags] Tags API response for ${productId}:`, JSON.stringify(data, null, 2));

    if (data.data?.productUpdate?.userErrors?.length) {
      const errors = data.data.productUpdate.userErrors
        .map((e) => e.message)
        .join(", ");
      console.error(`[VisionTags] Tags error for ${productId}:`, errors);
      return { success: false, error: errors };
    }

    const updatedTags = data.data?.productUpdate?.product?.tags || [];
    console.log(`[VisionTags] Successfully set ${updatedTags.length} tags for ${productId}`);

    return { success: true };
  } catch (error) {
    console.error("[VisionTags] Error updating tags:", error);
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
  try {
    const response = await admin.graphql(
      `#graphql
      query countProducts {
        productsCount {
          count
        }
      }`
    );

    const data = (await response.json()) as ProductsCountResponse;
    return data.data?.productsCount?.count || 0;
  } catch (error) {
    console.error("[VisionTags] Error counting products:", error);
    throw error;
  }
}

/**
 * Fetch products from a specific collection
 */
export async function fetchCollectionProducts(
  admin: AdminApiContext,
  collectionId: string,
  limit: number = 250
): Promise<ProductWithImage[]> {
  try {
    const products: ProductWithImage[] = [];
    let hasNextPage = true;
    let cursor: string | null = null;
    const MAX_PAGES = 100; // Safety guard against infinite loops

    for (let page = 0; hasNextPage && products.length < limit && page < MAX_PAGES; page++) {
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

      const data = (await response.json()) as CollectionProductsResponse;
      const edges: ProductEdge[] = data.data?.collection?.products?.edges || [];
      const pageInfo = data.data?.collection?.products?.pageInfo;

      // Break if no edges returned (prevents infinite loop)
      if (edges.length === 0) break;

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
  } catch (error) {
    console.error(`[VisionTags] Error fetching collection products for ${collectionId}:`, error);
    throw error;
  }
}

interface ProductDescriptionSeoResponse {
  data?: {
    productUpdate?: {
      product?: {
        id: string;
        descriptionHtml: string;
        seo: {
          title: string;
          description: string;
        };
      };
      userErrors?: Array<{
        field: string;
        message: string;
      }>;
    };
  };
}

/**
 * Update product description, SEO title, and meta description
 * Uses the productUpdate mutation with descriptionHtml and seo fields
 */
export async function updateProductDescriptionAndSeo(
  admin: AdminApiContext,
  productId: string,
  description?: string | null,
  seoTitle?: string | null,
  metaDescription?: string | null,
): Promise<{ success: boolean; error?: string }> {
  try {
    // Skip if nothing to update
    if (!description && !seoTitle && !metaDescription) {
      return { success: true };
    }

    // Build the product input, only including non-empty fields
    const productInput: Record<string, unknown> = { id: productId };

    if (description) {
      // Wrap plain text in <p> tags for proper HTML rendering in storefront
      productInput.descriptionHtml = `<p>${description}</p>`;
    }

    const seoInput: Record<string, string> = {};
    if (seoTitle) seoInput.title = seoTitle;
    if (metaDescription) seoInput.description = metaDescription;
    if (Object.keys(seoInput).length > 0) {
      productInput.seo = seoInput;
    }

    console.log(`[VisionTags] Updating description & SEO for ${productId}`);

    const response = await admin.graphql(
      `#graphql
      mutation productUpdate($product: ProductUpdateInput!) {
        productUpdate(product: $product) {
          product {
            id
            descriptionHtml
            seo {
              title
              description
            }
          }
          userErrors {
            field
            message
          }
        }
      }`,
      {
        variables: {
          product: productInput,
        },
      }
    );

    const data = (await response.json()) as ProductDescriptionSeoResponse;

    if (data.data?.productUpdate?.userErrors?.length) {
      const errors = data.data.productUpdate.userErrors
        .map((e) => e.message)
        .join(", ");
      console.error(`[VisionTags] Description/SEO error for ${productId}:`, errors);
      return { success: false, error: errors };
    }

    console.log(`[VisionTags] Description & SEO updated for ${productId}`);
    return { success: true };
  } catch (error) {
    console.error(`[VisionTags] Error updating description/SEO for ${productId}:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
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
