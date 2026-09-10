import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import { asyncHandler, ApiError } from "../../http/errors.js";
import { authenticate, chainId, requirePermission } from "../../http/middleware.js";
import { sendData } from "../../http/response.js";
import { jsonSafe } from "../../http/response.js";

export const auditRouter = Router();
auditRouter.use(authenticate, requirePermission("AUDIT_EXPORT"));
auditRouter.get("/", asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 100), 500);
  if (!Number.isInteger(limit) || limit < 1) throw ApiError.badRequest("Invalid limit");
  const where: Record<string, unknown> = { chainId: chainId(req) };
  if (req.query.action) where.action = String(req.query.action);
  if (req.query.actor) where.actorAddress = String(req.query.actor).toLowerCase();
  if (req.query.didKey) where.targetDidKey = String(req.query.didKey).toLowerCase();
  const rows = await prisma.auditRecord.findMany({ where, take: limit, orderBy: [{ blockNumber: "desc" }, { logIndex: "desc" }] });
  sendData(res, req, rows, 200, { chainId: chainId(req), freshness: "indexed" });
}));
auditRouter.get("/:eventId", asyncHandler(async (req, res) => {
  if (!z.string().min(1).max(128).safeParse(req.params.eventId).success) throw ApiError.badRequest("Invalid event ID");
  const row = await prisma.auditRecord.findFirst({ where: { id: String(req.params.eventId), chainId: chainId(req) }, include: { event: true, transaction: true } });
  if (!row) throw ApiError.notFound("Audit event not found");
  sendData(res, req, row);
}));
auditRouter.get("/export", asyncHandler(async (req, res) => {
  const format = req.query.format === "csv" ? "csv" : req.query.format === "json" ? "json" : undefined;
  if (!format) throw ApiError.badRequest("format must be csv or json");
  const rows = await prisma.auditRecord.findMany({ where: { chainId: chainId(req) }, take: 10_000, orderBy: { occurredAt: "asc" } });
  if (format === "json") return res.type("application/json").attachment("audit.json").send(JSON.stringify(jsonSafe(rows)));
  const fields = ["id", "action", "actorAddress", "blockNumber", "transactionId", "occurredAt"];
  const csv = [fields.join(","), ...rows.map((row) => fields.map((field) => JSON.stringify(String((row as unknown as Record<string, unknown>)[field] ?? ""))).join(","))].join("\n");
  return res.type("text/csv").attachment("audit.csv").send(csv);
}));
