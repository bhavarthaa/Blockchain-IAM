"use client";

import { useEffect, useRef, useState } from "react";
import { ApiError } from "../lib/api";
import { Icon } from "./icons";

export function Loading({ rows = 3 }: { rows?: number }) { return <div className="space-y-3" aria-label="Loading">{Array.from({ length: rows }).map((_, i) => <div key={i} className="h-14 animate-pulse rounded-lg bg-panel/80"/> )}</div>; }
export function Empty({ title, description }: { title: string; description: string }) { return <div className="card flex flex-col items-center justify-center px-6 py-14 text-center"><div className="mb-3 rounded-full border border-line bg-surface p-3 text-muted"><Icon name="search" size={20}/></div><p className="font-medium">{title}</p><p className="mt-1 max-w-md text-sm text-muted">{description}</p></div>; }
export function ErrorCard({ error, retry }: { error: unknown; retry?: () => void }) { const message = error instanceof ApiError || error instanceof Error ? error.message : "Unable to load data"; return <div className="card flex items-start gap-3 border-danger/40 bg-danger/5 p-4"><Icon name="alert" size={19}/><div className="flex-1"><p className="font-medium text-danger">Request failed</p><p className="mt-1 text-sm text-muted">{message}</p></div>{retry && <button className="btn" onClick={retry}><Icon name="refresh" size={14}/>Retry</button>}</div>; }
export function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "success" | "warning" | "danger" | "info" | "neutral" }) { const cls = { success: "border-success/30 bg-success/10 text-success", warning: "border-warning/30 bg-warning/10 text-warning", danger: "border-danger/30 bg-danger/10 text-danger", info: "border-cyan/30 bg-cyan/10 text-cyan", neutral: "border-line bg-surface text-muted" }[tone]; return <span className={`status ${cls}`}>{children}</span>; }
export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const listener = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", listener);
    return () => document.removeEventListener("keydown", listener);
  }, [onClose]);
  return <div className="fixed inset-0 z-50 grid place-items-center bg-surface/85 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div role="dialog" aria-modal="true" aria-labelledby="modal-title" className="card max-h-[90vh] w-full max-w-lg overflow-auto p-5">
      <div className="mb-5 flex items-center justify-between"><h2 id="modal-title" className="text-lg font-semibold">{title}</h2><button ref={closeRef} className="btn px-2" onClick={onClose} aria-label="Close"><Icon name="x"/></button></div>{children}
    </div>
  </div>;
}
export function PermissionDenied({ permission }: { permission: string }) { return <div role="status" className="rounded-md border border-warning/30 bg-warning/[.06] px-3 py-2 text-xs text-warning">This control is restricted. Required permission: <span className="font-mono">{permission}</span>. The API remains the authorization boundary.</div>; }
export function useNotice() { const [notice, setNotice] = useState<string | null>(null); return { notice, setNotice, Notice: notice ? <div className="fixed bottom-5 right-5 z-50 max-w-sm rounded-lg border border-danger/40 bg-panel px-4 py-3 text-sm text-danger shadow-xl">{notice}</div> : null }; }
