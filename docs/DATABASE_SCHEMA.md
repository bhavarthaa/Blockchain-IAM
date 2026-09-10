# PostgreSQL Database Schema Specification

## 1. Purpose and authority model

PostgreSQL is the Blockchain IAM platform's off-chain index and application data layer. Prisma is the ORM and migration interface. The database optimizes search, pagination, dashboards, audit filtering, verification responses, and transaction tracking; it does not replace the blockchain as the security authority.

### 1.1 Authoritative on-chain data

The following values must always be verified against the configured chain and contract before security-sensitive decisions:

- DID-to-wallet binding, identity active/revoked state, and on-chain identity role code.
- Account role membership and permission mappings in `RoleManager`.
- ERC-721 ownership, approvals, token existence, burn state, and token URI in `AssetNFT`.
- Transaction success, block inclusion, confirmations, and contract event contents.
- Immutable audit events emitted by `AuditLogger` and domain contracts.

The corresponding PostgreSQL columns are projections with provenance metadata. They may be stale during indexing, chain reorganization, RPC failure, or recovery.

### 1.2 Database-only data

The database may be authoritative for application conveniences that do not claim to alter chain state:

- Searchable metadata parsed from IPFS, display labels, UI preferences, and indexing status.
- API operation records, pending transaction tracking, nonce/session records, and retry state.
- Verification request history and cached verification responses.
- Indexer checkpoints, raw decoded event payloads, reconciliation status, and operational health.

Database-only data must never be used to authorize a transaction when a direct contract read is available.

## 2. Schema conventions

- PostgreSQL 15+ with Prisma 5.x.
- All wallet addresses are normalized lowercase hexadecimal strings and stored as `@db.VarChar(42)`.
- DIDs are stored as canonical strings with a unique constraint. Their on-chain lookup key is stored as a 32-byte hex value.
- Contract addresses are stored with chain ID and normalized lowercase form.
- Transaction hashes, block hashes, and event topics are stored as fixed-length hex strings where practical.
- EVM quantities use `BigInt`; block numbers and token IDs must not use JavaScript `Int`.
- Every indexed row includes `chainId`, block number, and transaction reference where the originating event provides them.
- `createdAt` and `updatedAt` use UTC database timestamps.
- Indexer writes are idempotent and use unique event identity `(chainId, transactionHash, logIndex)`.
- Projection rows are not hard-deleted during normal operation. Revocation, burn, and replacement are represented as state transitions.

## 3. Prisma schema

The following is the target schema for `backend/prisma/schema.prisma`. It is a design specification, not application implementation.

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum IdentityStatus {
  ACTIVE
  REVOKED
}

enum AssetType {
  DIGITAL
  PHYSICAL
}

enum AssetStatus {
  ACTIVE
  BURNED
}

enum RoleCode {
  ADMIN
  MANAGER
  AUDITOR
  USER
}

enum TransactionStatus {
  CREATED
  SUBMITTED
  MINED
  CONFIRMED
  FAILED
  REORGED
  UNKNOWN
}

enum EventProcessingStatus {
  PENDING
  PROCESSED
  FAILED
  REVERTED
}

enum VerificationType {
  DID
  ASSET
  OWNERSHIP
  AUDIT
}

enum VerificationResult {
  VERIFIED
  NOT_FOUND
  MISMATCH
  STALE
  ERROR
}

enum AuditAction {
  IDENTITY_CREATED
  IDENTITY_UPDATED
  IDENTITY_REVOKED
  IDENTITY_RESTORED
  ROLE_ASSIGNED
  ROLE_REVOKED
  PERMISSION_CONFIGURED
  ASSET_MINTED
  ASSET_ASSIGNED
  ASSET_TRANSFERRED
  ASSET_BURNED
  METADATA_UPDATED
}

