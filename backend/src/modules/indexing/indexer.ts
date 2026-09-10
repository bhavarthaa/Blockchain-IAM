import { prisma } from "../../db/prisma.js";
import { logger } from "../../logger.js";
import { publicClient, configuredAddress } from "../../blockchain/client.js";
import { decodeEventLog } from "viem";
import { AssetNFTAbi, AuditLoggerAbi, IdentityRegistryAbi, RoleManagerAbi } from "../../blockchain/abis.js";
import { config } from "../../config/env.js";
import { detectReorg } from "./reorg.js";

export type ChainLog = {
  chainId: number; blockNumber: bigint; blockHash: string; transactionHash: string;
  transactionIndex?: number; logIndex: number; address: string; topics: readonly string[]; data: string; eventName: string;
};

const platformAbi = [
  ...IdentityRegistryAbi,
  ...RoleManagerAbi,
  ...AssetNFTAbi,
  ...AuditLoggerAbi,
] as const;

function decodeEvent(log: Pick<ChainLog, "topics" | "data">): string {
  try {
    const decoded = decodeEventLog({
      abi: platformAbi,
      topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
      data: log.data as `0x${string}`,
      strict: false,
    });
    return String(decoded.eventName);
  } catch {
    return "UNKNOWN_EVENT";
  }
}

/** Idempotent event ingestion primitive. Projection handlers run in the same transaction. */
export async function ingestLog(log: ChainLog, project?: (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0], eventId: string) => Promise<void>) {
  return prisma.$transaction(async (tx) => {
    const transaction = await tx.blockchainTransaction.upsert({
      where: { chainId_txHash: { chainId: log.chainId, txHash: log.transactionHash } },
      create: { chainId: log.chainId, txHash: log.transactionHash, status: "MINED", blockNumber: log.blockNumber, blockHash: log.blockHash, transactionIndex: log.transactionIndex, minedAt: new Date() },
      update: { blockNumber: log.blockNumber, blockHash: log.blockHash, transactionIndex: log.transactionIndex, status: "MINED" },
    });
    const event = await tx.indexedEvent.upsert({
      where: { chainId_transactionHash_logIndex: { chainId: log.chainId, transactionHash: log.transactionHash, logIndex: log.logIndex } },
      create: { chainId: log.chainId, transactionId: transaction.id, contractAddress: log.address.toLowerCase(), eventName: log.eventName, blockNumber: log.blockNumber, blockHash: log.blockHash, transactionHash: log.transactionHash, transactionIndex: log.transactionIndex, logIndex: log.logIndex, topic0: log.topics[0], topics: log.topics, data: log.data, status: "PENDING" },
      update: {},
    });
    if (project) await project(tx, event.id);
    await tx.indexedEvent.update({ where: { id: event.id }, data: { status: "PROCESSED", processedAt: new Date() } });
    return event;
  }).catch((error) => {
    logger.error({ error, txHash: log.transactionHash, logIndex: log.logIndex }, "indexer batch failed");
    throw error;
  });
}

export async function saveCheckpoint(chainId: number, scope: string, deploymentBlock: bigint, blockNumber: bigint, blockHash: string) {
  return prisma.indexerCheckpoint.upsert({
    where: { chainId_scope: { chainId, scope } },
    create: { chainId, scope, deploymentBlock, nextBlock: blockNumber + 1n, lastProcessedBlock: blockNumber, lastBlockHash: blockHash },
    update: { nextBlock: blockNumber + 1n, lastProcessedBlock: blockNumber, lastBlockHash: blockHash },
  });
}

/** Polling worker used in deployments without websocket support. A job can
 * safely be retried: event provenance and checkpoints are unique/atomic. */
export class IndexerWorker {
  private timer?: ReturnType<typeof setTimeout>;
  private running = false;
  constructor(private readonly scope = "platform", private readonly deploymentBlock = 0n) {}

  async runOnce() {
    if (this.running) return;
    this.running = true;
    try {
      const chainId = config.CHAIN_ID;
      const reorg = await detectReorg(chainId, this.scope);
      const checkpoint = await prisma.indexerCheckpoint.findUnique({ where: { chainId_scope: { chainId, scope: this.scope } } });
      const fromBlock = reorg.reorged ? (reorg.rewindTo ?? this.deploymentBlock) : checkpoint?.nextBlock ?? this.deploymentBlock;
      const head = await publicClient.getBlockNumber();
      if (fromBlock > head) return;
      const toBlock = fromBlock + 2_000n < head ? fromBlock + 2_000n : head;
      const addresses = [
        config.IDENTITY_REGISTRY_ADDRESS, config.ROLE_MANAGER_ADDRESS,
        config.ASSET_NFT_ADDRESS, config.AUDIT_LOGGER_ADDRESS,
      ].map(configuredAddress).filter((value): value is `0x${string}` => Boolean(value));
      const logs = await publicClient.getLogs({ address: addresses.length ? addresses : undefined, fromBlock, toBlock });
      for (const log of logs) {
        await ingestLog({
          chainId, blockNumber: log.blockNumber, blockHash: log.blockHash,
          transactionHash: log.transactionHash, transactionIndex: log.transactionIndex,
          logIndex: log.logIndex, address: log.address, topics: log.topics as string[],
          data: log.data, eventName: decodeEvent(log),
        });
      }
      const block = await publicClient.getBlock({ blockNumber: toBlock });
      await saveCheckpoint(chainId, this.scope, this.deploymentBlock, toBlock, block.hash);
    } finally {
      this.running = false;
    }
  }

  start() {
    const tick = () => {
      void this.runOnce().catch((error) => logger.error({ error }, "indexer poll failed"))
        .finally(() => { this.timer = setTimeout(tick, config.INDEXER_POLL_MS); });
    };
    tick();
  }

  stop() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }
}
