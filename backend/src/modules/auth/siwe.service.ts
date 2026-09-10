import { SiweMessage } from "siwe";
import { config } from "../../config/env.js";
import { ApiError } from "../../http/errors.js";
import { normalizeWalletAddress } from "../../db/normalization.js";
import { consumeNonce, createNonce, createSession } from "./store.js";
import { issueAccessToken, newSessionId } from "./tokens.js";

export async function nonce(address: string, chainId: number) {
  let normalized: string;
  try { normalized = normalizeWalletAddress(address); } catch { throw ApiError.badRequest("Invalid wallet address"); }
  if (chainId !== config.CHAIN_ID) throw ApiError.badRequest("Unsupported chain ID");
  const expiresAt = new Date(Date.now() + 5 * 60_000);
  const record = await createNonce({ address: normalized, chainId, domain: config.SIWE_DOMAIN, uri: config.SIWE_URI, expiresAt });
  return { nonce: record.nonce, domain: config.SIWE_DOMAIN, uri: config.SIWE_URI, chainId, issuedAt: record.issuedAt.toISOString(), expirationTime: expiresAt.toISOString() };
}

export async function authenticate(message: string, signature: string) {
  let parsed: SiweMessage;
  try { parsed = new SiweMessage(message); } catch { throw ApiError.unauthorized("Malformed SIWE message"); }
  if (parsed.domain !== config.SIWE_DOMAIN || parsed.uri !== config.SIWE_URI || parsed.chainId !== config.CHAIN_ID) {
    throw ApiError.unauthorized("SIWE domain, URI, or chain does not match");
  }
  if (!parsed.nonce || !parsed.address) throw ApiError.unauthorized("Invalid SIWE message");
  try {
    await parsed.verify({ signature, time: new Date().toISOString(), domain: config.SIWE_DOMAIN, nonce: parsed.nonce });
  } catch {
    throw ApiError.unauthorized("Invalid SIWE signature");
  }
  const address = normalizeWalletAddress(parsed.address);
  await consumeNonce(parsed.nonce, address, parsed.chainId);
  const sessionId = newSessionId();
  const tokenData = await issueAccessToken({ wallet: address as `0x${string}`, chainId: parsed.chainId, sessionId });
  await createSession(address, parsed.chainId, sessionId, new Date(tokenData.expiresAt));
  return { ...tokenData, wallet: address, chainId: parsed.chainId, sessionId };
}
