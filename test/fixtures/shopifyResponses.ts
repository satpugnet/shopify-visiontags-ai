/**
 * Shopify GraphQL Response Fixtures
 * Pre-defined API responses for mocking Shopify Admin API
 */

import {
  mockShopifyProduct,
  mockProductWithoutImage,
  mockProductWithCategory,
} from "./products";

// Products Query Response (single page)
export const mockProductsQueryResponse = {
  data: {
    products: {
      edges: [
        { cursor: "cursor1", node: mockShopifyProduct },
        { cursor: "cursor2", node: mockProductWithCategory },
      ],
      pageInfo: { hasNextPage: false },
    },
  },
};

// Products Query Response (first page with more)
export const mockProductsQueryResponsePage1 = {
  data: {
    products: {
      edges: [
        { cursor: "cursor1", node: mockShopifyProduct },
        { cursor: "cursor2", node: mockProductWithCategory },
      ],
      pageInfo: { hasNextPage: true },
    },
  },
};

// Products Query Response (second page, no more)
export const mockProductsQueryResponsePage2 = {
  data: {
    products: {
      edges: [
        {
          cursor: "cursor3",
          node: { ...mockShopifyProduct, id: "gid://shopify/Product/333333333" },
        },
      ],
      pageInfo: { hasNextPage: false },
    },
  },
};

// Products Query Response with products without images
export const mockProductsQueryWithMissingImages = {
  data: {
    products: {
      edges: [
        { cursor: "cursor1", node: mockShopifyProduct },
        { cursor: "cursor2", node: mockProductWithoutImage },
      ],
      pageInfo: { hasNextPage: false },
    },
  },
};

// Single Product Query Response
export const mockProductQueryResponse = {
  data: {
    product: mockShopifyProduct,
  },
};

// Product Query Response - Not Found
export const mockProductQueryNotFound = {
  data: {
    product: null,
  },
};

// Product Update (Tags) Success
export const mockProductUpdateSuccess = {
  data: {
    productUpdate: {
      product: {
        id: mockShopifyProduct.id,
        tags: ["Navy Blue", "Cotton", "Summer"],
      },
      userErrors: [],
    },
  },
};

// Product Update (Tags) Error
export const mockProductUpdateError = {
  data: {
    productUpdate: {
      product: null,
      userErrors: [
        {
          field: ["tags"],
          message: "Invalid tag format",
        },
      ],
    },
  },
};

// Metafields Set Success
export const mockMetafieldsSetSuccess = {
  data: {
    metafieldsSet: {
      metafields: [
        {
          id: "gid://shopify/Metafield/1",
          namespace: "custom",
          key: "color",
          value: "Navy Blue",
        },
        {
          id: "gid://shopify/Metafield/2",
          namespace: "custom",
          key: "material",
          value: "Cotton",
        },
      ],
      userErrors: [],
    },
  },
};

// Metafields Set Error
export const mockMetafieldsSetError = {
  data: {
    metafieldsSet: {
      metafields: [],
      userErrors: [
        {
          field: ["namespace"],
          message: "Reserved namespace",
          code: "INVALID",
        },
      ],
    },
  },
};

// Products Count Response
export const mockProductsCountResponse = {
  data: {
    productsCount: {
      count: 42,
    },
  },
};

// Subscription Create Success
export const mockSubscriptionCreateSuccess = {
  data: {
    appSubscriptionCreate: {
      appSubscription: {
        id: "gid://shopify/AppSubscription/123",
      },
      confirmationUrl: "https://admin.shopify.com/store/test/charges/confirm",
      userErrors: [],
    },
  },
};

// Subscription Create Error
export const mockSubscriptionCreateError = {
  data: {
    appSubscriptionCreate: {
      appSubscription: null,
      confirmationUrl: null,
      userErrors: [
        {
          field: ["lineItems"],
          message: "Invalid pricing",
        },
      ],
    },
  },
};

// Active Subscription Check - Has Active
export const mockActiveSubscriptionYes = {
  data: {
    appInstallation: {
      activeSubscriptions: [
        {
          id: "gid://shopify/AppSubscription/123",
          status: "ACTIVE",
        },
      ],
    },
  },
};

// Active Subscription Check - No Active
export const mockActiveSubscriptionNo = {
  data: {
    appInstallation: {
      activeSubscriptions: [],
    },
  },
};

// Collection Products Response
export const mockCollectionProductsResponse = {
  data: {
    collection: {
      products: {
        edges: [
          { cursor: "cursor1", node: mockShopifyProduct },
          { cursor: "cursor2", node: mockProductWithCategory },
        ],
        pageInfo: { hasNextPage: false },
      },
    },
  },
};

// Helper to create mock admin context
export function createMockAdminContext(
  responses: Record<string, unknown> = {}
) {
  const defaultResponses: Record<string, unknown> = {
    getProducts: mockProductsQueryResponse,
    getProduct: mockProductQueryResponse,
    productUpdate: mockProductUpdateSuccess,
    metafieldsSet: mockMetafieldsSetSuccess,
    countProducts: mockProductsCountResponse,
    createSubscription: mockSubscriptionCreateSuccess,
    getActiveSubscription: mockActiveSubscriptionYes,
    getCollectionProducts: mockCollectionProductsResponse,
  };

  const mergedResponses = { ...defaultResponses, ...responses };

  return {
    graphql: vi.fn().mockImplementation(async (query: string) => {
      // Determine which response to return based on query content
      if (query.includes("productsCount")) {
        return { json: async () => mergedResponses.countProducts };
      }
      if (query.includes("collection(id:") || query.includes("getCollectionProducts")) {
        return { json: async () => mergedResponses.getCollectionProducts };
      }
      if (query.includes("products(first:") || query.includes("getProducts")) {
        return { json: async () => mergedResponses.getProducts };
      }
      if (query.includes("product(id:") || query.includes("getProduct")) {
        return { json: async () => mergedResponses.getProduct };
      }
      if (query.includes("productUpdate")) {
        return { json: async () => mergedResponses.productUpdate };
      }
      if (query.includes("metafieldsSet")) {
        return { json: async () => mergedResponses.metafieldsSet };
      }
      if (query.includes("appSubscriptionCreate")) {
        return { json: async () => mergedResponses.createSubscription };
      }
      if (query.includes("activeSubscriptions")) {
        return { json: async () => mergedResponses.getActiveSubscription };
      }

      // Default response
      return { json: async () => ({ data: {} }) };
    }),
  };
}

// Need to import vi for the helper
import { vi } from "vitest";
