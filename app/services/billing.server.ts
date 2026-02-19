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
 * Check if billing period has expired (30 days passed)
 */
function isBillingPeriodExpired(billingPeriodStart: Date): boolean {
  const now = new Date();
  const thirtyDaysInMs = 30 * 24 * 60 * 60 * 1000;
  return now.getTime() - billingPeriodStart.getTime() >= thirtyDaysInMs;
}

/**
 * Get billing status for a shop
 * Automatically resets credits if billing period has expired
 */
export async function getShopBilling(shop: string): Promise<ShopBilling> {
  let settings = await getOrCreateShopSettings(shop);
  const plan = settings.plan as PlanType;

  // Auto-reset credits if billing period expired (30 days)
  if (isBillingPeriodExpired(settings.billingPeriodStart)) {
    try {
      console.log(`[VisionTags] Auto-resetting credits for ${shop} (billing period expired)`);
      await resetCredits(shop);
      // Re-fetch settings after reset
      settings = await getOrCreateShopSettings(shop);
    } catch (error) {
      console.error(`[VisionTags] Failed to auto-reset credits for ${shop}:`, error);
      // Continue with stale data rather than crashing the dashboard
    }
  }

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
 * Use credits for a shop (atomic to prevent race conditions)
 * Uses raw SQL to atomically check and increment in a single query
 */
export async function useCredits(
  shop: string,
  count: number
): Promise<{ success: boolean; remaining: number }> {
  // Atomic: only increments if creditsUsed + count <= creditLimit
  const updated = await prisma.$executeRawUnsafe(
    `UPDATE "ShopSettings" SET "creditsUsed" = "creditsUsed" + $1, "updatedAt" = NOW() WHERE shop = $2 AND "creditsUsed" + $1 <= "creditLimit"`,
    count,
    shop
  );

  if (updated === 0) {
    // Either shop doesn't exist or would exceed limit
    const settings = await getOrCreateShopSettings(shop);
    return {
      success: false,
      remaining: Math.max(0, settings.creditLimit - settings.creditsUsed),
    };
  }

  // Track in UsageRecord for historical data
  const month = new Date().toISOString().slice(0, 7);
  await prisma.usageRecord.upsert({
    where: { shop_month: { shop, month } },
    create: { shop, month, count },
    update: { count: { increment: count } },
  });

  // Fetch updated settings for remaining count
  const settings = await getOrCreateShopSettings(shop);
  return {
    success: true,
    remaining: Math.max(0, settings.creditLimit - settings.creditsUsed),
  };
}

/**
 * Reset credits at the start of a new billing period
 * Also syncs creditLimit to current plan config (handles plan changes)
 */
export async function resetCredits(shop: string): Promise<void> {
  const settings = await getOrCreateShopSettings(shop);
  const plan = settings.plan as PlanType;
  const currentPlanCredits = PLANS[plan].credits;

  await prisma.shopSettings.update({
    where: { shop },
    data: {
      creditsUsed: 0,
      creditLimit: currentPlanCredits,
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
