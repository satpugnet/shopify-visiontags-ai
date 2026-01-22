/**
 * Billing Service - Subscription Management
 * Handles credit tracking, plan limits, and Shopify billing
 */

import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import prisma from "../db.server";

// Plan configurations
export const PLANS = {
  FREE: {
    name: "Free",
    credits: 50,
    price: 0,
    overageEnabled: false,
    overagePrice: 0,
    features: ["50 AI scans/month", "Basic metafields", "Basic tags"],
  },
  PRO: {
    name: "Pro",
    credits: 2000,
    price: 19,
    overageEnabled: true,
    overagePrice: 0.01, // $0.01 per scan after limit
    overageCap: 50, // Max $50 overage per billing cycle
    features: [
      "2,000 AI scans/month",
      "All metafields",
      "SEO tags",
      "Auto-sync new products",
      "Priority support",
      "Pay-as-you-go after limit ($0.01/scan)",
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
  overageScans: number;
  overageCharge: number;
  overageEnabled: boolean;
  overageCap: number;
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
  const planConfig = PLANS[plan];

  // Calculate overage (scans beyond the credit limit)
  const overageScans = Math.max(0, settings.creditsUsed - settings.creditLimit);
  const overagePrice = 'overagePrice' in planConfig ? planConfig.overagePrice : 0;
  const overageCap = 'overageCap' in planConfig ? planConfig.overageCap : 0;
  const overageCharge = Math.min(overageScans * overagePrice, overageCap);

  return {
    plan,
    creditsUsed: Math.min(settings.creditsUsed, settings.creditLimit),
    creditLimit: settings.creditLimit,
    creditsRemaining: Math.max(0, settings.creditLimit - settings.creditsUsed),
    billingPeriodStart: settings.billingPeriodStart,
    autoSyncEnabled: settings.autoSyncNewProducts,
    overageScans,
    overageCharge,
    overageEnabled: planConfig.overageEnabled,
    overageCap,
  };
}

/**
 * Check if shop has available credits (or overage capacity for Pro)
 */
export async function hasAvailableCredits(
  shop: string,
  required: number = 1
): Promise<{ allowed: boolean; useOverage: boolean; overageCount: number }> {
  const billing = await getShopBilling(shop);

  // If enough regular credits, use those
  if (billing.creditsRemaining >= required) {
    return { allowed: true, useOverage: false, overageCount: 0 };
  }

  // For Pro users, check if overage is available
  if (billing.overageEnabled) {
    const remainingOverageBudget = billing.overageCap - billing.overageCharge;
    const overagePrice = PLANS.PRO.overagePrice;
    const maxOverageScans = Math.floor(remainingOverageBudget / overagePrice);

    // Calculate how many would go to overage
    const overageNeeded = required - billing.creditsRemaining;

    if (overageNeeded <= maxOverageScans) {
      return {
        allowed: true,
        useOverage: true,
        overageCount: overageNeeded
      };
    }
  }

  return { allowed: false, useOverage: false, overageCount: 0 };
}

/**
 * Use credits for a shop (supports overage for Pro users)
 */
export async function useCredits(
  shop: string,
  count: number
): Promise<{ success: boolean; remaining: number; overageUsed: number }> {
  const settings = await getOrCreateShopSettings(shop);
  const plan = settings.plan as PlanType;
  const planConfig = PLANS[plan];

  // Check if this would exceed limits
  const newTotal = settings.creditsUsed + count;
  const wouldExceedLimit = newTotal > settings.creditLimit;

  if (wouldExceedLimit && !planConfig.overageEnabled) {
    // Free plan: no overage allowed
    return {
      success: false,
      remaining: settings.creditLimit - settings.creditsUsed,
      overageUsed: 0,
    };
  }

  if (wouldExceedLimit && planConfig.overageEnabled) {
    // Pro plan: check overage cap
    const currentOverage = Math.max(0, settings.creditsUsed - settings.creditLimit);
    const overagePrice = 'overagePrice' in planConfig ? planConfig.overagePrice : 0;
    const overageCap = 'overageCap' in planConfig ? planConfig.overageCap : 0;
    const currentOverageCharge = currentOverage * overagePrice;

    const newOverage = newTotal - settings.creditLimit;
    const newOverageCharge = newOverage * overagePrice;

    if (newOverageCharge > overageCap) {
      // Would exceed overage cap
      return {
        success: false,
        remaining: 0,
        overageUsed: currentOverage,
      };
    }
  }

  // Update credits (allow exceeding creditLimit for Pro users with overage)
  const updated = await prisma.shopSettings.update({
    where: { shop },
    data: {
      creditsUsed: newTotal,
    },
  });

  // Also track in UsageRecord for historical data
  const month = new Date().toISOString().slice(0, 7); // "2025-01"
  await prisma.usageRecord.upsert({
    where: { shop_month: { shop, month } },
    create: { shop, month, count },
    update: { count: { increment: count } },
  });

  // Calculate remaining and overage
  const remaining = Math.max(0, updated.creditLimit - updated.creditsUsed);
  const overageUsed = Math.max(0, updated.creditsUsed - updated.creditLimit);

  return {
    success: true,
    remaining,
    overageUsed,
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
 * Create a Shopify recurring charge for Pro plan
 */
export async function createProSubscription(
  admin: AdminApiContext,
  shop: string
): Promise<{ confirmationUrl: string } | { error: string }> {
  try {
    const response = await admin.graphql(
      `#graphql
      mutation createSubscription($name: String!, $lineItems: [AppSubscriptionLineItemInput!]!, $returnUrl: URL!) {
        appSubscriptionCreate(
          name: $name
          returnUrl: $returnUrl
          lineItems: $lineItems
        ) {
          appSubscription {
            id
          }
          confirmationUrl
          userErrors {
            field
            message
          }
        }
      }`,
      {
        variables: {
          name: "VisionTags Pro",
          returnUrl: `${process.env.SHOPIFY_APP_URL}/app?billing=success`,
          lineItems: [
            {
              plan: {
                appRecurringPricingDetails: {
                  price: {
                    amount: PLANS.PRO.price,
                    currencyCode: "USD",
                  },
                  interval: "EVERY_30_DAYS",
                },
              },
            },
          ],
        },
      }
    );

    const data = await response.json();

    if (data.data?.appSubscriptionCreate?.userErrors?.length > 0) {
      const errors = data.data.appSubscriptionCreate.userErrors
        .map((e: { message: string }) => e.message)
        .join(", ");
      return { error: errors };
    }

    const confirmationUrl = data.data?.appSubscriptionCreate?.confirmationUrl;
    if (!confirmationUrl) {
      return { error: "No confirmation URL returned" };
    }

    return { confirmationUrl };
  } catch (error) {
    console.error("Error creating subscription:", error);
    return {
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Check if shop has an active subscription
 */
export async function hasActiveSubscription(
  admin: AdminApiContext
): Promise<boolean> {
  try {
    const response = await admin.graphql(
      `#graphql
      query getActiveSubscription {
        appInstallation {
          activeSubscriptions {
            id
            status
          }
        }
      }`
    );

    const data = await response.json();
    const subscriptions =
      data.data?.appInstallation?.activeSubscriptions || [];

    return subscriptions.some(
      (sub: { status: string }) => sub.status === "ACTIVE"
    );
  } catch (error) {
    console.error("Error checking subscription:", error);
    return false;
  }
}
