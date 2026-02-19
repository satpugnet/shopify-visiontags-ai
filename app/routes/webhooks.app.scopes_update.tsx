import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { payload, session, topic, shop } = await authenticate.webhook(request);

  try {
    console.log(`[VisionTags] Received ${topic} webhook for ${shop}`);

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
    console.error(`[VisionTags] Error handling ${topic} webhook for ${shop}:`, error);
    // Always return 200 to prevent Shopify retries
    return new Response();
  }
};
