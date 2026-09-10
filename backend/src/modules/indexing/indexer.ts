import { Prisma, type IndexedEvent } from "@prisma/client";
import { decodeEventLog, type Abi, type Address, type Hex } from "viem";
import { prisma } from "../../db/prisma.js";
import { publicClient, configuredAddress } from "../../blockchain/client.js";
import { AssetNFTAbi, AuditLoggerAbi, IdentityRegistryAbi, RoleManagerAbi } from "../../blockchain/abis.js";
import { config } from "../../config/env.js";
import { logger } from "../../logger.js";
import { detectReorg } from "./reorg.js";

export type ChainLog = {
  chainId: number;
  blockNumber: bigint;
  blockHash: string;
  transactionHash: string;
  transactionIndex?: number;
  logIndex: number;
  address: string;
  topics: readonly string[];
  data: string;
  eventName?: string;
  parameters?: JsonValue;
};

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type DecodedChainLog = ChainLog & {
  eventName: string;
  parameters: JsonValue;
};

const platformAbi = [
  ...IdentityRegistryAbi,
  ...RoleManagerAbi,
  ...AssetNFTAbi,
  ...AuditLoggerAbi,
] as unknown as Abi;

function toJson(value: unknown): JsonValue {
  if (value === null || value === undefined) return null;
  if (typeof value === "bigint") return value.toString(10);
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Uint8Array) {
    return `0x${Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
  }
  if (Array.isArray(value)) return value.map(toJson);
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !/^\d+$/.test(key))
        .map(([key, item]) => [key, toJson(item)]),
    );
  }
  return String(value);
}

function decodedParameters(args: unknown): JsonValue {
  if (Array.isArray(args)) return args.map(toJson);
  if (args && typeof args === "object") {
    const named = Object.fromEntries(
      Object.entries(args).filter(([key]) => !/^\d+$/.test(key)).map(([key, value]) => [key, toJson(value)]),
    );
    return Object.keys(named).length > 0 ? named : toJson(args);
  }
  return {};
}

/** Decode a log against the checked-in contract artifacts. Unknown topics are
 * ignored rather than persisted as fabricated event names. */
export function decodeLog(log: Pick<ChainLog, "topics" | "data">): {
  eventName: string;
  parameters: JsonValue;
} | null {
  if (!log.topics[0]) return null;
  try {
    const decoded = decodeEventLog({
      abi: platformAbi,
      topics: log.topics as [Hex, ...Hex[]],
      data: log.data as Hex,
      strict: false,
    });
    return { eventName: String(decoded.eventName), parameters: decodedParameters(decoded.args) };
  } catch {
    return null;
  }
}

function normalizeHex(value: string): string {
  return value.toLowerCase();
}

function jsonInput(value: JsonValue): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

export type ProjectionHandler = (
  tx: Prisma.TransactionClient,
  eventId: string,
) => Promise<void>;

export function finalizedBlock(head: bigint, confirmations: number): bigint {
  const required = BigInt(confirmations);
  return head >= required ? head - required : -1n;
}

async function ingestDecodedLog(
  tx: Prisma.TransactionClient,
  log: DecodedChainLog,
  confirmations: number,
  project?: ProjectionHandler,
): Promise<IndexedEvent> {
  const transactionHash = normalizeHex(log.transactionHash);
  const blockHash = normalizeHex(log.blockHash);
  const contractAddress = normalizeHex(log.address);
  const transaction = await tx.blockchainTransaction.upsert({
    where: { chainId_txHash: { chainId: log.chainId, txHash: transactionHash } },
    create: {
      chainId: log.chainId,
      txHash: transactionHash,
      contractAddress,
      status: confirmations >= config.CONFIRMATIONS_REQUIRED ? "CONFIRMED" : "MINED",
      confirmations,
      blockNumber: log.blockNumber,
      blockHash,
      transactionIndex: log.transactionIndex,
      minedAt: new Date(),
      confirmedAt: confirmations >= config.CONFIRMATIONS_REQUIRED ? new Date() : undefined,
    },
    update: {
      contractAddress,
      blockNumber: log.blockNumber,
      blockHash,
      transactionIndex: log.transactionIndex,
      confirmations,
      status: confirmations >= config.CONFIRMATIONS_REQUIRED ? "CONFIRMED" : "MINED",
      confirmedAt: confirmations >= config.CONFIRMATIONS_REQUIRED ? new Date() : undefined,
    },
  });
  const event = await tx.indexedEvent.upsert({
    where: {
      chainId_transactionHash_logIndex: {
        chainId: log.chainId,
        transactionHash,
        logIndex: log.logIndex,
      },
    },
    create: {
      chainId: log.chainId,
      transactionId: transaction.id,
      contractAddress,
      eventName: log.eventName,
      blockNumber: log.blockNumber,
      blockHash,
      transactionHash,
      transactionIndex: log.transactionIndex,
      logIndex: log.logIndex,
      topic0: log.topics[0],
      topics: jsonInput(log.topics.map(normalizeHex)),
      data: jsonInput(log.data),
      parameters: jsonInput(log.parameters),
      confirmations,
      status: "PENDING",
    },
    update: {
      transactionId: transaction.id,
      contractAddress,
      eventName: log.eventName,
      blockNumber: log.blockNumber,
      blockHash,
      transactionIndex: log.transactionIndex,
      topic0: log.topics[0],
      topics: jsonInput(log.topics.map(normalizeHex)),
      data: jsonInput(log.data),
      parameters: jsonInput(log.parameters),
      confirmations,
      status: "PENDING",
      processingError: null,
      nextRetryAt: null,
      revertedAt: null,
    },
  });
  if (project) await project(tx, event.id);
  return tx.indexedEvent.update({
    where: { id: event.id },
    data: { status: "PROCESSED", processedAt: new Date(), processingError: null },
  });
}

async function recordFailedLog(log: DecodedChainLog, error: unknown): Promise<void> {
  try {
    await prisma.$transaction(async (tx) => {
      const transaction = await tx.blockchainTransaction.upsert({
        where: { chainId_txHash: { chainId: log.chainId, txHash: normalizeHex(log.transactionHash) } },
        create: {
          chainId: log.chainId,
          txHash: normalizeHex(log.transactionHash),
          contractAddress: normalizeHex(log.address),
          blockNumber: log.blockNumber,
          blockHash: normalizeHex(log.blockHash),
          transactionIndex: log.transactionIndex,
          status: "MINED",
          minedAt: new Date(),
        },
        update: {},
      });
      const existing = await tx.indexedEvent.findUnique({
        where: {
          chainId_transactionHash_logIndex: {
            chainId: log.chainId,
            transactionHash: normalizeHex(log.transactionHash),
            logIndex: log.logIndex,
          },
        },
        select: { id: true, retryCount: true },
      });
      await tx.indexedEvent.upsert({
        where: {
          chainId_transactionHash_logIndex: {
            chainId: log.chainId,
            transactionHash: normalizeHex(log.transactionHash),
            logIndex: log.logIndex,
          },
        },
        create: {
          chainId: log.chainId,
          transactionId: transaction.id,
          contractAddress: normalizeHex(log.address),
          eventName: log.eventName,
          blockNumber: log.blockNumber,
          blockHash: normalizeHex(log.blockHash),
          transactionHash: normalizeHex(log.transactionHash),
          transactionIndex: log.transactionIndex,
          logIndex: log.logIndex,
          topic0: log.topics[0],
          topics: jsonInput(log.topics.map(normalizeHex)),
          data: jsonInput(log.data),
          parameters: jsonInput(log.parameters),
          status: "FAILED",
          processingError: error instanceof Error ? error.message : String(error),
          retryCount: 1,
        },
        update: {
          status: "FAILED",
          processingError: error instanceof Error ? error.message : String(error),
          retryCount: (existing?.retryCount ?? 0) + 1,
          nextRetryAt: new Date(Date.now() + Math.min(300_000, 2 ** (existing?.retryCount ?? 0) * 1_000)),
        },
      });
    });
  } catch (recordError) {
    logger.error({ error: recordError }, "unable to persist indexer failure");
  }
}

/** Idempotent single-log ingestion primitive. */
export async function ingestLog(
  input: ChainLog,
  project?: ProjectionHandler,
  confirmations = config.CONFIRMATIONS_REQUIRED,
): Promise<IndexedEvent> {
  const decoded = input.eventName
    ? { eventName: input.eventName, parameters: input.parameters ?? {} }
    : decodeLog(input);
  if (!decoded) throw new Error(`Unknown contract event topic ${input.topics[0] ?? "(missing)"}`);
  const log = { ...input, eventName: decoded.eventName, parameters: decoded.parameters };
  try {
    return await prisma.$transaction((tx) => ingestDecodedLog(tx, log, confirmations, project));
  } catch (error) {
    logger.error({ error, txHash: input.transactionHash, logIndex: input.logIndex }, "indexer event failed");
    await recordFailedLog(log, error);
    throw error;
  }
}

async function ingestBatch(
  logs: DecodedChainLog[],
  chainId: number,
  scope: string,
  deploymentBlock: bigint,
  fromBlock: bigint,
  toBlock: bigint,
  blockHash: string,
  confirmations: number,
  project?: ProjectionHandler,
): Promise<void> {
  try {
    await prisma.$transaction(async (tx) => {
      for (const log of logs) await ingestDecodedLog(tx, log, confirmations, project);
      await tx.indexerBlock.upsert({
        where: { chainId_scope_blockNumber: { chainId, scope, blockNumber: toBlock } },
        create: { chainId, scope, blockNumber: toBlock, blockHash: normalizeHex(blockHash) },
        update: { blockHash: normalizeHex(blockHash) },
      });
      await tx.indexerCheckpoint.upsert({
        where: { chainId_scope: { chainId, scope } },
        create: {
          chainId,
          scope,
          deploymentBlock,
          nextBlock: toBlock + 1n,
          lastProcessedBlock: toBlock,
          lastBlockHash: normalizeHex(blockHash),
        },
        update: {
          nextBlock: toBlock + 1n,
          lastProcessedBlock: toBlock,
          lastBlockHash: normalizeHex(blockHash),
        },
      });
    });
  } catch (error) {
    // Keep a durable retry trail without advancing the cursor. The next run
    // replays the batch and changes FAILED events back to PENDING.
    await Promise.all(logs.map((log) => recordFailedLog(log, error)));
    throw error;
  }
}

export async function saveCheckpoint(
  chainId: number,
  scope: string,
  deploymentBlock: bigint,
  blockNumber: bigint,
  blockHash: string,
) {
  return prisma.$transaction(async (tx) => {
    await tx.indexerBlock.upsert({
      where: { chainId_scope_blockNumber: { chainId, scope, blockNumber } },
      create: { chainId, scope, blockNumber, blockHash: normalizeHex(blockHash) },
      update: { blockHash: normalizeHex(blockHash) },
    });
    return tx.indexerCheckpoint.upsert({
      where: { chainId_scope: { chainId, scope } },
      create: {
        chainId,
        scope,
        deploymentBlock,
        nextBlock: blockNumber + 1n,
        lastProcessedBlock: blockNumber,
        lastBlockHash: normalizeHex(blockHash),
      },
      update: {
        nextBlock: blockNumber + 1n,
        lastProcessedBlock: blockNumber,
        lastBlockHash: normalizeHex(blockHash),
      },
    });
  });
}

export class IndexerWorker {
  private timer?: ReturnType<typeof setTimeout>;
  private running = false;

  constructor(
    private readonly scope = "platform",
    private readonly deploymentBlock = config.DEPLOYMENT_BLOCK,
  ) {}

  async runOnce(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await detectReorg(config.CHAIN_ID, this.scope);
      const checkpoint = await prisma.indexerCheckpoint.findUnique({
        where: { chainId_scope: { chainId: config.CHAIN_ID, scope: this.scope } },
      });
      const addresses = [
        config.IDENTITY_REGISTRY_ADDRESS,
        config.ROLE_MANAGER_ADDRESS,
        config.ASSET_NFT_ADDRESS,
        config.AUDIT_LOGGER_ADDRESS,
      ]
        .map(configuredAddress)
        .filter((address): address is Address => Boolean(address));
      if (addresses.length === 0) {
        logger.warn("indexer has no configured contract addresses");
        return;
      }

      const head = await publicClient.getBlockNumber();
      const finalizedHead = finalizedBlock(head, config.CONFIRMATIONS_REQUIRED);
      const fromBlock = checkpoint?.nextBlock ?? this.deploymentBlock;
      if (fromBlock > finalizedHead) return;
      const batchSize = BigInt(config.INDEXER_BATCH_SIZE);
      const toBlock = fromBlock + batchSize - 1n < finalizedHead
        ? fromBlock + batchSize - 1n
        : finalizedHead;
      const logs = await publicClient.getLogs({
        address: addresses,
        fromBlock,
        toBlock,
      });
      const decoded = logs.flatMap((log) => {
        const event = decodeLog({
          topics: log.topics as readonly string[],
          data: log.data,
        });
        if (!event) return [];
        return [{
          chainId: config.CHAIN_ID,
          blockNumber: log.blockNumber,
          blockHash: log.blockHash,
          transactionHash: log.transactionHash,
          transactionIndex: log.transactionIndex,
          logIndex: log.logIndex,
          address: log.address,
          topics: log.topics as readonly string[],
          data: log.data,
          eventName: event.eventName,
          parameters: event.parameters,
        }];
      });
      const block = await publicClient.getBlock({ blockNumber: toBlock });
      const confirmationCount = Number(head - toBlock);
      await ingestBatch(
        decoded,
        config.CHAIN_ID,
        this.scope,
        this.deploymentBlock,
        fromBlock,
        toBlock,
        block.hash,
        confirmationCount,
      );
    } finally {
      this.running = false;
    }
  }

  start(): void {
    const tick = () => {
      void this.runOnce()
        .catch((error) => logger.error({ error }, "indexer poll failed"))
        .finally(() => {
          this.timer = setTimeout(tick, config.INDEXER_POLL_MS);
        });
    };
    tick();
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }
}
