"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Icon } from "./icons";
import { WalletControl } from "./wallet-control";
import { api } from "../lib/api";

const groups = [
  { label: "Overview", links: [{ label: "Dashboard", href: "/", icon: "grid" }] },
  { label: "Identity & access", links: [{ label: "Identities", href: "/identities", icon: "users" }, { label: "Roles", href: "/roles", icon: "shield" }] },
  { label: "Assets", links: [{ label: "Assets", href: "/assets", icon: "box" }] },
  { label: "Evidence", links: [{ label: "Audit log", href: "/audit", icon: "clock" }, { label: "Verify", href: "/verify", icon: "check" }] },
];

function Navigation({ close }: { close: () => void }) {
  const pathname = usePathname();
  return <nav aria-label="Primary navigation" className="space-y-5">
    {groups.map((group) => <div key={group.label}>
      <p className="eyebrow px-3 pb-2">{group.label}</p>
      <div className="space-y-1">{group.links.map((link) => {
        const active = pathname === link.href || (link.href !== "/" && pathname.startsWith(link.href));
        return <Link key={link.href} href={link.href} aria-current={active ? "page" : undefined} onClick={close} className={`group flex items-center gap-3 rounded-md border px-3 py-2.5 text-sm transition ${active ? "border-cyan/20 bg-cyan/10 font-medium text-cyan" : "border-transparent text-muted hover:border-line/60 hover:bg-panel-raised/60 hover:text-ink"}`}>
          <span className={active ? "text-cyan" : "text-muted transition group-hover:text-cyan"}><Icon name={link.icon}/></span>{link.label}
          {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-cyan shadow-[0_0_10px_rgb(var(--cyan)/.8)]" />}
        </Link>;
      })}</div>
    </div>)}
  </nav>;
}

export function Shell({ children, title, description, action }: { children: React.ReactNode; title: string; description?: string; action?: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const networkLabel = process.env.NEXT_PUBLIC_ENVIRONMENT ?? (process.env.NEXT_PUBLIC_CHAIN_ID === "11155111" ? "SEPOLIA" : process.env.NEXT_PUBLIC_CHAIN_ID === "31337" ? "LOCAL" : "CONFIGURED");
  const health = useQuery({ queryKey: ["health"], queryFn: async () => (await api<{ status: string; chainId: number }>("/health")).data, refetchInterval: 30_000 });

  useEffect(() => {
    if (!open) { menuButtonRef.current?.focus(); return; }
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const healthLabel = health.isError ? "API unreachable" : health.isLoading ? "Checking API" : `API online · chain ${health.data?.chainId ?? "—"}`;
  const healthTone = health.isError ? "text-danger" : health.isLoading ? "text-warning" : "text-success";
  return <div className="min-h-screen text-ink">
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-line/70 bg-surface/95 px-3 py-5 backdrop-blur-xl md:block">
      <div className="flex h-12 items-center gap-3 px-3"><div className="grid h-8 w-8 place-items-center rounded-md border border-cyan/50 bg-cyan/10 text-cyan"><Icon name="shield" size={17}/></div><div><p className="text-sm font-semibold tracking-tight">Blockchain IAM</p><p className="eyebrow mt-0.5">Control plane</p></div></div>
      <div className="mx-3 my-5 rounded-md border border-line/70 bg-panel/60 p-2.5"><div className="flex items-center justify-between"><span className="eyebrow">Network</span><span className="status border-success/30 bg-success/10 text-success"><span className="h-1.5 w-1.5 rounded-full bg-success"/>{networkLabel}</span></div><p className="mt-2 font-mono text-[10px] text-muted">CHAIN_{process.env.NEXT_PUBLIC_CHAIN_ID ?? "31337"}</p></div>
      <Navigation close={() => undefined}/>
      <div className="absolute inset-x-3 bottom-5 space-y-3 border-t border-line/70 pt-4"><Link href="/transactions" className={`flex items-center gap-3 rounded-md border px-3 py-2.5 text-sm ${pathname.startsWith("/transactions") ? "border-cyan/20 bg-cyan/10 text-cyan" : "border-transparent text-muted hover:border-line/60 hover:bg-panel-raised/60 hover:text-ink"}`}><Icon name="activity"/>Transactions</Link><p className="px-3 text-[10px] leading-relaxed text-muted">UI controls are advisory.<br/>API + chain enforce authorization.</p></div>
    </aside>

    {open && <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Navigation menu">
      <button aria-label="Close navigation" className="absolute inset-0 bg-surface/80 backdrop-blur-sm" onClick={() => setOpen(false)}/>
      <aside className="relative h-full w-[min(86vw,20rem)] border-r border-line bg-surface px-3 py-5 shadow-2xl">
        <div className="mb-6 flex items-center justify-between px-3"><div className="flex items-center gap-3"><div className="grid h-8 w-8 place-items-center rounded-md border border-cyan/50 bg-cyan/10 text-cyan"><Icon name="shield" size={17}/></div><p className="text-sm font-semibold">Blockchain IAM</p></div><button ref={closeButtonRef} aria-label="Close navigation" className="btn px-2" onClick={() => setOpen(false)}><Icon name="x" size={15}/></button></div>
        <Navigation close={() => setOpen(false)}/>
      </aside>
    </div>}

    <div className="md:pl-64">
      <header className="sticky top-0 z-20 border-b border-line/70 bg-surface/85 backdrop-blur-xl">
        <div className="flex h-16 items-center gap-3 px-4 md:px-8">
          <button ref={menuButtonRef} aria-label="Open navigation" className="btn px-2 md:hidden" onClick={() => setOpen(true)}><Icon name="menu"/></button>
          <div className="min-w-0 flex-1"><p className="eyebrow hidden sm:block">Operations / {title}</p><p className="truncate text-sm font-medium sm:hidden">{title}</p></div>
          <div className={`hidden items-center gap-2 rounded-md border border-line/70 bg-panel/50 px-3 py-2 text-[11px] lg:flex ${healthTone}`}><span className={`h-1.5 w-1.5 rounded-full ${health.isError ? "bg-danger" : health.isLoading ? "bg-warning animate-pulse" : "bg-success"}`}/>{healthLabel}</div>
          <WalletControl/>
        </div>
      </header>
      <main className="mx-auto max-w-[1600px] px-4 py-7 md:px-8">
        <div className="mb-7 flex flex-wrap items-start justify-between gap-4"><div><div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.2em] text-cyan"><span className="h-px w-5 bg-cyan"/>{networkLabel} / LIVE VIEW</div><p className="text-2xl font-semibold tracking-tight md:text-[28px]">{title}</p>{description && <p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted">{description}</p>}</div>{action}</div>
        {children}
      </main>
    </div>
  </div>;
}
