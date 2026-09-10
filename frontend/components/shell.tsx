"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
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

export function Shell({ children, title, description, action }: { children: React.ReactNode; title: string; description?: string; action?: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const networkLabel = process.env.NEXT_PUBLIC_ENVIRONMENT ?? (process.env.NEXT_PUBLIC_CHAIN_ID === "11155111" ? "SEPOLIA" : process.env.NEXT_PUBLIC_CHAIN_ID === "31337" ? "LOCAL" : "CONFIGURED");
  const health = useQuery({ queryKey: ["health"], queryFn: async () => (await api<{ status: string; chainId: number }>("/health")).data, refetchInterval: 30_000 });
  return <div className="min-h-screen text-ink">
    <aside className={`fixed inset-y-0 left-0 z-40 w-64 border-r border-line/70 bg-surface/95 px-3 py-4 backdrop-blur-xl transition-transform md:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}>
      <div className="flex h-12 items-center gap-3 px-3"><div className="grid h-8 w-8 place-items-center rounded-lg border border-cyan/50 bg-cyan/10 text-cyan"><Icon name="shield" size={17}/></div><div><p className="text-sm font-semibold">Blockchain IAM</p><p className="eyebrow mt-0.5">Security console</p></div></div>
      <div className="mx-3 my-4 flex items-center justify-between rounded-md border border-line/70 bg-panel/60 px-2.5 py-1.5"><span className="eyebrow">Environment</span><span className="status border-success/30 bg-success/10 text-success"><span className="h-1.5 w-1.5 rounded-full bg-success"/>{networkLabel}</span></div>
      <nav aria-label="Primary navigation" className="space-y-5">
        {groups.map((group) => <div key={group.label}><p className="eyebrow px-3 pb-1.5">{group.label}</p><div className="space-y-0.5">{group.links.map((link) => { const active = pathname === link.href || (link.href !== "/" && pathname.startsWith(link.href)); return <Link key={link.href} href={link.href} aria-current={active ? "page" : undefined} onClick={() => setOpen(false)} className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${active ? "bg-cyan/10 font-medium text-cyan" : "text-muted hover:bg-panel hover:text-ink"}`}><Icon name={link.icon}/>{link.label}</Link>; })}</div></div>)}
      </nav>
      <div className="absolute inset-x-3 bottom-4 space-y-2 border-t border-line/70 pt-3"><Link href="/transactions" className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted hover:bg-panel hover:text-ink"><Icon name="clock"/>Transactions</Link><p className="px-3 pt-2 text-[11px] text-muted">Backend-authoritative controls<br/>Chain ID {process.env.NEXT_PUBLIC_CHAIN_ID ?? "31337"}</p></div>
    </aside>
    {open && <button aria-label="Close navigation" className="fixed inset-0 z-30 bg-surface/70 md:hidden" onClick={() => setOpen(false)}/>}
    <div className="md:pl-64">
      <header className="sticky top-0 z-20 border-b border-line/70 bg-surface/80 backdrop-blur-xl"><div className="flex h-16 items-center gap-3 px-4 md:px-8"><button aria-label="Open navigation" className="btn px-2 md:hidden" onClick={() => setOpen(true)}><Icon name="menu"/></button><div className="min-w-0 flex-1"><p className="eyebrow hidden sm:block">Operations / {title}</p><p className="truncate text-sm font-medium sm:hidden">{title}</p></div><div className="hidden items-center gap-2 rounded-lg border border-line/70 bg-panel/50 px-3 py-2 text-xs text-muted lg:flex"><span className={`h-1.5 w-1.5 rounded-full ${health.isError ? "bg-danger" : health.isLoading ? "bg-warning" : "bg-success"}`}/>{health.isError ? "Backend unavailable" : health.isLoading ? "Checking backend…" : `API ready · chain ${health.data?.chainId ?? "—"}`}</div><WalletControl/></div></header>
      <main className="mx-auto max-w-[1600px] px-4 py-7 md:px-8"><div className="mb-7 flex flex-wrap items-start justify-between gap-4"><div><p className="text-2xl font-semibold tracking-tight">{title}</p>{description && <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p>}</div>{action}</div>{children}</main>
    </div>
  </div>;
}
