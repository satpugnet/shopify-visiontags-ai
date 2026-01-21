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
    features: ["50 AI scans/month", "Basic metafields", "Basic tags"],
  },
  PRO: {
    name: "Pro",
    credits: 2000,
    price: 19,
    features: [
      "2,000 AI scans/month",
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

  return {
    plan: settings.plan as PlanType,
    creditsUsed: settings.creditsUsed,
    creditLimit: settings.creditLimit,
    creditsRemaining: settings.creditLimit - settings.creditsUsed,
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
): Promise<boolean> {
  const billing = await getShopBilling(shop);
  return billing.creditsRemaining >= required;
}

/**
 * Use credits for a shop
 */
export async function useCredits(
  shop: string,
  count: number
): Promise<{ success: boolean; remaining: number }> {
  const settings = await getOrCreateShopSettings(shop);

  if (settings.creditsUsed + count > settings.creditLimit) {
    return {
      success: false,
      remaining: settings.creditLimit - settings.creditsUsed,
    };
  }

  const updated = await prisma.shopSettings.update({
    where: { shop },
    data: {
      creditsUsed: settings.creditsUsed + count,
    },
  });

  // Also track in UsageRecord for historical data
  const month = new Date().toISOString().slice(0, 7); // "2025-01"
  await prisma.usageRecord.upsert({
    where: { shop_month: { shop, month } },
    create: { shop, month, count },
    update: { count: { increment: count } },
  });

  return {
    success: true,
    remaining: updated.creditLimit - updated.creditsUsed,
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
