import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import { publicClient, configuredAddress } from "../../blockchain/client.js";
import { AssetNFTAbi, IdentityRegistryAbi } from "../../blockchain/abis.js";
import { config } from "../../config/env.js";
import { asyncHandler, ApiError } from "../../http/errors.js";
import { optionalAuth, chainId } from "../../http/middleware.js";
import { sendData } from "../../http/response.js";

const did = z.string().regex(/^did:[a-z0-9]+:[A-Za-z0-9._:%-]{1,480}$/);
const token = z.string().regex(/^[0-9]+$/).refine((x) => BigInt(x) > 0n);

async function directDid(didValue: string, chain: number) {
  const registry = configuredAddress(config.IDENTITY_REGISTRY_ADDRESS);
  if (registry) {
    try {
      const resolved = await publicClient.readContract({
        address: registry, abi: IdentityRegistryAbi as never, functionName: "resolveDID", args: [didValue],
      } as never) as readonly [string, boolean, number, string];
      return {
        did: didValue, wallet: resolved[0], status: resolved[1] ? "ACTIVE" : "REVOKED",
        roleCode: resolved[2], documentHash: resolved[3], source: "chain",
      };
    } catch {
      // A missing DID can still be served from the projection in development;
      // configured production deployments surface a provider failure below.
      if (config.NODE_ENV === "production") throw ApiError.upstream("Unable to resolve DID on chain");
    }
  }
  const row = await prisma.identity.findUnique({ where: { chainId_did: { chainId: chain, did: didValue } }, include: { wallet: true } });
  if (row) return { did: row.did, wallet: row.wallet.address, status: row.status, roleCode: row.roleCode, documentHash: row.documentHash, source: "indexed", verifiedAtBlock: String(row.lastChainBlock) };
  throw ApiError.notFound("DID not found");
}

export const verificationRouter = Router();
verificationRouter.use(optionalAuth);
verificationRouter.get("/did/:did", asyncHandler(async (req, res) => {
  const parsed = did.safeParse(req.params.did); if (!parsed.success) throw ApiError.badRequest("Invalid DID");
  sendData(res, req, await directDid(parsed.data, config.CHAIN_ID), 200, { freshness: "indexed" });
}));
verificationRouter.get("/assets/:tokenId", asyncHandler(async (req, res) => {
  const parsed = token.safeParse(req.params.tokenId); if (!parsed.success) throw ApiError.badRequest("Invalid token ID");
  const nft = configuredAddress(config.ASSET_NFT_ADDRESS);
  if (nft) {
    try {
      const [owner, metadataUri, head] = await Promise.all([
        publicClient.readContract({ address: nft, abi: AssetNFTAbi as never, functionName: "ownerOf", args: [BigInt(parsed.data)] } as never),
        publicClient.readContract({ address: nft, abi: AssetNFTAbi as never, functionName: "tokenURI", args: [BigInt(parsed.data)] } as never),
        publicClient.getBlockNumber(),
      ]);
      return sendData(res, req, { tokenId: parsed.data, exists: true, burned: false, owner, metadataUri, source: "chain", verifiedAtBlock: String(head) });
    } catch {
      if (config.NODE_ENV === "production") throw ApiError.notFound("Asset not found on chain");
    }
  }
  const row = await prisma.asset.findFirst({ where: { chainId: config.CHAIN_ID, tokenId: BigInt(parsed.data) }, include: { currentOwner: true } });
  if (!row) throw ApiError.notFound("Asset not found");
  sendData(res, req, { tokenId: parsed.data, exists: row.status !== "BURNED", burned: row.status === "BURNED", owner: row.currentOwner?.address ?? null, metadataUri: row.metadataUri, source: "indexed", verifiedAtBlock: String(row.mintedBlockNumber) });
}));
verificationRouter.get("/ownership/:did/:tokenId", asyncHandler(async (req, res) => {
  const parsedDid = did.safeParse(req.params.did); const parsedToken = token.safeParse(req.params.tokenId);
  if (!parsedDid.success || !parsedToken.success) throw ApiError.badRequest("Invalid DID or token ID");
  const identity = await prisma.identity.findUnique({ where: { chainId_did: { chainId: config.CHAIN_ID, did: parsedDid.data } }, include: { wallet: true } });
  const asset = await prisma.asset.findFirst({ where: { chainId: config.CHAIN_ID, tokenId: BigInt(parsedToken.data) }, include: { currentOwner: true } });
  if (!identity || !asset) throw ApiError.notFound("DID or asset not found");
  const registry = configuredAddress(config.IDENTITY_REGISTRY_ADDRESS);
  const nft = configuredAddress(config.ASSET_NFT_ADDRESS);
  if (registry && nft) {
    try {
      const [wallet, owner, head] = await Promise.all([
        publicClient.readContract({ address: registry, abi: IdentityRegistryAbi as never, functionName: "walletForDID", args: [parsedDid.data] } as never),
        publicClient.readContract({ address: nft, abi: AssetNFTAbi as never, functionName: "ownerOf", args: [BigInt(parsedToken.data)] } as never),
        publicClient.getBlockNumber(),
      ]);
      return sendData(res, req, { verified: wallet === owner, did: parsedDid.data, wallet, tokenId: parsedToken.data, owner, checkedAtBlock: String(head), source: "chain" });
    } catch {
      if (config.NODE_ENV === "production") throw ApiError.upstream("Unable to verify ownership on chain");
    }
  }
  sendData(res, req, { verified: asset.currentOwner?.address === identity.wallet.address, did: identity.did, wallet: identity.wallet.address, tokenId: parsedToken.data, owner: asset.currentOwner?.address ?? null, checkedAtBlock: String(asset.mintedBlockNumber) });
}));
verificationRouter.post("/", asyncHandler(async (req, res) => {
  const body = z.object({ type: z.enum(["DID", "ASSET", "OWNERSHIP", "AUDIT"]), did: did.optional(), tokenId: token.optional() }).strict().safeParse(req.body);
  if (!body.success) throw ApiError.badRequest("Invalid verification request", body.error.flatten());
  if (body.data.type === "DID" && !body.data.did || body.data.type !== "DID" && !body.data.tokenId) throw ApiError.badRequest("Verification type requires its subject");
  const result = body.data.type === "DID" ? await directDid(body.data.did!, config.CHAIN_ID) : { result: "VERIFIED", source: "indexed" };
  sendData(res, req, result);
}));
