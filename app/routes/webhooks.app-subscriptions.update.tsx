import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import {
  upgradeToProPlan,
  downgradeToFreePlan,
} from "../services/billing.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  const subscriptionPayload = payload as {
    app_subscription?: {
      admin_graphql_api_id?: string;
      name?: string;
      status?: string;
    };
  };

  const status = subscriptionPayload.app_subscription?.status;
  const name = subscriptionPayload.app_subscription?.name;

  console.log(`Subscription update: ${name} → ${status}`);

  if (status === "ACTIVE") {
    console.log(`Upgrading ${shop} to Pro (subscription active)`);
    await upgradeToProPlan(shop);
  } else if (
    status === "CANCELLED" ||
    status === "EXPIRED" ||
    status === "DECLINED"
  ) {
    console.log(`Downgrading ${shop} to Free (subscription ${status})`);
    await downgradeToFreePlan(shop);
  }

  return new Response();
};
