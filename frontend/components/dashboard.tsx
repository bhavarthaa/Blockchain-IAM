"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useAccount } from "wagmi";
import { api, formatDate, shortAddress } from "../lib/api";
import type { Asset, AuditEvent, Identity, Role } from "../lib/types";
import { Shell } from "./shell";
import { Badge, Empty, ErrorCard, Loading } from "./ui";
import { Icon } from "./icons";

function useData<T>(path: string, enabled = true) { return useQuery({ queryKey: [path], queryFn: async () => (await api<T>(path)).data, enabled }); }
export function Dashboard() {
  const { address } = useAccount();
  const identities = useData<Identity[]>("/api/v1/identities", Boolean(address));
  const assets = useData<Asset[]>("/api/v1/assets", Boolean(address));
  const roles = useData<Role[]>("/api/v1/roles", Boolean(address));
  const audit = useData<AuditEvent[]>("/api/v1/audit?limit=8", Boolean(address));
  const active = identities.data?.filter((x) => x.status === "ACTIVE").length ?? 0;
  const managedAssets = assets.data?.filter((x) => x.status === "ACTIVE").length ?? 0;
  return <Shell title="Security overview" description="Monitor identities, permissions, custody and indexed evidence across your connected chain." action={<Link href="/verify" className="btn"><Icon name="check" size={15}/>Public verification</Link>}>
    {!address ? <div className="card mb-6 flex flex-col items-start gap-4 border-cyan/30 bg-cyan/5 p-6 sm:flex-row sm:items-center"><div className="rounded-lg bg-cyan/10 p-3 text-cyan"><Icon name="wallet" size={22}/></div><div className="flex-1"><p className="font-medium">Connect and sign in to view your security posture</p><p className="mt-1 text-sm text-muted">Read models and permission-aware controls are loaded from the backend after SIWE authentication.</p></div></div> : null}
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {[["Active identities", active, "users", "/identities"], ["Role assignments", roles.data?.reduce((sum, r) => sum + (r._count?.assignments ?? 0), 0) ?? 0, "shield", "/roles"], ["Assets under management", managedAssets, "box", "/assets"], ["Audit events", audit.data?.length ?? 0, "clock", "/audit"]].map(([label, value, icon, href]) => <Link href={String(href)} key={String(label)} className="card group p-5 transition hover:-translate-y-0.5 hover:border-cyan/50"><div className="flex items-start justify-between"><span className="eyebrow">{label}</span><span className="rounded-md border border-line bg-surface p-2 text-cyan"><Icon name={String(icon)} size={16}/></span></div><p className="mt-4 text-3xl font-semibold tracking-tight">{value}</p><p className="mt-1 text-xs text-muted">Indexed projection</p></Link>)}
    </div>
    <div className="mt-6 grid gap-6 xl:grid-cols-[1.1fr_.9fr]">
      <section className="card p-5"><div className="mb-5 flex items-center justify-between"><div><p className="font-semibold">Recent audit activity</p><p className="mt-1 text-xs text-muted">Immutable events indexed from the configured chain</p></div><Link href="/audit" className="text-xs font-medium text-cyan hover:underline">View all</Link></div>
        {audit.isLoading ? <Loading rows={4}/> : audit.error ? <ErrorCard error={audit.error} retry={() => audit.refetch()}/> : audit.data?.length ? <div className="divide-y divide-line/60">{audit.data.map((event) => <div key={event.id} className="flex items-start gap-3 py-3 first:pt-0"><div className="mt-0.5 rounded-full border border-cyan/30 bg-cyan/10 p-1.5 text-cyan"><Icon name="check" size={13}/></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-medium">{event.action}</p><Badge tone={event.status === "FAILED" ? "danger" : "success"}>{event.status ?? "INDEXED"}</Badge></div><p className="mt-1 truncate text-xs text-muted">{shortAddress(event.actorAddress)} · block {event.blockNumber ?? "—"}</p></div><time className="text-[11px] text-muted">{formatDate(event.occurredAt)}</time></div>)}</div> : <Empty title="No indexed activity yet" description="Audit records will appear after the indexer observes contract events."/>}
      </section>
      <section className="card p-5"><div className="mb-5"><p className="font-semibold">Role distribution</p><p className="mt-1 text-xs text-muted">Assignments from the indexed permission matrix</p></div>{roles.isLoading ? <Loading rows={4}/> : roles.error ? <ErrorCard error={roles.error} retry={() => roles.refetch()}/> : roles.data?.length ? <div className="space-y-3">{roles.data.map((role) => <div key={role.name} className="flex items-center gap-3"><span className="w-20 text-sm text-muted">{role.displayName ?? role.name}</span><div className="h-2 flex-1 overflow-hidden rounded-full bg-surface"><div className="h-full rounded-full bg-cyan" style={{ width: `${Math.min(100, (role._count?.assignments ?? 0) * 10)}%` }}/></div><span className="w-8 text-right text-sm font-medium">{role._count?.assignments ?? 0}</span></div>)}</div> : <Empty title="No role data" description="Role catalog is available after authentication and indexing."/>}</section>
    </div>
    <section className="mt-6 card p-5"><div className="mb-4 flex items-center justify-between"><div><p className="font-semibold">Quick actions</p><p className="mt-1 text-xs text-muted">Controls are validated again by the API and contracts.</p></div></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Link className="btn justify-start" href="/identities?action=create"><Icon name="plus" size={15}/>Create identity</Link><Link className="btn justify-start" href="/roles?action=assign"><Icon name="shield" size={15}/>Assign role</Link><Link className="btn justify-start" href="/assets?action=mint"><Icon name="plus" size={15}/>Mint asset</Link><Link className="btn justify-start" href="/verify"><Icon name="check" size={15}/>Verify evidence</Link></div></section>
  </Shell>;
}
