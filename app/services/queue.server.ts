/**
 * Queue Service - BullMQ for background processing
 * Handles async image analysis jobs
 */

import { Queue, Worker, Job as BullJob } from "bullmq";
import IORedis from "ioredis";
import { analyzeProductImage, isVisionError } from "./vision.server";
import prisma from "../db.server";

// Redis connection
const getRedisConnection = () => {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    throw new Error("REDIS_URL environment variable is required");
  }
  return new IORedis(redisUrl, {
    maxRetriesPerRequest: null, // Required by BullMQ
  });
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

// Singleton queue instance
let analysisQueue: Queue<AnalysisJobData> | null = null;

/**
 * Get or create the analysis queue
 */
export function getAnalysisQueue(): Queue<AnalysisJobData> {
  if (!analysisQueue) {
    const connection = getRedisConnection();
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
 * Add a product to the analysis queue
 */
export async function queueProductAnalysis(
  jobId: string,
  productId: string,
  imageUrl: string,
  shop: string
): Promise<BullJob<AnalysisJobData>> {
  const queue = getAnalysisQueue();
  return queue.add(
    `analyze-${productId}`,
    { jobId, productId, imageUrl, shop },
    {
      jobId: `${jobId}-${productId}`, // Unique job ID to prevent duplicates
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

  const jobs = products.map((product) => ({
    name: `analyze-${product.id}`,
    data: {
      jobId,
      productId: product.id,
      imageUrl: product.imageUrl,
      shop,
    },
    opts: {
      jobId: `${jobId}-${product.id}`,
    },
  }));

  await queue.addBulk(jobs);
}

/**
 * Create and start the worker that processes analysis jobs
 * Should be called once on server startup
 */
export function startAnalysisWorker(): Worker<AnalysisJobData> {
  const connection = getRedisConnection();

  const worker = new Worker<AnalysisJobData>(
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

  worker.on("completed", (job) => {
    console.log(`Job ${job.id} completed`);
  });

  worker.on("failed", (job, err) => {
    console.error(`Job ${job?.id} failed:`, err.message);
  });

  return worker;
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
