"use client";

import { useEffect, useState } from "react";
import { useAccount, useConnect, useDisconnect, useSignMessage } from "wagmi";
import { SiweMessage } from "siwe";
import { api, clearToken, setToken, shortAddress } from "../lib/api";
import { Icon } from "./icons";

export function WalletControl() {
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors, isPending: connecting } = useConnect();
  const { disconnect } = useDisconnect();
  const { signMessageAsync } = useSignMessage();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const expectedChain = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 31337);
  const wrongChain = Boolean(chainId && chainId !== expectedChain);
  useEffect(() => { if (!isConnected) clearToken(); }, [isConnected]);

  async function signIn() {
    if (!address || !chainId) return;
    setBusy(true); setMessage(null);
    try {
      const nonceResponse = await api<{ nonce: string; domain: string; uri: string; chainId: number; issuedAt: string; expirationTime: string }>("/api/v1/auth/nonce", { method: "POST", body: JSON.stringify({ address, chainId }) });
      const n = nonceResponse.data;
      const message = new SiweMessage({ domain: n.domain, address, statement: "Sign in to Blockchain IAM to manage identity and custody.", uri: n.uri, version: "1", chainId: n.chainId, nonce: n.nonce, issuedAt: n.issuedAt, expirationTime: n.expirationTime });
      const signature = await signMessageAsync({ message: message.prepareMessage() });
      const session = await api<{ token: string }>("/api/v1/auth/siwe", { method: "POST", body: JSON.stringify({ message: message.prepareMessage(), signature }) });
      setToken(session.data.token);
      window.dispatchEvent(new Event("iam-auth-changed"));
    } catch (error) { setMessage(error instanceof Error ? error.message : "Wallet sign-in failed"); }
    finally { setBusy(false); }
  }
  if (!isConnected) return <div className="flex items-center gap-2">
    {message && <span className="hidden max-w-[180px] truncate text-xs text-danger md:inline">{message}</span>}
    <button className="btn btn-primary" onClick={() => connect({ connector: connectors[0] })} disabled={connecting || !connectors[0]}><Icon name="wallet" size={15}/>{connecting ? "Connecting…" : "Connect wallet"}</button>
  </div>;
  return <div className="flex items-center gap-2">
    {!message && !busy && <span className={`hidden items-center gap-1.5 text-xs lg:flex ${wrongChain ? "text-warning" : "text-muted"}`}><span className={`h-1.5 w-1.5 rounded-full ${wrongChain ? "bg-warning" : "bg-success"}`}/>{shortAddress(address)}</span>}
    {message && <span className="hidden max-w-[180px] truncate text-xs text-danger md:inline">{message}</span>}
    <button className="btn btn-primary" onClick={signIn} disabled={busy || wrongChain} title={wrongChain ? `Switch to chain ${expectedChain} to sign in` : undefined}>{busy ? "Signing…" : <><Icon name="shield" size={14}/>Sign in</>}</button>
    <button className="btn px-2" title="Disconnect wallet" onClick={() => disconnect()}><Icon name="x" size={15}/></button>
  </div>;
}
