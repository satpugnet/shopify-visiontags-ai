import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate, unauthenticated } from "../shopify.server";
import {
  upgradeToProPlan,
  downgradeToFreePlan,
} from "../services/billing.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  console.log(`[VisionTags] Received ${topic} webhook for ${shop}`);

  const subscriptionPayload = payload as {
    app_subscription?: {
      admin_graphql_api_id?: string;
      name?: string;
      status?: string;
    };
  };

  const status = subscriptionPayload.app_subscription?.status;
  const name = subscriptionPayload.app_subscription?.name;
  console.log(`[VisionTags] Subscription update: ${name} → ${status}`);

  // Query Shopify for the ACTUAL current subscription state.
  // This prevents race conditions when multiple webhooks arrive simultaneously
  // (e.g., old subscription CANCELLED + new subscription ACTIVE at the same time).
  try {
    const { admin } = await unauthenticated.admin(shop);
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

    console.log(`[VisionTags] Active subscriptions for ${shop}: ${subscriptions.length} (hasActive: ${hasActive})`);

    if (hasActive) {
      await upgradeToProPlan(shop);
      console.log(`[VisionTags] ${shop} confirmed on Pro plan`);
    } else {
      await downgradeToFreePlan(shop);
      console.log(`[VisionTags] ${shop} downgraded to Free plan`);
    }
  } catch (error) {
    // If we can't query Shopify (e.g., token expired), fall back to webhook payload
    console.error(`[VisionTags] Failed to verify subscriptions for ${shop}, falling back to webhook payload:`, error);

    if (status === "ACTIVE") {
      await upgradeToProPlan(shop);
    } else if (status === "CANCELLED" || status === "EXPIRED" || status === "DECLINED") {
      await downgradeToFreePlan(shop);
    }
  }

  return new Response();
};
