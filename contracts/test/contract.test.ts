import { expect } from "chai";
import { ethers } from "hardhat";

describe("Blockchain IAM contracts", function () {
  async function deploy() {
    const [admin, manager, user, other] = await ethers.getSigners();
    const roleManager = await (await ethers.getContractFactory("RoleManager")).deploy();
    const registry = await (await ethers.getContractFactory("IdentityRegistry")).deploy();
    const assets = await (await ethers.getContractFactory("AssetNFT")).deploy();
    const audit = await (await ethers.getContractFactory("AuditLogger")).deploy();
    await Promise.all([
      roleManager.waitForDeployment(),
      registry.waitForDeployment(),
      assets.waitForDeployment(),
      audit.waitForDeployment()
    ]);

    await roleManager.setIdentityRegistry(await registry.getAddress());
    await roleManager.setAuditLogger(await audit.getAddress());
    await registry.setRoleManager(await roleManager.getAddress());
    await registry.setAuditLogger(await audit.getAddress());
    await assets.setIdentityRegistry(await registry.getAddress());
    await assets.setRoleManager(await roleManager.getAddress());
    await assets.setAuditLogger(await audit.getAddress());
    await audit.setEmitter(await roleManager.getAddress(), true);
    await audit.setEmitter(await registry.getAddress(), true);
    await audit.setEmitter(await assets.getAddress(), true);

    const userRole = await roleManager.USER_ROLE();
    const managerRole = await roleManager.MANAGER_ROLE();
    await roleManager.grantPlatformRole(managerRole, manager.address);
    return { admin, manager, user, other, roleManager, registry, assets, audit, userRole, managerRole };
  }

  async function identity(registry: any, wallet: string, did: string, roleCode = 3) {
    await registry.createIdentity(wallet, did, roleCode, ethers.keccak256(ethers.toUtf8Bytes(did)));
  }

  describe("RoleManager", function () {
    it("exposes all permission constants and defaults administrator permissions", async function () {
      const { roleManager, admin } = await deploy();
      const permissions = [
        await roleManager.IDENTITY_CREATE(),
        await roleManager.IDENTITY_UPDATE(),
        await roleManager.IDENTITY_REVOKE(),
        await roleManager.ROLE_ASSIGN(),
        await roleManager.ASSET_MINT(),
        await roleManager.ASSET_ASSIGN(),
        await roleManager.ASSET_TRANSFER(),
        await roleManager.ASSET_BURN(),
        await roleManager.ASSET_METADATA_UPDATE(),
        await roleManager.AUDIT_EXPORT()
      ];
      expect(new Set(permissions).size).to.equal(10);
      for (const permission of permissions) {
        expect(await roleManager.hasPermission(admin.address, permission)).to.equal(true);
      }
    });

    it("rejects unknown roles and protects the final administrator", async function () {
      const { roleManager, other } = await deploy();
      await expect(
        roleManager.grantPlatformRole(ethers.keccak256(ethers.toUtf8Bytes("unknown")), other.address)
      ).to.be.revertedWithCustomError(roleManager, "UnknownRole");
      await expect(
        roleManager.revokePlatformRole(await roleManager.ADMIN_ROLE(), (await ethers.getSigners())[0].address)
      ).to.be.revertedWithCustomError(roleManager, "CannotRemoveLastAdmin");
    });
  });

  describe("IdentityRegistry", function () {
    it("enforces uniqueness, owner updates, revocation, and restore", async function () {
      const { admin, user, other, registry } = await deploy();
      await identity(registry, user.address, "did:iam:user");
      await expect(
        registry.createIdentity(other.address, "did:iam:user", 3, ethers.ZeroHash)
      ).to.be.revertedWithCustomError(registry, "DocumentHashRequired");
      await expect(
        registry.createIdentity(user.address, "did:iam:second", 3, ethers.keccak256(ethers.toUtf8Bytes("x")))
      ).to.be.revertedWithCustomError(registry, "WalletAlreadyRegistered");

      await registry.connect(user).updateDIDDocument(
        "did:iam:user",
        ethers.keccak256(ethers.toUtf8Bytes("updated"))
      );
      await expect(
        registry.connect(other).updateDIDDocument("did:iam:user", ethers.keccak256(ethers.toUtf8Bytes("bad")))
      ).to.be.revertedWithCustomError(registry, "UnauthorizedIdentityUpdate");
      await registry.revokeIdentity("did:iam:user");
      expect(await registry.isActiveWallet(user.address)).to.equal(false);
      await registry.restoreIdentity("did:iam:user");
      expect(await registry.isActiveWallet(user.address)).to.equal(true);
      expect((await registry.resolveDID("did:iam:user")).wallet).to.equal(user.address);
      expect(admin.address).to.not.equal(ethers.ZeroAddress);
    });

    it("synchronizes platform roles through the registry", async function () {
      const { user, registry, roleManager, userRole } = await deploy();
      await identity(registry, user.address, "did:iam:user");
      await registry.assignRole("did:iam:user", userRole, user.address);
      expect(await roleManager.hasRole(userRole, user.address)).to.equal(true);
      await registry["revokeRole(string,bytes32,address)"]("did:iam:user", userRole, user.address);
      expect(await roleManager.hasRole(userRole, user.address)).to.equal(false);
    });
  });

  describe("AssetNFT and AuditLogger", function () {
    it("mints, assigns, transfers, updates metadata, and preserves history", async function () {
      const { admin, manager, user, other, registry, assets, managerRole, roleManager, audit } = await deploy();
      await identity(registry, user.address, "did:iam:user");
      await identity(registry, other.address, "did:iam:other");
      await registry.assignRole("did:iam:user", await roleManager.USER_ROLE(), user.address);
      await assets.connect(manager).mint(user.address, "ipfs://first");
      expect(await assets.ownerOf(1)).to.equal(user.address);
      await assets.connect(manager).assign(1, "did:iam:other");
      expect(await assets.ownerOf(1)).to.equal(other.address);
      await assets.connect(manager).transferAsset(other.address, user.address, 1);
      expect(await assets.ownerOf(1)).to.equal(user.address);
      await assets.updateTokenURI(1, "ipfs://second");
      expect(await assets.tokenURI(1)).to.equal("ipfs://second");
      expect((await assets.getOwnershipHistory(1)).length).to.equal(3);
      await assets.burn(1);
      expect((await assets.getAsset(1)).burned).to.equal(true);
      expect((await assets.getOwnershipHistory(1)).length).to.equal(4);
      expect(await audit.getEventCount()).to.be.greaterThan(0);
      expect(admin.address).to.not.equal(ethers.ZeroAddress);
    });

    it("rejects inactive recipients and unauthorized lifecycle operations", async function () {
      const { manager, user, other, registry, assets, managerRole } = await deploy();
      await identity(registry, user.address, "did:iam:user");
      await identity(registry, other.address, "did:iam:other");
      await assets.connect(manager).mint(user.address, "ipfs://asset");
      await registry.revokeIdentity("did:iam:other");
      await expect(assets.connect(manager).assign(1, "did:iam:other"))
        .to.be.revertedWithCustomError(assets, "TransferToInactiveIdentity");
      await expect(assets.connect(other).burn(1))
        .to.be.revertedWithCustomError(assets, "MissingPermission");
    });

    it("allows only approved emitters to append audit records", async function () {
      const { audit, other } = await deploy();
      await expect(
        audit.connect(other).log(ethers.keccak256(ethers.toUtf8Bytes("ACTION")), ethers.ZeroHash, 0, ethers.ZeroHash)
      ).to.be.revertedWithCustomError(audit, "UnauthorizedEmitter");
      await audit.pause();
      await expect(
        audit.log(ethers.keccak256(ethers.toUtf8Bytes("ACTION")), ethers.ZeroHash, 0, ethers.ZeroHash)
      ).to.be.revertedWithCustomError(audit, "EnforcedPause");
    });

    it("keeps safe ERC-721 transfers receiver-safe and identity-gated", async function () {
      const { user, registry, assets, roleManager } = await deploy();
      const receiver = await (await ethers.getContractFactory("TestReceiver")).deploy();
      await receiver.waitForDeployment();
      await identity(registry, user.address, "did:iam:user");
      await identity(registry, await receiver.getAddress(), "did:iam:receiver");
      await registry.assignRole(
        "did:iam:user",
        await roleManager.USER_ROLE(),
        user.address
      );
      await assets.mint(user.address, "ipfs://safe");
      await assets.connect(user)["safeTransferFrom(address,address,uint256)"](
        user.address,
        await receiver.getAddress(),
        1
      );
      expect(await assets.ownerOf(1)).to.equal(await receiver.getAddress());
    });
  });
});
