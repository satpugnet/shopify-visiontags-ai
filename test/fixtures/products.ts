/**
 * Product Test Fixtures
 * Pre-defined products for testing different scenarios
 */

export const mockShopifyProduct = {
  id: "gid://shopify/Product/123456789",
  title: "Blue Cotton T-Shirt",
  featuredImage: {
    url: "https://cdn.shopify.com/s/files/1/0123/products/tshirt.jpg",
  },
  productType: "Apparel",
  tags: ["existing-tag"],
  category: { name: "Clothing" },
};

export const mockProductWithoutImage = {
  id: "gid://shopify/Product/987654321",
  title: "Product Without Image",
  featuredImage: null,
  productType: "Miscellaneous",
  tags: [],
  category: null,
};

export const mockProductWithCategory = {
  id: "gid://shopify/Product/111111111",
  title: "Leather Wallet",
  featuredImage: {
    url: "https://cdn.shopify.com/s/files/1/0123/products/wallet.jpg",
  },
  productType: "",
  tags: ["leather", "gift"],
  category: { name: "Accessories" },
};

export const mockProductWithProductType = {
  id: "gid://shopify/Product/222222222",
  title: "Running Shoes",
  featuredImage: {
    url: "https://cdn.shopify.com/s/files/1/0123/products/shoes.jpg",
  },
  productType: "Footwear",
  tags: ["running", "sports"],
  category: null,
};

export const mockVisionResult = {
  metafields: {
    color: "Navy Blue",
    pattern: "Solid",
    material: "Cotton",
    product_type: "T-Shirt",
  } as Record<string, string>,
  tags: ["Navy Blue", "Cotton", "Summer Vibes", "Business Casual"],
  alt_text: "A navy blue cotton t-shirt",
  description: "A classic navy blue cotton t-shirt with a clean solid pattern.",
  seo_title: "Navy Blue Cotton T-Shirt",
  meta_description: "Shop this classic navy blue cotton t-shirt.",
};

export const mockFashionVisionResult = {
  metafields: {
    color: "Navy Blue",
    pattern: "Solid",
    material: "Cotton",
    target_gender: "Male",
    age_group: "Adult",
    neckline: "Crew",
    sleeve_length: "Short",
    fit: "Regular",
    product_type: "T-Shirt",
  } as Record<string, string>,
  tags: ["Navy Blue", "Cotton", "Summer Vibes", "Business Casual"],
};

export const mockElectronicsVisionResult = {
  metafields: {
    color: "Black",
    material: "Plastic",
    connectivity: "Bluetooth",
    power_source: "Battery",
    product_type: "Headphones",
  } as Record<string, string>,
  tags: ["Wireless", "Bluetooth", "Music", "Audio"],
};

export const mockVisionResultWithMarkdown = `\`\`\`json
${JSON.stringify(mockVisionResult, null, 2)}
\`\`\``;

export const mockInvalidVisionResult = {
  // Missing tags array
  metafields: {
    color: "Red",
  },
};

export const mockDbProduct = {
  id: "product-db-1",
  jobId: "job-1",
  shopifyId: "gid://shopify/Product/123456789",
  title: "Blue Cotton T-Shirt",
  imageUrl: "https://cdn.shopify.com/s/files/1/0123/products/tshirt.jpg",
  status: "PENDING",
  metafields: null,
  tags: null,
  error: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

export const mockDbProductAnalyzed = {
  ...mockDbProduct,
  id: "product-db-2",
  status: "ANALYZED",
  metafields: mockVisionResult.metafields,
  tags: mockVisionResult.tags,
};

export const mockDbProductSynced = {
  ...mockDbProductAnalyzed,
  id: "product-db-3",
  status: "SYNCED",
};

export const mockDbProductError = {
  ...mockDbProduct,
  id: "product-db-4",
  status: "ERROR",
  error: "Failed to analyze image",
};

export const mockJob = {
  id: "job-1",
  shop: "test-shop.myshopify.com",
  status: "PROCESSING",
  totalProducts: 10,
  processedProducts: 5,
  createdAt: new Date(),
  updatedAt: new Date(),
};

export const mockJobCompleted = {
  ...mockJob,
  id: "job-2",
  status: "COMPLETED",
  processedProducts: 10,
};
