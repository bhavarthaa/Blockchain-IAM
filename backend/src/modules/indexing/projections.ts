import {
  AssetStatus,
  AuditAction,
  IdentityStatus,
  Prisma,
  RoleCode,
  type IndexedEvent,
} from "@prisma/client";
import { keccak256, toBytes } from "viem";
import { type JsonValue } from "./indexer.js";

type ProjectionEvent = IndexedEvent & {
  transaction: {
    id: string;
    fromWalletId: string | null;
  };
};

const ROLE_KEYS = {
  ADMIN: "0xa49807205ce4d355092ef5a8a18f56e8913cf4a201fbe287825b095693c21775",
  MANAGER: "0x241ecf16d79d0f8dbfb92cbc07fe17840425976cf0667f022fe9877caa831b08",
  AUDITOR: "0x59a1c48e5837ad7a7f3dcedcbe129bf3249ec4fbf651fd4f5e2600ead39fe2f5",
  USER: "0x14823911f2da1b49f045a0929a60b8c1f2a7fc8c06c7284ca3e8ab4e193a08c8",
} as const;

const PERMISSION_KEYS = {
  IDENTITY_CREATE: "0x44a71f65b388f83b6fbbf0710646649a5ca80981d76188d4e40fdcc23bd38290",
  IDENTITY_UPDATE: "0x80f00f20167dd911b8b5330473e4ad91914a89f02c1adf74c614766cec152e1f",
  IDENTITY_REVOKE: "0x124a500b227ee87bb31cfd819b45efc179b0272ccc300ecaac69b4ed7ac4533d",
  ROLE_ASSIGN: "0x980c53fba903d27dfdd61bb35e4936a8b4123d48d181c629ae8af3ff80436fc8",
  ASSET_MINT: "0x4b2c2d0e89ab46a67bf99c0fd4a3ed8a7c64edb5a7127d4580c6980b7c36285b",
  ASSET_ASSIGN: "0x052dea163918302106c5c35a5c2223da5b77b057ea18b921904ffd273eb381d2",
  ASSET_TRANSFER: "0x86f2124541c3e95269975661dbf8a2934f11261679ceb933d08673afdb92e144",
  ASSET_BURN: "0x20adaa1af676b00a96307c835840a5c62e12404e7486ed42fedc5a8be53548d4",
  ASSET_METADATA_UPDATE: "0x597c895994d8f3b3ee60b2128c600c52162f4b4a2ab108cd1b80ceb67f39e413",
  AUDIT_EXPORT: "0x34138d27cc0b23d61d27b4bbde1c0fd79b61876249b511a8fc58b4d42e6bd2e5",
} as const;

function record(value: JsonValue): Record<string, JsonValue> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Decoded event parameters are not an object");
  }
  return value;
}

function stringValue(parameters: JsonValue, name: string): string {
  const value = record(parameters)[name];
  if (typeof value !== "string" || value.length === 0) throw new Error(`Missing event parameter ${name}`);
  return value;
}

