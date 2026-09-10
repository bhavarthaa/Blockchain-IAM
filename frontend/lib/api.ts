import type { Asset, Envelope, Identity } from "./types";

export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001").replace(/\/$/, "");
const tokenKey = "iam_access_token";

export function getToken() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(tokenKey);
}
export function setToken(token: string) { window.localStorage.setItem(tokenKey, token); }
export function clearToken() { window.localStorage.removeItem(tokenKey); }

export class ApiError extends Error {
  status: number;
  code?: string;
  requestId?: string;
  constructor(message: string, status: number, code?: string, requestId?: string) {
    super(message); this.status = status; this.code = code; this.requestId = requestId;
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<Envelope<T>> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const token = getToken();
  if (token) headers.set("Authorization", "Bearer " + token);
  if (path.startsWith("/api/v1/") && init.method && init.method !== "GET") headers.set("Idempotency-Key", crypto.randomUUID());
  const chainId = process.env.NEXT_PUBLIC_CHAIN_ID;
  if (chainId) headers.set("X-Chain-Id", chainId);
  const response = await fetch(`${API_URL}${path}`, { ...init, headers, cache: "no-store" });
  if (response.status === 204) return { data: undefined as T };
  const payload = await response.json().catch(() => ({})) as Envelope<T> & { error?: { message?: string; code?: string; requestId?: string } };
  if (!response.ok) {
    throw new ApiError(payload.error?.message ?? `Request failed (${response.status})`, response.status, payload.error?.code, payload.error?.requestId);
  }
  return payload;
}

export function shortAddress(address?: string | null) {
  return address && address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address ?? "—";
}
export function formatDate(value?: string | number | Date) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? String(value) : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}
export function walletAddress(value: Identity["wallet"] | Asset["currentOwner"]) {
  return typeof value === "string" ? value : value?.address;
}
