-- Durable decoded event payloads, confirmation tracking, and retry metadata.
ALTER TABLE "indexed_events"
    ADD COLUMN "parameters" JSONB NOT NULL DEFAULT '{}',
    ADD COLUMN "confirmations" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "retryCount" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "nextRetryAt" TIMESTAMP(3),
    ADD COLUMN "revertedAt" TIMESTAMP(3);

CREATE TABLE "indexer_blocks" (
    "id" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "scope" VARCHAR(128) NOT NULL,
    "blockNumber" BIGINT NOT NULL,
    "blockHash" CHAR(66) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "indexer_blocks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "indexer_blocks_chainId_scope_blockNumber_key"
    ON "indexer_blocks"("chainId", "scope", "blockNumber");
CREATE INDEX "indexer_blocks_chainId_scope_blockNumber_idx"
    ON "indexer_blocks"("chainId", "scope", "blockNumber");
