import { app } from "./app.js";
import { config } from "./config/env.js";
import { logger } from "./logger.js";
import { disconnectPrisma } from "./db/prisma.js";
import { IndexerWorker } from "./modules/indexing/indexer.js";

const server = app.listen(config.PORT, () => logger.info({ port: config.PORT }, "backend listening"));
const indexer = config.INDEXER_ENABLED ? new IndexerWorker("platform", config.DEPLOYMENT_BLOCK) : undefined;
if (indexer) indexer.start();
function shutdown(signal: string) {
  logger.info({ signal }, "shutting down");
  indexer?.stop();
  server.close(() => { void disconnectPrisma().finally(() => process.exit(0)); });
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
