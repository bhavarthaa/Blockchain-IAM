import {
  createPublicClient, createWalletClient, http, type Address, type PublicClient,
  type WalletClient, defineChain,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { config } from "../config/env.js";
import { ApiError } from "../http/errors.js";

const chain = defineChain({
  id: config.CHAIN_ID,
  name: "configured-chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [config.RPC_URL] } },
});

export const publicClient: PublicClient = createPublicClient({ chain, transport: http(config.RPC_URL) });

export function configuredAddress(value?: string): Address | undefined {
  if (!value) return undefined;
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) throw new Error("Invalid configured contract address");
  return value as Address;
}

export function relayerClient(): WalletClient {
  const key = process.env.RELAYER_PRIVATE_KEY;
  if (!key) throw ApiError.upstream("No relayer is configured for this transaction");
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) throw ApiError.upstream("Invalid relayer configuration");
  return createWalletClient({ account: privateKeyToAccount(key as `0x${string}`), chain, transport: http(config.RPC_URL) });
}

export { chain };
