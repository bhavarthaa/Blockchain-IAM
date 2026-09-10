import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";

/**
 * Run a projection/indexer batch atomically. Checkpoints must be written
 * inside the callback so a failed batch can be replayed safely.
 */
export function withDatabaseTransaction<T>(
  callback: (tx: Prisma.TransactionClient) => Promise<T>,
  options?: { isolationLevel?: Prisma.TransactionIsolationLevel },
): Promise<T> {
  return prisma.$transaction(callback, options);
}
