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

/**
 * Restricts a scan to products in a given tagging state.
 *
 * MISSING_KEY targets the gap a merchant with a Key:Value convention actually
 * has: most of their catalog already carries some tags, so "no tags at all"
 * matches almost nothing, while "no Color: tag yet" is the real backlog.
 */
export type TagFilter =
  | { kind: "ANY" }
  | { kind: "UNTAGGED" }
  | { kind: "TAGGED" }
  | { kind: "MISSING_KEY"; key: string };

export const TAG_FILTER_ANY: TagFilter = { kind: "ANY" };

/** Parse the persisted/form representation. Unknown input degrades to ANY. */
export function parseTagFilter(raw: string | null | undefined): TagFilter {
  if (!raw || raw === "ANY") return TAG_FILTER_ANY;
  if (raw === "UNTAGGED") return { kind: "UNTAGGED" };
  if (raw === "TAGGED") return { kind: "TAGGED" };
  if (raw.startsWith("MISSING_KEY:")) {
    const key = raw.slice("MISSING_KEY:".length).trim();
    return key ? { kind: "MISSING_KEY", key } : TAG_FILTER_ANY;
  }
  return TAG_FILTER_ANY;
}

/** Serialize for Job.tagFilter. ANY is stored as null. */
export function serializeTagFilter(filter: TagFilter): string | null {
  if (filter.kind === "ANY") return null;
  if (filter.kind === "MISSING_KEY") return `MISSING_KEY:${filter.key}`;
  return filter.kind;
}

export function describeTagFilter(filter: TagFilter): string {
  switch (filter.kind) {
    case "UNTAGGED":
      return "products with no tags";
    case "TAGGED":
      return "products that already have tags";
    case "MISSING_KEY":
      return `products with no ${filter.key}: tag`;
    default:
      return "all products";
  }
}

function tagFilterPredicate(filter: TagFilter): ((tags: string[]) => boolean) | undefined {
  switch (filter.kind) {
    case "UNTAGGED":
      return (tags) => tags.length === 0;
    case "TAGGED":
      return (tags) => tags.length > 0;
    case "MISSING_KEY": {
      const prefix = `${filter.key.toLowerCase()}:`;
      return (tags) => !tags.some((tag) => tag.toLowerCase().startsWith(prefix));
    }
    default:
      return undefined;
  }
}

/**
 * Narrow the fetch server-side where Shopify's documented search syntax allows
 * it, so a large catalog does not have to be walked page by page.
 *
 * Only the two "any tag / no tag" cases qualify. MISSING_KEY cannot be expressed:
 * Shopify's tag index tokenizes on non-alphanumerics, so a `Color:*` prefix match
 * is not dependable, and a product with zero tags qualifies too, which a tag
 * predicate cannot express either way.
 */
function tagFilterSearchQuery(filter: TagFilter): string | null {
  if (filter.kind === "UNTAGGED") return "-tag:*";
  if (filter.kind === "TAGGED") return "tag:*";
  return null;
}

export interface FetchProductsOptions {
  /** Bare product GIDs to skip (e.g. already-scanned products) */
  excludeIds?: Set<string>;
  /** Restrict the run to a tagging state. Defaults to ANY. */
  tagFilter?: TagFilter;
  /**
   * Called when the walk stopped on the page/time budget rather than because the
   * catalog ran out, so the caller can tell the merchant the run was partial.
   */
  onBudgetExhausted?: () => void;
}

// Shopify's max page size. Exclusion filtering means a page can contribute
// zero new products, so we always request full pages and keep walking.
const PRODUCTS_PAGE_SIZE = 250;
const MAX_PAGES = 400; // Safety guard: 400 pages × 250 = 100k products walkable

// Wall-clock budget for the walk. Selection happens synchronously inside the
// Remix action, and a filtered scan over a large catalog can discard whole pages
// at ~300-800ms each, so the request timeout - not MAX_PAGES - is the real
// constraint. Returning fewer products is safe: the ScannedProduct ledger makes
// the next run resume where this one stopped.
const MAX_COLLECT_MS = 15_000;

/**
 * Shared cursor-pagination loop: walks pages until `limit` products with
 * images (and not excluded or filtered out) are accumulated, the catalog is
 * exhausted, or the page/time budget runs out.
 */
