/**
 * One-off backfill: seed the ScannedProduct ledger from existing Product rows.
 *
 * Run once after deploying the ScannedProduct schema:
 *   npx tsx scripts/backfill-scan-ledger.ts
 *
 * Idempotent (ON CONFLICT DO NOTHING) — safe to re-run, and safe to run
 * while the worker is already writing new ledger rows.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const inserted = await prisma.$executeRawUnsafe(`
    INSERT INTO "ScannedProduct" (shop, "productId", "imageUrl", "scannedAt", "createdAt")
    SELECT DISTINCT ON (j.shop, substring(p.id from '^gid://shopify/Product/[0-9]+'))
           j.shop,
           substring(p.id from '^gid://shopify/Product/[0-9]+'),
           p."imageUrl",
           p."createdAt",
           now()
    FROM "Product" p
    JOIN "Job" j ON j.id = p."jobId"
    WHERE p.status IN ('ANALYZED', 'SYNCED')
      AND p.id ~ '^gid://shopify/Product/[0-9]+'
    ORDER BY j.shop, substring(p.id from '^gid://shopify/Product/[0-9]+'), p."createdAt" DESC
    ON CONFLICT (shop, "productId") DO NOTHING
  `);
  console.log(`Backfilled ${inserted} ledger rows`);

  const counts = await prisma.$queryRawUnsafe<Array<{ shop: string; count: bigint }>>(
    `SELECT shop, count(*)::bigint AS count FROM "ScannedProduct" GROUP BY shop ORDER BY count DESC`
  );
  for (const row of counts) {
    console.log(`${row.shop}: ${row.count}`);
  }
}

main()
  .catch((error) => {
    console.error("Backfill failed:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
