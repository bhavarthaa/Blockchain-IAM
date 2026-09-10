import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import { AssetNFTAbi } from "../../blockchain/abis.js";
import { config } from "../../config/env.js";
import { asyncHandler, ApiError } from "../../http/errors.js";
import { authenticate, chainId, parseBody, requirePermission } from "../../http/middleware.js";
import { sendData } from "../../http/response.js";
import { submitTransaction } from "../transactions/service.js";

const token = z.string().regex(/^[0-9]+$/).refine((x) => BigInt(x) > 0n);
const addr = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const uri = z.string().min(1).max(2048).refine((x) => /^(ipfs:\/\/|https:\/\/|ar:\/\/)/.test(x), "Unsupported metadata URI");
const did = z.string().regex(/^did:[a-z0-9]+:[A-Za-z0-9._:%-]{1,480}$/);
function key(req: import("express").Request) { const k = req.header("Idempotency-Key"); if (!k) throw ApiError.badRequest("Idempotency-Key header is required"); return k; }
function routeArgs(req: import("express").Request, body: unknown) { return { chainId: chainId(req), wallet: req.auth!.wallet, route: req.originalUrl, idempotencyKey: key(req), request: body }; }

export const assetRouter = Router();
assetRouter.use(authenticate);
assetRouter.get("/", asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 50), 100);
  if (!Number.isInteger(limit) || limit < 1) throw ApiError.badRequest("Invalid limit");
  const where: Record<string, unknown> = { chainId: chainId(req) };
  if (req.query.owner) where.currentOwner = { address: String(req.query.owner).toLowerCase() };
  if (req.query.status === "ACTIVE" || req.query.status === "BURNED") where.status = req.query.status;
  const rows = await prisma.asset.findMany({ where, take: limit, orderBy: { createdAt: "desc" }, include: { currentOwner: true } });
  sendData(res, req, rows, 200, { chainId: chainId(req), freshness: "indexed" });
}));
assetRouter.get("/:tokenId", asyncHandler(async (req, res) => {
  const parsed = token.safeParse(req.params.tokenId); if (!parsed.success) throw ApiError.badRequest("Invalid token ID");
  const row = await prisma.asset.findFirst({ where: { chainId: chainId(req), tokenId: BigInt(parsed.data) }, include: { currentOwner: true, creator: true } });
  if (!row) throw ApiError.notFound("Asset not found");
  sendData(res, req, row, 200, { freshness: "indexed" });
}));
assetRouter.post("/", requirePermission("ASSET_MINT"), asyncHandler(async (req, res) => {
  const body = parseBody(z.object({ to: addr, metadataUri: uri, assetType: z.enum(["DIGITAL", "PHYSICAL"]) }).strict(), req);
  const result = await submitTransaction({ ...routeArgs(req, body), write: { abi: AssetNFTAbi, address: config.ASSET_NFT_ADDRESS, functionName: "mint", args: [body.to, body.metadataUri] } });
  sendData(res, req, result, 202, { freshness: "pending" });
}));
assetRouter.post("/:tokenId/assign", requirePermission("ASSET_ASSIGN"), asyncHandler(async (req, res) => {
  const id = token.safeParse(req.params.tokenId); if (!id.success) throw ApiError.badRequest("Invalid token ID");
  const body = parseBody(z.object({ did }).strict(), req);
  const result = await submitTransaction({ ...routeArgs(req, body), write: { abi: AssetNFTAbi, address: config.ASSET_NFT_ADDRESS, functionName: "assign", args: [BigInt(id.data), body.did] } });
  sendData(res, req, result, 202, { freshness: "pending" });
}));
assetRouter.post("/:tokenId/transfer", requirePermission("ASSET_TRANSFER"), asyncHandler(async (req, res) => {
  const id = token.safeParse(req.params.tokenId); if (!id.success) throw ApiError.badRequest("Invalid token ID");
  const body = parseBody(z.object({ from: addr, to: addr }).strict(), req);
  const result = await submitTransaction({ ...routeArgs(req, body), write: { abi: AssetNFTAbi, address: config.ASSET_NFT_ADDRESS, functionName: "transferAsset", args: [body.from, body.to, BigInt(id.data)] } });
  sendData(res, req, result, 202, { freshness: "pending" });
}));
assetRouter.patch("/:tokenId/metadata", requirePermission("ASSET_METADATA_UPDATE"), asyncHandler(async (req, res) => {
  const id = token.safeParse(req.params.tokenId); if (!id.success) throw ApiError.badRequest("Invalid token ID");
  const body = parseBody(z.object({ metadataUri: uri }).strict(), req);
  const result = await submitTransaction({ ...routeArgs(req, body), write: { abi: AssetNFTAbi, address: config.ASSET_NFT_ADDRESS, functionName: "updateTokenURI", args: [BigInt(id.data), body.metadataUri] } });
  sendData(res, req, result, 202, { freshness: "pending" });
}));
assetRouter.delete("/:tokenId", requirePermission("ASSET_BURN"), asyncHandler(async (req, res) => {
  const id = token.safeParse(req.params.tokenId); if (!id.success) throw ApiError.badRequest("Invalid token ID");
  const body = parseBody(z.object({ reason: z.string().max(500).optional() }).strict(), req);
  const result = await submitTransaction({ ...routeArgs(req, body), write: { abi: AssetNFTAbi, address: config.ASSET_NFT_ADDRESS, functionName: "burn", args: [BigInt(id.data)] } });
  sendData(res, req, result, 202, { freshness: "pending" });
}));
assetRouter.get("/:tokenId/ownership", asyncHandler(async (req, res) => {
  const id = token.safeParse(req.params.tokenId); if (!id.success) throw ApiError.badRequest("Invalid token ID");
  const row = await prisma.asset.findFirst({ where: { chainId: chainId(req), tokenId: BigInt(id.data) }, include: { currentOwner: true, ownershipHistory: { orderBy: { blockNumber: "asc" }, include: { fromWallet: true, toWallet: true } } } });
  if (!row) throw ApiError.notFound("Asset not found");
  sendData(res, req, row, 200, { freshness: "indexed" });
}));
