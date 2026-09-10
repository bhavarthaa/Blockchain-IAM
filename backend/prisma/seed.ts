import {
  AuditAction,
  AssetStatus,
  AssetType,
  IdentityStatus,
  PrismaClient,
  RoleCode,
  TransactionStatus,
  VerificationResult,
  VerificationType,
} from "@prisma/client";

const prisma = new PrismaClient();
const chainId = 31337;
const now = new Date("2026-01-15T12:00:00.000Z");
const block = 120n;

const roles = {
  ADMIN: "0xa49807205ce4d355092ef5a8a18f56e8913cf4a201fbe287825b095693c21775",
  MANAGER: "0x241ecf16d79d0f8dbfb92cbc07fe17840425976cf0667f022fe9877caa831b08",
  AUDITOR: "0x59a1c48e5837ad7a7f3dcedcbe129bf3249ec4fbf651fd4f5e2600ead39fe2f5",
  USER: "0x14823911f2da1b49f045a0929a60b8c1f2a7fc8c06c7284ca3e8ab4e193a08c8",
} as const;

const permissions = {
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

const wallets = {
  ADMIN: "0x1111111111111111111111111111111111111111",
  MANAGER: "0x2222222222222222222222222222222222222222",
  AUDITOR: "0x3333333333333333333333333333333333333333",
  USER: "0x4444444444444444444444444444444444444444",
} as const;

const txHashes = {
  ADMIN: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  MANAGER: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  AUDITOR: "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
  USER: "0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
  ASSET: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
  TRANSFER: "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
} as const;

const rolePermissions: Record<RoleCode, readonly (keyof typeof permissions)[]> = {
  ADMIN: Object.keys(permissions) as (keyof typeof permissions)[],
  MANAGER: ["ASSET_MINT", "ASSET_ASSIGN", "ASSET_TRANSFER", "ASSET_BURN", "ASSET_METADATA_UPDATE"],
  AUDITOR: ["AUDIT_EXPORT"],
  USER: ["ASSET_TRANSFER"],
};

async function main(): Promise<void> {
  const roleRows = new Map<RoleCode, { id: string }>();
  for (const [name, roleKey] of Object.entries(roles) as [RoleCode, string][]) {
    const role = await prisma.role.upsert({
      where: { chainId_name: { chainId, name } },
      update: { roleKey, displayName: `${name[0]}${name.slice(1).toLowerCase()}`, onChain: true },
      create: {
        chainId,
        roleKey,
        name,
        displayName: `${name[0]}${name.slice(1).toLowerCase()}`,
        onChain: true,
        createdAt: now,
      },
      select: { id: true },
    });
    roleRows.set(name, role);
  }

  const permissionRows = new Map<keyof typeof permissions, { id: string }>();
  const permissionDescriptions: Record<keyof typeof permissions, string> = {
    IDENTITY_CREATE: "Create a new on-chain identity projection",
    IDENTITY_UPDATE: "Update an identity document hash",
    IDENTITY_REVOKE: "Revoke an active identity",
    ROLE_ASSIGN: "Assign or revoke an on-chain platform role",
    ASSET_MINT: "Mint a new asset",
    ASSET_ASSIGN: "Assign an asset to a wallet",
    ASSET_TRANSFER: "Transfer an asset",
    ASSET_BURN: "Burn an asset",
    ASSET_METADATA_UPDATE: "Update an asset metadata URI",
    AUDIT_EXPORT: "Export indexed audit history",
  };
  for (const [name, permissionKey] of Object.entries(permissions) as [keyof typeof permissions, string][]) {
    const permission = await prisma.permission.upsert({
      where: { name },
      update: { permissionKey, description: permissionDescriptions[name] },
      create: { name, permissionKey, description: permissionDescriptions[name], createdAt: now },
      select: { id: true },
    });
    permissionRows.set(name, permission);
  }

  for (const [roleName, permissionNames] of Object.entries(rolePermissions) as [RoleCode, readonly (keyof typeof permissions)[]][]) {
    const role = roleRows.get(roleName);
    if (!role) throw new Error(`Missing seeded role ${roleName}`);
    for (const permissionName of permissionNames) {
      const permission = permissionRows.get(permissionName);
      if (!permission) throw new Error(`Missing seeded permission ${permissionName}`);
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
        update: { enabled: true, updatedAt: now },
        create: { roleId: role.id, permissionId: permission.id, enabled: true, createdAt: now },
      });
    }
  }

  const walletRows = new Map<RoleCode, { id: string }>();
  for (const roleName of Object.keys(wallets) as RoleCode[]) {
    const wallet = await prisma.walletAddress.upsert({
      where: { chainId_address: { chainId, address: wallets[roleName] } },
      update: { lastSeenBlock: block, updatedAt: now },
      create: {
        chainId,
        address: wallets[roleName],
        firstSeenBlock: block,
        lastSeenBlock: block,
        createdAt: now,
      },
      select: { id: true },
    });
    walletRows.set(roleName, wallet);
  }

  const txRows = new Map<string, { id: string }>();
  for (const [roleName, txHash] of Object.entries(txHashes).slice(0, 4) as [RoleCode, string][]) {
    const wallet = walletRows.get(roleName);
    if (!wallet) throw new Error(`Missing wallet for ${roleName}`);
    const tx = await prisma.blockchainTransaction.upsert({
      where: { chainId_txHash: { chainId, txHash } },
      update: { status: TransactionStatus.CONFIRMED, blockNumber: block, confirmedAt: now },
      create: {
        chainId,
        txHash,
        fromWalletId: wallet.id,
        status: TransactionStatus.CONFIRMED,
        blockNumber: block,
        blockHash: `0x${"12".repeat(32)}`,
        confirmations: 12,
        submittedAt: now,
        minedAt: now,
        confirmedAt: now,
        createdAt: now,
      },
      select: { id: true },
    });
    txRows.set(roleName, tx);
  }

  const identityData: Record<RoleCode, { did: string; didKey: string }> = {
    ADMIN: { did: "did:example:admin", didKey: `0x${"01".repeat(32)}` },
    MANAGER: { did: "did:example:manager", didKey: `0x${"02".repeat(32)}` },
    AUDITOR: { did: "did:example:auditor", didKey: `0x${"03".repeat(32)}` },
    USER: { did: "did:example:user", didKey: `0x${"04".repeat(32)}` },
  };

  const identityRows = new Map<RoleCode, { id: string }>();
  for (const roleName of Object.keys(identityData) as RoleCode[]) {
    const wallet = walletRows.get(roleName);
    const tx = txRows.get(roleName);
    const identity = identityData[roleName];
    if (!wallet || !tx) throw new Error(`Missing identity references for ${roleName}`);
    const row = await prisma.identity.upsert({
      where: { chainId_did: { chainId, did: identity.did } },
      update: {
        walletAddressId: wallet.id,
        didKey: identity.didKey,
        roleCode: roleName,
        status: IdentityStatus.ACTIVE,
        lastChainBlock: block,
        updatedAt: now,
      },
      create: {
        chainId,
        did: identity.did,
        didKey: identity.didKey,
        walletAddressId: wallet.id,
        roleCode: roleName,
        status: IdentityStatus.ACTIVE,
        documentHash: `0x${(10 + Object.keys(identityData).indexOf(roleName)).toString(16).padStart(2, "0").repeat(32)}`,
        createdBlockNumber: block,
        createdTxId: tx.id,
        lastChainBlock: block,
        createdAt: now,
      },
      select: { id: true },
    });
    identityRows.set(roleName, row);

    const role = roleRows.get(roleName);
    if (!role) throw new Error(`Missing role ${roleName}`);
    await prisma.walletRoleAssignment.upsert({
      where: { chainId_walletAddressId_roleId: { chainId, walletAddressId: wallet.id, roleId: role.id } },
      update: { active: true, identityId: row.id, updatedAt: now },
      create: {
        chainId,
        walletAddressId: wallet.id,
        roleId: role.id,
        identityId: row.id,
        active: true,
        assignedBlockNumber: block,
        assignedTxId: tx.id,
        createdAt: now,
      },
    });
  }

  const manager = walletRows.get("MANAGER");
  const user = walletRows.get("USER");
  const admin = walletRows.get("ADMIN");
  if (!manager || !user || !admin) throw new Error("Missing asset seed wallets");
  const assetTx = await prisma.blockchainTransaction.upsert({
    where: { chainId_txHash: { chainId, txHash: txHashes.ASSET } },
    update: { status: TransactionStatus.CONFIRMED, blockNumber: block + 1n, confirmedAt: now },
    create: {
      chainId,
      txHash: txHashes.ASSET,
      fromWalletId: manager.id,
      toAddress: wallets.USER,
      contractAddress: "0x9999999999999999999999999999999999999999",
      status: TransactionStatus.CONFIRMED,
      blockNumber: block + 1n,
      blockHash: `0x${"13".repeat(32)}`,
      confirmations: 12,
      gasUsed: 180000n,
      effectiveGasPrice: 1000000000n,
      submittedAt: now,
      minedAt: now,
      confirmedAt: now,
      createdAt: now,
    },
    select: { id: true },
  });
  const asset = await prisma.asset.upsert({
    where: { chainId_contractAddress_tokenId: { chainId, contractAddress: "0x9999999999999999999999999999999999999999", tokenId: 1n } },
    update: { currentOwnerId: user.id, updatedAt: now },
    create: {
      chainId,
      tokenId: 1n,
      contractAddress: "0x9999999999999999999999999999999999999999",
      status: AssetStatus.ACTIVE,
      assetType: AssetType.DIGITAL,
      currentOwnerId: user.id,
      creatorId: manager.id,
      metadataUri: "ipfs://bafybeigdyrdevseedassetmetadata",
      metadataHash: `0x${"ab".repeat(32)}`,
      name: "Development Access Badge",
      description: "Seed asset for local indexer and ownership queries",
      imageUri: "ipfs://bafybeigdyrdevseedassetimage",
      serialNumber: "DEV-BADGE-0001",
      mintedBlockNumber: block + 1n,
      mintedTxId: assetTx.id,
      createdAt: now,
    },
    select: { id: true },
  });

  const transferTx = await prisma.blockchainTransaction.upsert({
    where: { chainId_txHash: { chainId, txHash: txHashes.TRANSFER } },
    update: { status: TransactionStatus.CONFIRMED, blockNumber: block + 2n, confirmedAt: now },
    create: {
      chainId,
      txHash: txHashes.TRANSFER,
      fromWalletId: manager.id,
      toAddress: wallets.USER,
      contractAddress: "0x9999999999999999999999999999999999999999",
      status: TransactionStatus.CONFIRMED,
      blockNumber: block + 2n,
      blockHash: `0x${"14".repeat(32)}`,
      confirmations: 12,
      submittedAt: now,
      minedAt: now,
      confirmedAt: now,
      createdAt: now,
    },
    select: { id: true },
  });
  const event = await prisma.indexedEvent.upsert({
    where: { chainId_transactionHash_logIndex: { chainId, transactionHash: txHashes.TRANSFER, logIndex: 0 } },
    update: { status: "PROCESSED", processedAt: now },
    create: {
      chainId,
      transactionId: transferTx.id,
      contractAddress: "0x9999999999999999999999999999999999999999",
      eventName: "Transfer",
      blockNumber: block + 2n,
      blockHash: `0x${"14".repeat(32)}`,
      transactionHash: txHashes.TRANSFER,
      logIndex: 0,
      topics: ["Transfer", wallets.MANAGER, wallets.USER, "0x01"],
      data: {},
      status: "PROCESSED",
      observedAt: now,
      processedAt: now,
    },
    select: { id: true },
  });
  await prisma.ownershipTransfer.upsert({
    where: { chainId_transactionId_logIndex: { chainId, transactionId: transferTx.id, logIndex: 0 } },
    update: { toWalletId: user.id },
    create: {
      chainId,
      assetId: asset.id,
      fromWalletId: manager.id,
      toWalletId: user.id,
      operatorWalletId: manager.id,
      transactionId: transferTx.id,
      eventId: event.id,
      blockNumber: block + 2n,
      logIndex: 0,
      reason: "seed transfer",
      createdAt: now,
    },
  });

  await prisma.auditRecord.upsert({
    where: { chainId_eventId: { chainId, eventId: event.id } },
    update: { action: AuditAction.ASSET_TRANSFERRED },
    create: {
      chainId,
      eventId: event.id,
      transactionId: transferTx.id,
      action: AuditAction.ASSET_TRANSFERRED,
      emitterAddress: "0x9999999999999999999999999999999999999999",
      actorAddress: wallets.MANAGER,
      targetTokenId: 1n,
      targetAssetId: asset.id,
      blockNumber: block + 2n,
      blockHash: `0x${"14".repeat(32)}`,
      logIndex: 0,
      occurredAt: now,
      metadata: { source: "development-seed" },
    },
  });

  const existingVerification = await prisma.verificationRecord.findFirst({
    where: {
      chainId,
      type: VerificationType.OWNERSHIP,
      assetId: asset.id,
      source: "development-seed",
    },
    select: { id: true },
  });
  if (!existingVerification) {
    await prisma.verificationRecord.create({
      data: {
        chainId,
        type: VerificationType.OWNERSHIP,
        result: VerificationResult.VERIFIED,
        requestedTokenId: 1n,
        assetId: asset.id,
        walletAddressId: user.id,
        verifiedAtBlock: block + 2n,
        verifiedBlockHash: `0x${"14".repeat(32)}`,
        source: "development-seed",
        responseSnapshot: { owner: wallets.USER, status: "ACTIVE" },
        createdAt: now,
      },
    });
  }

  await prisma.indexerCheckpoint.upsert({
    where: { chainId_scope: { chainId, scope: "development-local" } },
    update: { nextBlock: block + 3n, lastProcessedBlock: block + 2n, lastBlockHash: `0x${"14".repeat(32)}` },
    create: {
      chainId,
      scope: "development-local",
      nextBlock: block + 3n,
      lastProcessedBlock: block + 2n,
      lastBlockHash: `0x${"14".repeat(32)}`,
      deploymentBlock: 1n,
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exitCode = 1;
  });
