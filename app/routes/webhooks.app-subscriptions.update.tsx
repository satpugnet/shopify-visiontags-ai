import type { ActionFunctionArgs } from "@remix-run/node";
import * as Sentry from "@sentry/remix";
import { authenticate, unauthenticated } from "../shopify.server";
import {
  upgradeToProPlan,
  downgradeToFreePlan,
} from "../services/billing.server";
import { logger } from "../services/logger.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  logger.info("WEBHOOK_RECEIVED", { shop, topic });

  const subscriptionPayload = payload as {
    app_subscription?: {
      admin_graphql_api_id?: string;
      name?: string;
      status?: string;
    };
  };

  const status = subscriptionPayload.app_subscription?.status;
  const name = subscriptionPayload.app_subscription?.name;
  logger.info("SUBSCRIPTION_UPDATE", { shop, name, status });

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
      (sub: { status: string; name: string }) =>
        sub.status === "ACTIVE" && sub.name !== "Free"
    );

    logger.info("SUBSCRIPTION_VERIFIED", {
      shop,
      subscriptionCount: subscriptions.length,
      hasActive,
    });

    if (hasActive) {
      await upgradeToProPlan(shop);
    } else {
      await downgradeToFreePlan(shop);
    }
  } catch (error) {
    // If we can't query Shopify (e.g., token expired), fall back to webhook payload
    logger.error("SUBSCRIPTION_VERIFY_FAILED", {
      shop,
      error: error instanceof Error ? error.message : String(error),
      fallback: "webhook_payload",
    });
    Sentry.captureException(error, {
      tags: { service: "webhook", topic, shop },
    });

    if (status === "ACTIVE" && name !== "Free") {
      await upgradeToProPlan(shop);
    } else if (status === "CANCELLED" || status === "EXPIRED" || status === "DECLINED") {
      await downgradeToFreePlan(shop);
    }
  }

  return new Response();
};
