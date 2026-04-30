import type { ActionFunctionArgs } from "@remix-run/node";
import * as Sentry from "@sentry/remix";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { logger } from "../services/logger.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  let shop: string;
  let topic: string;
  let payload: { current?: string[] };
  let session: { id: string } | undefined;
  try {
    ({ payload, session, topic, shop } = await authenticate.webhook(request));
  } catch (error) {
    // Always return 200 on webhook auth failure to avoid Shopify retry storms
    // that can eventually auto-disable the subscription.
    logger.warn("WEBHOOK_AUTH_FAILED", {
      route: "app.scopes_update",
      error: error instanceof Error ? error.message : String(error),
    });
    Sentry.captureException(error, {
      tags: { service: "webhook", route: "app.scopes_update", phase: "auth" },
    });
    return new Response();
  }

  try {
    logger.info("WEBHOOK_RECEIVED", { shop, topic });

    const current = payload.current as string[];
    if (session) {
      await db.session.update({
        where: {
          id: session.id,
        },
        data: {
          scope: current.toString(),
        },
      });
    }
    return new Response();
  } catch (error) {
    logger.error("WEBHOOK_ERROR", {
      shop,
      topic,
      error: error instanceof Error ? error.message : String(error),
    });
    // Always return 200 to prevent Shopify retries
    return new Response();
  }
};
