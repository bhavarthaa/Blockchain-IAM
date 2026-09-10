"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, API_URL, formatDate, getToken, shortAddress } from "../../lib/api";
import type { AuditEvent } from "../../lib/types";
import { Shell } from "../../components/shell";
import { Badge, Empty, ErrorCard, Loading } from "../../components/ui";
import { Icon } from "../../components/icons";
import { usePermissions } from "../../components/permissions";

export default function AuditPage() {
  const [action, setAction] = useState("");
  const [exportError, setExportError] = useState<string | null>(null);
  const permissions = usePermissions();
  const query = useQuery({ queryKey: ["audit", action], queryFn: async () => (await api<AuditEvent[]>(`/api/v1/audit?limit=100${action ? `&action=${encodeURIComponent(action)}` : ""}`)).data });
  async function exportAudit() {
    try {
      setExportError(null);
      const response = await fetch(`${API_URL}/api/v1/audit/export?format=csv`, { headers: { Authorization: `Bearer ${getToken() ?? ""}` } });
      if (!response.ok) throw new Error("Audit export was rejected by the API.");
      const blob = await response.blob(); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = "audit.csv"; link.click(); URL.revokeObjectURL(url);
    } catch (error) { setExportError(error instanceof Error ? error.message : "Audit export failed"); }
  }
  return <Shell title="Audit log" description="Evidence timeline sourced from indexed immutable contract events." action={<button className="btn" disabled={permissions.loading || !permissions.can("AUDIT_EXPORT")} title={!permissions.loading && !permissions.can("AUDIT_EXPORT") ? "Requires AUDIT_EXPORT" : undefined} onClick={() => void exportAudit()}><Icon name="external" size={14}/>Export CSV</button>}>
    {exportError && <div className="mb-4 rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">{exportError}</div>}<div className="card mb-4 flex flex-wrap items-center gap-3 p-3"><div className="relative flex-1"><Icon name="search" size={15}/><input className="field pl-9" placeholder="Filter by action" value={action} onChange={(e) => setAction(e.target.value)}/></div><Badge tone="info">{query.data?.length ?? 0} events</Badge></div>
    {query.isLoading ? <Loading rows={7}/> : query.error ? <ErrorCard error={query.error} retry={() => query.refetch()}/> : !query.data?.length ? <Empty title="No indexed activity yet" description="Audit records require an authenticated AUDIT_EXPORT permission and indexed contract events."/> : <div className="card divide-y divide-line/60">{query.data.map((event) => <div key={event.id} className="flex flex-wrap items-start gap-4 p-4"><div className="mt-0.5 rounded-full border border-cyan/30 bg-cyan/10 p-2 text-cyan"><Icon name="clock" size={15}/></div><div className="min-w-[180px] flex-1"><p className="font-medium">{event.action}</p><p className="mt-1 text-xs text-muted">Actor {shortAddress(event.actorAddress)} {event.targetDid ? `· ${event.targetDid}` : ""}</p></div><div className="text-right text-xs text-muted"><p>Block {event.blockNumber ?? "—"}</p><p className="mt-1">{formatDate(event.occurredAt)}</p></div><Badge tone={event.status === "FAILED" ? "danger" : "success"}>{event.status ?? "INDEXED"}</Badge></div>)}</div>}
  </Shell>;
}