model WalletAddress {
  id                  String   @id @default(cuid())
  address             String   @db.VarChar(42)
  chainId             Int
  firstSeenBlock      BigInt?
  lastSeenBlock       BigInt?
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt

  identities          Identity[]
  ownedAssets         Asset[]  @relation("CurrentAssetOwner")
  createdAssets       Asset[]  @relation("AssetCreator")
  sentTransfers       OwnershipTransfer[] @relation("TransferFrom")
  receivedTransfers   OwnershipTransfer[] @relation("TransferTo")
  operatedTransfers   OwnershipTransfer[] @relation("TransferOperator")
  roleAssignments     WalletRoleAssignment[]
  transactions        BlockchainTransaction[] @relation("TransactionSender")
  verificationRequests VerificationRecord[]

  @@unique([chainId, address])
  @@index([address])
  @@map("wallet_addresses")
}

model Identity {
  id                  String         @id @default(cuid())
  chainId             Int
  did                 String         @db.VarChar(512)
  didKey              String         @db.Char(66)
  walletAddressId     String
  status              IdentityStatus @default(ACTIVE)
  roleCode            RoleCode?
  documentHash        String?        @db.Char(66)
  createdBlockNumber  BigInt
  createdTxId         String
  revokedBlockNumber  BigInt?
  revokedTxId         String?
  lastChainBlock      BigInt
  createdAt            DateTime
  updatedAt            DateTime       @updatedAt

  wallet              WalletAddress @relation(fields: [walletAddressId], references: [id])
  createdTransaction  BlockchainTransaction @relation("IdentityCreatedByTx", fields: [createdTxId], references: [id])
  revokedTransaction  BlockchainTransaction? @relation("IdentityRevokedByTx", fields: [revokedTxId], references: [id])
  roleAssignments     WalletRoleAssignment[]
  auditRecords        AuditRecord[]
  verificationRecords VerificationRecord[]

  @@unique([chainId, did])
  @@unique([chainId, didKey])
  @@unique([chainId, walletAddressId])
  @@index([chainId, status])
  @@index([walletAddressId, status])
  @@map("identities")
}

model Role {
  id                  String   @id @default(cuid())
  chainId             Int
  roleKey             String   @db.Char(66)
  name                RoleCode
  displayName         String?
  onChain             Boolean  @default(true)
  createdAt            DateTime @default(now())
  updatedAt            DateTime @updatedAt

  permissions         RolePermission[]
  assignments         WalletRoleAssignment[]

  @@unique([chainId, roleKey])
  @@unique([chainId, name])
  @@index([chainId, name])
  @@map("roles")
}

model Permission {
  id                  String   @id @default(cuid())
  permissionKey       String   @db.Char(66)
  name                String   @db.VarChar(64)
  description         String?
  createdAt           DateTime @default(now())

  roles               RolePermission[]

  @@unique([permissionKey])
  @@unique([name])
  @@map("permissions")
}

model RolePermission {
  roleId              String
  permissionId        String
  enabled             Boolean  @default(true)
  sourceBlockNumber   BigInt?
  sourceEventId       String?
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt

  role                Role       @relation(fields: [roleId], references: [id], onDelete: Cascade)
  permission          Permission @relation(fields: [permissionId], references: [id], onDelete: Cascade)
  sourceEvent         IndexedEvent? @relation(fields: [sourceEventId], references: [id])

  @@id([roleId, permissionId])
  @@index([permissionId, enabled])
  @@map("role_permissions")
}

model WalletRoleAssignment {
  id                  String   @id @default(cuid())
  chainId             Int
  walletAddressId     String
  roleId              String
  identityId          String?
  active              Boolean  @default(true)
  assignedBlockNumber BigInt
  assignedTxId        String
  revokedBlockNumber  BigInt?
  revokedTxId         String?
  createdAt           DateTime
  updatedAt           DateTime @updatedAt

  wallet              WalletAddress @relation(fields: [walletAddressId], references: [id])
  role                Role @relation(fields: [roleId], references: [id])
  identity            Identity? @relation(fields: [identityId], references: [id])
  assignedTransaction BlockchainTransaction @relation("RoleAssignedByTx", fields: [assignedTxId], references: [id])
  revokedTransaction  BlockchainTransaction? @relation("RoleRevokedByTx", fields: [revokedTxId], references: [id])

  @@unique([chainId, walletAddressId, roleId])
  @@index([chainId, active])
  @@index([walletAddressId, active])
  @@index([roleId, active])
  @@map("wallet_role_assignments")
}