function optionalString(parameters: JsonValue, name: string): string | null {
  const value = record(parameters)[name];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function bigintValue(parameters: JsonValue, name: string): bigint {
  const value = record(parameters)[name];
  if (typeof value !== "string" && typeof value !== "number") throw new Error(`Missing event parameter ${name}`);
  try {
    return BigInt(value);
  } catch {
    throw new Error(`Invalid bigint event parameter ${name}`);
  }
}

function numberValue(parameters: JsonValue, name: string): number {
  const value = bigintValue(parameters, name);
  const result = Number(value);
  if (!Number.isSafeInteger(result)) throw new Error(`Invalid numeric event parameter ${name}`);
  return result;
}

function address(parameters: JsonValue, name: string): string {
  return stringValue(parameters, name).toLowerCase();
}

function hash(parameters: JsonValue, name: string): string {
  return stringValue(parameters, name).toLowerCase();
}

function nonZeroHash(value: string | null): string | null {
  return value && !/^0x0+$/.test(value) ? value : null;
}

function auditTimestamp(event: ProjectionEvent, parameters: JsonValue): Date {
  const timestamp = bigintValue(parameters, "timestamp");
  const milliseconds = timestamp * 1_000n;
  const value = Number(milliseconds);
  return Number.isSafeInteger(value) ? new Date(value) : event.observedAt;
}

function roleName(roleKey: string): RoleCode {
  const normalized = roleKey.toLowerCase();
  const entry = (Object.entries(ROLE_KEYS) as [RoleCode, string][]).find(([, key]) => key === normalized);
  if (!entry) throw new Error(`Unknown on-chain role ${roleKey}`);
  return entry[0];
}

function permissionName(permissionKey: string): string {
  const normalized = permissionKey.toLowerCase();
  const entry = Object.entries(PERMISSION_KEYS).find(([, key]) => key === normalized);
  if (!entry) throw new Error(`Unknown on-chain permission ${permissionKey}`);
  return entry[0];
}

function identityRoleCode(value: number): RoleCode | null {
  return [RoleCode.ADMIN, RoleCode.MANAGER, RoleCode.AUDITOR, RoleCode.USER][value] ?? null;
}

function actionForHash(action: string): AuditAction {
  // Filled using viem's keccak implementation at module load, without
  // relying on generated contract artifacts.
  const names: [string, AuditAction][] = [
    ["IDENTITY_CREATED", AuditAction.IDENTITY_CREATED],
    ["IDENTITY_UPDATED", AuditAction.IDENTITY_UPDATED],
    ["IDENTITY_REVOKED", AuditAction.IDENTITY_REVOKED],
    ["IDENTITY_RESTORED", AuditAction.IDENTITY_RESTORED],
    ["IDENTITY_ROLE_ASSIGNED", AuditAction.ROLE_ASSIGNED],
    ["IDENTITY_ROLE_REVOKED", AuditAction.ROLE_REVOKED],
    ["ROLE_GRANTED", AuditAction.ROLE_ASSIGNED],
    ["ROLE_REVOKED", AuditAction.ROLE_REVOKED],
    ["PERMISSION_CONFIGURED", AuditAction.PERMISSION_CONFIGURED],
    ["ASSET_MINTED", AuditAction.ASSET_MINTED],
    ["ASSET_ASSIGNED", AuditAction.ASSET_ASSIGNED],
    ["ASSET_TRANSFERRED", AuditAction.ASSET_TRANSFERRED],
    ["ASSET_BURNED", AuditAction.ASSET_BURNED],
    ["ASSET_METADATA_UPDATED", AuditAction.METADATA_UPDATED],
  ];
  const normalized = action.toLowerCase();
  for (const [name, value] of names) {
    if (solidityHash(name) === normalized) return value;
  }
  throw new Error(`Unknown audit action ${action}`);
}

function solidityHash(value: string): string {
  return keccak256(toBytes(value)).toLowerCase();
}

async function wallet(
  tx: Prisma.TransactionClient,
  chainId: number,
  addressValue: string,
  blockNumber: bigint,
  observedAt: Date,
): Promise<{ id: string }> {
  return tx.walletAddress.upsert({
    where: { chainId_address: { chainId, address: addressValue } },
    update: { lastSeenBlock: blockNumber },
    create: {
      chainId,
      address: addressValue,
      firstSeenBlock: blockNumber,
      lastSeenBlock: blockNumber,
      createdAt: observedAt,
    },
    select: { id: true },
  });
}

async function setActor(
  tx: Prisma.TransactionClient,
  event: ProjectionEvent,
  actorId: string | null,
): Promise<void> {
  if (!actorId) return;
  await tx.blockchainTransaction.update({
    where: { id: event.transactionId },
    data: { fromWalletId: actorId },
  });
}

async function role(
  tx: Prisma.TransactionClient,
  chainId: number,
  roleKey: string,
  observedAt: Date,
): Promise<{ id: string; name: RoleCode }> {
  const name = roleName(roleKey);
  return tx.role.upsert({
    where: { chainId_roleKey: { chainId, roleKey: roleKey.toLowerCase() } },
    update: { name, displayName: `${name[0]}${name.slice(1).toLowerCase()}`, onChain: true },
    create: {
      chainId,
      roleKey: roleKey.toLowerCase(),
      name,
      displayName: `${name[0]}${name.slice(1).toLowerCase()}`,
      onChain: true,
      createdAt: observedAt,
    },
    select: { id: true, name: true },
  });
}

async function permission(
  tx: Prisma.TransactionClient,
  permissionKey: string,
  observedAt: Date,
): Promise<{ id: string }> {
  const name = permissionName(permissionKey);
  return tx.permission.upsert({
    where: { permissionKey: permissionKey.toLowerCase() },
    update: { name },
    create: { permissionKey: permissionKey.toLowerCase(), name, createdAt: observedAt },
    select: { id: true },
  });
}

async function assignment(
  tx: Prisma.TransactionClient,
  event: ProjectionEvent,
  walletId: string,
  roleId: string,
  identityId: string | null,
  active: boolean,
): Promise<void> {
  const data = active
    ? {
        active: true,
        identityId,
        assignedBlockNumber: event.blockNumber,
        assignedTxId: event.transactionId,
        revokedBlockNumber: null,
        revokedTxId: null,
      }
    : {
        active: false,
        identityId,
        revokedBlockNumber: event.blockNumber,
        revokedTxId: event.transactionId,
      };
  await tx.walletRoleAssignment.upsert({
    where: {
      chainId_walletAddressId_roleId: {
        chainId: event.chainId,
        walletAddressId: walletId,
        roleId,
      },
    },
    update: data,
    create: {
      chainId: event.chainId,
      walletAddressId: walletId,
      roleId,
      identityId,
      active,
      assignedBlockNumber: event.blockNumber,
      assignedTxId: event.transactionId,
      ...(active ? {} : { revokedBlockNumber: event.blockNumber, revokedTxId: event.transactionId }),
      createdAt: event.observedAt,
    },
  });
}

async function identityCreated(tx: Prisma.TransactionClient, event: ProjectionEvent): Promise<void> {
  const parameters = event.parameters as JsonValue;
  const didKey = hash(parameters, "didKey");
  const walletRow = await wallet(tx, event.chainId, address(parameters, "wallet"), event.blockNumber, event.observedAt);
  const roleCode = identityRoleCode(numberValue(parameters, "roleCode"));
  await tx.identity.upsert({
    where: { chainId_didKey: { chainId: event.chainId, didKey } },
    update: {
      did: stringValue(parameters, "did"),
      walletAddressId: walletRow.id,
      status: IdentityStatus.ACTIVE,
      roleCode,
      documentHash: nonZeroHash(hash(parameters, "documentHash")),
      createdBlockNumber: event.blockNumber,
      createdTxId: event.transactionId,
      lastChainBlock: event.blockNumber,
      updatedAt: event.observedAt,
    },
    create: {
      chainId: event.chainId,
      did: stringValue(parameters, "did"),
      didKey,
      walletAddressId: walletRow.id,
      status: IdentityStatus.ACTIVE,
      roleCode,
      documentHash: nonZeroHash(hash(parameters, "documentHash")),
      createdBlockNumber: event.blockNumber,
      createdTxId: event.transactionId,
      lastChainBlock: event.blockNumber,
      createdAt: event.observedAt,
    },
  });
  await setActor(tx, event, walletRow.id);
}

async function identityChanged(tx: Prisma.TransactionClient, event: ProjectionEvent): Promise<void> {
  const parameters = event.parameters as JsonValue;
  const identity = await tx.identity.findUnique({
    where: { chainId_didKey: { chainId: event.chainId, didKey: hash(parameters, "didKey") } },
  });
  if (!identity) throw new Error(`Identity ${hash(parameters, "didKey")} is not indexed`);
  const actorAddress = optionalString(parameters, event.eventName === "IdentityUpdated" ? "wallet" : event.eventName === "IdentityRevoked" ? "revoker" : "restorer");
  const actor = actorAddress
    ? await wallet(tx, event.chainId, actorAddress.toLowerCase(), event.blockNumber, event.observedAt)
    : null;
  const update: Prisma.IdentityUpdateInput = { lastChainBlock: event.blockNumber, updatedAt: event.observedAt };
  if (event.eventName === "IdentityUpdated") update.documentHash = nonZeroHash(hash(parameters, "newDocumentHash"));
  if (event.eventName === "IdentityRevoked") {
    update.status = IdentityStatus.REVOKED;
    update.revokedBlockNumber = event.blockNumber;
    update.revokedTransaction = { connect: { id: event.transactionId } };
  }
  if (event.eventName === "IdentityRestored") {
    update.status = IdentityStatus.ACTIVE;
    update.revokedBlockNumber = null;
    update.revokedTransaction = { disconnect: true };
  }
  await tx.identity.update({ where: { id: identity.id }, data: update });
  await setActor(tx, event, actor?.id ?? null);
}

async function roleEvent(tx: Prisma.TransactionClient, event: ProjectionEvent, active: boolean): Promise<void> {
  const parameters = event.parameters as JsonValue;
  const account = await wallet(tx, event.chainId, address(parameters, "account"), event.blockNumber, event.observedAt);
  const roleRow = await role(tx, event.chainId, hash(parameters, "role"), event.observedAt);
  const identity = await tx.identity.findUnique({
    where: { chainId_walletAddressId: { chainId: event.chainId, walletAddressId: account.id } },
    select: { id: true },
  });
  await assignment(tx, event, account.id, roleRow.id, identity?.id ?? null, active);
  const sender = optionalString(parameters, event.eventName === "PlatformRoleGranted" || event.eventName === "PlatformRoleRevoked" ? "sender" : "assigner");
  const actor = sender
    ? await wallet(tx, event.chainId, sender.toLowerCase(), event.blockNumber, event.observedAt)
    : null;
  await setActor(tx, event, actor?.id ?? null);
}

async function permissionChanged(tx: Prisma.TransactionClient, event: ProjectionEvent): Promise<void> {
  const parameters = event.parameters as JsonValue;
  const roleRow = await role(tx, event.chainId, hash(parameters, "role"), event.observedAt);
  const permissionRow = await permission(tx, hash(parameters, "permission"), event.observedAt);
  await tx.rolePermission.upsert({
    where: { roleId_permissionId: { roleId: roleRow.id, permissionId: permissionRow.id } },
    update: {
      enabled: Boolean(record(parameters).enabled),
      sourceBlockNumber: event.blockNumber,
      sourceEventId: event.id,
    },
    create: {
      roleId: roleRow.id,
      permissionId: permissionRow.id,
      enabled: Boolean(record(parameters).enabled),
      sourceBlockNumber: event.blockNumber,
      sourceEventId: event.id,
      createdAt: event.observedAt,
    },
  });
  const sender = await wallet(tx, event.chainId, address(parameters, "sender"), event.blockNumber, event.observedAt);
  await setActor(tx, event, sender.id);
}

async function asset(tx: Prisma.TransactionClient, event: ProjectionEvent, ownerId: string | null): Promise<{ id: string }> {
  const parameters = event.parameters as JsonValue;
  const tokenId = bigintValue(parameters, "tokenId");
  const contractAddress = event.contractAddress.toLowerCase();
  const creator = await wallet(tx, event.chainId, address(parameters, "creator"), event.blockNumber, event.observedAt);
  return tx.asset.upsert({
    where: { chainId_contractAddress_tokenId: { chainId: event.chainId, contractAddress, tokenId } },
    update: {
      currentOwnerId: ownerId,
      status: AssetStatus.ACTIVE,
      metadataUri: stringValue(parameters, "metadataURI"),
      mintedBlockNumber: event.blockNumber,
      mintedTxId: event.transactionId,
      creatorId: creator.id,
      updatedAt: event.observedAt,
    },
    create: {
      chainId: event.chainId,
      tokenId,
      contractAddress,
      status: AssetStatus.ACTIVE,
      currentOwnerId: ownerId,
      creatorId: creator.id,
      metadataUri: stringValue(parameters, "metadataURI"),
      mintedBlockNumber: event.blockNumber,
      mintedTxId: event.transactionId,
      createdAt: event.observedAt,
    },
    select: { id: true },
  });
}

async function ownership(
  tx: Prisma.TransactionClient,
  event: ProjectionEvent,
  assetId: string,
  fromWalletId: string | null,
  toWalletId: string | null,
  operatorWalletId: string | null,
  reason: string,
): Promise<void> {
  await tx.ownershipTransfer.upsert({
    where: {
      chainId_transactionId_logIndex: {
        chainId: event.chainId,
        transactionId: event.transactionId,
        logIndex: event.logIndex,
      },
    },
    update: { assetId, eventId: event.id, fromWalletId, toWalletId, operatorWalletId, blockNumber: event.blockNumber, reason },
    create: {
      chainId: event.chainId,
      assetId,
      fromWalletId,
      toWalletId,
      operatorWalletId,
      transactionId: event.transactionId,
      eventId: event.id,
      blockNumber: event.blockNumber,
      logIndex: event.logIndex,
      reason,
      createdAt: event.observedAt,
    },
  });
}

async function assetEvent(tx: Prisma.TransactionClient, event: ProjectionEvent): Promise<void> {
  const parameters = event.parameters as JsonValue;
  const tokenId = bigintValue(parameters, "tokenId");
  const contractAddress = event.contractAddress.toLowerCase();
  if (event.eventName === "AssetMinted") {
    const creator = await wallet(tx, event.chainId, address(parameters, "creator"), event.blockNumber, event.observedAt);
    const owner = await wallet(tx, event.chainId, address(parameters, "initialOwner"), event.blockNumber, event.observedAt);
    const row = await asset(tx, event, owner.id);
    await ownership(tx, event, row.id, null, owner.id, creator.id, "minted");
    await setActor(tx, event, creator.id);
    return;
  }
  const row = await tx.asset.findUnique({
    where: { chainId_contractAddress_tokenId: { chainId: event.chainId, contractAddress, tokenId } },
  });
  if (!row) throw new Error(`Asset ${tokenId} is not indexed`);
  if (event.eventName === "AssetAssigned" || event.eventName === "AssetTransferred") {
    const to = await wallet(tx, event.chainId, address(parameters, event.eventName === "AssetAssigned" ? "recipient" : "to"), event.blockNumber, event.observedAt);
    const from = event.eventName === "AssetTransferred"
      ? (await wallet(tx, event.chainId, address(parameters, "from"), event.blockNumber, event.observedAt)).id
      : row.currentOwnerId;
    const operator = event.eventName === "AssetTransferred"
      ? (await wallet(tx, event.chainId, address(parameters, "operator"), event.blockNumber, event.observedAt)).id
      : event.transaction.fromWalletId;
    await tx.asset.update({ where: { id: row.id }, data: { currentOwnerId: to.id, status: AssetStatus.ACTIVE, updatedAt: event.observedAt } });
    await ownership(tx, event, row.id, from, to.id, operator, event.eventName === "AssetAssigned" ? "assigned" : "transferred");
    await setActor(tx, event, operator);
    return;
  }
  if (event.eventName === "AssetBurned") {
    const burner = await wallet(tx, event.chainId, address(parameters, "burner"), event.blockNumber, event.observedAt);
    await tx.asset.update({
      where: { id: row.id },
      data: {
        status: AssetStatus.BURNED,
        currentOwnerId: null,
        burnedBlockNumber: event.blockNumber,
        burnedTxId: event.transactionId,
        updatedAt: event.observedAt,
      },
    });
    await ownership(tx, event, row.id, row.currentOwnerId, null, burner.id, "burned");
    await setActor(tx, event, burner.id);
    return;
  }
  if (event.eventName === "MetadataUpdated") {
    const updater = await wallet(tx, event.chainId, address(parameters, "updater"), event.blockNumber, event.observedAt);
    await tx.asset.update({ where: { id: row.id }, data: { metadataUri: stringValue(parameters, "newURI"), updatedAt: event.observedAt } });
    await setActor(tx, event, updater.id);
  }
}

async function audit(tx: Prisma.TransactionClient, event: ProjectionEvent): Promise<void> {
  const parameters = event.parameters as JsonValue;
  const action = actionForHash(hash(parameters, "action"));
  const didKey = nonZeroHash(optionalString(parameters, "targetDidKey"));
  const token = bigintValue(parameters, "targetTokenId");
  const targetIdentity = didKey
    ? await tx.identity.findUnique({ where: { chainId_didKey: { chainId: event.chainId, didKey } }, select: { id: true } })
    : null;
  const targetAsset = token > 0n
    ? await tx.asset.findFirst({ where: { chainId: event.chainId, tokenId: token }, orderBy: { createdAt: "desc" }, select: { id: true } })
    : null;
  await tx.auditRecord.upsert({
    where: { chainId_eventId: { chainId: event.chainId, eventId: event.id } },
    update: {
      action,
      emitterAddress: event.contractAddress.toLowerCase(),
      actorAddress: event.contractAddress.toLowerCase(),
      targetDidKey: didKey,
      targetIdentityId: targetIdentity?.id ?? null,
      targetTokenId: token > 0n ? token : null,
      targetAssetId: targetAsset?.id ?? null,
      metadataHash: nonZeroHash(optionalString(parameters, "metadataHash")),
      metadata: parameters as Prisma.InputJsonValue,
      blockNumber: event.blockNumber,
      blockHash: event.blockHash,
      logIndex: event.logIndex,
      occurredAt: auditTimestamp(event, parameters),
    },
    create: {
      chainId: event.chainId,
      eventId: event.id,
      transactionId: event.transactionId,
      action,
      emitterAddress: event.contractAddress.toLowerCase(),
      actorAddress: event.contractAddress.toLowerCase(),
      targetDidKey: didKey,
      targetIdentityId: targetIdentity?.id ?? null,
      targetTokenId: token > 0n ? token : null,
      targetAssetId: targetAsset?.id ?? null,
      metadataHash: nonZeroHash(optionalString(parameters, "metadataHash")),
      metadata: parameters as Prisma.InputJsonValue,
      blockNumber: event.blockNumber,
      blockHash: event.blockHash,
      logIndex: event.logIndex,
      occurredAt: auditTimestamp(event, parameters),
    },
  });
}

export async function projectIndexedEvent(tx: Prisma.TransactionClient, eventId: string): Promise<void> {
  const event = await tx.indexedEvent.findUnique({
    where: { id: eventId },
    include: { transaction: { select: { id: true, fromWalletId: true } } },
  }) as ProjectionEvent | null;
  if (!event) throw new Error(`Indexed event ${eventId} is missing`);
  switch (event.eventName) {
    case "IdentityCreated":
      await identityCreated(tx, event);
      break;
    case "IdentityUpdated":
    case "IdentityRevoked":
    case "IdentityRestored":
      await identityChanged(tx, event);
      break;
    case "IdentityRoleAssigned":
      await roleEvent(tx, event, true);
      break;
    case "IdentityRoleRevoked":
      await roleEvent(tx, event, false);
      break;
    case "PlatformRoleGranted":
      await roleEvent(tx, event, true);
      break;
    case "PlatformRoleRevoked":
      await roleEvent(tx, event, false);
      break;
    case "PermissionConfigured":
      await permissionChanged(tx, event);
      break;
    case "AssetMinted":
    case "AssetAssigned":
    case "AssetTransferred":
    case "AssetBurned":
    case "MetadataUpdated":
      await assetEvent(tx, event);
      break;
    case "AuditEvent":
      await audit(tx, event);
      break;
    default:
      // Configuration and inherited ERC-721 events are still durably indexed,
      // but they do not represent a projection row by themselves.
      break;
  }
}
