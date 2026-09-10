import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import { IdentityRegistryAbi } from "../../blockchain/abis.js";
import { config } from "../../config/env.js";
import { asyncHandler, ApiError } from "../../http/errors.js";
import { authenticate, chainId, parseBody, requirePermission } from "../../http/middleware.js";
import { sendData } from "../../http/response.js";
import { submitTransaction } from "../transactions/service.js";

const did = z.string().regex(/^did:[a-z0-9]+:[A-Za-z0-9._:%-]{1,480}$/);
const addr = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const hash = z.string().regex(/^0x[0-9a-fA-F]{64}$/).refine((x) => !/^0x0+$/.test(x), "Hash must be non-zero");
const createSchema = z.object({ wallet: addr, did, roleCode: z.number().int().min(0).max(255), documentHash: hash }).strict();
const docSchema = z.object({ documentHash: hash }).strict();
const emptySchema = z.object({ reason: z.string().max(500).optional() }).strict();

function idempotency(req: import("express").Request) {
  const key = req.header("Idempotency-Key");
  if (!key) throw ApiError.badRequest("Idempotency-Key header is required");
  return key;
}
function data(value: unknown) { return value; }

export const identityRouter = Router();
identityRouter.use(authenticate);
identityRouter.get("/", asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 50), 100);
  if (!Number.isInteger(limit) || limit < 1) throw ApiError.badRequest("Invalid limit");
  const where: Record<string, unknown> = { chainId: chainId(req) };
  if (req.query.status === "ACTIVE" || req.query.status === "REVOKED") where.status = req.query.status;
  if (req.query.wallet) where.wallet = { address: String(req.query.wallet).toLowerCase() };
  const rows = await prisma.identity.findMany({ where, take: limit, orderBy: { createdAt: "desc" }, include: { wallet: true } });
  sendData(res, req, rows, 200, { chainId: chainId(req), freshness: "indexed" });
}));
identityRouter.get("/:did", asyncHandler(async (req, res) => {
  const parsed = did.safeParse(req.params.did);
  if (!parsed.success) throw ApiError.badRequest("Invalid DID");
  const row = await prisma.identity.findUnique({ where: { chainId_did: { chainId: chainId(req), did: parsed.data } }, include: { wallet: true } });
  if (!row) throw ApiError.notFound("Identity is not indexed");
  sendData(res, req, row, 200, { chainId: chainId(req), lastIndexedBlock: String(row.lastChainBlock), freshness: "indexed" });
}));
identityRouter.post("/", requirePermission("IDENTITY_CREATE"), asyncHandler(async (req, res) => {
  const body = parseBody(createSchema, req);
  const result = await submitTransaction({
    chainId: chainId(req), wallet: req.auth!.wallet, route: req.originalUrl, idempotencyKey: idempotency(req), request: body,
    write: { abi: IdentityRegistryAbi, address: config.IDENTITY_REGISTRY_ADDRESS, functionName: "createIdentity", args: [body.wallet, body.did, body.roleCode, body.documentHash] },
  });
  sendData(res, req, result, 202, { chainId: chainId(req), freshness: "pending" });
}));
identityRouter.patch("/:did/document", requirePermission("IDENTITY_UPDATE"), asyncHandler(async (req, res) => {
  const parsed = did.safeParse(req.params.did); if (!parsed.success) throw ApiError.badRequest("Invalid DID");
  const body = parseBody(docSchema, req);
  const result = await submitTransaction({
    chainId: chainId(req), wallet: req.auth!.wallet, route: req.originalUrl, idempotencyKey: idempotency(req), request: body,
    write: { abi: IdentityRegistryAbi, address: config.IDENTITY_REGISTRY_ADDRESS, functionName: "updateDIDDocument", args: [parsed.data, body.documentHash] },
  });
  sendData(res, req, result, 202, { freshness: "pending" });
}));
for (const [path, permission, functionName] of [["revoke", "IDENTITY_REVOKE", "revokeIdentity"], ["restore", "IDENTITY_UPDATE", "restoreIdentity"]] as const) {
  identityRouter.post(`/:did/${path}`, requirePermission(permission), asyncHandler(async (req, res) => {
    const parsed = did.safeParse(req.params.did); if (!parsed.success) throw ApiError.badRequest("Invalid DID");
    const body = parseBody(emptySchema, req);
    const result = await submitTransaction({
      chainId: chainId(req), wallet: req.auth!.wallet, route: req.originalUrl, idempotencyKey: idempotency(req), request: body,
      write: { abi: IdentityRegistryAbi, address: config.IDENTITY_REGISTRY_ADDRESS, functionName, args: [parsed.data] },
    });
    sendData(res, req, result, 202, { freshness: "pending" });
  }));
}
