/**
 * Prisma Client Mock
 * Used by vitest to mock database operations
 */

import { mockDeep } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

const prismaMock = mockDeep<PrismaClient>();

export default prismaMock;
