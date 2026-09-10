import { keccak256, toBytes } from "viem";
import { publicClient, configuredAddress } from "./client.js";
import { RoleManagerAbi } from "./abis.js";
import { config } from "../config/env.js";
import { ApiError } from "../http/errors.js";

const constantForPermission: Record<string, string> = {
  DEFAULT_ADMIN_ROLE: "DEFAULT_ADMIN_ROLE",
  IDENTITY_CREATE: "IDENTITY_CREATE",
  IDENTITY_UPDATE: "IDENTITY_UPDATE",
  IDENTITY_REVOKE: "IDENTITY_REVOKE",
  ROLE_ASSIGN: "ROLE_ASSIGN",
  ASSET_MINT: "ASSET_MINT",
  ASSET_ASSIGN: "ASSET_ASSIGN",
  ASSET_TRANSFER: "ASSET_TRANSFER",
  ASSET_METADATA_UPDATE: "ASSET_METADATA_UPDATE",
  ASSET_BURN: "ASSET_BURN",
  AUDIT_EXPORT: "AUDIT_EXPORT",
  INDEXER_OPERATOR: "DEFAULT_ADMIN_ROLE",
};

export async function hasOnChainPermission(wallet: `0x${string}`, permission: string): Promise<boolean> {
  const address = configuredAddress(config.ROLE_MANAGER_ADDRESS);
  if (!address) {
    if (config.NODE_ENV === "production") throw ApiError.unavailable("RoleManager is not configured");
    return true;
  }
  const constant = constantForPermission[permission];
  if (!constant) throw ApiError.forbidden(`Unknown permission ${permission}`);
  try {
    const role = await publicClient.readContract({
      address, abi: RoleManagerAbi as never, functionName: constant, args: [],
    } as never) as `0x${string}`;
    return await publicClient.readContract({
      address, abi: RoleManagerAbi as never, functionName: "hasPermission", args: [wallet, role],
    } as never) as boolean;
  } catch {
    throw ApiError.upstream("Unable to verify on-chain permission");
  }
}

export function permissionKey(name: string): `0x${string}` {
  return keccak256(toBytes(name));
}
