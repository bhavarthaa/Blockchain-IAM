import type { Request, Response } from "express";

export function jsonSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (_key, item) => typeof item === "bigint" ? item.toString() : item)) as T;
}

export function sendData(res: Response, req: Request, data: unknown, status = 200, extra: Record<string, unknown> = {}) {
  return res.status(status).json({ data: jsonSafe(data), meta: { requestId: req.id, ...extra } });
}
