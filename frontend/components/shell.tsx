"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Icon } from "./icons";
import { WalletControl } from "./wallet-control";
import { api } from "../lib/api";

const groups = [
  { label: "01 / Overview", links: [{ label: "Command center", href: "/", icon: "grid" }] },
  { label: "02 / Identity", links: [{ label: "Identities", href: "/identities", icon: "users" }, { label: "Roles & policy", href: "/roles", icon: "shield" }] },
  { label: "03 / Custody", links: [{ label: "Assets", href: "/assets", icon: "box" }, { label: "Transactions", href: "/transactions", icon: "activity" }] },
  { label: "04 / Evidence", links: [{ label: "Audit stream", href: "/audit", icon: "clock" }, { label: "Verify proof", href: "/verify", icon: "check" }] },
];

function Navigation({ close }: { close: () => void }) {
  const pathname = usePathname();
  return <nav aria-label="Primary navigation" className="space-y-6">
    {groups.map((group) => <div key={group.label}>
      <p className="px-3 pb-2 font-mono text-[9px] font-semibold uppercase tracking-[.2em] text-muted/70">{group.label}</p>
      <div className="space-y-0.5">{group.links.map((link) => {
        const active = pathname === link.href || (link.href !== "/" && pathname.startsWith(link.href));
        return <Link key={link.href} href={link.href} aria-current={active ? "page" : undefined} onClick={close} className={`group relative flex items-center gap-3 border-l-2 px-3 py-2.5 text-sm transition ${active ? "border-cyan bg-cyan/[.08] font-medium text-cyan" : "border-transparent text-muted hover:border-line hover:bg-panel-raised/60 hover:text-ink"}`}>
          <span className={active ? "text-cyan" : "text-muted transition group-hover:text-cyan"}><Icon name={link.icon}/></span><span>{link.label}</span>{active && <span className="ml-auto font-mono text-[9px] uppercase tracking-wider text-cyan/70">live</span>}
        </Link>;
      })}</div>
    </div>)}
  </nav>;
}