async function collectProductsWithImages(
  fetchPage: (
    first: number,
    after: string | null
  ) => Promise<{ edges: ProductEdge[]; pageInfo?: PageInfo }>,
  limit: number,
  excludeIds?: Set<string>,
  matchesTags?: (tags: string[]) => boolean,
  onBudgetExhausted?: () => void
): Promise<ProductWithImage[]> {
  const products: ProductWithImage[] = [];
  const deadline = Date.now() + MAX_COLLECT_MS;
  let hasNextPage = true;
  let cursor: string | null = null;
  let page = 0;

  for (; hasNextPage && products.length < limit && page < MAX_PAGES; page++) {
    if (page > 0 && Date.now() > deadline) break;

    const { edges, pageInfo } = await fetchPage(PRODUCTS_PAGE_SIZE, cursor);

    // Break if no edges returned (prevents infinite loop). An empty page means
    // the catalog is exhausted, so clear hasNextPage first or the run would be
    // reported as a partial batch.
    if (edges.length === 0) {
      hasNextPage = false;
      break;
    }

    for (const edge of edges) {
      if (products.length >= limit) break;
      const product = edge.node as ShopifyProduct;

      // Only include products with images
      if (!product.featuredImage?.url) continue;
      if (excludeIds?.has(product.id)) continue;
      if (matchesTags && !matchesTags(product.tags ?? [])) continue;

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

  // More catalog left, but we stopped short of the requested batch size.
  if (hasNextPage && products.length < limit) {
    onBudgetExhausted?.();
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
  const tagFilter = options.tagFilter ?? TAG_FILTER_ANY;
  // Narrowing is an optimization, and a wrong one would be invisible: if the
  // search syntax ever stops matching what we expect, the walk would silently
  // return nothing and look like "no products match your filter". So if the very
  // first narrowed page comes back empty, we drop the query and walk the catalog
  // client-side instead, where the predicate is the source of truth.
  let searchQuery = tagFilterSearchQuery(tagFilter);
  let pagesFetched = 0;

  try {
    return await collectProductsWithImages(
      async (first, after) => {
        const runQuery = () =>
          withRetry(
            () =>
              admin.graphql(
              `#graphql
              query getProducts($first: Int!, $after: String, $query: String) {
                products(first: $first, after: $after, query: $query) {
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
              { variables: { first, after, query: searchQuery } }
            ),
            { maxRetries: 3, baseDelayMs: 1000, logEvent: "SHOPIFY_API_RETRY" }
          );

        let response = await runQuery();
        let data = (await response.json()) as ProductsQueryResponse;
        const isFirstPage = pagesFetched === 0;
        pagesFetched++;

        // Only a rejected query triggers the fallback. An empty edge list is a
        // legitimate answer ("-tag:*" on a fully tagged catalog matches nothing),
        // and treating that as broken syntax would send us walking the whole
        // catalog to rediscover the same emptiness.
        if (isFirstPage && searchQuery && !data.data?.products) {
          logger.warn("TAG_FILTER_QUERY_REJECTED", {
            query: searchQuery,
            fallback: "client_side_filter",
          });
          searchQuery = null;
          response = await runQuery();
          data = (await response.json()) as ProductsQueryResponse;
        }

        const edges = data.data?.products?.edges || [];

        return {
          edges,
          pageInfo: data.data?.products?.pageInfo,
        };
      },
      limit,
      options.excludeIds,
      // Applied even when the server already narrowed the query: it costs
      // nothing (tags are in the payload) and keeps the two paths consistent.
      tagFilterPredicate(tagFilter),
      options.onBudgetExhausted
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

interface ProductTagsResponse {
  data?: {
    productTags?: {
      edges: Array<{ cursor: string; node: string }>;
      pageInfo?: { hasNextPage: boolean };
    };
  };
}

/** Pages walked when reading the shop's tag vocabulary (250 per page). */
const TAG_VOCABULARY_MAX_PAGES = 8;

/**
 * Read the shop's distinct product tags.
 *
 * Paginated deliberately: productTags returns tags alphabetically, so a single
 * first:250 page on a large catalog returns everything up to "F" and nothing
 * after it - useless for suggesting a schema from an existing vocabulary.
 */
export async function fetchProductTagVocabulary(
  admin: AdminApiContext,
): Promise<string[]> {
  const tags: string[] = [];
  let cursor: string | null = null;
  let hasNextPage = true;

  for (let page = 0; hasNextPage && page < TAG_VOCABULARY_MAX_PAGES; page++) {
    const response: Response = await admin.graphql(
      `#graphql
      query getProductTags($first: Int!, $after: String) {
        productTags(first: $first, after: $after) {
          edges {
            cursor
            node
          }
          pageInfo {
            hasNextPage
          }
        }
      }`,
      { variables: { first: 250, after: cursor } },
    );

    const data = (await response.json()) as ProductTagsResponse;
    const edges = data.data?.productTags?.edges ?? [];
    if (edges.length === 0) break;

    for (const edge of edges) {
      if (edge.node) tags.push(edge.node);
    }

    hasNextPage = data.data?.productTags?.pageInfo?.hasNextPage ?? false;
    cursor = edges[edges.length - 1].cursor;
  }

  return tags;
}

/**
 * Fetch products with images from a specific collection
 * Same pagination/exclusion behavior as fetchAllProducts.
 *
 * Note: the collection.products connection takes no `query` argument, so a tag
 * filter here is always applied client-side over the walked pages.
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
      options.excludeIds,
      tagFilterPredicate(options.tagFilter ?? TAG_FILTER_ANY),
      options.onBudgetExhausted
    );
  } catch (error) {
    logger.error("COLLECTION_PRODUCTS_FETCH_ERROR", { collectionId, error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

interface ProductSyncStateQueryResponse {
  data?: {
    product?: {
      tags?: string[] | null;
      descriptionHtml: string | null;
      seo: {
        title: string | null;
        description: string | null;
      };
    };
  };
}

export interface ProductSyncState {
  tags: string[];
  descriptionHtml: string | null;
  seoTitle: string | null;
  metaDescription: string | null;
}

/**
 * Fetch a product's current live state ahead of a sync: tags, description, SEO.
 *
 * Tags are read live rather than taken from the Product.currentTags snapshot,
 * which is captured at scan time and can be days stale. Merging against a stale
 * list would miss a tag the merchant added since (leaving, say, both Color:Red
 * and Color:Black on the product) which is exactly the duplicate-key mess the
 * Key:Value format exists to prevent.
 */
export async function fetchProductSyncState(
  admin: AdminApiContext,
  productId: string,
): Promise<ProductSyncState> {
  const response = await admin.graphql(
    `#graphql
    query getProductSyncState($id: ID!) {
      product(id: $id) {
        tags
        descriptionHtml
        seo {
          title
          description
        }
      }
    }`,
    { variables: { id: productId } }
  );

  const data = (await response.json()) as ProductSyncStateQueryResponse;
  const product = data.data?.product;

  return {
    tags: product?.tags ?? [],
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
