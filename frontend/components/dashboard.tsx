"use client";

import Link from "next/link";
import { useAccount } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { api, formatDate, shortAddress } from "../lib/api";
import type { Asset, AuditEvent, Identity, Role } from "../lib/types";
import { Shell } from "./shell";
import { Badge, Empty, ErrorCard, Loading } from "./ui";
import { Icon } from "./icons";
import { usePermissions } from "./permissions";

function useData<T>(path: string, enabled = true) {
  return useQuery({ queryKey: [path], queryFn: async () => (await api<T>(path)).data, enabled });
}

function ActionLink({ href, icon, label, permission, allowed, loading }: { href: string; icon: string; label: string; permission?: string; allowed?: boolean; loading?: boolean }) {
  const locked = Boolean(permission && !loading && !allowed);
  return <Link href={locked ? "#" : href} aria-disabled={locked || undefined} onClick={(event) => { if (locked) event.preventDefault(); }} title={locked ? `Requires ${permission}` : undefined} className={`btn justify-start ${locked ? "cursor-not-allowed opacity-45" : ""}`}><Icon name={locked ? "lock" : icon} size={15}/>{label}{locked && <span className="ml-auto text-[10px] uppercase tracking-wide">Restricted</span>}</Link>;
}

export function Dashboard() {
  const { address } = useAccount();
  const permissions = usePermissions();
  const identities = useData<Identity[]>("/api/v1/identities", Boolean(address));
  const assets = useData<Asset[]>("/api/v1/assets", Boolean(address));
  const roles = useData<Role[]>("/api/v1/roles", Boolean(address));
  const audit = useData<AuditEvent[]>("/api/v1/audit?limit=8", Boolean(address));
  const health = useQuery({ queryKey: ["health"], queryFn: async () => (await api<{ status: string; chainId: number }>("/health")).data, refetchInterval: 30_000 });
  const active = identities.data?.filter((x) => x.status === "ACTIVE").length;
  const revoked = identities.data?.filter((x) => x.status === "REVOKED").length ?? 0;
  const managedAssets = assets.data?.filter((x) => x.status === "ACTIVE").length;
  const burned = assets.data?.filter((x) => x.status === "BURNED").length ?? 0;
  const roleAssignments = roles.data?.reduce((sum, role) => sum + (role._count?.assignments ?? 0), 0);
  const transactions = audit.data?.filter((event) => event.transactionId) ?? [];
  const attention = [
    ...(health.isError ? ["Backend health check is unavailable"] : []),
    ...(identities.error ? ["Identity projection could not be loaded"] : []),
    ...(assets.error ? ["Asset projection could not be loaded"] : []),
    ...(revoked ? [`${revoked} identity ${revoked === 1 ? "is" : "are"} revoked`] : []),
    ...(burned ? [`${burned} asset ${burned === 1 ? "is" : "are"} burned`] : []),
  ];
  const latestBlock = audit.data?.find((event) => event.blockNumber !== undefined)?.blockNumber;

  return <Shell title="Security overview" description="A live posture view of identities, permissions, custody and indexed evidence on the connected chain." action={<Link href="/verify" className="btn"><Icon name="check" size={15}/>Public verification</Link>}>
    {!address && <div className="card mb-6 overflow-hidden border-cyan/30 bg-cyan/[.06]"><div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-md border border-cyan/30 bg-cyan/10 text-cyan"><Icon name="wallet" size={21}/></div><div className="flex-1"><p className="font-medium">Connect a wallet to load the control plane</p><p className="mt-1 text-sm text-muted">Read models and permission-aware controls appear after SIWE authentication. Public verification remains available without a session.</p></div><Badge tone="info">Session required</Badge></div><div className="h-1 bg-cyan/20"><div className="h-full w-1/3 bg-cyan"/></div></div>}

    <section className="card mb-6 overflow-hidden"><div className="grid gap-0 lg:grid-cols-[1.25fr_.75fr]"><div className="p-5 md:p-6"><div className="flex items-start justify-between gap-4"><div><p className="eyebrow text-cyan">System posture</p><h2 className="mt-3 text-xl font-semibold tracking-tight">{!address ? "Awaiting wallet session" : health.isError ? "Degraded visibility" : "Monitoring active"}</h2><p className="mt-2 max-w-xl text-sm leading-6 text-muted">{!address ? "Connect and sign in to evaluate the authenticated projections. This screen never substitutes for API or contract authorization." : health.isError ? "The API health signal is unavailable. Treat loaded projections as stale until the backend recovers." : "The control plane is reading authoritative API projections while the indexer reports the latest observed chain state."}</p></div><span className={`mt-1 inline-flex h-8 w-8 items-center justify-center rounded-full border ${health.isError ? "border-danger/30 bg-danger/10 text-danger" : "border-success/30 bg-success/10 text-success"}`}><Icon name={health.isError ? "alert" : "pulse"} size={16}/></span></div><div className="mt-6 flex flex-wrap gap-2"><Badge tone={health.isError ? "danger" : health.isLoading ? "warning" : "success"}>{health.isError ? "API degraded" : health.isLoading ? "Checking API" : "API reachable"}</Badge>{address ? <Badge tone="info">Wallet {shortAddress(address)}</Badge> : <Badge>Not authenticated</Badge>}</div></div><div className="border-t border-line/70 bg-surface/30 p-5 lg:border-l lg:border-t-0"><p className="eyebrow">Chain / indexer</p><div className="mt-4 space-y-4"><div className="flex items-center justify-between"><span className="text-sm text-muted">Configured chain</span><span className="font-mono text-sm">{health.data?.chainId ?? process.env.NEXT_PUBLIC_CHAIN_ID ?? "—"}</span></div><div className="flex items-center justify-between"><span className="text-sm text-muted">Latest observed block</span><span className="font-mono text-sm">{latestBlock ?? "—"}</span></div><div className="flex items-center justify-between"><span className="text-sm text-muted">Projection status</span><span className={audit.error ? "text-danger" : "text-success"}>{audit.error ? "Unavailable" : audit.isLoading ? "Loading" : audit.data ? "Loaded" : "Waiting"}</span></div></div></div></div></section>

    <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {[
        { label: "Active identities", value: active, icon: "users", href: "/identities", detail: "Indexed identity registry", tone: "info" as const },
        { label: "Role assignments", value: roleAssignments, icon: "shield", href: "/roles", detail: "Permission matrix", tone: "success" as const },
        { label: "Assets under management", value: managedAssets, icon: "box", href: "/assets", detail: "Active token projections", tone: "warning" as const },
        { label: "Audit events", value: audit.data?.length, icon: "clock", href: "/audit", detail: "Latest 8 indexed events", tone: "info" as const },
      ].map((metric) => <Link href={metric.href} key={metric.label} className="card group p-4 transition hover:-translate-y-0.5 hover:border-cyan/50"><div className="flex items-center justify-between"><span className="data-label">{metric.label}</span><span className={`rounded-md border p-2 ${metric.tone === "success" ? "border-success/20 bg-success/10 text-success" : metric.tone === "warning" ? "border-warning/20 bg-warning/10 text-warning" : "border-cyan/20 bg-cyan/10 text-cyan"}`}><Icon name={metric.icon} size={15}/></span></div><p className="mt-4 text-3xl font-semibold tracking-tight">{metric.value === undefined ? "—" : metric.value}</p><p className="mt-1 text-xs text-muted">{metric.detail}</p></Link>)}
    </div>

    <div className="mb-6 grid gap-6 xl:grid-cols-[1.15fr_.85fr]">
      <section className="card p-5"><div className="mb-5 flex items-start justify-between"><div><p className="font-semibold">Audit timeline</p><p className="mt-1 text-xs text-muted">Immutable events from the indexed projection</p></div><Link href="/audit" className="text-xs font-medium text-cyan hover:underline">View all <Icon name="arrow" size={12}/></Link></div>{audit.isLoading ? <Loading rows={4}/> : audit.error ? <ErrorCard error={audit.error} retry={() => audit.refetch()}/> : audit.data?.length ? <div className="relative ml-2 border-l border-line/70 pl-5">{audit.data.map((event) => <div key={event.id} className="relative pb-4 last:pb-0"><span className="absolute -left-[26px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-panel bg-cyan shadow-[0_0_0_3px_rgb(var(--cyan)/.1)]"/><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-sm font-medium">{event.action}</p><p className="mt-1 text-xs text-muted">{shortAddress(event.actorAddress)}{event.blockNumber !== undefined ? ` · block ${event.blockNumber}` : ""}</p></div><div className="flex items-center gap-2"><Badge tone={event.status === "FAILED" ? "danger" : "success"}>{event.status ?? "INDEXED"}</Badge><time className="text-[10px] text-muted">{formatDate(event.occurredAt)}</time></div></div></div>)}</div> : <Empty title="No indexed activity yet" description="Audit records will appear after the indexer observes contract events."/>}</section>
      <div className="space-y-6">
        <section className="card p-5"><div className="mb-4 flex items-start justify-between"><div><p className="font-semibold">Attention</p><p className="mt-1 text-xs text-muted">Signals from currently loaded data</p></div><Icon name="alert" size={16} className="text-warning"/></div>{attention.length ? <div className="space-y-2">{attention.slice(0, 5).map((item) => <div key={item} className="flex items-start gap-2 rounded-md border border-warning/20 bg-warning/[.06] px-3 py-2 text-xs text-warning"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-warning"/>{item}</div>)}</div> : <div className="flex items-center gap-3 rounded-md border border-success/20 bg-success/[.06] px-3 py-3 text-sm text-success"><Icon name="check" size={16}/>No open signals in loaded projections.</div>}</section>
        <section className="card p-5"><div className="mb-4 flex items-start justify-between"><div><p className="font-semibold">Transaction activity</p><p className="mt-1 text-xs text-muted">Write events surfaced by the audit projection</p></div><Link href="/transactions" className="text-xs text-cyan hover:underline">Lookup</Link></div>{transactions.length ? <div className="space-y-3">{transactions.slice(0, 4).map((event) => <div key={event.id} className="flex items-center justify-between gap-3"><div className="min-w-0"><p className="truncate font-mono text-xs text-cyan">{shortAddress(event.transactionId)}</p><p className="mt-1 text-[11px] text-muted">{event.action}</p></div><Badge tone={event.status === "FAILED" ? "danger" : "success"}>{event.status ?? "INDEXED"}</Badge></div>)}</div> : <p className="rounded-md border border-dashed border-line px-3 py-4 text-xs text-muted">No transaction-linked events in the current window.</p>}</section>
      </div>
    </div>

    <div className="mb-6 grid gap-6 xl:grid-cols-[.9fr_1.1fr]"><section className="card p-5"><div className="mb-5"><p className="font-semibold">Role distribution</p><p className="mt-1 text-xs text-muted">Assignments in the indexed permission matrix</p></div>{roles.isLoading ? <Loading rows={4}/> : roles.error ? <ErrorCard error={roles.error} retry={() => roles.refetch()}/> : roles.data?.length ? <div className="space-y-3">{roles.data.map((role) => <div key={role.name} className="flex items-center gap-3"><span className="w-24 truncate text-xs text-muted">{role.displayName ?? role.name}</span><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface"><div className="h-full rounded-full bg-cyan transition-all" style={{ width: `${Math.min(100, (role._count?.assignments ?? 0) * 10)}%` }}/></div><span className="w-8 text-right text-sm font-medium">{role._count?.assignments ?? 0}</span></div>)}</div> : <Empty title="No role data" description="Role catalog appears after authentication and indexing."/>}</section><section className="card p-5"><div className="mb-5"><p className="font-semibold">Operator actions</p><p className="mt-1 text-xs text-muted">Every write is re-authorized by the API and contract.</p></div><div className="grid gap-3 sm:grid-cols-2"><ActionLink href="/identities?action=create" icon="plus" label="Create identity" permission="IDENTITY_CREATE" allowed={permissions.can("IDENTITY_CREATE")} loading={permissions.loading}/><ActionLink href="/roles?action=assign" icon="shield" label="Assign role" permission="ROLE_ASSIGN" allowed={permissions.can("ROLE_ASSIGN")} loading={permissions.loading}/><ActionLink href="/assets?action=mint" icon="plus" label="Mint asset" permission="ASSET_MINT" allowed={permissions.can("ASSET_MINT")} loading={permissions.loading}/><ActionLink href="/verify" icon="check" label="Verify evidence"/></div>{permissions.error && <p className="mt-4 text-xs text-danger">Permission state unavailable. Write controls remain restricted until the API responds.</p>}</section></div>
  </Shell>;
}