model Asset {
  id                  String      @id @default(cuid())
  chainId             Int
  tokenId             BigInt
  contractAddress     String      @db.VarChar(42)
  status              AssetStatus @default(ACTIVE)
  assetType           AssetType?
  currentOwnerId      String?
  creatorId           String
  metadataUri         String      @db.VarChar(2048)
  metadataHash        String?     @db.Char(66)
  name                String?
  description         String?
  imageUri            String?
  serialNumber        String?
  mintedBlockNumber   BigInt
  mintedTxId          String
  burnedBlockNumber   BigInt?
  burnedTxId          String?
  createdAt            DateTime
  updatedAt            DateTime    @updatedAt

  currentOwner        WalletAddress? @relation("CurrentAssetOwner", fields: [currentOwnerId], references: [id])
  creator             WalletAddress @relation("AssetCreator", fields: [creatorId], references: [id])
  mintedTransaction   BlockchainTransaction @relation("AssetMintedByTx", fields: [mintedTxId], references: [id])
  burnedTransaction   BlockchainTransaction? @relation("AssetBurnedByTx", fields: [burnedTxId], references: [id])
  ownershipHistory    OwnershipTransfer[]
  auditRecords        AuditRecord[]
  verificationRecords VerificationRecord[]

  @@unique([chainId, contractAddress, tokenId])
  @@index([chainId, status])
  @@index([currentOwnerId, status])
  @@index([creatorId])
  @@index([serialNumber])
  @@map("assets")
}

model OwnershipTransfer {
  id                  String   @id @default(cuid())
  chainId             Int
  assetId             String
  fromWalletId        String?
  toWalletId          String?
  operatorWalletId    String?
  transactionId        String
  eventId              String
  blockNumber         BigInt
  logIndex            Int
  reason              String?  @db.VarChar(64)
  createdAt            DateTime

  asset               Asset @relation(fields: [assetId], references: [id])
  fromWallet          WalletAddress? @relation("TransferFrom", fields: [fromWalletId], references: [id])
  toWallet            WalletAddress? @relation("TransferTo", fields: [toWalletId], references: [id])
  operatorWallet      WalletAddress? @relation("TransferOperator", fields: [operatorWalletId], references: [id])
  transaction         BlockchainTransaction @relation(fields: [transactionId], references: [id])
  event               IndexedEvent @relation(fields: [eventId], references: [id])

  @@unique([chainId, transactionId, logIndex])
  @@index([assetId, blockNumber])
  @@index([toWalletId, createdAt])
  @@index([fromWalletId, createdAt])
  @@map("ownership_transfers")
}

