import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";
import type { Request as ExpressRequest, RequestHandler } from "express";
import { config } from "./config/env.js";
import { logger } from "./logger.js";
import { requestContext } from "./http/middleware.js";
import { errorHandler } from "./http/errors.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { identityRouter } from "./modules/identities/routes.js";
import { roleRouter, permissionRouter, walletRoleRouter } from "./modules/roles/routes.js";
import { assetRouter } from "./modules/assets/routes.js";
import { verificationRouter } from "./modules/verification/routes.js";
import { auditRouter } from "./modules/audit/routes.js";
import { transactionRouter } from "./modules/transactions/routes.js";
import { indexerRouter } from "./modules/indexing/routes.js";
import { hasOnChainPermission } from "./blockchain/permission.js";

export function createApp() {
  const app = express();
  app.locals.permissionChecker = hasOnChainPermission;
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(cors({ origin: config.CORS_ORIGIN.split(",").map((x) => x.trim()), credentials: true }));
  app.use(express.json({ limit: "100kb" }));
  app.use(requestContext);
  const httpLogger = (pinoHttp as unknown as (options: {
    logger: typeof logger;
    genReqId: (req: ExpressRequest) => string;
  }) => RequestHandler)({ logger, genReqId: (req) => String(req.id) });
  app.use(httpLogger);
  app.use(rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: "draft-7", legacyHeaders: false }));

  app.get("/health", (_req, res) => res.json({ data: { status: "ok", chainId: config.CHAIN_ID } }));
  app.get("/ready", (_req, res) => res.json({ data: { status: "ready", chainId: config.CHAIN_ID } }));

  const api = express.Router();
  api.use("/auth", authRouter);
  api.use("/identities", identityRouter);
  api.use("/roles", roleRouter);
  api.use("/wallets", walletRoleRouter);
  api.use("/permissions", permissionRouter);
  api.use("/assets", assetRouter);
  api.use("/verify", verificationRouter);
  api.use("/verifications", verificationRouter);
  api.use("/audit", auditRouter);
  api.use("/transactions", transactionRouter);
  api.use("/indexer", indexerRouter);
  app.use("/api/v1", api);

  app.use((_req, _res, next) => next(Object.assign(new Error("Route not found"), { status: 404, code: "NOT_FOUND" })));
  app.use((error: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
    logger.error({ error, requestId: req.id }, "request failed");
    errorHandler(error, req, res, next);
  });
  return app;
}

export const app = createApp();
