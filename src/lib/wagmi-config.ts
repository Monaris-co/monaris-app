import { createConfig } from '@privy-io/wagmi';
import { http } from 'viem';
import { arbitrum } from 'viem/chains';

export const supportedChains = [arbitrum] as const;

function getChainRpcUrl(chainId: number): string {
  const envKey = `VITE_RPC_URL_${chainId}`;
  const envValue = import.meta.env[envKey];
  if (envValue) return envValue;

  const defaults: Record<number, string> = {
    42161: 'https://arbitrum-one-rpc.publicnode.com',
  };
  return defaults[chainId] || '';
}

export const wagmiConfig = createConfig({
  chains: supportedChains as any,
  transports: {
    [arbitrum.id]: http(getChainRpcUrl(42161)),
  } as any,
});

export const chains = supportedChains;

export function getChainById(chainId: number) {
  return supportedChains.find((chain) => chain.id === chainId);
}

export function isChainSupported(chainId: number): boolean {
  return supportedChains.some((chain) => chain.id === chainId);
}

export const CHAIN_NAMES: Record<number, string> = {
  42161: 'Arbitrum One',
};

export const CHAIN_IDS = {
  ARBITRUM_MAINNET: 42161,
} as const;
