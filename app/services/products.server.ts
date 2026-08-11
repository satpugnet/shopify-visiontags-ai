/**
 * Products Service - Shopify Product Operations
 * Handles fetching products, updating tags, and syncing data
 */

import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import { logger } from "./logger.server";
import { withRetry } from "./retry.server";

export interface ShopifyProduct {
  id: string;
  title: string;
  vendor: string;
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
  vendor: string;
  imageUrl: string;
  category?: string;
  productType?: string;
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

const PRODUCT_GID_RE = /^(gid:\/\/shopify\/Product\/\d+)/;

/**
 * Extract the bare Shopify product GID from a Product row ID.
 * Manual scans use the bare GID as the row ID, while webhook-created rows
 * use a "${gid}-${uuid}" suffixed variant — this normalizes both.
 */
export function extractProductGid(id: string): string | null {
  return PRODUCT_GID_RE.exec(id)?.[1] ?? null;
}

export interface FetchProductsOptions {
  /** Bare product GIDs to skip (e.g. already-scanned products) */
  excludeIds?: Set<string>;
}

// Shopify's max page size. Exclusion filtering means a page can contribute
// zero new products, so we always request full pages and keep walking.
const PRODUCTS_PAGE_SIZE = 250;
const MAX_PAGES = 400; // Safety guard: 400 pages × 250 = 100k products walkable

/**
 * Shared cursor-pagination loop: walks pages until `limit` products with
 * images (and not excluded) are accumulated, or the catalog is exhausted.
 */
async function collectProductsWithImages(
  fetchPage: (
    first: number,
    after: string | null
  ) => Promise<{ edges: ProductEdge[]; pageInfo?: PageInfo }>,
  limit: number,
  excludeIds?: Set<string>
): Promise<ProductWithImage[]> {
  const products: ProductWithImage[] = [];
  let hasNextPage = true;
  let cursor: string | null = null;

  for (let page = 0; hasNextPage && products.length < limit && page < MAX_PAGES; page++) {
    const { edges, pageInfo } = await fetchPage(PRODUCTS_PAGE_SIZE, cursor);

    // Break if no edges returned (prevents infinite loop)
    if (edges.length === 0) break;

    for (const edge of edges) {
      if (products.length >= limit) break;
      const product = edge.node as ShopifyProduct;

      // Only include products with images
      if (!product.featuredImage?.url) continue;
      if (excludeIds?.has(product.id)) continue;

      products.push({
        id: product.id,
        title: product.title,
        vendor: product.vendor,
        imageUrl: product.featuredImage.url,
        category: product.category?.name || product.productType,
        productType: product.productType,
        tags: product.tags,
      });
    }

    hasNextPage = pageInfo?.hasNextPage || false;
    cursor = edges[edges.length - 1].cursor;
  }

  return products;
}

/**
 * Fetch products with images from a shop
 * Uses cursor-based pagination; skips options.excludeIds while continuing
 * to paginate until `limit` new products are found or the catalog ends.
 */
export async function fetchAllProducts(
  admin: AdminApiContext,
  limit: number = 250,
  options: FetchProductsOptions = {}
): Promise<ProductWithImage[]> {
  try {
    return await collectProductsWithImages(
      async (first, after) => {
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
                      vendor
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
              { variables: { first, after } }
            ),
          { maxRetries: 3, baseDelayMs: 1000, logEvent: "SHOPIFY_API_RETRY" }
        );

        const data = (await response.json()) as ProductsQueryResponse;
        return {
          edges: data.data?.products?.edges || [],
          pageInfo: data.data?.products?.pageInfo,
        };
      },
      limit,
      options.excludeIds
    );
  } catch (error) {
    logger.error("PRODUCTS_FETCH_ERROR", { error: error instanceof Error ? error.message : String(error) });
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
          vendor
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
      vendor: product.vendor,
      imageUrl: product.featuredImage.url,
      category: product.category?.name || product.productType,
      tags: product.tags,
    };
  } catch (error) {
    logger.error("PRODUCT_FETCH_ERROR", { productId, error: error instanceof Error ? error.message : String(error) });
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
    logger.info("TAGS_SYNC_START", { productId, count: tags.length });

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

    logger.info("TAGS_API_RESPONSE", { productId });

    if (data.data?.productUpdate?.userErrors?.length) {
      const errors = data.data.productUpdate.userErrors
        .map((e) => e.message)
        .join(", ");
      logger.error("TAGS_SYNC_ERROR", { productId, errors });
      return { success: false, error: errors };
    }

    const updatedTags = data.data?.productUpdate?.product?.tags || [];
    logger.info("TAGS_SYNC_SUCCESS", { productId, count: updatedTags.length });

    return { success: true };
  } catch (error) {
    logger.error("TAGS_SYNC_ERROR", { productId, error: error instanceof Error ? error.message : String(error) });
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
        productsCount(limit: null) {
          count
        }
      }`
    );

    const data = (await response.json()) as ProductsCountResponse;
    return data.data?.productsCount?.count || 0;
  } catch (error) {
    logger.error("PRODUCTS_COUNT_ERROR", { error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

/**
 * Fetch products with images from a specific collection
 * Same pagination/exclusion behavior as fetchAllProducts.
 */
export async function fetchCollectionProducts(
  admin: AdminApiContext,
  collectionId: string,
  limit: number = 250,
  options: FetchProductsOptions = {}
): Promise<ProductWithImage[]> {
  try {
    return await collectProductsWithImages(
      async (first, after) => {
        const response = await withRetry(
          () =>
            admin.graphql(
              `#graphql
              query getCollectionProducts($id: ID!, $first: Int!, $after: String) {
                collection(id: $id) {
                  products(first: $first, after: $after) {
                    edges {
                      cursor
                      node {
                        id
                        title
                        vendor
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
              { variables: { id: collectionId, first, after } }
            ),
          { maxRetries: 3, baseDelayMs: 1000, logEvent: "SHOPIFY_API_RETRY" }
        );

        const data = (await response.json()) as CollectionProductsResponse;
        return {
          edges: data.data?.collection?.products?.edges || [],
          pageInfo: data.data?.collection?.products?.pageInfo,
        };
      },
      limit,
      options.excludeIds
    );
  } catch (error) {
    logger.error("COLLECTION_PRODUCTS_FETCH_ERROR", { collectionId, error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

interface ProductDescriptionSeoQueryResponse {
  data?: {
    product?: {
      descriptionHtml: string | null;
      seo: {
        title: string | null;
        description: string | null;
      };
    };
  };
}

/**
 * Fetch current description and SEO fields for a product
 */
export async function fetchProductDescriptionAndSeo(
  admin: AdminApiContext,
  productId: string,
): Promise<{ descriptionHtml: string | null; seoTitle: string | null; metaDescription: string | null }> {
  const response = await admin.graphql(
    `#graphql
    query getProductDescSeo($id: ID!) {
      product(id: $id) {
        descriptionHtml
        seo {
          title
          description
        }
      }
    }`,
    { variables: { id: productId } }
  );

  const data = (await response.json()) as ProductDescriptionSeoQueryResponse;
  const product = data.data?.product;

  return {
    descriptionHtml: product?.descriptionHtml ?? null,
    seoTitle: product?.seo?.title ?? null,
    metaDescription: product?.seo?.description ?? null,
  };
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
  { isHtml = false }: { isHtml?: boolean } = {},
): Promise<{ success: boolean; error?: string }> {
  try {
    // Skip if nothing to update
    if (!description && !seoTitle && !metaDescription) {
      return { success: true };
    }

    // Build the product input, only including non-empty fields
    const productInput: Record<string, unknown> = { id: productId };

    if (description) {
      // isHtml: pass through as-is (for revert). Otherwise wrap plain text in <p> tags.
      productInput.descriptionHtml = isHtml ? description : `<p>${description}</p>`;
    }

    const seoInput: Record<string, string> = {};
    if (seoTitle) seoInput.title = seoTitle;
    if (metaDescription) seoInput.description = metaDescription;
    if (Object.keys(seoInput).length > 0) {
      productInput.seo = seoInput;
    }

    logger.info("DESCRIPTION_SEO_SYNC_START", { productId });

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
      logger.error("DESCRIPTION_SEO_SYNC_ERROR", { productId, errors });
      return { success: false, error: errors };
    }

    logger.info("DESCRIPTION_SEO_SYNC_SUCCESS", { productId });
    return { success: true };
  } catch (error) {
    logger.error("DESCRIPTION_SEO_SYNC_ERROR", { productId, error: error instanceof Error ? error.message : String(error) });
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
    logger.info("ALT_TEXT_SYNC_START", { productId, mediaId });

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
      logger.error("ALT_TEXT_SYNC_ERROR", { productId, errors });
      return { success: false, error: errors };
    }

    logger.info("ALT_TEXT_SYNC_SUCCESS", { productId });
    return { success: true };
  } catch (error) {
    logger.error("ALT_TEXT_SYNC_ERROR", { productId, error: error instanceof Error ? error.message : String(error) });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
