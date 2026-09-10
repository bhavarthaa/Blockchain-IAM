# SIH Blockchain IAM System Architecture

## 1. High-level architecture

The platform is a hybrid on-chain/off-chain system. The blockchain is the authoritative source for identity registration, role enforcement, asset ownership, transaction outcomes, and immutable audit events. PostgreSQL is a query-optimized projection rebuilt from blockchain events; it is never the authority for authorization or ownership.

```text
┌──────────────┐       HTTPS/JSON + WebSocket       ┌────────────────────┐
│ Next.js 14   │ ──────────────────────────────────> │ Node.js/TypeScript  │
│ dashboard    │ <────────────────────────────────── │ API + auth + tx     │
└──────┬───────┘                                    └──────┬─────────────┘
       │                                                     │
       │ Wallet provider                                     │ Prisma
       │ SIWE signatures                                     ▼
┌──────▼───────┐                                      ┌──────────────┐
│ MetaMask /   │                                      │ PostgreSQL   │
│ EVM wallet   │                                      │ read model   │
└──────┬───────┘                                      └──────────────┘
       │ JSON-RPC / signed tx                                  ▲
       ▼                                                       │ events
┌──────────────────────────────────────────────────────────────┴──┐
│ EVM network: IdentityRegistry, RoleManager, AssetNFT, AuditLogger│
└──────────────────────────────▲───────────────────────────────────┘
                               │ logs / RPC
                         ┌─────┴─────┐
                         │ Indexer   │
                         │ worker    │
                         └───────────┘
```

The Next.js application uses Wagmi/Viem/RainbowKit for wallet connection, TanStack Query for API/server state, and WebSocket notifications for projection updates. The backend exposes REST endpoints, verifies SIWE, performs authorization pre-checks, submits or relays contract transactions, serves indexed reads, and owns the indexer process. The indexer consumes contract logs and writes idempotent projections through Prisma.

The deployment target is an EVM-compatible network: Hardhat locally and Sepolia for the demo, with contract addresses, ABI, chain ID, and RPC configuration supplied through environment-specific configuration.

## 2. Component responsibilities

### Next.js frontend

- Connects and disconnects the wallet and requests the supported chain.
- Creates SIWE messages using the connected address, domain, URI, chain ID, nonce, and expiration.
- Sends signed SIWE messages to the backend.
- Renders role-aware pages: dashboard, identities, roles, assets, audit, and public verification.
- Calls the backend for authenticated reads and writes; local UI checks are not security boundaries.
- Uses direct public RPC reads for public verification, transaction status, and optional confirmation checks.
- Uploads asset and DID documents through the backend IPFS gateway.
- Shows transaction lifecycle states: preparing, awaiting signature, submitted, confirming, confirmed, failed, and indexed.
- Invalidates TanStack Query caches when WebSocket events or indexed confirmations arrive.

### Node.js/TypeScript backend

- Terminates HTTPS requests and WebSocket connections.
- Validates payloads, applies CORS, rate limits IPs and wallets, and returns structured errors.
- Implements SIWE nonce issuance, signature verification, token/session issuance, expiry, and replay protection.
- Normalizes wallet addresses and DIDs before authorization or persistence.
- Maps endpoint actions to contract permissions and performs pre-flight reads.
- Treats smart contracts, not the API, as the final authorization boundary.
- Provides read APIs from PostgreSQL for pagination, filtering, dashboards, audit export, and history.
- Falls back to direct chain reads when an indexed projection is stale.
- Coordinates IPFS pinning and returns content identifiers.
- Submits contract calls through direct-wallet or configured relayer mode.
- Starts and monitors the indexer and broadcasts projection events over WebSocket.

### PostgreSQL and Prisma

- Stores the materialized read model: identities, role assignments, assets, transfers, audit entries, indexed block checkpoints, transaction records, and IPFS metadata references.
- Stores SIWE nonces/session metadata and transaction status, but never private keys.
- Uses unique constraints on chain ID plus transaction hash/log index, DID, wallet, token ID, and checkpoint scope to make ingestion idempotent.
- Stores block hashes with indexed events so reorgs can be detected.
- Is disposable and reconstructable by replaying blockchain logs from the deployment block.

### Blockchain RPC/network

- Provides read RPC for contract calls and block/log queries.
- Accepts signed transactions from the user wallet or backend relayer.
- Provides confirmation and receipt data.
- Determines whether a state-changing operation succeeds.

### Smart contracts

- **IdentityRegistry:** maps DID to wallet, role, active status, creation time, and DID-document hash; emits identity lifecycle events.
- **RoleManager:** defines Admin, Manager, Auditor, and User roles and the ten permission actions.
- **AssetNFT:** implements ERC-721 ownership, mint, assign, transfer, burn, metadata URI updates, and ownership-history events.
- **AuditLogger:** emits immutable audit events for critical identity, role, asset, and permission operations.
- All write paths use OpenZeppelin access control, pause/emergency-stop behavior, input validation, and reentrancy protection where applicable.

### Blockchain event indexer

