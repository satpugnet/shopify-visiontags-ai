/**
 * Shop Settings Test Fixtures
 * Pre-defined shop configurations for testing different scenarios
 */

export const freeShopSettings = {
  id: "settings-free-1",
  shop: "test-shop.myshopify.com",
  plan: "FREE" as const,
  creditsUsed: 30,
  creditLimit: 50,
  billingPeriodStart: new Date(),
  autoSyncNewProducts: false,
  createdAt: new Date(),
  updatedAt: new Date(),
};

export const proShopSettings = {
  id: "settings-pro-1",
  shop: "pro-shop.myshopify.com",
  plan: "PRO" as const,
  creditsUsed: 2500,
  creditLimit: 4000,
  billingPeriodStart: new Date(),
  autoSyncNewProducts: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

export const exhaustedFreeSettings = {
  ...freeShopSettings,
  id: "settings-exhausted-1",
  shop: "exhausted-shop.myshopify.com",
  creditsUsed: 50,
};

export const exhaustedProSettings = {
  ...proShopSettings,
  id: "settings-pro-exhausted-1",
  shop: "exhausted-pro-shop.myshopify.com",
  creditsUsed: 4000, // At limit but can use overage
};

export const overageProSettings = {
  ...proShopSettings,
  id: "settings-pro-overage-1",
  shop: "overage-pro-shop.myshopify.com",
  creditsUsed: 5000, // 1000 scans in overage ($5)
};

export const maxOverageProSettings = {
  ...proShopSettings,
  id: "settings-pro-max-overage-1",
  shop: "max-overage-pro-shop.myshopify.com",
  creditsUsed: 9000, // 5000 scans in overage = $25 cap reached
};

export const expiredBillingSettings = {
  ...freeShopSettings,
  id: "settings-expired-1",
  shop: "expired-shop.myshopify.com",
  billingPeriodStart: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000), // 31 days ago
  creditsUsed: 45,
};

export const newShopSettings = {
  id: "settings-new-1",
  shop: "new-shop.myshopify.com",
  plan: "FREE" as const,
  creditsUsed: 0,
  creditLimit: 50,
  billingPeriodStart: new Date(),
  autoSyncNewProducts: false,
  createdAt: new Date(),
  updatedAt: new Date(),
};
