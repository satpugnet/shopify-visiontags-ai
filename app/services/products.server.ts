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
    const response = await admin.graphql(
      `#graphql
      mutation productUpdate($input: ProductInput!) {
        productUpdate(input: $input) {
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
          input: {
            id: productId,
            tags,
          },
        },
      }
    );

    const data = await response.json();

    if (data.data?.productUpdate?.userErrors?.length > 0) {
      const errors = data.data.productUpdate.userErrors
        .map((e: { message: string }) => e.message)
        .join(", ");
      return { success: false, error: errors };
    }

    return { success: true };
  } catch (error) {
    console.error("Error updating tags:", error);
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
