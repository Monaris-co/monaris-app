import { fallback, http } from "viem";
import { arbitrum } from "viem/chains";

const KNOWN_BAD_RPCS = ["pocket.network", "llamarpc.com", "1rpc.io", "publicnode.com"];

export const walletSupportedChains = [
  arbitrum,
] as const;

export const walletBalanceChainIds = walletSupportedChains.map((chain) => chain.id);

export const walletSupportedPrivyChains = walletSupportedChains.map((chain) => ({
  id: chain.id,
  name: chain.name,
  nativeCurrency: chain.nativeCurrency,
  rpcUrls: chain.rpcUrls,
  blockExplorers: chain.blockExplorers,
  testnet: chain.testnet,
}));

export const GLOBAL_USDC_ADDRESSES: Partial<Record<number, `0x${string}`>> = {
  42161: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
};

function getRpcEnvValue(chainId: number) {
  const envKey = `VITE_RPC_URL_${chainId}`;
  const envValue = import.meta.env[envKey];
  return envValue && !KNOWN_BAD_RPCS.some((bad) => envValue.includes(bad))
    ? envValue
    : undefined;
}

export function getWalletChainById(chainId: number) {
  return walletSupportedChains.find((chain) => chain.id === chainId);
}

export function getWalletTransport(chainId: number) {
  const chain = getWalletChainById(chainId);
  if (!chain) throw new Error(`Unsupported wallet chain ${chainId}`);

  const envRpc = getRpcEnvValue(chainId);
  const defaultHttp = chain.rpcUrls.default.http || [];
  const publicHttp = chain.rpcUrls.public?.http || [];
  const arbitrumFallbacks = [
    "https://arb1.arbitrum.io/rpc",
    "https://arbitrum.drpc.org",
    "https://rpc.ankr.com/arbitrum",
    "https://arb-pokt.nodies.app",
  ];
  const candidateUrls =
    chainId === arbitrum.id
      ? [...(envRpc ? [envRpc] : []), ...arbitrumFallbacks, ...defaultHttp, ...publicHttp]
      : [...(envRpc ? [envRpc] : []), ...defaultHttp, ...publicHttp];
  const httpUrls = Array.from(
    new Set(candidateUrls.filter((url) => !KNOWN_BAD_RPCS.some((bad) => url.includes(bad)))),
  );

  if (chainId === arbitrum.id) {
    return fallback(httpUrls.map((url) => http(url)), { rank: true });
  }

  return fallback(httpUrls.map((url) => http(url)), { rank: true });
}
