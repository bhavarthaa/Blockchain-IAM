import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import { RoleManagerAbi } from "../../blockchain/abis.js";
import { IdentityRegistryAbi } from "../../blockchain/abis.js";
import { config } from "../../config/env.js";
import { asyncHandler, ApiError } from "../../http/errors.js";
import { authenticate, chainId, parseBody, requirePermission } from "../../http/middleware.js";
import { sendData } from "../../http/response.js";
import { submitTransaction } from "../transactions/service.js";

const role = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
const account = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const did = z.string().regex(/^did:[a-z0-9]+:[A-Za-z0-9._:%-]{1,480}$/);
const assignment = z.object({ did, role, account }).strict();
const permission = z.object({ enabled: z.boolean() }).strict();
function key(req: import("express").Request) { const k = req.header("Idempotency-Key"); if (!k) throw ApiError.badRequest("Idempotency-Key header is required"); return k; }

export const roleRouter = Router();
roleRouter.use(authenticate);
roleRouter.get("/", asyncHandler(async (req, res) => {
  const rows = await prisma.role.findMany({ where: { chainId: chainId(req) }, include: { permissions: { include: { permission: true } }, _count: { select: { assignments: true } } } });
  sendData(res, req, rows, 200, { chainId: chainId(req), freshness: "indexed" });
}));
roleRouter.get("/:role/permissions", asyncHandler(async (req, res) => {
  const name = String(req.params.role).toUpperCase();
  if (!["ADMIN", "MANAGER", "AUDITOR", "USER"].includes(name)) throw ApiError.badRequest("Unknown role");
  const row = await prisma.role.findFirst({ where: { chainId: chainId(req), name: name as never }, include: { permissions: { include: { permission: true } } } });
  if (!row) throw ApiError.notFound("Role not found");
  sendData(res, req, row.permissions.filter((x) => x.enabled).map((x) => x.permission), 200, { freshness: "indexed" });
}));
roleRouter.get("/wallets/:address/roles", asyncHandler(async (req, res) => {
  if (!account.safeParse(req.params.address).success) throw ApiError.badRequest("Invalid wallet address");
  const wallet = await prisma.walletAddress.findUnique({ where: { chainId_address: { chainId: chainId(req), address: String(req.params.address).toLowerCase() } }, include: { roleAssignments: { where: { active: true }, include: { role: { include: { permissions: { include: { permission: true } } } } }, } } });
  if (!wallet) throw ApiError.notFound("Wallet not found");
  sendData(res, req, wallet, 200, { freshness: "indexed" });
}));

export const walletRoleRouter = Router();
walletRoleRouter.use(authenticate);
walletRoleRouter.get("/:address/roles", asyncHandler(async (req, res) => {
  if (!account.safeParse(req.params.address).success) throw ApiError.badRequest("Invalid wallet address");
  const wallet = await prisma.walletAddress.findUnique({ where: { chainId_address: { chainId: chainId(req), address: String(req.params.address).toLowerCase() } }, include: { roleAssignments: { where: { active: true }, include: { role: { include: { permissions: { include: { permission: true } } } } }, } } });
  if (!wallet) throw ApiError.notFound("Wallet not found");
  sendData(res, req, wallet, 200, { freshness: "indexed" });
}));
roleRouter.post("/assign", requirePermission("ROLE_ASSIGN"), asyncHandler(async (req, res) => {
  const body = parseBody(assignment, req);
  const result = await submitTransaction({ chainId: chainId(req), wallet: req.auth!.wallet, route: req.originalUrl, idempotencyKey: key(req), request: body, write: { abi: IdentityRegistryAbi, address: config.IDENTITY_REGISTRY_ADDRESS, functionName: "assignRole", args: [body.did, body.role, body.account] } });
  sendData(res, req, result, 202, { freshness: "pending" });
}));
roleRouter.post("/revoke", requirePermission("ROLE_ASSIGN"), asyncHandler(async (req, res) => {
  const body = parseBody(assignment, req);
  const result = await submitTransaction({ chainId: chainId(req), wallet: req.auth!.wallet, route: req.originalUrl, idempotencyKey: key(req), request: body, write: { abi: IdentityRegistryAbi, address: config.IDENTITY_REGISTRY_ADDRESS, functionName: "revokeRole", args: [body.did, body.role, body.account] } });
  sendData(res, req, result, 202, { freshness: "pending" });
}));

export const permissionRouter = Router();
permissionRouter.use(authenticate);
permissionRouter.get("/", asyncHandler(async (req, res) => {
  const rows = await prisma.permission.findMany({ include: { roles: { where: { role: { chainId: chainId(req) } }, include: { role: true } } } });
  sendData(res, req, rows, 200, { freshness: "indexed" });
}));
permissionRouter.put("/:role/:permission", requirePermission("DEFAULT_ADMIN_ROLE"), asyncHandler(async (req, res) => {
  const body = parseBody(permission, req);
  const parsedRole = role.safeParse(req.params.role);
  const parsedPermission = role.safeParse(req.params.permission);
  if (!parsedRole.success || !parsedPermission.success) throw ApiError.badRequest("Invalid role or permission key");
  const result = await submitTransaction({ chainId: chainId(req), wallet: req.auth!.wallet, route: req.originalUrl, idempotencyKey: key(req), request: body, write: { abi: RoleManagerAbi, address: config.ROLE_MANAGER_ADDRESS, functionName: "setPermission", args: [parsedRole.data, parsedPermission.data, body.enabled] } });
  sendData(res, req, result, 202, { freshness: "pending" });
}));
