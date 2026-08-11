/**
 * Queue Service - BullMQ for background processing
 * Handles async image analysis jobs
 */

import { Queue, Worker, type Job as BullJob } from "bullmq";
import * as Sentry from "@sentry/remix";
import { analyzeProductImage, isVisionError } from "./vision.server";
import { extractProductGid } from "./products.server";
import { logger } from "./logger.server";
import prisma from "../db.server";

// Redis connection options for BullMQ
const getRedisConnectionOptions = () => {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    throw new Error("REDIS_URL environment variable is required");
  }
  // Parse the URL for BullMQ connection options
  const url = new URL(redisUrl);
  return {
    host: url.hostname,
    port: parseInt(url.port || "6379"),
    password: url.password || undefined,
    username: url.username || undefined,
    maxRetriesPerRequest: null as null, // Required by BullMQ
  };
};

// Queue names
const QUEUE_NAME = "vision-analysis";

// Job data types
export interface AnalysisJobData {
  jobId: string;
  productId: string;
  imageUrl: string;
  shop: string;
  industryId?: string;
  productTitle?: string;
  vendor?: string;
  language?: string;
  storeName?: string;
}

// Singleton instances
let analysisQueue: Queue<AnalysisJobData> | null = null;
let analysisWorker: Worker<AnalysisJobData> | null = null;

/**
 * Get or create the analysis queue
 */
export function getAnalysisQueue(): Queue<AnalysisJobData> {
  if (!analysisQueue) {
    const connection = getRedisConnectionOptions();
    analysisQueue = new Queue<AnalysisJobData>(QUEUE_NAME, {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 5000,
        },
        removeOnComplete: 100,
        removeOnFail: 50,
      },
    });
  }
  return analysisQueue;
}

/**
 * Sanitize an ID for use as a BullMQ job ID (no colons allowed)
 * Exported for testing
 */
export function sanitizeJobId(id: string): string {
  // Replace colons and slashes with underscores
  return id.replace(/[:/]/g, "_");
}

/**
 * Add a product to the analysis queue
 */
export async function queueProductAnalysis(
  jobId: string,
  productId: string,
  imageUrl: string,
  shop: string,
  industryId?: string,
  productTitle?: string,
  vendor?: string,
  language?: string,
  storeName?: string,
): Promise<BullJob<AnalysisJobData>> {
  const queue = getAnalysisQueue();
  const sanitizedProductId = sanitizeJobId(productId);
  return queue.add(
    `analyze-${sanitizedProductId}`,
    { jobId, productId, imageUrl, shop, industryId, productTitle, vendor, language, storeName },
    {
      jobId: `${jobId}-${sanitizedProductId}`, // Unique job ID to prevent duplicates
    }
  );
}

/**
 * Add multiple products to the analysis queue.
 * options.bullJobIdSuffix makes re-queues (e.g. retry-failed) use fresh BullMQ
 * job IDs — originals may linger in Redis (removeOnComplete/removeOnFail keep
 * recent ones) and BullMQ silently drops duplicate custom IDs.
 */
export async function queueBulkAnalysis(
  jobId: string,
  products: Array<{ id: string; imageUrl: string; title?: string; vendor?: string }>,
  shop: string,
  industryId?: string,
  language?: string,
  storeName?: string,
  options?: { bullJobIdSuffix?: string },
): Promise<void> {
  const queue = getAnalysisQueue();

  const jobs = products.map((product) => {
    const sanitizedProductId = sanitizeJobId(product.id);
    return {
      name: `analyze-${sanitizedProductId}`,
      data: {
        jobId,
        productId: product.id,
        imageUrl: product.imageUrl,
        shop,
        industryId,
        productTitle: product.title,
        vendor: product.vendor,
        language,
        storeName,
      },
      opts: {
        jobId: options?.bullJobIdSuffix
          ? `${jobId}-${sanitizedProductId}-${options.bullJobIdSuffix}`
          : `${jobId}-${sanitizedProductId}`,
      },
    };
  });

  await queue.addBulk(jobs);
}

/**
 * Mark jobs stuck in PROCESSING/QUEUED as FAILED if no progress in 15 minutes.
 * Called from the dashboard loader to clean up stale jobs.
 */
export async function cleanupStaleJobs(shop?: string): Promise<number> {
  const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);

  const where: Record<string, unknown> = {
    status: { in: ["QUEUED", "PROCESSING"] },
    updatedAt: { lt: fifteenMinutesAgo },
  };
  if (shop) {
    where.shop = shop;
  }

  const staleJobs = await prisma.job.findMany({ where });

  for (const job of staleJobs) {
    await prisma.job.update({
      where: { id: job.id },
      data: { status: "FAILED" },
    });
    logger.warn("STALE_JOB_CLEANED", {
      shop: job.shop,
      jobId: job.id,
      lastUpdated: job.updatedAt.toISOString(),
      processed: job.processed,
      totalItems: job.totalItems,
    });
  }

  return staleJobs.length;
}

/**
 * Create and start the worker that processes analysis jobs
 * Uses singleton pattern - safe to call multiple times
 */
