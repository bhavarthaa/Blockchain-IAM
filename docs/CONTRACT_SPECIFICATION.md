# Solidity Smart-Contract Specification

## 1. Scope and design principles

This specification defines the on-chain layer for the Blockchain IAM platform:

- `IdentityRegistry` — DID-to-wallet identity lifecycle and active status.
- `RoleManager` — roles, permission constants, and on-chain authorization decisions.
- `AssetNFT` — ERC-721 asset ownership and lifecycle.
- `AuditLogger` — immutable event log for critical operations.

The contracts are Solidity `^0.8.24` projects built and tested with Hardhat and OpenZeppelin Contracts. The contracts are deployed together by one deployment script, then wired with each other's addresses. The initial deployer receives the administrator role and is responsible for transferring administration to a production multisig.

The blockchain is authoritative. Frontend controls and backend pre-flight checks are useful for UX and efficiency, but every state-changing operation below independently checks permissions on-chain.

### 1.1 Shared conventions

- Addresses are compared and stored in their native EVM form.
- DIDs are non-empty canonical strings. The registry enforces one active DID per wallet and one wallet per DID.
- Role and permission identifiers are `bytes32` constants generated with `keccak256`.
- Asset identifiers are monotonically increasing `uint256` token IDs beginning at `1`.
- Timestamps are `block.timestamp` and are informational, not consensus time guarantees.
- Contract addresses are immutable after deployment where possible. Administrative wiring functions are one-time or restricted.
- External integrations use interfaces rather than concrete type coupling.
- Events include enough indexed fields for the indexer to rebuild PostgreSQL without trusting API-originated data.

### 1.2 Roles and permissions

| Role | Intended authority |
|---|---|
| `DEFAULT_ADMIN_ROLE` | Contract administration, emergency controls, role-manager configuration |
| `ADMIN_ROLE` | Full IAM and asset administration |
| `MANAGER_ROLE` | Asset lifecycle management |
| `AUDITOR_ROLE` | Read access off-chain; no state-changing contract permission |
| `USER_ROLE` | Own-asset operations allowed by the asset contract |

The ten permission constants are:

```text
IDENTITY_CREATE
IDENTITY_UPDATE
IDENTITY_REVOKE
ROLE_ASSIGN
ASSET_MINT
ASSET_ASSIGN
ASSET_TRANSFER
ASSET_BURN
ASSET_METADATA_UPDATE
AUDIT_EXPORT
```

`AUDIT_EXPORT` controls the backend export endpoint. It is represented in the contract permission model for consistent policy, although the chain cannot restrict an off-chain database query by itself.

## 2. RoleManager

### 2.1 Purpose

`RoleManager` is the single on-chain policy registry. It maps accounts to platform roles, maps roles to permission constants, and exposes view functions used by the other contracts. It must not rely on frontend visibility or backend claims.

`IdentityRegistry` is the source of DID-to-wallet identity status. `RoleManager` is the source of account-to-role permission decisions. A state-changing contract checks both when an operation requires an active identity.

### 2.2 Storage

```text
mapping(bytes32 role => mapping(address account => bool)) roleMembers
mapping(bytes32 role => mapping(bytes32 permission => bool)) rolePermissions
mapping(address account => uint8 roleCount) activeRoleCount
address identityRegistry
bool initialized
```

OpenZeppelin `AccessControl` may provide the role membership storage and admin hierarchy. The explicit permission mapping remains required so permissions can be queried without duplicating policy in each consuming contract.

Defined role constants:

```text
ADMIN_ROLE
MANAGER_ROLE
AUDITOR_ROLE
USER_ROLE
```

### 2.3 Public and external functions

```solidity
function hasRole(bytes32 role, address account) public view returns (bool);
function hasPermission(address account, bytes32 permission) public view returns (bool);
function getPermissions(bytes32 role) external view returns (bytes32[] memory);
function getAccountRoles(address account) external view returns (bytes32[] memory);
function setPermission(bytes32 role, bytes32 permission, bool enabled)
    external
    onlyRole(DEFAULT_ADMIN_ROLE);
function grantPlatformRole(bytes32 role, address account)
    external
    onlyRole(ROLE_ASSIGNER_ROLE);
function revokePlatformRole(bytes32 role, address account)
    external
    onlyRole(ROLE_ASSIGNER_ROLE);
function setIdentityRegistry(address registry)
    external
    onlyRole(DEFAULT_ADMIN_ROLE);
function isKnownRole(bytes32 role) external pure returns (bool);
```

