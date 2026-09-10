"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { useState } from "react";
import { wagmiConfig } from "../lib/wagmi";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 15_000, retry: 1 } } }));
  // wagmi 2.12 ships React 18 element typings that are narrower than the
  // current JSX runtime; the provider itself remains a normal React provider.
  const Provider = WagmiProvider as unknown as React.ComponentType<{ config: typeof wagmiConfig; children: React.ReactNode }>;
  return <Provider config={wagmiConfig}><QueryClientProvider client={queryClient}>{children}</QueryClientProvider></Provider>;
}
