import crypto from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { config } from "../../config/env.js";

const secret = new TextEncoder().encode(config.SESSION_SECRET);

export type AuthClaims = { wallet: `0x${string}`; chainId: number; sessionId: string };

export async function issueAccessToken(claims: AuthClaims): Promise<{ token: string; expiresAt: string }> {
  const expiresAt = new Date(Date.now() + config.SESSION_TTL_SECONDS * 1000);
  const token = await new SignJWT({ wallet: claims.wallet, chainId: claims.chainId, sessionId: claims.sessionId })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(claims.wallet)
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(secret);
  return { token, expiresAt: expiresAt.toISOString() };
}

export async function verifyAccessToken(token: string): Promise<AuthClaims> {
  const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"] });
  if (typeof payload.wallet !== "string" || typeof payload.chainId !== "number" || typeof payload.sessionId !== "string") {
    throw new Error("Invalid claims");
  }
  return { wallet: payload.wallet as `0x${string}`, chainId: payload.chainId, sessionId: payload.sessionId };
}

export function newSessionId(): string {
  return `ses_${crypto.randomUUID()}`;
}
