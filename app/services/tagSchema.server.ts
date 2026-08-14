/**
 * Tag Schema Service - database-facing helpers.
 *
 * The schema logic itself is pure and lives in ./tagSchema so the settings page
 * can parse and preview a schema client-side. Only the Prisma Json bridging
 * belongs here.
 */

import { Prisma } from "@prisma/client";
import { validateTagSchema, isUsableTagSchema, type TagSchema } from "./tagSchema";

export * from "./tagSchema";

/**
 * Read a schema out of a Prisma `Json?` column. Malformed stored data degrades to
 * null rather than breaking a scan.
 */
export function readTagSchema(raw: unknown): TagSchema | null {
  const result = validateTagSchema(raw);
  if (result.errors || !isUsableTagSchema(result.schema)) return null;
  return result.schema;
}

/**
 * Write a schema into a Prisma `Json?` column.
 *
 * Prisma's JSON input type requires a string index signature, which TagSchema
 * deliberately does not have (an open shape would defeat the point of validating
 * it). The cast is confined to this one place.
 */
export function writeTagSchema(
  schema: TagSchema | null,
): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return schema ? (schema as unknown as Prisma.InputJsonObject) : Prisma.DbNull;
}