model BlockchainTransaction {
  id                  String            @id @default(cuid())
  chainId             Int
  txHash              String            @db.Char(66)
  fromWalletId        String?
  toAddress           String?           @db.VarChar(42)
  contractAddress     String?           @db.VarChar(42)
  nonce               BigInt?
  blockNumber         BigInt?
  blockHash           String?           @db.Char(66)
  transactionIndex    Int?
  status              TransactionStatus @default(CREATED)
  confirmations       Int               @default(0)
  gasUsed             BigInt?
  effectiveGasPrice   BigInt?
  failureReason       String?
  submittedAt         DateTime?
  minedAt             DateTime?
  confirmedAt         DateTime?
  createdAt           DateTime          @default(now())
  updatedAt           DateTime          @updatedAt

  fromWallet          WalletAddress? @relation("TransactionSender", fields: [fromWalletId], references: [id])
  events              IndexedEvent[]
  ownershipTransfers  OwnershipTransfer[]
  identitiesCreated   Identity[] @relation("IdentityCreatedByTx")
  identitiesRevoked   Identity[] @relation("IdentityRevokedByTx")
  roleAssignments     WalletRoleAssignment[] @relation("RoleAssignedByTx")
  roleRevocations     WalletRoleAssignment[] @relation("RoleRevokedByTx")
  assetsMinted        Asset[] @relation("AssetMintedByTx")
  assetsBurned        Asset[] @relation("AssetBurnedByTx")
  auditRecords        AuditRecord[]

  @@unique([chainId, txHash])
  @@index([chainId, status])
  @@index([fromWalletId, createdAt])
  @@index([contractAddress, blockNumber])
  @@map("blockchain_transactions")
}

model IndexedEvent {
  id                  String              @id @default(cuid())
  chainId             Int
  transactionId       String
  contractAddress     String              @db.VarChar(42)
  eventName           String              @db.VarChar(128)
  blockNumber         BigInt
  blockHash            String             @db.Char(66)
  transactionHash     String             @db.Char(66)
  transactionIndex    Int?
  logIndex            Int
  topic0              String?             @db.Char(66)
  topics              Json
  data                Json
  status              EventProcessingStatus @default(PENDING)
  processingError     String?
  observedAt          DateTime            @default(now())
  processedAt         DateTime?

  transaction         BlockchainTransaction @relation(fields: [transactionId], references: [id])
  rolePermissions     RolePermission[]
  ownershipTransfers  OwnershipTransfer[]
  auditRecords        AuditRecord[]

  @@unique([chainId, transactionHash, logIndex])
  @@index([chainId, blockNumber, logIndex])
  @@index([contractAddress, eventName, blockNumber])
  @@index([status, observedAt])
  @@map("indexed_events")
}

model AuditRecord {
  id                  String      @id @default(cuid())
  chainId             Int
  eventId             String
  transactionId        String
  action              AuditAction
  emitterAddress       String      @db.VarChar(42)
  actorAddress         String?     @db.VarChar(42)
  targetDidKey         String?     @db.Char(66)
  targetIdentityId     String?
  targetTokenId        BigInt?
  targetAssetId        String?
  metadataHash         String?     @db.Char(66)
  metadata             Json?
  blockNumber          BigInt
  blockHash            String      @db.Char(66)
  logIndex             Int
  occurredAt           DateTime
  createdAt            DateTime    @default(now())

  event               IndexedEvent @relation(fields: [eventId], references: [id])
  transaction         BlockchainTransaction @relation(fields: [transactionId], references: [id])
  targetIdentity      Identity? @relation(fields: [targetIdentityId], references: [id])
  targetAsset         Asset? @relation(fields: [targetAssetId], references: [id])

  @@unique([chainId, eventId])
  @@index([chainId, action, occurredAt])
  @@index([emitterAddress, occurredAt])
  @@index([targetDidKey])
  @@index([targetTokenId])
  @@index([transactionId])
  @@map("audit_records")
}

model VerificationRecord {
  id                  String             @id @default(cuid())
  chainId             Int
  type                VerificationType
  result              VerificationResult
  requestedDid        String?
  requestedTokenId    BigInt?
  identityId          String?
  assetId             String?
  walletAddressId     String?
  verifiedAtBlock     BigInt?
  verifiedBlockHash   String?            @db.Char(66)
  source              String             @db.VarChar(32)
  responseSnapshot    Json?
  errorMessage        String?
  createdAt           DateTime           @default(now())

  identity            Identity?          @relation(fields: [identityId], references: [id])
  asset               Asset?             @relation(fields: [assetId], references: [id])
  wallet              WalletAddress?     @relation(fields: [walletAddressId], references: [id])

  @@index([chainId, type, result, createdAt])
  @@index([identityId, createdAt])
  @@index([assetId, createdAt])
  @@map("verification_records")
}

