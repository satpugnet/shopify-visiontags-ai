/**
 * Billing Service - Subscription Management
 * Handles credit tracking, plan limits, and Shopify billing
 */

import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import prisma from "../db.server";

// Plan configurations
// Using Claude Haiku 4.5: ~$0.003/scan
// Free: 50 scans = ~$0.15 cost (acquisition cost)
// Pro: 5,000 scans = ~$15 cost, $19 revenue = $4 profit (21% margin)
export const PLANS = {
  FREE: {
    name: "Free",
    credits: 50,
    price: 0,
    features: ["50 AI scans/month", "Basic metafields", "Basic tags"],
  },
  PRO: {
    name: "Pro",
    credits: 5000,
    price: 19,
    features: [
      "5,000 AI scans/month",
      "All metafields",
      "SEO tags",
      "Auto-sync new products",
      "Priority support",
    ],
  },
} as const;

export type PlanType = keyof typeof PLANS;

export interface ShopBilling {
  plan: PlanType;
  creditsUsed: number;
  creditLimit: number;
  creditsRemaining: number;
  billingPeriodStart: Date;
  autoSyncEnabled: boolean;
}

/**
 * Get or create shop settings
 */
export async function getOrCreateShopSettings(shop: string) {
  let settings = await prisma.shopSettings.findUnique({
    where: { shop },
  });

  if (!settings) {
    settings = await prisma.shopSettings.create({
      data: {
        shop,
        plan: "FREE",
        creditLimit: PLANS.FREE.credits,
      },
    });
  }

  return settings;
}

/**
 * Get billing status for a shop
 */
export async function getShopBilling(shop: string): Promise<ShopBilling> {
  const settings = await getOrCreateShopSettings(shop);
  const plan = settings.plan as PlanType;

  return {
    plan,
    creditsUsed: settings.creditsUsed,
    creditLimit: settings.creditLimit,
    creditsRemaining: Math.max(0, settings.creditLimit - settings.creditsUsed),
    billingPeriodStart: settings.billingPeriodStart,
    autoSyncEnabled: settings.autoSyncNewProducts,
  };
}

/**
 * Check if shop has available credits
 */
export async function hasAvailableCredits(
  shop: string,
  required: number = 1
): Promise<{ allowed: boolean }> {
  const billing = await getShopBilling(shop);
  return { allowed: billing.creditsRemaining >= required };
}

/**
 * Use credits for a shop
 */
export async function useCredits(
  shop: string,
  count: number
): Promise<{ success: boolean; remaining: number }> {
  const settings = await getOrCreateShopSettings(shop);

  const newTotal = settings.creditsUsed + count;
  if (newTotal > settings.creditLimit) {
    return {
      success: false,
      remaining: settings.creditLimit - settings.creditsUsed,
    };
  }

  const updated = await prisma.shopSettings.update({
    where: { shop },
    data: {
      creditsUsed: newTotal,
    },
  });

  // Also track in UsageRecord for historical data
  const month = new Date().toISOString().slice(0, 7);
  await prisma.usageRecord.upsert({
    where: { shop_month: { shop, month } },
    create: { shop, month, count },
    update: { count: { increment: count } },
  });

  return {
    success: true,
    remaining: Math.max(0, updated.creditLimit - updated.creditsUsed),
  };
}

/**
 * Reset credits at the start of a new billing period
 */
export async function resetCredits(shop: string): Promise<void> {
  await prisma.shopSettings.update({
    where: { shop },
    data: {
      creditsUsed: 0,
      billingPeriodStart: new Date(),
    },
  });
}

/**
 * Upgrade shop to Pro plan
 */
export async function upgradeToProPlan(shop: string): Promise<void> {
  await prisma.shopSettings.update({
    where: { shop },
    data: {
      plan: "PRO",
      creditLimit: PLANS.PRO.credits,
      creditsUsed: 0,
      billingPeriodStart: new Date(),
    },
  });
}

/**
 * Downgrade shop to Free plan
 */
export async function downgradeToFreePlan(shop: string): Promise<void> {
  await prisma.shopSettings.update({
    where: { shop },
    data: {
      plan: "FREE",
      creditLimit: PLANS.FREE.credits,
      autoSyncNewProducts: false, // Disable auto-sync on downgrade
    },
  });
}

/**
 * Toggle auto-sync setting (Pro only)
 */
export async function toggleAutoSync(
  shop: string,
  enabled: boolean
): Promise<{ success: boolean; error?: string }> {
  const settings = await getOrCreateShopSettings(shop);

  if (settings.plan === "FREE" && enabled) {
    return {
      success: false,
      error: "Auto-sync is only available on Pro plan",
    };
  }

  await prisma.shopSettings.update({
    where: { shop },
    data: { autoSyncNewProducts: enabled },
  });

  return { success: true };
}

/**
 * Sync the shop's plan status from Shopify's active subscriptions.
 * Used with Managed Pricing — the app does not create subscriptions itself.
 */
export async function syncPlanFromShopify(
  admin: AdminApiContext,
  shop: string
): Promise<{ plan: PlanType; synced: boolean }> {
  try {
    const response = await admin.graphql(
      `#graphql
      query getActiveSubscriptions {
        currentAppInstallation {
          activeSubscriptions {
            id
            name
            status
          }
        }
      }`
    );

    const data = await response.json();
    const subscriptions =
      data.data?.currentAppInstallation?.activeSubscriptions || [];

    const hasActive = subscriptions.some(
      (sub: { status: string }) => sub.status === "ACTIVE"
    );

    const settings = await getOrCreateShopSettings(shop);
    const currentPlan = settings.plan as PlanType;

    if (hasActive && currentPlan !== "PRO") {
      await upgradeToProPlan(shop);
      return { plan: "PRO", synced: true };
    } else if (!hasActive && currentPlan !== "FREE") {
      await downgradeToFreePlan(shop);
      return { plan: "FREE", synced: true };
    }

    return { plan: currentPlan, synced: false };
  } catch (error) {
    console.error("Error syncing plan from Shopify:", error);
    const settings = await getOrCreateShopSettings(shop);
    return { plan: settings.plan as PlanType, synced: false };
  }
}

/**
 * Get the URL to Shopify's hosted plan picker page.
 * Used with Managed Pricing — redirects merchant to Shopify's plan selection UI.
 */
export function getPlanPickerUrl(shop: string): string {
  const storeHandle = shop.replace(".myshopify.com", "");
  const appHandle = process.env.SHOPIFY_APP_HANDLE || "visiontags";
  return `https://admin.shopify.com/store/${storeHandle}/charges/${appHandle}/pricing_plans`;
}