`ROLE_ASSIGNER_ROLE` is granted to `ADMIN_ROLE` during deployment. `grantPlatformRole` and `revokePlatformRole` reject unknown roles and the zero address.

### 2.4 Events

```solidity
event PlatformRoleGranted(
    bytes32 indexed role,
    address indexed account,
    address indexed sender
);
event PlatformRoleRevoked(
    bytes32 indexed role,
    address indexed account,
    address indexed sender
);
event PermissionConfigured(
    bytes32 indexed role,
    bytes32 indexed permission,
    bool enabled,
    address indexed sender
);
event IdentityRegistryConfigured(address indexed registry);
```

OpenZeppelin `RoleGranted`, `RoleRevoked`, and `RoleAdminChanged` events are also emitted where `AccessControl` is used.

### 2.5 Modifiers and security controls

- `onlyRole(DEFAULT_ADMIN_ROLE)` for permission configuration and address wiring.
- `onlyRole(ROLE_ASSIGNER_ROLE)` for role assignment and revocation.
- `validAccount(account)` rejects the zero address.
- `knownRole(role)` rejects arbitrary role identifiers.
- `whenNotPaused` for role mutations if emergency pausing is enabled.
- Admin cannot remove the final operational administrator without first assigning another one.
- Role administration is not inferred from a DID string supplied by a caller; it is checked against `msg.sender`.

### 2.6 Contract interactions

- `IdentityRegistry` calls `hasPermission` before identity lifecycle operations and may call role-manager grant/revoke functions through a restricted interface when role changes are part of identity operations.
- `AssetNFT` calls `hasPermission` for mint, assign, transfer, burn, and metadata updates.
- `AuditLogger` checks that the caller is an approved logger contract, not merely an account with a UI role.
- The backend uses read-only calls for pre-flight checks but cannot override a contract result.

### 2.7 Failure conditions

- `UnknownRole(role)` when a caller supplies an unsupported role.
- `InvalidAccount()` for the zero address.
- `MissingPermission(account, permission)` for unauthorized operations.
- `IdentityRegistryNotConfigured()` when identity-dependent checks are attempted before wiring.
- `CannotRemoveLastAdmin()` when an operation would leave the system without an administrator.
- `AlreadyGranted` or `AccessControlUnauthorizedAccount` from OpenZeppelin for duplicate or unauthorized role changes.

## 3. IdentityRegistry

### 3.1 Purpose

`IdentityRegistry` manages W3C-compatible DID references bound to EVM wallet addresses. It stores the minimum on-chain identity state needed to authorize platform actions and verify that an identity is active. The DID document contents remain off-chain; the registry stores its content hash or IPFS CID.

### 3.2 Storage

```text
struct Identity {
    string did;
    address wallet;
    bytes32 documentHash;
    uint8 roleCode;
    uint64 createdAt;
    uint64 updatedAt;
    bool active;
}

mapping(bytes32 didKey => Identity identity) identities
mapping(address wallet => bytes32 didKey) walletToDid
mapping(bytes32 didKey => bool exists) identityExists
address roleManager
address auditLogger
bool paused
```

The mapping key is `keccak256(bytes(did))`; the original DID string is retained for event and verification output. A DID cannot be silently rebound to a different wallet.

### 3.3 Roles and permissions

| Operation | Required permission | Additional rule |
|---|---|---|
| Create identity | `IDENTITY_CREATE` | DID and wallet must be unused |
| Update document | `IDENTITY_UPDATE` | Admin, or the identity's wallet for self-update |
| Revoke identity | `IDENTITY_REVOKE` | Admin only by default |
| Restore identity | `IDENTITY_UPDATE` | Admin only; optional recovery operation |
| Assign/revoke platform role | `ROLE_ASSIGN` | Admin only; delegates to `RoleManager` |

`roleCode` is a display/projection value. The authoritative permissions are the role memberships held by `RoleManager`.

### 3.4 Public and external functions

