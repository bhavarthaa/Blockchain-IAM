import crypto from "node:crypto";
import { prisma } from "../../db/prisma.js";
import { config } from "../../config/env.js";
import { ApiError } from "../../http/errors.js";
import { configuredAddress, relayerClient, publicClient } from "../../blockchain/client.js";
import { logger } from "../../logger.js";

export type ContractWrite = {
  abi: readonly unknown[];
  address?: string;
  functionName: string;
  args?: readonly unknown[];
  value?: bigint;
};

function requestHash(input: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(input, (_, value) => typeof value === "bigint" ? value.toString() : value)).digest("hex");
}

export async function submitTransaction(input: {
  chainId: number; wallet: string; route: string; idempotencyKey: string; request: unknown; write: ContractWrite;
}) {
  if (!/^[A-Za-z0-9._:-]{8,255}$/.test(input.idempotencyKey)) {
    throw ApiError.badRequest("A valid Idempotency-Key header is required");
  }
  const hash = requestHash(input.request);
  let prior = await prisma.idempotencyRecord.findUnique({
    where: { walletAddress_route_key: { walletAddress: input.wallet, route: input.route, key: input.idempotencyKey } },
  });
  if (prior) {
    if (prior.requestHash !== hash) throw ApiError.conflict("IDEMPOTENCY_CONFLICT", "Idempotency key was used for a different request");
    if (prior.response && prior.statusCode) return { ...(prior.response as object), replayed: true };
  } else {
    try {
      prior = await prisma.idempotencyRecord.create({
        data: {
          walletAddress: input.wallet, route: input.route, key: input.idempotencyKey,
          requestHash: hash, expiresAt: new Date(Date.now() + 24 * 3600_000),
        },
      });
    } catch (error) {
      if ((error as { code?: string }).code !== "P2002") throw error;
      const claimed = await prisma.idempotencyRecord.findUnique({
        where: { walletAddress_route_key: { walletAddress: input.wallet, route: input.route, key: input.idempotencyKey } },
      });
      if (claimed?.requestHash !== hash) throw ApiError.conflict("IDEMPOTENCY_CONFLICT", "Idempotency key was used for a different request");
      if (claimed?.response && claimed.statusCode) return { ...(claimed.response as object), replayed: true };
      throw ApiError.conflict("OPERATION_IN_PROGRESS", "An operation with this idempotency key is already being submitted");
    }
  }

  const address = configuredAddress(input.write.address);
  if (!address) {
    await prisma.idempotencyRecord.delete({ where: { id: prior.id } });
    throw ApiError.upstream("Contract address is not configured");
  }
  const client = relayerClient();
  let txHash: `0x${string}`;
  try {
    txHash = await client.writeContract({
      address, abi: input.write.abi as never, functionName: input.write.functionName,
      args: input.write.args as never, value: input.write.value,
    } as never);
  } catch (error) {
    await prisma.idempotencyRecord.delete({ where: { id: prior.id } }).catch(() => undefined);
    logger.warn({ route: input.route, wallet: input.wallet, error }, "blockchain transaction submission failed");
    throw ApiError.upstream("Transaction submission failed");
  }

  const sender = await prisma.walletAddress.upsert({
    where: { chainId_address: { chainId: input.chainId, address: input.wallet } },
    create: { chainId: input.chainId, address: input.wallet },
    update: {},
  });
  const transaction = await prisma.blockchainTransaction.create({
    data: {
      chainId: input.chainId, txHash, fromWalletId: sender.id,
      contractAddress: address, status: "SUBMITTED", submittedAt: new Date(),
    },
  });
  const data = {
    operationId: `op_${transaction.id}`, transactionId: transaction.id, txHash,
    status: "SUBMITTED", statusUrl: `/api/v1/transactions/${txHash}`,
  };
  await prisma.idempotencyRecord.update({
    where: { id: prior.id },
    data: { response: data, statusCode: 202, operationId: transaction.id },
  });
  return data;
}

export async function refreshTransaction(chainId: number, txHash: `0x${string}`) {
  const tx = await prisma.blockchainTransaction.findUnique({ where: { chainId_txHash: { chainId, txHash } } });
  if (!tx) throw ApiError.notFound("Transaction not found");
  if (tx.status !== "SUBMITTED" && tx.status !== "CREATED" && tx.status !== "MINED") return tx;
  try {
    const receipt = await publicClient.getTransactionReceipt({ hash: txHash });
    const latest = await publicClient.getBlockNumber();
    const confirmations = Number(latest - receipt.blockNumber + 1n);
    const status = receipt.status === "success"
      ? (confirmations >= config.CONFIRMATIONS_REQUIRED ? "CONFIRMED" : "MINED")
      : "FAILED";
    return prisma.blockchainTransaction.update({
      where: { id: tx.id },
      data: {
        status, blockNumber: receipt.blockNumber, blockHash: receipt.blockHash,
        transactionIndex: receipt.transactionIndex, gasUsed: receipt.gasUsed,
        effectiveGasPrice: receipt.effectiveGasPrice, confirmations,
        minedAt: tx.minedAt ?? new Date(),
        confirmedAt: status === "CONFIRMED" ? new Date() : undefined,
        failureReason: status === "FAILED" ? "Transaction reverted" : null,
      },
    });
  } catch (error) {
    // A not-found receipt is normal while a transaction is pending. Other
    // provider failures are surfaced as an upstream error without resubmitting.
    if (error instanceof Error && /not found|could not be found/i.test(error.message)) return tx;
    throw ApiError.upstream("Unable to read transaction receipt");
  }
}
