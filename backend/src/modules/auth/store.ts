import crypto from "node:crypto";
import { prisma } from "../../db/prisma.js";
import { ApiError } from "../../http/errors.js";

export async function createNonce(input: {
  address: string; chainId: number; domain: string; uri: string; expiresAt: Date;
}) {
  return prisma.authNonce.create({
    data: { nonce: crypto.randomBytes(16).toString("hex"), ...input, issuedAt: new Date() },
  });
}

export async function consumeNonce(nonce: string, address: string, chainId: number) {
  const updated = await prisma.authNonce.updateMany({
    where: { nonce, address, chainId, consumedAt: null, expiresAt: { gt: new Date() } },
    data: { consumedAt: new Date() },
  });
  if (updated.count !== 1) throw ApiError.conflict("NONCE_ALREADY_CONSUMED", "Nonce is invalid, expired, or already consumed");
}

export async function createSession(address: string, chainId: number, tokenId: string, expiresAt: Date) {
  return prisma.authSession.create({ data: { id: tokenId, tokenId, address, chainId, expiresAt } });
}

export async function revokeSession(sessionId: string) {
  await prisma.authSession.updateMany({ where: { id: sessionId, revokedAt: null }, data: { revokedAt: new Date() } });
}

export async function isSessionActive(sessionId: string, address: string, chainId: number): Promise<boolean> {
  const session = await prisma.authSession.findFirst({
    where: { id: sessionId, address, chainId, revokedAt: null, expiresAt: { gt: new Date() } },
    select: { id: true },
  });
  if (!session) return false;
  await prisma.authSession.update({ where: { id: sessionId }, data: { lastUsedAt: new Date() } });
  return true;
}