```solidity
function createIdentity(
    address wallet,
    string calldata did,
    uint8 roleCode,
    bytes32 documentHash
) external returns (bytes32 didKey);

function updateDIDDocument(
    string calldata did,
    bytes32 newDocumentHash
) external;

function revokeIdentity(string calldata did) external;
function restoreIdentity(string calldata did) external;

function assignRole(
    string calldata did,
    bytes32 role,
    address account
) external;

function revokeRole(
    string calldata did,
    bytes32 role,
    address account
) external;

function resolveDID(string calldata did)
    external
    view
    returns (Identity memory);

function didForWallet(address wallet) external view returns (string memory);
function didKeyForWallet(address wallet) external view returns (bytes32);
function isActiveWallet(address wallet) external view returns (bool);
function isActiveDID(string calldata did) external view returns (bool);
function walletForDID(string calldata did) external view returns (address);
function getRoleCode(string calldata did) external view returns (uint8);

function setRoleManager(address manager) external;
function setAuditLogger(address logger) external;
function pause() external;
function unpause() external;
```

Configuration functions are one-time and restricted to `DEFAULT_ADMIN_ROLE`; `pause` and `unpause` are restricted to emergency administrators.

### 3.5 Events

```solidity
event IdentityCreated(
    bytes32 indexed didKey,
    string did,
    address indexed wallet,
    uint8 roleCode,
    bytes32 documentHash
);
event IdentityUpdated(
    bytes32 indexed didKey,
    address indexed wallet,
    bytes32 previousDocumentHash,
    bytes32 newDocumentHash
);
event IdentityRevoked(
    bytes32 indexed didKey,
    string did,
    address indexed revoker
);
event IdentityRestored(
    bytes32 indexed didKey,
    string did,
    address indexed restorer
);
event IdentityRoleAssigned(
    bytes32 indexed didKey,
    address indexed account,
    bytes32 indexed role,
    address assigner
);
event IdentityRoleRevoked(
    bytes32 indexed didKey,
    address indexed account,
    bytes32 indexed role,
    address revoker
);
event RoleManagerConfigured(address indexed roleManager);
event AuditLoggerConfigured(address indexed auditLogger);
```

### 3.6 Modifiers and security controls

- `onlyPermission(IDENTITY_CREATE)` for creation.
- `onlyPermission(IDENTITY_REVOKE)` for revocation.
- `onlyPermission(ROLE_ASSIGN)` for role changes.
- `onlyIdentityOwnerOrPermission(did, IDENTITY_UPDATE)` for document updates.
- `identityExists(didKey)` and `activeIdentity(didKey)` for applicable operations.
- `validDID(did)` rejects empty and oversized input.
- `validDocumentHash` rejects an empty hash for create/update.
- `nonReentrant` on state-changing identity operations.
- `whenNotPaused` on all lifecycle writes.
- No function accepts a caller-supplied actor address for authorization; `msg.sender` is always used.
- Revocation does not delete identity history or release a DID/wallet binding for reuse unless a separately governed migration policy is introduced.

### 3.7 Contract interactions

- Queries `RoleManager.hasPermission(msg.sender, permission)` for authorization.
- Calls `RoleManager.grantPlatformRole` or `revokePlatformRole` through a restricted interface for role synchronization.
- Calls `AuditLogger.log` for identity creation, updates, revocations, restoration, and role changes.
- `AssetNFT` calls `isActiveWallet` before assigning assets to an identity and can resolve a DID to a wallet.

### 3.8 Failure conditions

- `EmptyDID()` or `DocumentHashRequired()`.
- `InvalidWallet()` for the zero address.
- `DIDAlreadyRegistered(didKey)` or `WalletAlreadyRegistered(wallet)`.
- `IdentityNotFound(didKey)`.
- `IdentityInactive(didKey)`.
- `UnauthorizedIdentityUpdate()`.
- `RoleManagerNotConfigured()` or `AuditLoggerNotConfigured()`.
- `CannotRevokeAdminIdentity()` if deployment policy protects the final administrator.
- OpenZeppelin `Pausable` and `ReentrancyGuard` errors where applicable.

## 4. AssetNFT

### 4.1 Purpose

