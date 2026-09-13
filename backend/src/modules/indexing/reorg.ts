import { prisma } from "../../db/prisma.js";
import { publicClient } from "../../blockchain/client.js";
import { logger } from "../../logger.js";

export type ReorgResult = {
  reorged: boolean;
  rewindTo?: bigint;
  commonAncestor?: bigint;
};

/**
 * Check the durable cursor against the canonical chain and rewind to the
 * latest block header that is known to be canonical. Block headers are
 * persisted even for empty ranges, so this is not dependent on a log being
 * present at the cursor block.
 */
export async function detectReorg(chainId: number, scope: string): Promise<ReorgResult> {
  const checkpoint = await prisma.indexerCheckpoint.findUnique({
    where: { chainId_scope: { chainId, scope } },
  });
  if (!checkpoint?.lastBlockHash) return { reorged: false };

  const cursor = await publicClient.getBlock({ blockNumber: checkpoint.lastProcessedBlock });
  if (cursor.hash?.toLowerCase() === checkpoint.lastBlockHash.toLowerCase()) {
    return { reorged: false };
  }

  const history = await prisma.indexerBlock.findMany({
    where: {
      chainId,
      scope,
      blockNumber: { lte: checkpoint.lastProcessedBlock },
    },
    orderBy: { blockNumber: "desc" },
    take: 256,
  });

  let commonAncestor = checkpoint.deploymentBlock - 1n;
  let commonHash: string | null = null;
  for (const known of history) {
    if (known.blockNumber < checkpoint.deploymentBlock) continue;
    const canonical = await publicClient.getBlock({ blockNumber: known.blockNumber });
    if (canonical.hash?.toLowerCase() === known.blockHash.toLowerCase()) {
      commonAncestor = known.blockNumber;
      commonHash = canonical.hash;
      break;
    }
  }

  logger.warn(
    { chainId, scope, cursor: checkpoint.lastProcessedBlock, commonAncestor },
    "chain reorganization detected",
  );

  const rewindTo = commonAncestor + 1n;
  await prisma.$transaction(async (tx) => {
    const affected = await tx.indexedEvent.findMany({
      where: {
        chainId,
        blockNumber: { gt: commonAncestor },
        status: { not: "REVERTED" },
      },
      select: { transactionId: true },
      distinct: ["transactionId"],
    });
    const reverted = await tx.indexedEvent.updateMany({
      where: {
        chainId,
        blockNumber: { gt: commonAncestor },
        status: { not: "REVERTED" },
      },
      data: {
        status: "REVERTED",
        processingError: "reorg",
        revertedAt: new Date(),
        nextRetryAt: null,
      },
    });

    // A transaction with only reverted events must not remain confirmed.
    // Projections are rebuilt by replaying the canonical range below.
    if (reverted.count > 0 && affected.length > 0) {
      await tx.blockchainTransaction.updateMany({
        where: { id: { in: affected.map((event) => event.transactionId) } },
        data: { status: "REORGED" },
      });
    }

    await tx.indexerBlock.deleteMany({
      where: { chainId, scope, blockNumber: { gt: commonAncestor } },
    });
    await tx.indexerCheckpoint.update({
      where: { id: checkpoint.id },
      data: {
        nextBlock: rewindTo,
        lastProcessedBlock: commonAncestor,
        lastBlockHash: commonHash,
      },
    });
  });

  return { reorged: true, rewindTo, commonAncestor };
}
