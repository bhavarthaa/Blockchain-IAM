import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = {
    indexedEvent: { findMany: vi.fn(), updateMany: vi.fn() },
    blockchainTransaction: { updateMany: vi.fn() },
    indexerBlock: { deleteMany: vi.fn() },
    indexerCheckpoint: { update: vi.fn() },
  };
  return {
    tx,
    prisma: {
      indexerCheckpoint: { findUnique: vi.fn() },
      indexerBlock: { findMany: vi.fn() },
      $transaction: vi.fn(async (callback: (transaction: typeof tx) => unknown) => callback(tx)),
    },
    publicClient: { getBlock: vi.fn() },
  };
});

vi.mock("../../db/prisma.js", () => ({ prisma: mocks.prisma }));
vi.mock("../../blockchain/client.js", () => ({ publicClient: mocks.publicClient }));

import { detectReorg } from "./reorg.js";

describe("indexer restart and reorganization recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.indexerCheckpoint.findUnique.mockResolvedValue({
      id: "checkpoint",
      chainId: 31337,
      scope: "platform",
      deploymentBlock: 1n,
      nextBlock: 11n,
      lastProcessedBlock: 10n,
      lastBlockHash: `0x${"aa".repeat(32)}`,
    });
    mocks.prisma.indexerBlock.findMany.mockResolvedValue([
      { blockNumber: 10n, blockHash: `0x${"aa".repeat(32)}` },
      { blockNumber: 9n, blockHash: `0x${"bb".repeat(32)}` },
    ]);
    mocks.publicClient.getBlock
      .mockResolvedValueOnce({ hash: `0x${"cc".repeat(32)}` })
      .mockResolvedValueOnce({ hash: `0x${"dd".repeat(32)}` })
      .mockResolvedValueOnce({ hash: `0x${"bb".repeat(32)}` });
    mocks.tx.indexedEvent.findMany.mockResolvedValue([{ transactionId: "tx-row" }]);
    mocks.tx.indexedEvent.updateMany.mockResolvedValue({ count: 1 });
  });

  it("rewinds a restarted worker to the latest common ancestor", async () => {
    const result = await detectReorg(31337, "platform");
    expect(result).toEqual({ reorged: true, rewindTo: 10n, commonAncestor: 9n });
    expect(mocks.tx.indexedEvent.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ blockNumber: { gt: 9n } }),
      data: expect.objectContaining({ status: "REVERTED" }),
    }));
    expect(mocks.tx.indexerCheckpoint.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        nextBlock: 10n,
        lastProcessedBlock: 9n,
        lastBlockHash: `0x${"bb".repeat(32)}`,
      }),
    }));
  });
});
