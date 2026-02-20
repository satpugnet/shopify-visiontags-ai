import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, session, topic } = await authenticate.webhook(request);

  try {
    console.log(`[VisionTags] Received ${topic} webhook for ${shop}`);

    // Webhook requests can trigger multiple times and after an app has already been uninstalled.
    // If this webhook already ran, the session may have been deleted previously.
    if (session) {
      const deleted = await db.session.deleteMany({ where: { shop } });
      console.log(`[VisionTags] App uninstalled for ${shop}, deleted ${deleted.count} sessions`);
    } else {
      console.log(`[VisionTags] App uninstalled for ${shop}, no session to delete (duplicate webhook)`);
    }

    return new Response();
  } catch (error) {
    console.error(`[VisionTags] Error handling ${topic} webhook for ${shop}:`, error);
    // Always return 200 to prevent Shopify retries
    return new Response();
  }
};
