import { ethers } from "hardhat";

async function main(): Promise<void> {
  const [deployer] = await ethers.getSigners();
  console.log(`Deploying with ${deployer.address}`);

  const RoleManager = await ethers.getContractFactory("RoleManager");
  const roleManager = await RoleManager.deploy();
  await roleManager.waitForDeployment();

  const IdentityRegistry = await ethers.getContractFactory("IdentityRegistry");
  const identityRegistry = await IdentityRegistry.deploy();
  await identityRegistry.waitForDeployment();

  const AssetNFT = await ethers.getContractFactory("AssetNFT");
  const assetNFT = await AssetNFT.deploy();
  await assetNFT.waitForDeployment();

  const AuditLogger = await ethers.getContractFactory("AuditLogger");
  const auditLogger = await AuditLogger.deploy();
  await auditLogger.waitForDeployment();

  const roleManagerAddress = await roleManager.getAddress();
  const identityRegistryAddress = await identityRegistry.getAddress();
  const assetNFTAddress = await assetNFT.getAddress();
  const auditLoggerAddress = await auditLogger.getAddress();

  await (await roleManager.setIdentityRegistry(identityRegistryAddress)).wait();
  await (await roleManager.setAuditLogger(auditLoggerAddress)).wait();
  await (await identityRegistry.setRoleManager(roleManagerAddress)).wait();
  await (await identityRegistry.setAuditLogger(auditLoggerAddress)).wait();
  await (await assetNFT.setIdentityRegistry(identityRegistryAddress)).wait();
  await (await assetNFT.setRoleManager(roleManagerAddress)).wait();
  await (await assetNFT.setAuditLogger(auditLoggerAddress)).wait();

  await (await auditLogger.setEmitter(roleManagerAddress, true)).wait();
  await (await auditLogger.setEmitter(identityRegistryAddress, true)).wait();
  await (await auditLogger.setEmitter(assetNFTAddress, true)).wait();

  console.log(JSON.stringify({
    deployer: deployer.address,
    roleManager: roleManagerAddress,
    identityRegistry: identityRegistryAddress,
    assetNFT: assetNFTAddress,
    auditLogger: auditLoggerAddress
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