export function startAnalysisWorker(): Worker<AnalysisJobData> {
  if (analysisWorker) {
    return analysisWorker;
  }

  const connection = getRedisConnectionOptions();

  analysisWorker = new Worker<AnalysisJobData>(
    QUEUE_NAME,
    async (job) => {
      const { jobId, productId, imageUrl, shop, industryId, productTitle, vendor, language, storeName } = job.data;

      logger.info("PRODUCT_ANALYSIS_STARTED", { shop, jobId, productId, industryId });

      // Check if product still exists before doing expensive API call
      const productRecord = await prisma.product.findUnique({
        where: { id: productId },
      });

      if (!productRecord) {
        logger.warn("PRODUCT_SKIPPED_MISSING", {
          shop,
          jobId,
          productId,
          reason: "product_record_not_found",
        });
        // Don't throw - this would trigger retries for a permanently missing record
        return { success: false, productId, skipped: true };
      }

      try {
        // Analyze the image
        Sentry.addBreadcrumb({
          category: "queue",
          message: `Analyzing product ${productId}`,
          data: { jobId, shop },
          level: "info",
        });

        const result = await analyzeProductImage(imageUrl, industryId, productTitle, language, storeName, vendor);

        // Update the product in database (wrapped in try-catch for race conditions)
        try {
          if (isVisionError(result)) {
            logger.warn("PRODUCT_ANALYSIS_ERROR", {
              shop,
              jobId,
              productId,
              error: result.error,
              code: result.code,
            });
            await prisma.product.update({
              where: { id: productId },
              data: {
                status: "ERROR",
                error: result.error,
              },
            });
          } else {
            // Include alt_text in metafields blob for storage
            const metafieldsWithAlt = {
              ...result.metafields,
              ...(result.alt_text ? { alt_text: result.alt_text } : {}),
            };
            await prisma.product.update({
              where: { id: productId },
              data: {
                status: "ANALYZED",
                suggestedMetafields: metafieldsWithAlt,
                suggestedTags: result.tags,
                suggestedDescription: result.description,
                suggestedSeoTitle: result.seo_title,
                suggestedMetaDescription: result.meta_description,
              },
            });

            // Record in the cross-run scan ledger so future scans skip this
            // product. Ledger keys on the bare GID (webhook rows are suffixed).
            // Best-effort: a ledger failure must never fail the analysis.
            try {
              const bareGid = extractProductGid(productId);
              if (bareGid) {
                await prisma.scannedProduct.upsert({
                  where: { shop_productId: { shop, productId: bareGid } },
                  create: { shop, productId: bareGid, imageUrl },
                  update: { imageUrl, scannedAt: new Date() },
                });
              }
            } catch (ledgerError) {
              logger.warn("LEDGER_UPSERT_FAILED", {
                shop,
                productId,
                error:
                  ledgerError instanceof Error
                    ? ledgerError.message
                    : String(ledgerError),
              });
            }
          }
        } catch (updateError) {
          // Product was deleted between our check and the update (P2025)
          if (updateError instanceof Error && updateError.message.includes("P2025")) {
            logger.warn("PRODUCT_SKIPPED_MISSING", {
              shop,
              jobId,
              productId,
              reason: "deleted_during_analysis",
            });
            return { success: false, productId, skipped: true };
          }
          throw updateError;
        }

        // Update job progress (count query instead of loading all product rows —
        // matters at 2,000-product Scale runs)
        const jobRecord = await prisma.job.findUnique({
          where: { id: jobId },
        });

        if (jobRecord) {
          const processed = await prisma.product.count({
            where: { jobId, status: { not: "PENDING" } },
          });

          const newStatus = processed >= jobRecord.totalItems ? "COMPLETED" : "PROCESSING";
          await prisma.job.update({
            where: { id: jobId },
            data: {
              processed,
              status: newStatus,
            },
          });

          if (newStatus === "COMPLETED") {
            logger.info("SCAN_COMPLETED", {
              shop,
              jobId,
              totalItems: jobRecord.totalItems,
              processed,
            });
          } else {
            logger.info("PRODUCT_ANALYZED", {
              shop,
              jobId,
              productId,
              progress: `${processed}/${jobRecord.totalItems}`,
            });
          }
        }

        return { success: true, productId };
      } catch (error) {
        logger.error("WORKER_JOB_FAILED", {
          shop,
          jobId,
          productId,
          error: error instanceof Error ? error.message : String(error),
        });
        Sentry.captureException(error, {
          tags: { service: "queue", jobId, productId, shop },
          extra: { imageUrl },
        });

        // Try to mark the product as errored (may fail if product was deleted)
        try {
          await prisma.product.update({
            where: { id: productId },
            data: {
              status: "ERROR",
              error: error instanceof Error ? error.message : "Unknown error",
            },
          });
        } catch (updateError) {
          logger.warn("PRODUCT_SKIPPED_MISSING", { shop, jobId, productId });
        }

        throw error; // Re-throw to trigger retry
      }
    },
    {
      connection,
      concurrency: 5, // ~1 product/sec at ~5s API latency = ~60/min
      // No limiter -- withRetry in vision.server.ts handles actual 429s
      // with exponential backoff. Eliminates 40-second stall periods.
    }
  );

  analysisWorker.on("completed", (job) => {
    logger.info("WORKER_JOB_COMPLETED", { queueJobId: job.id });
  });

  analysisWorker.on("failed", (job, err) => {
    logger.error("WORKER_JOB_FAILED", {
      queueJobId: job?.id,
      error: err.message,
    });
  });

  logger.info("WORKER_STARTED", {});
  return analysisWorker;
}

/**
 * Get queue statistics
 */
export async function getQueueStats(): Promise<{
  waiting: number;
  active: number;
  completed: number;
  failed: number;
}> {
  const queue = getAnalysisQueue();
  const [waiting, active, completed, failed] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount(),
  ]);

  return { waiting, active, completed, failed };
}

/**
 * Auto-start the worker on module load (server-side only)
 * This ensures the worker is always running when the server starts
 */
if (typeof process !== "undefined" && process.env.REDIS_URL) {
  try {
    startAnalysisWorker();
  } catch (error) {
    logger.error("WORKER_START_FAILED", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
