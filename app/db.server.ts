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
  // Use console.error here since logger may not be loaded yet at module init
  console.error(JSON.stringify({ timestamp: new Date().toISOString(), level: "error", event: "QUEUE_SERVICE_LOAD_FAILED", error: err instanceof Error ? err.message : String(err) }));
});
