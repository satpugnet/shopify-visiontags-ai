/**
 * Metafields Service - Shopify Metafield Operations
 * Handles reading and writing product metafields
 */

import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import { logger } from "./logger.server";
import { getMetafieldMappings } from "./industry.server";

export interface MetafieldInput {
  namespace: string;
  key: string;
  value: string;
  type: string;
}

/**
 * Convert AI metafields to Shopify metafield inputs.
 * Uses industry-specific mappings to validate keys -- unknown keys are skipped.
 */
export function toMetafieldInputs(
  metafields: Record<string, string | null | undefined>,
  industryId?: string
): MetafieldInput[] {
  const mappings = getMetafieldMappings(industryId || "general");
  const inputs: MetafieldInput[] = [];

  for (const [key, value] of Object.entries(metafields)) {
    if (value === null || value === undefined) continue;

    const mapping = mappings[key];
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
 * Uses metafieldsSet mutation for reliable metafield updates
 */
export async function updateProductMetafields(
  admin: AdminApiContext,
  productId: string,
  metafields: Record<string, string | null | undefined>,
  industryId?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const inputs = toMetafieldInputs(metafields, industryId);

    if (inputs.length === 0) {
      logger.info("METAFIELD_SYNC_SKIP", { productId, reason: "no_metafields" });
      return { success: true }; // Nothing to update
    }

    logger.info("METAFIELD_SYNC_START", { productId, count: inputs.length });

    // Use metafieldsSet mutation for reliable metafield updates
    const metafieldsInput = inputs.map((input) => ({
      namespace: input.namespace,
      key: input.key,
      value: input.value,
      type: input.type,
      ownerId: productId,
    }));

    const response = await admin.graphql(
      `#graphql
      mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields {
            id
            namespace
            key
            value
          }
          userErrors {
            field
            message
            code
          }
        }
      }`,
      {
        variables: {
          metafields: metafieldsInput,
        },
      }
    );

    const data = await response.json();

    logger.info("METAFIELD_API_RESPONSE", { productId });

    const userErrors = data.data?.metafieldsSet?.userErrors;
    if (userErrors && userErrors.length > 0) {
      const errors = userErrors
        .map((e: { message: string; code?: string | null }) => `${e.message}${e.code ? ` (${e.code})` : ''}`)
        .join(", ");
      logger.error("METAFIELD_SYNC_ERROR", { productId, errors });
      return { success: false, error: errors };
    }

    const setMetafields = data.data?.metafieldsSet?.metafields || [];
    logger.info("METAFIELD_SYNC_SUCCESS", { productId, count: setMetafields.length });

    return { success: true };
  } catch (error) {
    logger.error("METAFIELD_SYNC_ERROR", { productId, error: error instanceof Error ? error.message : String(error) });
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
    logger.error("METAFIELD_FETCH_ERROR", { productId, error: error instanceof Error ? error.message : String(error) });
    return {};
  }
}
