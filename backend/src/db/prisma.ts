import { PrismaClient } from "@prisma/client";
import { config } from "../config/env.js";

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
  var demoPrisma: PrismaClient | undefined;
}

/**
 * Reuse one Prisma client in development so hot reload does not exhaust
 * PostgreSQL connections. Production creates one process-wide client.
 */
function createPrismaClient(datasource?: string) {
  return new PrismaClient({
    log: config.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    datasources: datasource ? { db: { url: datasource } } : undefined,
  });
}

export const prisma = globalThis.prisma ?? createPrismaClient();
if (process.env.NODE_ENV !== "production") {
  globalThis.prisma = prisma;
}

/** Demo-mode client using SQLite for zero-setup demonstrations */
export function getDemoPrisma(): PrismaClient {
  if (!config.DEMO_MODE) {
    throw new Error("Demo mode not enabled");
  }
  if (!config.DEMO_DATABASE_URL) {
    throw new Error("DEMO_DATABASE_URL not configured");
  }
  globalThis.demoPrisma ??= createPrismaClient(config.DEMO_DATABASE_URL);
  return globalThis.demoPrisma;
}

export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
  if (globalThis.demoPrisma) {
    await globalThis.demoPrisma.$disconnect();
  }
}