`AssetNFT` is the ERC-721 representation of a managed digital or physical asset. ERC-721 ownership is the authoritative ownership record. The token URI points to metadata, normally an IPFS CID, and does not itself grant permissions.

The contract should inherit OpenZeppelin `ERC721`, `ERC721URIStorage`, `AccessControl` only if needed for compatibility, `Pausable`, and `ReentrancyGuard`. Platform authorization must still route through `RoleManager` so policy is not duplicated or accidentally weakened.

### 4.2 Storage

```text
uint256 nextTokenId
mapping(uint256 tokenId => AssetInfo asset) assets
mapping(uint256 tokenId => TransferRecord[] history) ownershipHistory
address identityRegistry
address roleManager
address auditLogger
bool paused

struct AssetInfo {
    uint256 tokenId;
    address creator;
    uint64 createdAt;
    bool burned;
}

struct TransferRecord {
    address from;
    address to;
    address operator;
    uint64 timestamp;
    bytes32 transactionReason;
}
```

The ERC-721 owner mapping remains the source of truth. `AssetInfo.burned` makes historical queries explicit; a burned token has no owner under ERC-721.

### 4.3 Roles and permissions

| Operation | Required permission | Additional rule |
|---|---|---|
| Mint | `ASSET_MINT` | Recipient must be an active registered wallet |
| Assign | `ASSET_ASSIGN` | Admin/Manager operation; recipient must be active |
| Transfer | `ASSET_TRANSFER` | Token owner, approved operator, or privileged Manager/Admin |
| Burn | `ASSET_BURN` | Admin/Manager; owner burn is disabled by default |
| Metadata update | `ASSET_METADATA_UPDATE` | Admin/Manager; token must exist |

For user transfers, the contract verifies ERC-721 ownership/approval and active identity status. A Manager/Admin transfer may bypass owner approval only through an explicit privileged function, never by spoofing `from`.

### 4.4 Public and external functions

```solidity
function mint(address to, string calldata metadataURI)
    external
    returns (uint256 tokenId);

function assign(uint256 tokenId, string calldata toDid) external;

function transferAsset(
    address from,
    address to,
    uint256 tokenId
) external;

function burn(uint256 tokenId) external;
function updateTokenURI(uint256 tokenId, string calldata newURI) external;

function getAsset(uint256 tokenId)
    external
    view
    returns (AssetInfo memory);

function getOwnershipHistory(uint256 tokenId)
    external
    view
    returns (TransferRecord[] memory);

function verifyOwnership(
    string calldata did,
    uint256 tokenId
) external view returns (bool);

function ownerOf(uint256 tokenId)
    public
    view
    override
    returns (address);

function tokenURI(uint256 tokenId)
    public
    view
    override
    returns (string memory);

function setIdentityRegistry(address registry) external;
function setRoleManager(address manager) external;
function setAuditLogger(address logger) external;
function pause() external;
function unpause() external;
```

The standard ERC-721 `approve`, `setApprovalForAll`, `transferFrom`, and `safeTransferFrom` remain available. If unrestricted standard transfers are supported, the override must enforce active-recipient policy and append ownership history. Alternatively, policy may require all transfers through `transferAsset`; this choice must be fixed before deployment and reflected in the frontend.

### 4.5 Events

OpenZeppelin `Transfer`, `Approval`, and `ApprovalForAll` events are mandatory. The contract additionally emits:

```solidity
event AssetMinted(
    uint256 indexed tokenId,
    address indexed creator,
    address indexed initialOwner,
    string metadataURI
);
event AssetAssigned(
    uint256 indexed tokenId,
    bytes32 indexed recipientDidKey,
    address indexed recipient
);
event AssetTransferred(
    uint256 indexed tokenId,
    address indexed from,
    address indexed to,
    address operator
);
event AssetBurned(
    uint256 indexed tokenId,
    address indexed burner
);
event MetadataUpdated(
    uint256 indexed tokenId,
    string previousURI,
    string newURI,
    address indexed updater
);
event IdentityRegistryConfigured(address indexed registry);
event RoleManagerConfigured(address indexed roleManager);
event AuditLoggerConfigured(address indexed auditLogger);
```

### 4.6 Modifiers and security controls

