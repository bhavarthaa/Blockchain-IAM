-- CreateEnum
CREATE TYPE "IdentityStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "AssetType" AS ENUM ('DIGITAL', 'PHYSICAL');

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('ACTIVE', 'BURNED');

-- CreateEnum
CREATE TYPE "RoleCode" AS ENUM ('ADMIN', 'MANAGER', 'AUDITOR', 'USER');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('CREATED', 'SUBMITTED', 'MINED', 'CONFIRMED', 'FAILED', 'REORGED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "EventProcessingStatus" AS ENUM ('PENDING', 'PROCESSED', 'FAILED', 'REVERTED');

-- CreateEnum
CREATE TYPE "VerificationType" AS ENUM ('DID', 'ASSET', 'OWNERSHIP', 'AUDIT');

-- CreateEnum
CREATE TYPE "VerificationResult" AS ENUM ('VERIFIED', 'NOT_FOUND', 'MISMATCH', 'STALE', 'ERROR');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('IDENTITY_CREATED', 'IDENTITY_UPDATED', 'IDENTITY_REVOKED', 'IDENTITY_RESTORED', 'ROLE_ASSIGNED', 'ROLE_REVOKED', 'PERMISSION_CONFIGURED', 'ASSET_MINTED', 'ASSET_ASSIGNED', 'ASSET_TRANSFERRED', 'ASSET_BURNED', 'METADATA_UPDATED');

-- CreateTable
CREATE TABLE "wallet_addresses" (
    "id" TEXT NOT NULL,
    "address" VARCHAR(42) NOT NULL,
    "chainId" INTEGER NOT NULL,
    "firstSeenBlock" BIGINT,
    "lastSeenBlock" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wallet_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identities" (
    "id" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "did" VARCHAR(512) NOT NULL,
    "didKey" CHAR(66) NOT NULL,
    "walletAddressId" TEXT NOT NULL,
    "status" "IdentityStatus" NOT NULL DEFAULT 'ACTIVE',
    "roleCode" "RoleCode",
    "documentHash" CHAR(66),
    "createdBlockNumber" BIGINT NOT NULL,
    "createdTxId" TEXT NOT NULL,
    "revokedBlockNumber" BIGINT,
    "revokedTxId" TEXT,
    "lastChainBlock" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "roleKey" CHAR(66) NOT NULL,
    "name" "RoleCode" NOT NULL,
    "displayName" TEXT,
    "onChain" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" TEXT NOT NULL,
    "permissionKey" CHAR(66) NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sourceBlockNumber" BIGINT,
    "sourceEventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "wallet_role_assignments" (
    "id" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "walletAddressId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "identityId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "assignedBlockNumber" BIGINT NOT NULL,
    "assignedTxId" TEXT NOT NULL,
    "revokedBlockNumber" BIGINT,
    "revokedTxId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wallet_role_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assets" (
    "id" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "tokenId" BIGINT NOT NULL,
    "contractAddress" VARCHAR(42) NOT NULL,
    "status" "AssetStatus" NOT NULL DEFAULT 'ACTIVE',
    "assetType" "AssetType",
    "currentOwnerId" TEXT,
    "creatorId" TEXT NOT NULL,
    "metadataUri" VARCHAR(2048) NOT NULL,
    "metadataHash" CHAR(66),
    "name" TEXT,
    "description" TEXT,
    "imageUri" TEXT,
    "serialNumber" TEXT,
    "mintedBlockNumber" BIGINT NOT NULL,
    "mintedTxId" TEXT NOT NULL,
    "burnedBlockNumber" BIGINT,
    "burnedTxId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ownership_transfers" (
    "id" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "assetId" TEXT NOT NULL,
    "fromWalletId" TEXT,
    "toWalletId" TEXT,
    "operatorWalletId" TEXT,
    "transactionId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "blockNumber" BIGINT NOT NULL,
    "logIndex" INTEGER NOT NULL,
    "reason" VARCHAR(64),
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ownership_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blockchain_transactions" (
    "id" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "txHash" CHAR(66) NOT NULL,
    "fromWalletId" TEXT,
    "toAddress" VARCHAR(42),
    "contractAddress" VARCHAR(42),
    "nonce" BIGINT,
    "blockNumber" BIGINT,
    "blockHash" CHAR(66),
    "transactionIndex" INTEGER,
    "status" "TransactionStatus" NOT NULL DEFAULT 'CREATED',
    "confirmations" INTEGER NOT NULL DEFAULT 0,
    "gasUsed" BIGINT,
    "effectiveGasPrice" BIGINT,
    "failureReason" TEXT,
    "submittedAt" TIMESTAMP(3),
    "minedAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "blockchain_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "indexed_events" (
    "id" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "transactionId" TEXT NOT NULL,
    "contractAddress" VARCHAR(42) NOT NULL,
    "eventName" VARCHAR(128) NOT NULL,
    "blockNumber" BIGINT NOT NULL,
    "blockHash" CHAR(66) NOT NULL,
    "transactionHash" CHAR(66) NOT NULL,
    "transactionIndex" INTEGER,
    "logIndex" INTEGER NOT NULL,
    "topic0" CHAR(66),
    "topics" JSONB NOT NULL,
    "data" JSONB NOT NULL,
    "status" "EventProcessingStatus" NOT NULL DEFAULT 'PENDING',
    "processingError" TEXT,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "indexed_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_records" (
    "id" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "eventId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "emitterAddress" VARCHAR(42) NOT NULL,
    "actorAddress" VARCHAR(42),
    "targetDidKey" CHAR(66),
    "targetIdentityId" TEXT,
    "targetTokenId" BIGINT,
    "targetAssetId" TEXT,
    "metadataHash" CHAR(66),
    "metadata" JSONB,
    "blockNumber" BIGINT NOT NULL,
    "blockHash" CHAR(66) NOT NULL,
    "logIndex" INTEGER NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_records" (
    "id" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "type" "VerificationType" NOT NULL,
    "result" "VerificationResult" NOT NULL,
    "requestedDid" TEXT,
    "requestedTokenId" BIGINT,
    "identityId" TEXT,
    "assetId" TEXT,
    "walletAddressId" TEXT,
    "verifiedAtBlock" BIGINT,
    "verifiedBlockHash" CHAR(66),
    "source" VARCHAR(32) NOT NULL,
    "responseSnapshot" JSONB,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "indexer_checkpoints" (
    "id" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "scope" VARCHAR(128) NOT NULL,
    "nextBlock" BIGINT NOT NULL,
    "lastProcessedBlock" BIGINT NOT NULL,
    "lastBlockHash" CHAR(66),
    "deploymentBlock" BIGINT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "indexer_checkpoints_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "wallet_addresses_address_idx" ON "wallet_addresses"("address");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_addresses_chainId_address_key" ON "wallet_addresses"("chainId", "address");

-- CreateIndex
CREATE INDEX "identities_chainId_status_idx" ON "identities"("chainId", "status");

-- CreateIndex
CREATE INDEX "identities_walletAddressId_status_idx" ON "identities"("walletAddressId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "identities_chainId_did_key" ON "identities"("chainId", "did");

-- CreateIndex
CREATE UNIQUE INDEX "identities_chainId_didKey_key" ON "identities"("chainId", "didKey");

-- CreateIndex
CREATE UNIQUE INDEX "identities_chainId_walletAddressId_key" ON "identities"("chainId", "walletAddressId");

-- CreateIndex
CREATE INDEX "roles_chainId_name_idx" ON "roles"("chainId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "roles_chainId_roleKey_key" ON "roles"("chainId", "roleKey");

-- CreateIndex
CREATE UNIQUE INDEX "roles_chainId_name_key" ON "roles"("chainId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_permissionKey_key" ON "permissions"("permissionKey");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_name_key" ON "permissions"("name");

-- CreateIndex
CREATE INDEX "role_permissions_permissionId_enabled_idx" ON "role_permissions"("permissionId", "enabled");

-- CreateIndex
CREATE INDEX "wallet_role_assignments_chainId_active_idx" ON "wallet_role_assignments"("chainId", "active");

-- CreateIndex
CREATE INDEX "wallet_role_assignments_walletAddressId_active_idx" ON "wallet_role_assignments"("walletAddressId", "active");

-- CreateIndex
CREATE INDEX "wallet_role_assignments_roleId_active_idx" ON "wallet_role_assignments"("roleId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_role_assignments_chainId_walletAddressId_roleId_key" ON "wallet_role_assignments"("chainId", "walletAddressId", "roleId");

-- CreateIndex
CREATE INDEX "assets_chainId_status_idx" ON "assets"("chainId", "status");

-- CreateIndex
CREATE INDEX "assets_currentOwnerId_status_idx" ON "assets"("currentOwnerId", "status");

-- CreateIndex
CREATE INDEX "assets_creatorId_idx" ON "assets"("creatorId");

-- CreateIndex
CREATE INDEX "assets_serialNumber_idx" ON "assets"("serialNumber");

-- CreateIndex
CREATE UNIQUE INDEX "assets_chainId_contractAddress_tokenId_key" ON "assets"("chainId", "contractAddress", "tokenId");

-- CreateIndex
CREATE INDEX "ownership_transfers_assetId_blockNumber_idx" ON "ownership_transfers"("assetId", "blockNumber");

-- CreateIndex
CREATE INDEX "ownership_transfers_toWalletId_createdAt_idx" ON "ownership_transfers"("toWalletId", "createdAt");

-- CreateIndex
CREATE INDEX "ownership_transfers_fromWalletId_createdAt_idx" ON "ownership_transfers"("fromWalletId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ownership_transfers_chainId_transactionId_logIndex_key" ON "ownership_transfers"("chainId", "transactionId", "logIndex");

-- CreateIndex
CREATE INDEX "blockchain_transactions_chainId_status_idx" ON "blockchain_transactions"("chainId", "status");

-- CreateIndex
CREATE INDEX "blockchain_transactions_fromWalletId_createdAt_idx" ON "blockchain_transactions"("fromWalletId", "createdAt");

-- CreateIndex
CREATE INDEX "blockchain_transactions_contractAddress_blockNumber_idx" ON "blockchain_transactions"("contractAddress", "blockNumber");

-- CreateIndex
CREATE UNIQUE INDEX "blockchain_transactions_chainId_txHash_key" ON "blockchain_transactions"("chainId", "txHash");

-- CreateIndex
CREATE INDEX "indexed_events_chainId_blockNumber_logIndex_idx" ON "indexed_events"("chainId", "blockNumber", "logIndex");

-- CreateIndex
CREATE INDEX "indexed_events_contractAddress_eventName_blockNumber_idx" ON "indexed_events"("contractAddress", "eventName", "blockNumber");

-- CreateIndex
CREATE INDEX "indexed_events_status_observedAt_idx" ON "indexed_events"("status", "observedAt");

-- CreateIndex
CREATE UNIQUE INDEX "indexed_events_chainId_transactionHash_logIndex_key" ON "indexed_events"("chainId", "transactionHash", "logIndex");

-- CreateIndex
CREATE INDEX "audit_records_chainId_action_occurredAt_idx" ON "audit_records"("chainId", "action", "occurredAt");

-- CreateIndex
CREATE INDEX "audit_records_emitterAddress_occurredAt_idx" ON "audit_records"("emitterAddress", "occurredAt");

-- CreateIndex
CREATE INDEX "audit_records_targetDidKey_idx" ON "audit_records"("targetDidKey");

-- CreateIndex
CREATE INDEX "audit_records_targetTokenId_idx" ON "audit_records"("targetTokenId");

-- CreateIndex
CREATE INDEX "audit_records_transactionId_idx" ON "audit_records"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "audit_records_chainId_eventId_key" ON "audit_records"("chainId", "eventId");

-- CreateIndex
CREATE INDEX "verification_records_chainId_type_result_createdAt_idx" ON "verification_records"("chainId", "type", "result", "createdAt");

-- CreateIndex
CREATE INDEX "verification_records_identityId_createdAt_idx" ON "verification_records"("identityId", "createdAt");

-- CreateIndex
CREATE INDEX "verification_records_assetId_createdAt_idx" ON "verification_records"("assetId", "createdAt");

-- CreateIndex
CREATE INDEX "indexer_checkpoints_chainId_lastProcessedBlock_idx" ON "indexer_checkpoints"("chainId", "lastProcessedBlock");

-- CreateIndex
CREATE UNIQUE INDEX "indexer_checkpoints_chainId_scope_key" ON "indexer_checkpoints"("chainId", "scope");

-- AddForeignKey
ALTER TABLE "identities" ADD CONSTRAINT "identities_walletAddressId_fkey" FOREIGN KEY ("walletAddressId") REFERENCES "wallet_addresses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identities" ADD CONSTRAINT "identities_createdTxId_fkey" FOREIGN KEY ("createdTxId") REFERENCES "blockchain_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identities" ADD CONSTRAINT "identities_revokedTxId_fkey" FOREIGN KEY ("revokedTxId") REFERENCES "blockchain_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_sourceEventId_fkey" FOREIGN KEY ("sourceEventId") REFERENCES "indexed_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_role_assignments" ADD CONSTRAINT "wallet_role_assignments_walletAddressId_fkey" FOREIGN KEY ("walletAddressId") REFERENCES "wallet_addresses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_role_assignments" ADD CONSTRAINT "wallet_role_assignments_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_role_assignments" ADD CONSTRAINT "wallet_role_assignments_identityId_fkey" FOREIGN KEY ("identityId") REFERENCES "identities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_role_assignments" ADD CONSTRAINT "wallet_role_assignments_assignedTxId_fkey" FOREIGN KEY ("assignedTxId") REFERENCES "blockchain_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_role_assignments" ADD CONSTRAINT "wallet_role_assignments_revokedTxId_fkey" FOREIGN KEY ("revokedTxId") REFERENCES "blockchain_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_currentOwnerId_fkey" FOREIGN KEY ("currentOwnerId") REFERENCES "wallet_addresses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "wallet_addresses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_mintedTxId_fkey" FOREIGN KEY ("mintedTxId") REFERENCES "blockchain_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_burnedTxId_fkey" FOREIGN KEY ("burnedTxId") REFERENCES "blockchain_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ownership_transfers" ADD CONSTRAINT "ownership_transfers_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ownership_transfers" ADD CONSTRAINT "ownership_transfers_fromWalletId_fkey" FOREIGN KEY ("fromWalletId") REFERENCES "wallet_addresses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ownership_transfers" ADD CONSTRAINT "ownership_transfers_toWalletId_fkey" FOREIGN KEY ("toWalletId") REFERENCES "wallet_addresses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ownership_transfers" ADD CONSTRAINT "ownership_transfers_operatorWalletId_fkey" FOREIGN KEY ("operatorWalletId") REFERENCES "wallet_addresses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ownership_transfers" ADD CONSTRAINT "ownership_transfers_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "blockchain_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ownership_transfers" ADD CONSTRAINT "ownership_transfers_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "indexed_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blockchain_transactions" ADD CONSTRAINT "blockchain_transactions_fromWalletId_fkey" FOREIGN KEY ("fromWalletId") REFERENCES "wallet_addresses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "indexed_events" ADD CONSTRAINT "indexed_events_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "blockchain_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_records" ADD CONSTRAINT "audit_records_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "indexed_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_records" ADD CONSTRAINT "audit_records_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "blockchain_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_records" ADD CONSTRAINT "audit_records_targetIdentityId_fkey" FOREIGN KEY ("targetIdentityId") REFERENCES "identities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_records" ADD CONSTRAINT "audit_records_targetAssetId_fkey" FOREIGN KEY ("targetAssetId") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_records" ADD CONSTRAINT "verification_records_identityId_fkey" FOREIGN KEY ("identityId") REFERENCES "identities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_records" ADD CONSTRAINT "verification_records_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_records" ADD CONSTRAINT "verification_records_walletAddressId_fkey" FOREIGN KEY ("walletAddressId") REFERENCES "wallet_addresses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

