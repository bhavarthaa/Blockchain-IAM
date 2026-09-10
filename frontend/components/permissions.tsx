"use client";

import { useQuery } from "@tanstack/react-query";
import { useAccount } from "wagmi";
import { api } from "../lib/api";

type WalletRoles = { roleAssignments?: Array<{ role?: { permissions?: Array<{ enabled: boolean; permission?: { key?: string; name?: string } }> } }> };
export function usePermissions() {
  const { address } = useAccount();
  const query = useQuery({ queryKey: ["wallet-permissions", address], enabled: Boolean(address), queryFn: async () => (await api<WalletRoles>(`/api/v1/wallets/${address}/roles`)).data });
  const allowed = new Set<string>();
  query.data?.roleAssignments?.forEach((assignment) => assignment.role?.permissions?.forEach((item) => { if (item.enabled) { const key = item.permission?.key ?? item.permission?.name; if (key) allowed.add(key ?? ""); } }));
  return { can: (permission: string) => allowed.has(permission), loading: query.isLoading, error: query.error };
}
