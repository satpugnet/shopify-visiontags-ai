/**
 * Health Check Endpoint
 * Used by Railway and other monitoring services
 * Checks database and Redis connectivity
 */

import type { LoaderFunctionArgs } from "@remix-run/node";
import prisma from "../db.server";
import Redis from "ioredis";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const checks: Record<string, string> = {};
  let isHealthy = true;

  // Check database connectivity
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = "ok";
  } catch (error) {
    console.error("[VisionTags] Health check - database failed:", error);
    checks.database = "error";
    isHealthy = false;
  }

  // Check Redis connectivity (required for queue processing)
  try {
    const redisUrl = process.env.REDIS_URL;
    if (redisUrl) {
      const redis = new Redis(redisUrl, { lazyConnect: true, connectTimeout: 5000 });
      await redis.ping();
      await redis.quit();
      checks.redis = "ok";
    } else {
      checks.redis = "not_configured";
    }
  } catch (error) {
    console.error("[VisionTags] Health check - redis failed:", error);
    checks.redis = "error";
    // Redis down = queue dead, but app still serves pages
    // Mark as degraded, not unhealthy
  }

  const status = isHealthy ? (checks.redis === "ok" ? "healthy" : "degraded") : "unhealthy";
  const statusCode = isHealthy ? 200 : 503;

  return new Response(
    JSON.stringify({
      status,
      timestamp: new Date().toISOString(),
      checks,
    }),
    {
      status: statusCode,
      headers: {
        "Content-Type": "application/json",
      },
    }
  );
};
