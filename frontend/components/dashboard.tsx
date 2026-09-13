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
  return <Link href={locked ? "#" : href} aria-disabled={locked || undefined} onClick={(event) => { if (locked) event.preventDefault(); }} title={locked ? `Requires ${permission}` : undefined} className={`btn justify-start ${locked ? "cursor-not-allowed opacity-45" : ""}`}><Icon name={locked ? "lock" : icon} size={15}/>{label}{locked && <span className="ml-auto font-mono text-[9px] uppercase tracking-wide">restricted</span>}</Link>;
}

export function Dashboard() {
  const { address } = useAccount();
  const permissions = usePermissions();
  const identities = useData<Identity[]>("/api/v1/identities", Boolean(address));
  const assets = useData<Asset[]>("/api/v1/assets", Boolean(address));
  const roles = useData<Role[]>("/api/v1/roles", Boolean(address));
  const audit = useData<AuditEvent[]>("/api/v1/audit?limit=8", Boolean(address));
  const health = useQuery({ queryKey: ["health"], queryFn: async () => (await api<{ status: string; chainId: number }>("/health")).data, refetchInterval: 30_000 });
  const active = identities.data?.filter((item) => item.status === "ACTIVE").length;
  const revoked = identities.data?.filter((item) => item.status === "REVOKED").length ?? 0;
  const managedAssets = assets.data?.filter((item) => item.status === "ACTIVE").length;
  const burned = assets.data?.filter((item) => item.status === "BURNED").length ?? 0;
  const roleAssignments = roles.data?.reduce((sum, role) => sum + (role._count?.assignments ?? 0), 0);
  const transactions = audit.data?.filter((event) => event.transactionId) ?? [];
  const latestBlock = audit.data?.find((event) => event.blockNumber !== undefined)?.blockNumber;
  const attention = [
    ...(health.isError ? ["Backend health check is unavailable"] : []),
    ...(identities.error ? ["Identity projection could not be loaded"] : []),
    ...(assets.error ? ["Asset projection could not be loaded"] : []),
    ...(revoked ? [`${revoked} identity ${revoked === 1 ? "is" : "are"} revoked`] : []),
    ...(burned ? [`${burned} asset ${burned === 1 ? "is" : "are"} burned`] : []),
  ];

  return <Shell title="Security overview" description="Operational posture across identity, policy, custody and indexed chain evidence." action={<Link href="/verify" className="btn btn-primary"><Icon name="check" size={15}/>Verify proof</Link>}>
    {!address && <div className="section-band mb-7 flex flex-col gap-4 border-cyan/40 bg-cyan/[.04] p-5 sm:flex-row sm:items-center"><div className="grid h-10 w-10 shrink-0 place-items-center border border-cyan/40 bg-cyan/10 text-cyan"><Icon name="wallet" size={20}/></div><div className="flex-1"><p className="font-medium">Wallet session required for the operational view</p><p className="mt-1 text-sm text-muted">Connect and sign in to load authenticated projections. Public verification remains available without a session.</p></div><Badge tone="info">No session</Badge></div>}

    <section className="console-panel mb-7 grid min-h-[280px] overflow-hidden lg:grid-cols-[1.55fr_.75fr]">
      <div className="relative flex flex-col justify-between border-b border-line/70 p-6 md:p-8 lg:border-b-0 lg:border-r">
        <div className="pointer-events-none absolute right-0 top-0 h-full w-1/2 opacity-30" style={{ backgroundImage: "linear-gradient(90deg, transparent, rgb(var(--cyan) / .08)), linear-gradient(rgb(var(--line) / .12) 1px, transparent 1px), linear-gradient(90deg, rgb(var(--line) / .12) 1px, transparent 1px)", backgroundSize: "auto, 28px 28px, 28px 28px" }}/>
        <div className="relative"><div className="rule-label text-cyan"><span className="h-px w-8 bg-cyan"/><span>01 / System posture</span></div><div className="mt-8 flex items-start gap-5"><span className={`mt-1 flex h-12 w-12 shrink-0 items-center justify-center border ${!address || health.isError ? "border-warning/50 bg-warning/10 text-warning" : "border-success/50 bg-success/10 text-success"}`}><Icon name={!address || health.isError ? "alert" : "pulse"} size={23}/></span><div><h2 className="text-3xl font-semibold tracking-[-.04em]">{!address ? "Awaiting session" : health.isError ? "Degraded visibility" : "Monitoring active"}</h2><p className="mt-3 max-w-xl text-sm leading-6 text-muted">{!address ? "Authenticate with a connected wallet to evaluate IAM posture and permission-aware operations." : health.isError ? "Health telemetry is unavailable. Loaded projections may be stale; do not infer authorization from this view." : "The control plane is reading API projections while the indexer reports the latest observed chain state."}</p></div></div></div>
        <div className="relative mt-8 flex flex-wrap gap-2"><Badge tone={health.isError ? "danger" : health.isLoading ? "warning" : "success"}>{health.isError ? "API degraded" : health.isLoading ? "Checking API" : "API reachable"}</Badge>{address ? <Badge tone="info">Wallet {shortAddress(address)}</Badge> : <Badge>Unauthenticated</Badge>}<span className="ml-auto hidden font-mono text-[10px] text-muted md:block">LAST CHECK // LIVE</span></div>
      </div>
      <div className="flex flex-col justify-between bg-surface/35 p-6 md:p-8"><div><div className="rule-label"><span className="h-px w-5 bg-line"/><span>Chain telemetry</span></div><dl className="mt-6 divide-y divide-line/70">{[["Configured chain", health.data?.chainId ?? process.env.NEXT_PUBLIC_CHAIN_ID ?? "—"], ["Latest observed block", latestBlock ?? "—"], ["Audit projection", audit.error ? "Unavailable" : audit.isLoading ? "Loading" : audit.data ? "Loaded" : "Waiting"]].map(([label, value]) => <div key={label} className="flex items-center justify-between gap-4 py-3 first:pt-0"><dt className="text-xs text-muted">{label}</dt><dd className={`font-mono text-xs ${value === "Unavailable" ? "text-danger" : "text-ink"}`}>{value}</dd></div>)}</dl></div><Link href="/transactions" className="mt-6 flex items-center justify-between border-t border-line/70 pt-4 text-xs text-cyan hover:text-ink"><span>Inspect transaction state</span><Icon name="arrow" size={14}/></Link></div>
    </section>

    <section className="metric-rail mb-7 grid divide-y divide-line/70 sm:grid-cols-[1.3fr_1fr_1fr_1fr] sm:divide-x sm:divide-y-0">
      {[["Active identities", active, "users", "/identities", "Identity registry"], ["Role assignments", roleAssignments, "shield", "/roles", "Permission matrix"], ["Assets managed", managedAssets, "box", "/assets", "Custody projection"], ["Indexed events", audit.data?.length, "clock", "/audit", "Latest audit window"]].map(([label, value, icon, href, detail], index) => <Link href={String(href)} key={String(label)} className={`group p-5 transition hover:bg-cyan/[.045] ${index === 0 ? "bg-cyan/[.035]" : ""}`}><div className="flex items-center justify-between"><span className="data-label">{label}</span><Icon name={String(icon)} size={15} className="text-cyan/80"/></div><p className={`mt-5 tracking-[-.05em] ${index === 0 ? "text-4xl" : "text-3xl"} font-semibold`}>{value === undefined ? "—" : value}</p><p className="mt-1 font-mono text-[9px] uppercase tracking-wider text-muted/70">{detail}</p></Link>)}
    </section>

    <div className="grid gap-7 xl:grid-cols-[1.35fr_.65fr]">
      <section className="console-panel"><div className="flex items-end justify-between border-b border-line/70 px-5 py-4 md:px-6"><div><div className="rule-label text-cyan"><span className="h-px w-6 bg-cyan"/>02 / Live event stream</div><p className="mt-2 text-xs text-muted">Latest immutable events from the indexed projection</p></div><Link href="/audit" className="font-mono text-[10px] uppercase tracking-wider text-cyan hover:text-ink">Open audit <Icon name="arrow" size={12}/></Link></div>{audit.isLoading ? <div className="p-5"><Loading rows={5}/></div> : audit.error ? <div className="p-5"><ErrorCard error={audit.error} retry={() => audit.refetch()}/></div> : audit.data?.length ? <div className="divide-y divide-line/60">{audit.data.map((event, index) => <div key={event.id} className="grid gap-3 px-5 py-4 transition hover:bg-cyan/[.035] md:grid-cols-[42px_1fr_auto] md:items-center md:px-6"><div className="font-mono text-[10px] text-muted/60">{String(index + 1).padStart(2, "0")}</div><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="h-1.5 w-1.5 bg-cyan"/><p className="truncate text-sm font-medium">{event.action}</p><Badge tone={event.status === "FAILED" ? "danger" : "success"}>{event.status ?? "INDEXED"}</Badge></div><p className="mt-1 truncate font-mono text-[10px] text-muted">{shortAddress(event.actorAddress)}{event.targetDid ? `  /  ${event.targetDid}` : ""}</p></div><div className="text-left font-mono text-[10px] text-muted md:text-right"><p>{event.blockNumber !== undefined ? `BLK ${event.blockNumber}` : "BLK —"}</p><p className="mt-1">{formatDate(event.occurredAt)}</p></div></div>)}</div> : <div className="p-5"><Empty title="No indexed activity yet" description="Events will appear after the indexer observes contract activity."/></div>}</section>

      <aside className="space-y-7">
        <section className="data-rail min-h-[220px] p-5 md:p-6"><div className="flex items-start justify-between"><div><div className="rule-label text-warning"><span className="h-px w-6 bg-warning"/>03 / Attention queue</div><p className="mt-2 text-xs text-muted">Signals requiring operator awareness</p></div><Icon name="alert" size={17} className="text-warning"/></div>{attention.length ? <div className="mt-6 space-y-3">{attention.slice(0, 5).map((item) => <div key={item} className="border-l border-warning/60 bg-warning/[.06] px-3 py-2.5 text-xs leading-5 text-warning">{item}</div>)}</div> : <div className="mt-6 flex items-center gap-3 border-l border-success/60 bg-success/[.06] px-3 py-3 text-sm text-success"><Icon name="check" size={15}/>No open signals in loaded projections.</div>}</section>
        <section className="console-panel p-5 md:p-6"><div className="flex items-end justify-between border-b border-line/70 pb-4"><div><div className="rule-label"><span className="h-px w-6 bg-line"/>04 / Write activity</div><p className="mt-2 text-xs text-muted">Transaction-linked events</p></div><Link href="/transactions" className="font-mono text-[10px] text-cyan">LOOKUP</Link></div>{transactions.length ? <div className="divide-y divide-line/60">{transactions.slice(0, 4).map((event) => <div key={event.id} className="flex items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="truncate font-mono text-xs text-cyan">{shortAddress(event.transactionId)}</p><p className="mt-1 text-[10px] text-muted">{event.action}</p></div><Badge tone={event.status === "FAILED" ? "danger" : "success"}>{event.status ?? "INDEXED"}</Badge></div>)}</div> : <p className="py-5 text-xs text-muted">No transaction-linked events in the current window.</p>}</section>
      </aside>
    </div>

    <section className="section-band mt-7 grid gap-6 p-5 md:grid-cols-[.85fr_1.15fr] md:p-6"><div><div className="rule-label text-cyan"><span className="h-px w-6 bg-cyan"/>05 / Operator actions</div><p className="mt-3 max-w-sm text-sm leading-6 text-muted">Shortcuts stay permission-aware. API and contract authorization remain authoritative.</p>{permissions.error && <p className="mt-3 text-xs text-danger">Permission state unavailable; write controls remain restricted.</p>}</div><div className="grid gap-2 sm:grid-cols-2"><ActionLink href="/identities?action=create" icon="plus" label="Create identity" permission="IDENTITY_CREATE" allowed={permissions.can("IDENTITY_CREATE")} loading={permissions.loading}/><ActionLink href="/roles?action=assign" icon="shield" label="Assign role" permission="ROLE_ASSIGN" allowed={permissions.can("ROLE_ASSIGN")} loading={permissions.loading}/><ActionLink href="/assets?action=mint" icon="plus" label="Mint asset" permission="ASSET_MINT" allowed={permissions.can("ASSET_MINT")} loading={permissions.loading}/><ActionLink href="/verify" icon="check" label="Verify evidence"/></div></section>
  </Shell>;
}
