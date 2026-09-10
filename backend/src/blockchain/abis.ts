import fs from "node:fs";
import path from "node:path";

type AbiItem = Record<string, unknown>;
function artifact(name: string): AbiItem[] {
  const root = process.env.CONTRACT_ARTIFACTS_DIR ??
    path.resolve(process.cwd(), "../contracts/artifacts/contracts");
  const file = path.join(root, `${name}.sol`, `${name}.json`);
  try {
    return (JSON.parse(fs.readFileSync(file, "utf8")) as { abi: AbiItem[] }).abi;
  } catch {
    // Keep startup usable for API-only deployments; configured contract calls
    // fail explicitly rather than silently using mock data.
    return [];
  }
}

export const IdentityRegistryAbi = artifact("IdentityRegistry");
export const RoleManagerAbi = artifact("RoleManager");
export const AssetNFTAbi = artifact("AssetNFT");
export const AuditLoggerAbi = artifact("AuditLogger");
