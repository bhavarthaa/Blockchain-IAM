import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { config } from "../config/env.js";
import { ApiError } from "./errors.js";
import { verifyAccessToken } from "../modules/auth/tokens.js";
import { isSessionActive } from "../modules/auth/store.js";

declare global {
  namespace Express {
    interface Request {
      id: string;
      auth?: { wallet: `0x${string}`; chainId: number; sessionId: string };
    }
  }
}

export function requestContext(req: Request, res: Response, next: NextFunction) {
  req.id = req.header("X-Request-Id")?.slice(0, 100) || `req_${crypto.randomUUID()}`;
  res.setHeader("X-Request-Id", req.id);
  next();
}

export function authenticate(req: Request, _res: Response, next: NextFunction) {
  const header = req.header("Authorization");
  if (!header?.startsWith("Bearer ")) return next(ApiError.unauthorized());
  void verifyAccessToken(header.slice("Bearer ".length))
    .then(async (auth) => {
      if (!(await isSessionActive(auth.sessionId, auth.wallet, auth.chainId))) throw ApiError.unauthorized("Session is revoked or expired");
      req.auth = auth; next();
    })
    .catch((error: unknown) => {
      const dependencyError = error as { code?: string; name?: string };
      if (error instanceof ApiError) return next(error);
      if (dependencyError.code === "P1001" || dependencyError.name === "PrismaClientInitializationError") {
        return next(ApiError.unavailable("Session store unavailable"));
      }
      return next(ApiError.unauthorized("Invalid or expired session"));
    });
}

export function requirePermission(permission: string) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) return next(ApiError.unauthorized());
    try {
      // Permission reads are deliberately delegated to the blockchain service.
      // Routes can inject a policy checker via app.locals for production relayers.
      const checker = req.app.locals.permissionChecker as
        | ((wallet: `0x${string}`, chainId: number, permission: string) => Promise<boolean>)
        | undefined;
      if (!checker) return next(ApiError.unavailable("Authorization service is not configured"));
      if (!(await checker(req.auth.wallet, req.auth.chainId, permission))) {
        return next(ApiError.forbidden(`The wallet does not have ${permission} permission.`));
      }
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.header("Authorization");
  if (!header?.startsWith("Bearer ")) return next();
  void verifyAccessToken(header.slice(7))
    .then((auth) => { req.auth = auth; next(); })
    .catch(() => next(ApiError.unauthorized("Invalid or expired session")));
}

export function chainId(req: Request): number {
  const value = Number(req.header("X-Chain-Id") ?? config.CHAIN_ID);
  if (!Number.isInteger(value) || value <= 0) throw ApiError.badRequest("Unsupported chain ID");
  return value;
}

export function parseBody<T>(schema: { parse: (input: unknown) => T }, req: Request): T {
  try { return schema.parse(req.body); }
  catch (error) { throw ApiError.unprocessable("Request validation failed", error); }
}