- `onlyPermission(permission)` for privileged lifecycle functions.
- `onlyTokenOwnerOrApproved(tokenId)` for user-controlled transfers.
- `existingToken(tokenId)` and `notBurned(tokenId)` for asset operations.
- `activeWallet(to)` prevents assignment to revoked/unregistered identities.
- `validMetadataURI(uri)` rejects an empty URI.
- `whenNotPaused` and `nonReentrant` for writes.
- Uses OpenZeppelin `_safeMint` and safe transfer semantics.
- Does not trust a DID string as ownership; resolves it through `IdentityRegistry`.
- Does not permit arbitrary caller-supplied `from` values to authorize transfers.
- The privileged manager path must emit the actual `msg.sender` as operator for auditability.
- Burn retains event history and does not recycle token IDs.

### 4.7 Contract interactions

- Queries `RoleManager.hasPermission` for mint, assign, burn, metadata, and privileged transfer.
- Queries `IdentityRegistry.walletForDID` and `isActiveWallet` for recipient validation.
- Calls `AuditLogger.log` after each successful lifecycle mutation.
- Emits standard ERC-721 events consumed by wallets and indexers.

### 4.8 Failure conditions

- `InvalidRecipient()` for zero, unregistered, or inactive recipient.
- `TokenDoesNotExist(tokenId)` or `TokenAlreadyBurned(tokenId)`.
- `EmptyMetadataURI()`.
- `MissingPermission(account, permission)`.
- `NotOwnerOrApproved(account, tokenId)`.
- `TransferToInactiveIdentity()`.
- `IdentityRegistryNotConfigured()`, `RoleManagerNotConfigured()`, or `AuditLoggerNotConfigured()`.
- `Pausable`, `ReentrancyGuard`, and ERC-721 receiver errors.

## 5. AuditLogger

### 5.1 Purpose

`AuditLogger` provides a canonical on-chain audit event stream. It records critical actions without attempting to store large or private payloads. The backend indexer uses these events to build searchable audit records; PostgreSQL is only a derived cache.

### 5.2 Storage

```text
struct AuditEventRecord {
    bytes32 action;
    address actor;
    bytes32 targetDidKey;
    uint256 targetTokenId;
    bytes32 metadataHash;
    uint64 timestamp;
    uint256 blockNumber;
}

mapping(address emitter => bool) approvedEmitters
mapping(bytes32 eventId => bool) recordedEvents
uint256 eventCount
bool paused
```

The recommended minimal implementation emits the event and stores only `eventCount`/deduplication state. If queryable on-chain records are required, `AuditEventRecord` is appended under `eventId = keccak256(...)`. Metadata must be a hash or bounded bytes32 value, not arbitrary unbounded user text.

### 5.3 Roles and permissions

Only the deployed platform contracts are approved emitters. An account having `AUDITOR_ROLE` may read events but cannot fabricate them. `DEFAULT_ADMIN_ROLE` manages the emitter allowlist and emergency pause.

### 5.4 Public and external functions

```solidity
function log(
    bytes32 action,
    bytes32 targetDidKey,
    uint256 targetTokenId,
    bytes32 metadataHash
) external onlyApprovedEmitter;

function setEmitter(address emitter, bool approved)
    external
    onlyRole(DEFAULT_ADMIN_ROLE);

function getEventCount() external view returns (uint256);
function isApprovedEmitter(address emitter) external view returns (bool);
function pause() external;
function unpause() external;
```

The function must not accept a caller-supplied actor. `msg.sender` is the emitting contract. If the original human actor is needed, the calling contract includes it in the event payload or passes a bounded `actor` argument that is checked against the calling contract's operation context; the safer default is to emit actor-specific events in the source contract and use `AuditLogger` for canonical action metadata.

### 5.5 Events

```solidity
event AuditEvent(
    uint256 indexed sequence,
    bytes32 indexed action,
    address indexed emitter,
    bytes32 targetDidKey,
    uint256 targetTokenId,
    bytes32 metadataHash,
    uint256 timestamp
);
event EmitterConfigured(address indexed emitter, bool approved);
```

### 5.6 Modifiers and security controls

