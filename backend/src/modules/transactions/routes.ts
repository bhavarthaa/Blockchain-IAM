import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import { asyncHandler, ApiError } from "../../http/errors.js";
import { authenticate, chainId } from "../../http/middleware.js";
import { sendData } from "../../http/response.js";
import { refreshTransaction } from "./service.js";
import { hasOnChainPermission } from "../../blockchain/permission.js";

const txHash = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
export const transactionRouter = Router();
transactionRouter.use(authenticate);
transactionRouter.get("/:txHash", asyncHandler(async (req, res) => {
  const parsed = txHash.safeParse(req.params.txHash);
  if (!parsed.success) throw ApiError.badRequest("Invalid transaction hash");
  const value = await prisma.blockchainTransaction.findUnique({
    where: { chainId_txHash: { chainId: chainId(req), txHash: parsed.data } },
    include: { events: { select: { id: true, eventName: true, blockNumber: true, status: true } } },
  });
  if (!value) throw ApiError.notFound("Transaction not found");
  if (value.fromWalletId && value.fromWalletId !== (await prisma.walletAddress.findUnique({ where: { chainId_address: { chainId: chainId(req), address: req.auth!.wallet } } }))?.id) {
    const canViewAll = await hasOnChainPermission(req.auth!.wallet, "AUDIT_EXPORT");
    if (!canViewAll) throw ApiError.forbidden("You may only view your own transactions");
  }
  sendData(res, req, value, 200, { chainId: chainId(req), freshness: "indexed" });
}));
transactionRouter.post("/:txHash/refresh", asyncHandler(async (req, res) => {
  const parsed = txHash.safeParse(req.params.txHash);
  if (!parsed.success) throw ApiError.badRequest("Invalid transaction hash");
  sendData(res, req, await refreshTransaction(chainId(req), parsed.data as `0x${string}`), 202);
}));
