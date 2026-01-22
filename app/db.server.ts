import { PrismaClient } from "@prisma/client";

declare global {
  var prismaGlobal: PrismaClient;
}

if (process.env.NODE_ENV !== "production") {
  if (!global.prismaGlobal) {
    global.prismaGlobal = new PrismaClient();
  }
}

const prisma = global.prismaGlobal ?? new PrismaClient();

export default prisma;

// Start the background worker when this module loads (server startup)
// This import has side effects - it starts the BullMQ worker
import("./services/queue.server").catch((err) => {
  console.error("[VisionTags] Failed to load queue service:", err);
});
