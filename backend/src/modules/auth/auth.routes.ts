import { Router } from "express";
import { z } from "zod";
import { asyncHandler, ApiError } from "../../http/errors.js";
import { authenticate, optionalAuth } from "../../http/middleware.js";
import { sendData } from "../../http/response.js";
import { config } from "../../config/env.js";
import { nonce, authenticate as verifySiwe } from "./siwe.service.js";
import { revokeSession } from "./store.js";

const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const nonceSchema = z.object({ address, chainId: z.coerce.number().int().positive() }).strict();
const siweSchema = z.object({ message: z.string().min(1).max(10_000), signature: z.string().regex(/^0x[0-9a-fA-F]+$/) }).strict();

export const authRouter = Router();
authRouter.post("/nonce", asyncHandler(async (req, res) => {
  const body = nonceSchema.safeParse(req.body);
  if (!body.success) throw ApiError.badRequest("Invalid nonce request", body.error.flatten());
  sendData(res, req, await nonce(body.data.address, body.data.chainId));
}));
authRouter.post("/siwe", asyncHandler(async (req, res) => {
  const body = siweSchema.safeParse(req.body);
  if (!body.success) throw ApiError.badRequest("Invalid SIWE request", body.error.flatten());
  sendData(res, req, await verifySiwe(body.data.message, body.data.signature));
}));
authRouter.post("/logout", authenticate, asyncHandler(async (req, res) => {
  if (req.auth) await revokeSession(req.auth.sessionId);
  res.status(204).send();
}));
