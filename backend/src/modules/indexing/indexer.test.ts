import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const transaction = {
    id: "tx-row",
    blockchainTransaction: { upsert: vi.fn() },
    indexedEvent: { upsert: vi.fn(), update: vi.fn() },
  };
  return {
    transaction,
    prisma: {
      $transaction: vi.fn(async (callback: (tx: typeof transaction) => unknown) => callback(transaction)),
    },
  };
});

vi.mock("../../db/prisma.js", () => ({ prisma: mocks.prisma }));

import { decodeLog, finalizedBlock, ingestLog } from "./indexer.js";
import { encodeAbiParameters, encodeEventTopics } from "viem";
import { IdentityRegistryAbi } from "../../blockchain/abis.js";

describe("indexer event decoding", () => {
  it("decodes ABI arguments and serializes bigint values", () => {
    const event = IdentityRegistryAbi.find((item) => item.type === "event" && item.name === "IdentityCreated");
    if (!event || event.type !== "event") throw new Error("IdentityCreated ABI is missing");
    const didKey = `0x${"11".repeat(32)}` as `0x${string}`;
    const wallet = `0x${"22".repeat(20)}` as `0x${string}`;
    const topics = encodeEventTopics({ abi: [event], eventName: "IdentityCreated", args: { didKey, wallet } });
    const inputs = (event as unknown as { inputs: readonly { indexed?: boolean; type: string; name?: string }[] }).inputs;
    const data = encodeAbiParameters(
      inputs.filter((input) => !input.indexed),
      ["example:did", 3, `0x${"33".repeat(32)}`],
    );
    expect(decodeLog({ topics: topics.filter((topic): topic is `0x${string}` => typeof topic === "string"), data })).toEqual({
      eventName: "IdentityCreated",
      parameters: {
        didKey,
        wallet,
        did: "example:did",
        roleCode: 3,
        documentHash: `0x${"33".repeat(32)}`,
      },
    });
  });

  it("does not invent an event for an unknown topic", () => {
    expect(decodeLog({ topics: [`0x${"ff".repeat(32)}`], data: "0x" })).toBeNull();
  });
});

describe("indexer durability primitives", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.blockchainTransaction.upsert.mockResolvedValue({ id: "tx-row" });
    mocks.transaction.indexedEvent.upsert.mockResolvedValue({ id: "event-row" });
    mocks.transaction.indexedEvent.update.mockResolvedValue({ id: "event-row", status: "PROCESSED" });
  });

  it("does not process a block until it has the required confirmations", () => {
    expect(finalizedBlock(10n, 2)).toBe(8n);
    expect(finalizedBlock(1n, 2)).toBe(-1n);
  });

  it("uses transaction hash and log index as an idempotent provenance key", async () => {
    const log = {
      chainId: 31337,
      blockNumber: 8n,
      blockHash: `0x${"aa".repeat(32)}`,
      transactionHash: `0x${"bb".repeat(32)}`,
      logIndex: 4,
      address: `0x${"cc".repeat(20)}`,
      topics: [`0x${"dd".repeat(32)}`],
      data: "0x",
      eventName: "IdentityCreated",
      parameters: { didKey: `0x${"11".repeat(32)}` },
    };
    await ingestLog(log);
    await ingestLog(log);
    expect(mocks.transaction.indexedEvent.upsert).toHaveBeenCalledTimes(2);
    expect(mocks.transaction.indexedEvent.upsert.mock.calls[0][0].where).toEqual({
      chainId_transactionHash_logIndex: { chainId: 31337, transactionHash: log.transactionHash, logIndex: 4 },
    });
  });
});
