import { describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { keccak256, toBytes } from "viem";
import { projectIndexedEvent } from "./projections.js";

const txHash = `0x${"aa".repeat(32)}`;
const blockHash = `0x${"bb".repeat(32)}`;
const contract = `0x${"cc".repeat(20)}`;
const walletAddress = `0x${"11".repeat(20)}`;

function event(eventName: string, parameters: Record<string, unknown>) {
  return {
    id: "event-row",
    chainId: 31337,
    transactionId: "transaction-row",
    contractAddress: contract,
    eventName,
    blockNumber: 42n,
    blockHash,
    transactionHash: txHash,
    transactionIndex: 0,
    logIndex: 1,
    topic0: null,
    topics: [],
    data: "0x",
    parameters,
    confirmations: 2,
    status: "PENDING",
    processingError: null,
    retryCount: 0,
    nextRetryAt: null,
    observedAt: new Date("2026-01-01T00:00:00.000Z"),
    processedAt: null,
    revertedAt: null,
    transaction: { id: "transaction-row", fromWalletId: null },
  };
}

function transaction(eventRow: ReturnType<typeof event>) {
  const mock = {
    indexedEvent: { findUnique: vi.fn().mockResolvedValue(eventRow) },
    walletAddress: { upsert: vi.fn().mockResolvedValue({ id: "wallet-row" }) },
    identity: { upsert: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    blockchainTransaction: { update: vi.fn() },
    role: { upsert: vi.fn() },
    permission: { upsert: vi.fn() },
    rolePermission: { upsert: vi.fn() },
    walletRoleAssignment: { upsert: vi.fn() },
    asset: { upsert: vi.fn(), findUnique: vi.fn(), update: vi.fn(), findFirst: vi.fn() },
    ownershipTransfer: { upsert: vi.fn() },
    auditRecord: { upsert: vi.fn() },
  };
  return mock as unknown as Prisma.TransactionClient;
}

describe("indexed event projections", () => {
  it("projects IdentityCreated with decoded parameter names and bigint block values", async () => {
    const row = event("IdentityCreated", {
      didKey: `0x${"22".repeat(32)}`,
      did: "did:example:alice",
      wallet: walletAddress,
      roleCode: "3",
      documentHash: `0x${"33".repeat(32)}`,
    });
    const tx = transaction(row);
    await projectIndexedEvent(tx, row.id);

    expect(tx.walletAddress.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { chainId_address: { chainId: 31337, address: walletAddress } },
    }));
    expect(tx.identity.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { chainId_didKey: { chainId: 31337, didKey: row.parameters.didKey } },
      create: expect.objectContaining({
        did: "did:example:alice",
        roleCode: "USER",
        createdBlockNumber: 42n,
        createdTxId: "transaction-row",
      }),
    }));
    expect(tx.blockchainTransaction.update).toHaveBeenCalledWith({
      where: { id: "transaction-row" },
      data: { fromWalletId: "wallet-row" },
    });
  });

  it("updates current ownership and upserts ownership history for AssetTransferred", async () => {
    const row = event("AssetTransferred", {
      tokenId: "7",
      from: `0x${"12".repeat(20)}`,
      to: `0x${"13".repeat(20)}`,
      operator: `0x${"14".repeat(20)}`,
    });
    const tx = transaction(row);
    tx.asset.findUnique = vi.fn().mockResolvedValue({ id: "asset-row", currentOwnerId: "old-owner" });
      // Code calls: to address first, then from, then operator
      tx.walletAddress.upsert = vi.fn()
        .mockResolvedValueOnce({ id: "to-owner" })   // 1st call: to address
        .mockResolvedValueOnce({ id: "from-owner" })  // 2nd call: from address
        .mockResolvedValueOnce({ id: "operator" });   // 3rd call: operator
      await projectIndexedEvent(tx, row.id);

      expect(tx.asset.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: "asset-row" },
        data: expect.objectContaining({ currentOwnerId: "to-owner", status: "ACTIVE" }),
      }));
      expect(tx.ownershipTransfer.upsert).toHaveBeenCalledWith(expect.objectContaining({
        where: { chainId_transactionId_logIndex: { chainId: 31337, transactionId: "transaction-row", logIndex: 1 } },
        create: expect.objectContaining({
          assetId: "asset-row",
          fromWalletId: "from-owner",
          toWalletId: "to-owner",
          operatorWalletId: "operator",
        }),
      }));
    });

  it("maps AuditLogger action hashes to the constrained AuditAction enum", async () => {
    const row = event("AuditEvent", {
      sequence: "1",
      action: keccak256(toBytes("ASSET_TRANSFERRED")),
      emitter: contract,
      targetDidKey: `0x${"00".repeat(32)}`,
      targetTokenId: "0",
      metadataHash: `0x${"00".repeat(32)}`,
      timestamp: "1704067200",
    });
    const tx = transaction(row);
    tx.identity.findUnique = vi.fn().mockResolvedValue(null);
    tx.asset.findFirst = vi.fn().mockResolvedValue(null);
    await projectIndexedEvent(tx, row.id);

    expect(tx.auditRecord.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { chainId_eventId: { chainId: 31337, eventId: "event-row" } },
      create: expect.objectContaining({
        action: "ASSET_TRANSFERRED",
        emitterAddress: contract,
        targetDidKey: null,
        targetTokenId: null,
        metadataHash: null,
      }),
    }));
  });
});
