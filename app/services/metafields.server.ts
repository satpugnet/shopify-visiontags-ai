/**
 * Metafields Service - Shopify Metafield Operations
 * Handles reading and writing product metafields
 */

import type { AdminApiContext } from "@shopify/shopify-app-remix/server";

// Custom metafield mappings for VisionTags
// Note: "shopify" namespace is reserved - we use "custom" for all app metafields
const METAFIELD_MAPPINGS: Record<string, { namespace: string; key: string; type: string }> = {
  color: { namespace: "custom", key: "color", type: "single_line_text_field" },
  pattern: { namespace: "custom", key: "pattern", type: "single_line_text_field" },
  material: { namespace: "custom", key: "material", type: "single_line_text_field" },
  target_gender: { namespace: "custom", key: "target_gender", type: "single_line_text_field" },
  age_group: { namespace: "custom", key: "age_group", type: "single_line_text_field" },
  neckline: { namespace: "custom", key: "neckline", type: "single_line_text_field" },
  sleeve_length: { namespace: "custom", key: "sleeve_length", type: "single_line_text_field" },
  fit: { namespace: "custom", key: "fit", type: "single_line_text_field" },
};

// Product categories that support apparel-specific fields
const APPAREL_CATEGORIES = [
  "Apparel",
  "Clothing",
  "Shirts",
  "Tops",
  "Dresses",
  "Pants",
  "Shorts",
  "Skirts",
  "Outerwear",
  "Jackets",
  "Coats",
  "Sweaters",
];

export interface MetafieldInput {
  namespace: string;
  key: string;
  value: string;
  type: string;
}

export interface ProductMetafields {
  color?: string;
  pattern?: string;
  material?: string;
  target_gender?: string;
  age_group?: string;
  neckline?: string | null;
  sleeve_length?: string | null;
  fit?: string;
}

/**
 * Filter metafields based on product category
 * V1: Basic filtering - skip apparel-specific fields for non-apparel
 */
export function filterMetafieldsByCategory(
  metafields: ProductMetafields,
  category?: string | null
): ProductMetafields {
  const filtered = { ...metafields };

  // If category is known and NOT apparel, remove apparel-specific fields
  if (category && !APPAREL_CATEGORIES.some((cat) => category.toLowerCase().includes(cat.toLowerCase()))) {
    delete filtered.neckline;
    delete filtered.sleeve_length;
    delete filtered.fit;
  }

  // Remove null values
  Object.keys(filtered).forEach((key) => {
    const k = key as keyof ProductMetafields;
    if (filtered[k] === null || filtered[k] === undefined) {
      delete filtered[k];
    }
  });

  return filtered;
}

/**
 * Convert AI metafields to Shopify metafield inputs
 */
export function toMetafieldInputs(metafields: ProductMetafields): MetafieldInput[] {
  const inputs: MetafieldInput[] = [];

  for (const [key, value] of Object.entries(metafields)) {
    if (value === null || value === undefined) continue;

    const mapping = METAFIELD_MAPPINGS[key];
    if (!mapping) continue;

    inputs.push({
      namespace: mapping.namespace,
      key: mapping.key,
      value: String(value),
      type: mapping.type,
    });
  }

  return inputs;
}

/**
 * Update product metafields via Shopify Admin API
 */
export async function updateProductMetafields(
  admin: AdminApiContext,
  productId: string,
  metafields: ProductMetafields,
  category?: string | null
): Promise<{ success: boolean; error?: string }> {
  try {
    // Filter metafields based on category
    const filtered = filterMetafieldsByCategory(metafields, category);
    const inputs = toMetafieldInputs(filtered);

    if (inputs.length === 0) {
      return { success: true }; // Nothing to update
    }

    // Build metafields for the mutation
    const metafieldsInput = inputs.map((input) => ({
      namespace: input.namespace,
      key: input.key,
      value: input.value,
      type: input.type,
    }));

    const response = await admin.graphql(
      `#graphql
      mutation productUpdate($input: ProductInput!) {
        productUpdate(input: $input) {
          product {
            id
            metafields(first: 20) {
              edges {
                node {
                  namespace
                  key
                  value
                }
              }
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
          input: {
            id: productId,
            metafields: metafieldsInput,
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
    console.error("Error updating metafields:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Get current metafields for a product
 */
export async function getProductMetafields(
  admin: AdminApiContext,
  productId: string
): Promise<Record<string, string>> {
  try {
    const response = await admin.graphql(
      `#graphql
      query getProductMetafields($id: ID!) {
        product(id: $id) {
          metafields(first: 50) {
            edges {
              node {
                namespace
                key
                value
              }
            }
          }
        }
      }`,
      {
        variables: { id: productId },
      }
    );

    const data = await response.json();
    const metafields: Record<string, string> = {};

    if (data.data?.product?.metafields?.edges) {
      for (const edge of data.data.product.metafields.edges) {
        const { namespace, key, value } = edge.node;
        metafields[`${namespace}.${key}`] = value;
      }
    }

    return metafields;
  } catch (error) {
    console.error("Error fetching metafields:", error);
    return {};
  }
}
