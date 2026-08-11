import type { ActionFunctionArgs } from "@remix-run/node";
import * as Sentry from "@sentry/remix";
import { authenticate, unauthenticated } from "../shopify.server";
import {
  setPlan,
  resolvePlanFromSubscriptions,
  resolvePlanFromSubscriptionName,
} from "../services/billing.server";
import { logger } from "../services/logger.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  let shop: string;
  let topic: string;
  let payload: unknown;
  try {
    ({ shop, topic, payload } = await authenticate.webhook(request));
  } catch (error) {
    // Always return 200 on webhook auth failure to avoid Shopify retry storms
    // that can eventually auto-disable the subscription. The error is still
    // captured in Sentry for visibility.
    logger.warn("WEBHOOK_AUTH_FAILED", {
      route: "app-subscriptions.update",
      error: error instanceof Error ? error.message : String(error),
    });
    Sentry.captureException(error, {
      tags: { service: "webhook", route: "app-subscriptions.update", phase: "auth" },
    });
    return new Response();
  }

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
    const targetPlan = resolvePlanFromSubscriptions(subscriptions);

    logger.info("SUBSCRIPTION_VERIFIED", {
      shop,
      subscriptionCount: subscriptions.length,
      targetPlan,
    });

    await setPlan(shop, targetPlan);
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

    if (status === "ACTIVE") {
      await setPlan(shop, resolvePlanFromSubscriptionName(name));
    } else if (status === "CANCELLED" || status === "EXPIRED" || status === "DECLINED") {
      await setPlan(shop, "FREE");
    }
  }

  return new Response();
};
