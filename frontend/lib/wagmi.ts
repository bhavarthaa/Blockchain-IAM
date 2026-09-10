import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { defineChain } from "viem";

const id = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 31337);
export const appChain = defineChain({
  id,
  name: id === 11155111 ? "Sepolia" : id === 31337 ? "Local Anvil" : `Chain ${id}`,
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [process.env.NEXT_PUBLIC_RPC_URL ?? "http://127.0.0.1:8545"] } },
});
export const wagmiConfig = createConfig({ chains: [appChain], connectors: [injected()], transports: { [appChain.id]: http(appChain.rpcUrls.default.http[0]) } });