- Reads from a persisted checkpoint, subscribes to new blocks/logs, and periodically backfills by block range.
- Decodes all four contract ABIs and writes normalized projections in database transactions.
- Uses `(chainId, contractAddress, transactionHash, logIndex)` as the event idempotency key.
- Updates transaction records after receipts/logs are available.
- Publishes `identity.updated`, `role.updated`, `asset.updated`, `audit.created`, and `transaction.confirmed` events after committed database writes.
- Detects reorgs by comparing stored block hashes, rolls back affected projections to the common ancestor, and replays logs.

## 3. Request/response flows

### Authenticated read

1. The frontend sends a request such as `GET /api/assets` or `GET /api/identities/:did` with the session token.
2. The backend verifies token validity and address normalization.
3. The service queries PostgreSQL with pagination and filters.
4. The response includes projection data, chain identifiers, transaction hashes, confirmation/indexing status, and a `lastIndexedBlock` marker.
5. Verification-sensitive fields may be checked with a direct contract read.

### Authenticated write

1. The frontend validates form data and sends a write request with the session token and an idempotency key.
2. The backend validates the request, authenticates the wallet, checks the requested permission against the chain, and checks resource ownership where applicable.
3. The backend creates a pending transaction record.
4. The transaction service submits a contract call through direct-wallet or relayer mode.
5. The backend returns `202 Accepted` with a transaction hash, operation ID, and status URL.
6. The frontend watches the status endpoint and WebSocket events.
7. After confirmation and indexer commit, the status becomes `confirmed/indexed`.

### Public verification

1. A caller requests `/api/verify/did/:did`, `/api/verify/asset/:tokenId`, or ownership verification without a session.
2. The backend validates the identifier and reads the indexed projection.
3. It verifies freshness against the current chain head or performs direct contract reads.
4. It returns the DID/asset, current owner, active/revoked status, metadata URI, relevant transaction hashes, block numbers, and verification timestamp.
5. Public responses omit private metadata and expose wallet addresses only as defined by the product policy.

## 4. Blockchain transaction flows

### Identity creation

```text
Admin frontend → POST /identities
→ backend SIWE/auth + on-chain permission read
→ IdentityRegistry.createIdentity(wallet, did, role, documentHash)
→ receipt with IdentityCreated
→ indexer upserts Identity and AuditLog
→ WebSocket/cache invalidation → frontend
```

The DID document is stored off-chain, for example on IPFS; only its CID or hash is written on-chain. The contract remains authoritative for the DID-to-wallet binding, role, and active state.

### Role assignment/revocation

The backend checks Admin permission, submits the role mutation, and tracks the transaction. The indexer updates the role projection only from `RoleAssigned` and `RoleRevoked` events. A failed transaction leaves the prior role unchanged.

### Mint and assignment

1. The frontend uploads metadata/image through the backend IPFS service.
2. The backend returns a CID/URI and creates a pending operation.
3. The transaction service calls `AssetNFT.mint` to the target wallet, or mints to the manager and executes a separate assignment if that is the deployed contract API.
4. The contract emits mint and assignment/transfer events.
5. The indexer creates the asset, current ownership, transfer history, and audit rows.

### Transfer

1. The frontend resolves the recipient DID to a wallet through the backend or chain.
2. The backend checks that the caller is the owner or has Manager/Admin permission.
3. The owner signs directly when the asset is user-controlled; Manager/Admin actions may use the configured relayer.
4. `safeTransferFrom` or the contract transfer method executes.
5. The indexer updates current owner and appends an immutable transfer record.

### Burn and metadata update

The backend performs a pre-flight role check, submits the operation, and waits for `AssetBurned` or `MetadataUpdated`. The indexer marks a burned asset as non-current rather than deleting its history; metadata updates preserve the old URI in audit/event history.

## 5. Database synchronization flow

```text
Chain block/logs
  → indexer reads from checkpoint
  → decode + validate event
  → detect block-hash/reorg condition
  → database transaction:
       insert raw indexed event (deduplicated)
       upsert identity/role/asset/transfer/audit projection
       update transaction status
       advance checkpoint
  → commit
  → publish WebSocket notification
```

The indexer advances the checkpoint only in the same database transaction as the projection writes. If the process crashes before commit, the block is replayed safely; if it crashes after commit, uniqueness constraints prevent duplicates. A periodic reconciliation job compares selected PostgreSQL values with direct contract reads and reports drift. A full rebuild replays contract events from the deployment block.

Local development may use one confirmation; testnet/production uses a configured confirmation depth. Until finality, records are marked pending and the UI must not present them as irreversible.

## 6. Authentication flow

1. The frontend requests a one-time nonce from `POST /api/auth/nonce?address=...`.
2. The backend stores the nonce with expiry, domain, URI, chain ID, and intended address.
3. The frontend constructs a SIWE message and asks the wallet to sign it. No private key leaves the wallet.
4. The frontend posts the message and signature to `POST /api/auth/siwe`.
5. The backend verifies domain/URI, nonce, chain ID, expiration, signature, and address match; it consumes the nonce atomically.
6. The backend reads the caller's on-chain identity/role and issues a short-lived access token, 15 minutes per the blueprint.
7. Refresh requires a new controlled session/nonce flow; expired, revoked, or wrong-chain sessions are rejected.
8. Logout revokes the server-side session record where sessions are used and clears the frontend token.

