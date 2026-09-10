import { prisma } from "../../db/prisma.js";
import { publicClient } from "../../blockchain/client.js";
import { logger } from "../../logger.js";

/** Detects checkpoint divergence before a batch is read. The caller then
 * replays from its deployment block/common ancestor. */
export async function detectReorg(chainId: number, scope: string): Promise<{ reorged: boolean; rewindTo?: bigint }> {
  const checkpoint = await prisma.indexerCheckpoint.findUnique({ where: { chainId_scope: { chainId, scope } } });
  if (!checkpoint?.lastBlockHash) return { reorged: false };
  const block = await publicClient.getBlock({ blockNumber: checkpoint.lastProcessedBlock });
  if (block.hash === checkpoint.lastBlockHash) return { reorged: false };
  logger.warn({ chainId, scope, block: checkpoint.lastProcessedBlock }, "chain reorganization detected");
  const rewindTo = checkpoint.lastProcessedBlock > checkpoint.deploymentBlock
    ? checkpoint.lastProcessedBlock - 1n
    : checkpoint.deploymentBlock;
  await prisma.$transaction([
    prisma.indexedEvent.updateMany({ where: { chainId, blockNumber: { gt: rewindTo } }, data: { status: "REVERTED", processingError: "reorg" } }),
    prisma.indexerCheckpoint.update({ where: { id: checkpoint.id }, data: { nextBlock: rewindTo, lastProcessedBlock: rewindTo, lastBlockHash: null } }),
  ]);
  return { reorged: true, rewindTo };
}