model IndexerCheckpoint {
  id                  String   @id @default(cuid())
  chainId             Int
  scope               String   @db.VarChar(128)
  nextBlock           BigInt
  lastProcessedBlock  BigInt
  lastBlockHash       String?  @db.Char(66)
  deploymentBlock     BigInt
  updatedAt           DateTime @updatedAt
  createdAt           DateTime @default(now())

  @@unique([chainId, scope])
  @@index([chainId, lastProcessedBlock])
  @@map("indexer_checkpoints")
}
```

## 4. Relationship and ownership rules

### Wallet addresses and identities

- `WalletAddress` is the chain-scoped address directory.
- An active on-chain identity has exactly one wallet and a wallet has at most one identity per chain.
- `Identity.walletAddressId` is a projection of `IdentityRegistry.walletToDid`; the database uniqueness constraint protects projection consistency but does not establish ownership.
- A revoked identity remains stored for history. Its `status` changes to `REVOKED`; rows are never deleted to make a DID reusable.

### Roles and permissions

- `Role` and `Permission` are catalog projections keyed by on-chain `bytes32` values.
- `RolePermission` represents the permission matrix at the latest indexed block.
- `WalletRoleAssignment` is a temporal projection of `RoleManager` memberships. `active = false` and revocation provenance preserve historical assignments.
- A backend authorization check must query `RoleManager` directly or use a projection explicitly known to be fresh; it must not rely solely on `WalletRoleAssignment`.

### Assets and ownership

- `Asset` is keyed by `(chainId, contractAddress, tokenId)`.
- `currentOwnerId` is a cache of `AssetNFT.ownerOf(tokenId)`.
- `OwnershipTransfer` is append-only and references both the raw `IndexedEvent` and its `BlockchainTransaction`.
- A burned asset remains in `Asset` with `status = BURNED`; its transfer and audit history remains queryable.
- Metadata fields parsed from an IPFS document are convenience fields. `metadataUri` and the token's current URI must be reconciled against `AssetNFT`.

## 5. Blockchain transaction references

Every operation that changes blockchain state is represented by `BlockchainTransaction`:

1. The API may create a `CREATED` row before submission, identified by a client operation ID outside this schema.
2. Once a transaction hash is known, `(chainId, txHash)` becomes the immutable identity.
3. A receipt changes the row to `MINED`, with `blockNumber`, `blockHash`, gas data, and mined time.
4. After the configured confirmation depth, the row becomes `CONFIRMED`.
5. Reverted receipts become `FAILED` and retain the failure reason.
6. Reorganization handling changes affected rows to `REORGED`, removes or marks derived events, and replays the replacement canonical blocks.

The transaction row is operational and derived. A `CONFIRMED` status does not authorize an action unless the corresponding contract state and canonical receipt are still valid.

## 6. Indexed event ingestion

The indexer processes a block range inside a database transaction:

```text
read checkpoint
  → fetch canonical logs
  → insert BlockchainTransaction rows
  → insert IndexedEvent rows using (chainId, txHash, logIndex)
  → upsert identities, roles, assets, ownership, and audit records
  → update IndexerCheckpoint in the same transaction
  → commit
