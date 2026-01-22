/**
 * Queue Service - BullMQ for background processing
 * Handles async image analysis jobs
 */

import { Queue, Worker, Job as BullJob } from "bullmq";
import { analyzeProductImage, isVisionError } from "./vision.server";
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
  shop: string
): Promise<BullJob<AnalysisJobData>> {
  const queue = getAnalysisQueue();
  const sanitizedProductId = sanitizeJobId(productId);
  return queue.add(
    `analyze-${sanitizedProductId}`,
    { jobId, productId, imageUrl, shop },
    {
      jobId: `${jobId}-${sanitizedProductId}`, // Unique job ID to prevent duplicates
    }
  );
}

/**
 * Add multiple products to the analysis queue
 */
export async function queueBulkAnalysis(
  jobId: string,
  products: Array<{ id: string; imageUrl: string }>,
  shop: string
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
      },
      opts: {
        jobId: `${jobId}-${sanitizedProductId}`,
      },
    };
  });

  await queue.addBulk(jobs);
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
      const { jobId, productId, imageUrl } = job.data;

      console.log(`Processing product ${productId} for job ${jobId}`);

      try {
        // Analyze the image
        const result = await analyzeProductImage(imageUrl);

        // Update the product in database
        if (isVisionError(result)) {
          await prisma.product.update({
            where: { id: productId },
            data: {
              status: "ERROR",
              error: result.error,
            },
          });
        } else {
          await prisma.product.update({
            where: { id: productId },
            data: {
              status: "ANALYZED",
              suggestedMetafields: result.metafields,
              suggestedTags: result.tags,
            },
          });
        }

        // Update job progress
        const jobRecord = await prisma.job.findUnique({
          where: { id: jobId },
          include: { products: true },
        });

        if (jobRecord) {
          const processed = jobRecord.products.filter(
            (p) => p.status !== "PENDING"
          ).length;

          await prisma.job.update({
            where: { id: jobId },
            data: {
              processed,
              status:
                processed >= jobRecord.totalItems ? "COMPLETED" : "PROCESSING",
            },
          });
        }

        return { success: true, productId };
      } catch (error) {
        console.error(`Error processing product ${productId}:`, error);

        await prisma.product.update({
          where: { id: productId },
          data: {
            status: "ERROR",
            error: error instanceof Error ? error.message : "Unknown error",
          },
        });

        throw error; // Re-throw to trigger retry
      }
    },
    {
      connection,
      concurrency: 2, // Process 2 images at a time
      limiter: {
        max: 10, // Max 10 jobs per minute (respect API limits)
        duration: 60000,
      },
    }
  );

  analysisWorker.on("completed", (job) => {
    console.log(`Job ${job.id} completed`);
  });

  analysisWorker.on("failed", (job, err) => {
    console.error(`Job ${job?.id} failed:`, err.message);
  });

  console.log("[VisionTags] Analysis worker started");
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
    console.error("[VisionTags] Failed to start analysis worker:", error);
  }
}
