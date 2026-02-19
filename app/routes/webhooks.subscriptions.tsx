/**
 * Subscription Webhook Handler
 *
 * Handles app_subscriptions/update webhook to sync billing state.
 * Fires when a subscription is created, updated, or cancelled.
 */

import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { PLANS } from "../services/billing.server";

interface SubscriptionPayload {
  app_subscription: {
    id: number;
    name: string;
    status: "ACTIVE" | "CANCELLED" | "DECLINED" | "EXPIRED" | "FROZEN" | "PENDING";
  };
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  try {
    console.log(`[VisionTags] Received ${topic} webhook for ${shop}`);

    const data = payload as SubscriptionPayload;
    const subscriptionStatus = data.app_subscription?.status;
    const subscriptionName = data.app_subscription?.name;

    console.log(`[VisionTags] Subscription "${subscriptionName}" status: ${subscriptionStatus}`);

    // Get current shop settings
    const settings = await prisma.shopSettings.findUnique({
      where: { shop },
    });

    if (!settings) {
      console.log(`[VisionTags] No settings found for ${shop}, skipping`);
      return new Response();
    }

    // Handle subscription status changes
    if (subscriptionStatus === "ACTIVE") {
      // Subscription is active - ensure shop is on Pro plan
      if (settings.plan !== "PRO") {
        console.log(`[VisionTags] Upgrading ${shop} to Pro (subscription active)`);
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
    } else if (
      subscriptionStatus === "CANCELLED" ||
      subscriptionStatus === "EXPIRED" ||
      subscriptionStatus === "DECLINED"
    ) {
      // Subscription ended - downgrade to Free plan
      if (settings.plan === "PRO") {
        console.log(`[VisionTags] Downgrading ${shop} to Free (subscription ${subscriptionStatus})`);
        await prisma.shopSettings.update({
          where: { shop },
          data: {
            plan: "FREE",
            creditLimit: PLANS.FREE.credits,
            autoSyncNewProducts: false, // Disable Pro-only features
          },
        });
      }
    } else if (subscriptionStatus === "FROZEN") {
      // Subscription frozen (payment issues) - disable auto-sync but keep Pro features
      console.log(`[VisionTags] Subscription frozen for ${shop} - disabling auto-sync`);
      await prisma.shopSettings.update({
        where: { shop },
        data: {
          autoSyncNewProducts: false,
        },
      });
    }

    return new Response();
  } catch (error) {
    console.error(`[VisionTags] Error handling ${topic} webhook for ${shop}:`, error);
    return new Response();
  }
};
