import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import { publicClient } from "../../blockchain/client.js";
import { asyncHandler, ApiError } from "../../http/errors.js";
import { authenticate, chainId, parseBody, requirePermission } from "../../http/middleware.js";
import { sendData } from "../../http/response.js";

export const indexerRouter = Router();
indexerRouter.use(authenticate, requirePermission("INDEXER_OPERATOR"));
indexerRouter.get("/status", asyncHandler(async (req, res) => {
  const scope = String(req.query.scope ?? "all");
  const checkpoint = await prisma.indexerCheckpoint.findUnique({ where: { chainId_scope: { chainId: chainId(req), scope } } });
  const head = await publicClient.getBlockNumber();
  sendData(res, req, { checkpoint, headBlock: String(head), lag: checkpoint ? String(head - checkpoint.lastProcessedBlock) : null, subscription: "polling" });
}));
indexerRouter.post("/replay", asyncHandler(async (req, res) => {
  const body = parseBody(z.object({ chainId: z.number().int().positive(), fromBlock: z.coerce.bigint(), toBlock: z.coerce.bigint(), reason: z.string().min(3).max(500) }).strict(), req);
  if (body.toBlock < body.fromBlock || body.toBlock - body.fromBlock > 10_000n) throw ApiError.badRequest("Replay range is invalid or too large");
  sendData(res, req, { operationId: `replay_${Date.now()}`, chainId: body.chainId, fromBlock: String(body.fromBlock), toBlock: String(body.toBlock), status: "SUBMITTED" }, 202);
}));
indexerRouter.post("/reconcile", asyncHandler(async (req, res) => {
  const body = parseBody(z.object({ scope: z.enum(["assets", "identities", "roles"]), limit: z.number().int().min(1).max(1000).default(100) }).strict(), req);
  sendData(res, req, { operationId: `reconcile_${Date.now()}`, scope: body.scope, limit: body.limit, status: "SUBMITTED" }, 202);
}));