SIWE authenticates control of a wallet. It does not itself grant permissions; role and resource authorization are resolved from the chain and enforced again by contracts.

## 7. Authorization flow

Authorization is defense in depth:

1. **Frontend:** hides unavailable controls based on the latest role projection; this is UX only.
2. **Backend:** authenticates SIWE, resolves wallet/DID, checks endpoint policy, reads `RoleManager.hasPermission` or `IdentityRegistry.getRole`, verifies ownership/target identity, and returns `403` before submitting an obviously unauthorized transaction.
3. **Smart contract:** checks AccessControl/permission mappings, identity status, ownership, paused state, and input constraints inside the transaction. This is the security boundary.
4. **Indexer:** records the resulting success/failure and audit event; it never grants access.

A role change takes effect on-chain first. Until the indexer catches up, the backend may use a direct chain read for authorization so stale PostgreSQL cannot extend privileges. Revoked identities are rejected even if the frontend cache still shows an old role.

## 8. Audit logging flow

1. Every critical write emits a canonical contract event and, where configured, calls `AuditLogger.log`.
2. The receipt, block number, transaction hash, actor, target DID/token, action, and event payload are captured by the indexer.
3. The indexer inserts an immutable audit projection keyed by transaction hash and log index.
4. The backend serves filtered, paginated audit timelines and CSV/JSON exports to Admin/Auditor users according to policy.
5. Public verification exposes only the permitted anonymized view and on-chain proof fields.
6. The UI links each entry to the transaction/block explorer and distinguishes indexed records from pending transactions.

The database audit table is a searchable cache. If it is altered or lost, the canonical audit history is reconstructed from contract logs.

## 9. Asset ownership flow

- A DID is bound to a wallet in `IdentityRegistry`; the wallet is the operational owner address.
- `AssetNFT.ownerOf(tokenId)` is authoritative for current ERC-721 ownership.
- The backend resolves recipient DIDs before transfer and rejects inactive/unregistered targets according to contract policy.
- PostgreSQL stores a current-owner projection plus append-only transfer history for fast UI queries.
- Ownership changes only after a successful chain transaction; pending API requests cannot change the authoritative owner.
- Burned tokens retain historical transfer/audit records but have no current owner.
- Metadata URI/CID identifies asset information; it does not establish ownership.
- Public ownership verification compares the DID's registered wallet with direct `ownerOf(tokenId)` and reports the supporting transaction/block.

## 10. Failure and recovery scenarios

| Scenario | Detection | Recovery/behavior |
|---|---|---|
| Wallet rejects signature | Frontend receives user-rejected error | Mark operation cancelled; no transaction or state change is recorded. |
| Wrong chain or disconnected wallet | Wallet/network checks and SIWE chain validation | Prompt network switch/reconnect; reject writes until chain and address match. |
| Invalid/expired SIWE nonce | Backend signature/nonce validation | Return `401`; issue a fresh nonce. Never reuse a consumed nonce. |
| Backend permission denial | Contract read or API policy returns false | Return `403`; do not submit a transaction. |
| Contract revert/paused contract | Receipt failure or simulation/revert decoding | Mark transaction failed, preserve reason, and leave projection unchanged. |
| RPC timeout/submission ambiguity | Missing receipt or provider error | Keep operation `submitted/unknown`, poll by hash through a second RPC provider; never blindly resubmit without idempotency protection. |
| Gas underpricing or relayer outage | Submission/receipt monitoring | Retry through configured provider policy or surface actionable pending state. |
| Transaction mined but indexer offline | Chain receipt exists, checkpoint lags | Report confirmed but not indexed; the indexer resumes from its checkpoint. |
| Duplicate event delivery | Unique event key constraint | Ignore duplicate and continue checkpoint processing. |
| Chain reorganization | Stored block hash differs from RPC ancestor | Roll back projections after the common ancestor and replay affected blocks. |
| PostgreSQL outage | Prisma/database health checks | Fail API writes explicitly; the indexer resumes from its durable checkpoint. |
| Database corruption or lost read model | Integrity/health check or restore event | Recreate projection tables and replay contract events from deployment block. |
| IPFS upload/pinning failure | Pinning response or CID retrieval failure | Do not submit mint/update with an unverified URI; retry or return a clear upload failure. |
| Stale frontend cache | WebSocket/indexed-block mismatch | Invalidate and refetch; direct chain verification wins for security-sensitive views. |
| Compromised relayer key | Operational monitoring/emergency response | Pause contracts, rotate/revoke relayer permissions, replace the signer, and reconcile actions from chain audit logs. |

This design keeps PostgreSQL, caches, the indexer, and the UI replaceable while preserving a single authoritative security model: wallet signatures establish caller control, smart contracts enforce authorization and ownership, and blockchain events provide immutable synchronization and audit evidence.
