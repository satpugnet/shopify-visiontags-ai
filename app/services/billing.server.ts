/**
 * Billing Service - Subscription Management
 * Handles credit tracking, plan limits, and Shopify billing
 */

import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import prisma from "../db.server";
import { logger } from "./logger.server";

// Plan configurations
// Using Claude Haiku 4.5: ~$0.003/scan
// Free: 50 scans = ~$0.15 cost (acquisition cost)
// Pro: 5,000 scans = ~$15 cost, $19 revenue = $4 profit (21% margin)
// Scale: 15,000 scans = ~$45-60 cost worst case, $79 revenue (thin if maxed; typical usage is partial)
export const PLANS = {
  FREE: {
    name: "Free",
    credits: 50,
    price: 0,
    scanLimit: 50,
    features: ["50 AI scans/month", "Basic metafields", "Basic tags", "AI descriptions"],
  },
  PRO: {
    name: "Pro",
    credits: 5000,
    price: 19,
    scanLimit: 500,
    features: [
      "5,000 AI scans/month",
      "All metafields",
      "SEO tags",
      "AI product descriptions & SEO",
      "Auto-sync new products",
      "Priority support",
    ],
  },
  SCALE: {
    name: "Scale",
    credits: 15000,
    price: 79,
    scanLimit: 2000,
    features: [
      "15,000 AI scans/month",
      "2,000 products per scan",
      "All metafields",
      "SEO tags",
      "AI product descriptions & SEO",
      "Auto-sync new products",
      "Priority support",
    ],
  },
} as const;

export type PlanType = keyof typeof PLANS;

// Rank used to resolve the effective plan when duplicate/out-of-order webhooks
// briefly report old and new subscriptions as simultaneously active.
const PLAN_RANK: Record<PlanType, number> = { FREE: 0, PRO: 1, SCALE: 2 };

/**
 * Map a Shopify subscription name to a plan.
 * The Managed Pricing plan Display Names are a contract: "Free", "Pro", "Scale".
 * Unknown paid names fall back to PRO so a renamed Partner Dashboard plan
 * degrades gracefully instead of locking merchants out.
 */
export function resolvePlanFromSubscriptionName(
  name: string | null | undefined
): PlanType {
  const normalized = (name || "").trim().toLowerCase();
  if (normalized === "scale") return "SCALE";
  if (normalized === "" || normalized === "free") return "FREE";
  if (normalized !== "pro") {
    logger.warn("PLAN_NAME_UNRECOGNIZED", { name: name || "", resolvedTo: "PRO" });
  }
  return "PRO";
}

/**
 * Resolve the effective plan from a shop's active subscriptions,
 * picking the highest-ranked plan among ACTIVE ones.
 */
export function resolvePlanFromSubscriptions(
  subscriptions: Array<{ name: string; status: string }>
): PlanType {
  return subscriptions
    .filter((sub) => sub.status === "ACTIVE")
    .map((sub) => resolvePlanFromSubscriptionName(sub.name))
    .reduce<PlanType>(
      (best, plan) => (PLAN_RANK[plan] > PLAN_RANK[best] ? plan : best),
      "FREE"
    );
}

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
    logger.info("SHOP_CREATED", { shop, plan: "FREE", creditLimit: PLANS.FREE.credits });
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
      logger.info("CREDIT_RESET", { shop, reason: "billing_period_expired" });
      await resetCredits(shop);
      // Re-fetch settings after reset
      settings = await getOrCreateShopSettings(shop);
    } catch (error) {
      logger.error("CREDIT_RESET_FAILED", {
        shop,
        error: error instanceof Error ? error.message : String(error),
      });
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
export async function consumeCredits(
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
    const remaining = Math.max(0, settings.creditLimit - settings.creditsUsed);
    logger.warn("CREDIT_LIMIT_REACHED", { shop, requested: count, available: remaining });
    return { success: false, remaining };
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
  const remaining = Math.max(0, settings.creditLimit - settings.creditsUsed);
  logger.info("CREDIT_USED", { shop, count, remaining });
  return { success: true, remaining };
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
  logger.info("CREDIT_RESET", { shop, plan, newLimit: currentPlanCredits });
}

/**
 * Set the shop's plan. Guarded for idempotency so duplicate webhook calls are safe:
 * - Same plan: no-op except syncing creditLimit to config (handles plan config changes).
 * - Upgrade (rank up): fresh credits and billing period.
 * - Downgrade (rank down): keeps creditsUsed/billingPeriodStart until the period resets;
 *   auto-sync is disabled only when landing on FREE.
 */
export async function setPlan(shop: string, plan: PlanType): Promise<void> {
  const settings = await getOrCreateShopSettings(shop);
  const currentPlan = settings.plan as PlanType;
  const planCredits = PLANS[plan].credits;

  if (currentPlan === plan) {
    logger.info("PLAN_SYNC_SKIPPED", {
      shop,
      plan,
      reason: "already_on_plan",
      creditsUsed: settings.creditsUsed,
    });
    // Ensure creditLimit matches config (handles plan config changes)
    if (settings.creditLimit !== planCredits) {
      await prisma.shopSettings.update({
        where: { shop },
        data: { creditLimit: planCredits },
      });
    }
    return;
  }

  const isUpgrade = PLAN_RANK[plan] > PLAN_RANK[currentPlan];
  logger.info("PLAN_CHANGED", {
    shop,
    from: currentPlan,
    to: plan,
    creditLimit: planCredits,
  });
  await prisma.shopSettings.update({
    where: { shop },
    data: {
      plan,
      creditLimit: planCredits,
      ...(isUpgrade ? { creditsUsed: 0, billingPeriodStart: new Date() } : {}),
      ...(plan === "FREE" ? { autoSyncNewProducts: false } : {}),
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
      error: "Auto-sync is only available on paid plans",
    };
  }

  await prisma.shopSettings.update({
    where: { shop },
    data: { autoSyncNewProducts: enabled },
  });

  logger.info("AUTO_SYNC_TOGGLED", { shop, enabled });
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

    const targetPlan = resolvePlanFromSubscriptions(subscriptions);

    logger.info("PLAN_SYNC_CHECK", {
      shop,
      subscriptions: JSON.stringify(subscriptions),
      targetPlan,
    });

    const settings = await getOrCreateShopSettings(shop);
    const currentPlan = settings.plan as PlanType;

    if (targetPlan !== currentPlan) {
      await setPlan(shop, targetPlan);
      return { plan: targetPlan, synced: true };
    }

    return { plan: currentPlan, synced: false };
  } catch (error) {
    logger.error("PLAN_SYNC_ERROR", {
      shop,
      error: error instanceof Error ? error.message : String(error),
    });
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