```

### Idempotency

- `IndexedEvent` uniqueness prevents duplicate delivery from subscriptions and backfills.
- Domain projections use their chain identifiers and source event/transaction references to make upserts repeatable.
- `OwnershipTransfer` uses event provenance, not an application-generated timestamp, as its identity.
- A failed database transaction must not advance `IndexerCheckpoint`.

### Reorganizations

- The indexer compares `lastBlockHash` with the node's canonical block hash.
- It walks backwards to a common ancestor.
- Rows derived from orphaned blocks are marked or removed in a controlled rebuild transaction.
- It replays canonical logs and advances the checkpoint only after the replacement block range commits.

## 7. Recommended indexes and query patterns

The schema includes indexes for the main application queries:

| Query | Index |
|---|---|
| Resolve a DID | `Identity(chainId, did)` |
| Find identity by wallet | `Identity(walletAddressId, status)` |
| List active assets for a wallet | `Asset(currentOwnerId, status)` |
| Asset ownership timeline | `OwnershipTransfer(assetId, blockNumber)` |
| Audit timeline filters | `AuditRecord(chainId, action, occurredAt)` |
| Transaction status polling | `BlockchainTransaction(chainId, txHash)` |
| Indexer backfill | `IndexedEvent(chainId, blockNumber, logIndex)` |
| Failed event retry | `IndexedEvent(status, observedAt)` |
| Verification history | `VerificationRecord(chainId, type, result, createdAt)` |

For high-volume deployments, partition `IndexedEvent`, `AuditRecord`, and `OwnershipTransfer` by chain or time after measuring actual workload. Do not add partitioning before confirming Prisma migration and operational support.

## 8. Data integrity and operational constraints

- Store only normalized addresses; reject mixed-case or malformed values at the application boundary.
- Validate that every referenced transaction belongs to the same chain and has a compatible contract/block provenance before inserting projections.
- Treat `blockHash`, `transactionHash`, and `logIndex` as immutable after indexing except during an explicit reorganization rollback.
- Use Prisma interactive transactions for one block batch or one event batch.
- Keep raw event `topics` and `data` so projections can be rebuilt when decoding logic changes.
- Keep contract deployment metadata separately from user-facing tables if multiple deployments of the same contract exist; at minimum, include `contractAddress` and `chainId` in every chain-scoped unique key.
- Do not store private keys, seed phrases, wallet signatures, or sensitive DID document contents in these tables.
- Apply retention policies only to `VerificationRecord.responseSnapshot` and operational failure details; retain chain-derived events and audit records for the life of the deployment.

## 9. Authoritative versus projected fields

| Data | Database role | Authority |
|---|---|---|
| `Identity.did`, wallet, active/revoked status | Search projection | `IdentityRegistry` |
| `RolePermission.enabled` | Permission cache | `RoleManager` |
| `WalletRoleAssignment.active` | Role membership cache | `RoleManager` |
| `Asset.currentOwnerId`, status | Ownership projection | `AssetNFT.ownerOf` and events |
| `Asset.metadataUri` | Token URI cache | `AssetNFT.tokenURI` |
| `OwnershipTransfer` | History projection | ERC-721/domain transfer events |
| `BlockchainTransaction.status` | Receipt/finality cache | RPC receipt and canonical chain |
| `IndexedEvent` and `AuditRecord` | Searchable event projection | Contract logs |
| `VerificationRecord` | Application history/cache | Direct verification source recorded in `source` |
| `IndexerCheckpoint` | Operational cursor | Indexer process and canonical chain |

The backend may serve projected data for normal reads, but it must include freshness/last-indexed metadata for security-sensitive responses. Before authorization, asset transfer, role mutation, identity revocation, or public proof generation, it must use direct contract reads whenever the projection may be stale.

## 10. Migration and rebuild strategy

1. Create the schema and seed the static role/permission catalog from the deployed contract constants.
2. Record each contract deployment address and deployment block in indexer configuration.
3. Start one checkpoint per `(chainId, deployment scope)`.
4. Backfill logs from deployment blocks, then switch to live subscriptions.
5. Rebuild derived tables by replaying `IndexedEvent` rows or re-reading chain logs; never infer authoritative state from user-entered application records.
6. When a contract deployment changes, use a new `scope` and contract address rather than mixing histories from incompatible deployments.

This schema keeps PostgreSQL useful for application performance while ensuring that no database row can grant a permission, change ownership, or rewrite the immutable audit history independently of the blockchain.