- `onlyApprovedEmitter` rejects direct calls from arbitrary wallets.
- `onlyRole(DEFAULT_ADMIN_ROLE)` controls the emitter registry.
- `validAction(action)` rejects the zero action identifier.
- `whenNotPaused` allows emergency suppression while preserving prior logs.
- Metadata is bounded to a hash; no PII or large strings are stored on-chain.
- Emitter configuration is audited and should be transferred to a multisig in production.
- Events are append-only; there is no edit or delete function.

### 5.7 Contract interactions

- `IdentityRegistry` logs identity and role actions.
- `RoleManager` logs permission configuration and role changes where appropriate.
- `AssetNFT` logs mint, assignment, transfer, burn, and metadata changes.
- The indexer listens to both `AuditEvent` and domain-specific events and de-duplicates by transaction hash and log index.

### 5.8 Failure conditions

- `UnauthorizedEmitter(msg.sender)`.
- `InvalidAction()`.
- `AuditLoggerPaused()`.
- `EmitterConfigurationLocked()` if deployment permanently locks the allowlist.
- Reverting an audit call reverts the originating state change; this is intentional for critical operations that must never succeed without an audit record.

## 6. Cross-contract interaction and deployment order

Deployment order:

1. Deploy `RoleManager` and grant the deployer `DEFAULT_ADMIN_ROLE`, `ADMIN_ROLE`, and `ROLE_ASSIGNER_ROLE`.
2. Deploy `IdentityRegistry`, `AssetNFT`, and `AuditLogger`.
3. Configure the registry and asset contract addresses in `RoleManager`.
4. Configure `roleManager` and `auditLogger` in `IdentityRegistry`.
5. Configure `identityRegistry`, `roleManager`, and `auditLogger` in `AssetNFT`.
6. Approve `IdentityRegistry`, `RoleManager` if needed, and `AssetNFT` as `AuditLogger` emitters.
7. Configure default role permissions.
8. Create or migrate the initial administrator identity.
9. Transfer administrative ownership to the production governance account or multisig.
10. Verify all addresses, role memberships, permission mappings, and pause states in a deployment invariant test.

### 6.1 Required authorization invariant

For every state-changing function:

```text
caller wallet
  → contract checks msg.sender and local ownership/approval
  → contract queries RoleManager and, where needed, IdentityRegistry
  → contract performs mutation only if all checks pass
  → contract emits domain event and audit event
```

The backend may submit a transaction, but it cannot make an unauthorized caller appear authorized. A relayer, if used, receives only the minimum contract roles and must not be treated as the end user's identity unless the deployment explicitly implements a verified meta-transaction scheme.

## 7. Global failure and recovery policy

- A failed permission check reverts the complete transaction; no partial database or contract state is created.
- A failed `AuditLogger.log` reverts the originating critical operation, preventing unaudited success.
- Pausing `AssetNFT` stops asset writes without deleting ownership history; pausing `IdentityRegistry` stops identity lifecycle writes.
- Role revocation is effective immediately because consuming contracts read `RoleManager` at execution time.
- Contract addresses are treated as immutable configuration by the backend; changing them requires an explicit deployment migration and indexer restart from the new deployment block.
- The indexer must use transaction hash, log index, chain ID, contract address, and block hash for replay and reorganization handling.
- PostgreSQL, the API, and the frontend can be rebuilt from contract state and logs. None of them can restore state that was never committed on-chain.

## 8. Hardhat test and review requirements

Before implementation is accepted, Hardhat tests must cover:

- Every permission constant and default role mapping.
- Unauthorized direct calls to every write function.
- Identity uniqueness, ownership-only updates, revocation, and inactive-recipient rejection.
- Role grant/revoke effects immediately changing contract authorization.
- Mint, assignment, approved transfer, privileged transfer, burn, metadata update, and ownership history.
- ERC-721 receiver safety and approval behavior.
- Audit emitter allowlisting and revert-on-audit-failure behavior.
- Pause/unpause behavior for every write surface.
- Reentrancy attempts on state-changing paths.
- Fuzzed invalid DIDs, zero addresses, nonexistent token IDs, empty URIs, and arbitrary role/action identifiers.
- Deployment wiring and invariants, including the final administrator protection.
- Event fields and indexed parameters required by the blockchain indexer.

This specification deliberately defines interfaces and security invariants before Solidity implementation so that the frontend, backend, indexer, and contract tests can share a stable on-chain contract boundary.