export function Shell({ children, title, description, action }: { children: React.ReactNode; title: string; description?: string; action?: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [command, setCommand] = useState("");
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const commandRef = useRef<HTMLInputElement>(null);
  const networkLabel = process.env.NEXT_PUBLIC_ENVIRONMENT ?? (process.env.NEXT_PUBLIC_CHAIN_ID === "11155111" ? "SEPOLIA" : process.env.NEXT_PUBLIC_CHAIN_ID === "31337" ? "LOCAL" : "CONFIGURED");
  const health = useQuery({ queryKey: ["health"], queryFn: async () => (await api<{ status: string; chainId: number }>("/health")).data, refetchInterval: 30_000 });

  useEffect(() => {
    if (!open) { menuButtonRef.current?.focus(); return; }
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);
  useEffect(() => {
    const onShortcut = (event: KeyboardEvent) => { if (event.key === "/" && document.activeElement?.tagName !== "INPUT") { event.preventDefault(); commandRef.current?.focus(); } };
    document.addEventListener("keydown", onShortcut);
    return () => document.removeEventListener("keydown", onShortcut);
  }, []);

  const healthLabel = health.isError ? "API unreachable" : health.isLoading ? "Checking API" : `API online · chain ${health.data?.chainId ?? "—"}`;
  const healthTone = health.isError ? "text-danger" : health.isLoading ? "text-warning" : "text-success";
  return <div className="min-h-screen text-ink">
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[18rem] border-r border-line bg-surface/95 px-4 py-5 backdrop-blur-xl md:block">
      <div className="mb-8 flex items-start gap-3 px-2"><div className="grid h-10 w-10 shrink-0 place-items-center border border-cyan/60 bg-cyan/10 text-cyan"><Icon name="shield" size={19}/></div><div><p className="text-sm font-semibold tracking-tight">Blockchain IAM</p><p className="mt-1 font-mono text-[9px] uppercase tracking-[.22em] text-cyan/80">Operational console</p></div></div>
      <div className="mb-8 border-y border-line/70 px-2 py-3"><div className="flex items-center justify-between"><span className="eyebrow">Environment</span><span className="font-mono text-[10px] text-cyan">{networkLabel}</span></div><div className="mt-2 flex items-center gap-2 font-mono text-[10px] text-muted"><span className="h-1.5 w-1.5 bg-success shadow-[0_0_9px_rgb(var(--success)/.7)]"/>{`CHAIN_${process.env.NEXT_PUBLIC_CHAIN_ID ?? "31337"}`}</div></div>
      <Navigation close={() => undefined}/>
      <div className="absolute inset-x-4 bottom-5 border-t border-line/70 pt-4"><div className="flex items-center gap-2 px-2 text-[10px] text-muted"><span className={`h-1.5 w-1.5 ${health.isError ? "bg-danger" : health.isLoading ? "bg-warning animate-pulse" : "bg-success"}`}/>{healthLabel}</div><p className="mt-3 px-2 font-mono text-[9px] leading-relaxed text-muted/70">AUTHORITY // API + CONTRACT<br/>UI STATUS IS ADVISORY ONLY</p></div>
    </aside>

    {open && <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Navigation menu"><button aria-label="Close navigation" className="absolute inset-0 bg-surface/90 backdrop-blur-sm" onClick={() => setOpen(false)}/><aside className="relative h-full w-[min(88vw,20rem)] border-r border-line bg-surface px-4 py-5 shadow-2xl"><div className="mb-8 flex items-center justify-between px-2"><div className="flex items-center gap-3"><div className="grid h-8 w-8 place-items-center border border-cyan/50 bg-cyan/10 text-cyan"><Icon name="shield" size={17}/></div><p className="text-sm font-semibold">Blockchain IAM</p></div><button ref={closeButtonRef} aria-label="Close navigation" className="btn px-2" onClick={() => setOpen(false)}><Icon name="x" size={15}/></button></div><Navigation close={() => setOpen(false)}/></aside></div>}

    <div className="md:pl-[18rem]">
      <header className="sticky top-0 z-20 border-b border-line bg-surface/90 backdrop-blur-xl">
        <div className="flex min-h-16 flex-wrap items-center gap-3 px-4 py-2 md:px-8">
          <button ref={menuButtonRef} aria-label="Open navigation" className="btn px-2 md:hidden" onClick={() => setOpen(true)}><Icon name="menu"/></button>
          <div className="command-bar order-3 w-full md:order-none md:max-w-md"><span className="px-3 text-muted"><Icon name="search" size={15}/></span><input ref={commandRef} value={command} onChange={(event) => setCommand(event.target.value)} aria-label="Command search" className="min-w-0 flex-1 bg-transparent py-2 text-xs text-ink outline-none placeholder:text-muted" placeholder="Search console / address / route" /><kbd className="mr-2 hidden border border-line px-1.5 py-0.5 font-mono text-[9px] text-muted sm:block">/</kbd></div>
          <div className="min-w-0 flex-1 md:ml-auto md:text-right"><p className="eyebrow hidden sm:block">Console / {title}</p><p className="truncate text-sm font-medium sm:hidden">{title}</p></div>
          <div className={`hidden items-center gap-2 border border-line px-3 py-2 font-mono text-[10px] lg:flex ${healthTone}`}><span className={`h-1.5 w-1.5 ${health.isError ? "bg-danger" : health.isLoading ? "bg-warning animate-pulse" : "bg-success"}`}/>{healthLabel}</div>
          <WalletControl/>
        </div>
      </header>
      <main className="mx-auto max-w-[1680px] px-4 py-6 md:px-8 md:py-8">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-5 border-b border-line/70 pb-5"><div><div className="rule-label mb-3"><span className="h-px w-8 bg-cyan"/>{networkLabel} <span className="text-muted/50">/</span> {pathname === "/" ? "COMMAND CENTER" : "WORKSPACE"}</div><h1 className="text-3xl font-semibold tracking-[-.04em] md:text-4xl">{title}</h1>{description && <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">{description}</p>}</div><div className="flex items-center gap-3">{action}</div></div>
        {children}
      </main>
    </div>
  </div>;
}
