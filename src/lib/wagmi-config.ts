import { createConfig } from '@privy-io/wagmi';
import { http, fallback } from 'viem';
import { arbitrum } from 'viem/chains';

export const supportedChains = [arbitrum] as const;

const envRpc = import.meta.env.VITE_RPC_URL_42161;

const arbitrumTransport = fallback(
  [
    ...(envRpc ? [http(envRpc)] : []),
    http('https://arb1.arbitrum.io/rpc'),
    http('https://arbitrum-one-rpc.publicnode.com'),
    http('https://1rpc.io/arb'),
    http('https://rpc.ankr.com/arbitrum'),
  ],
  { rank: true }
);

export const wagmiConfig = createConfig({
  chains: supportedChains as any,
  transports: {
    [arbitrum.id]: arbitrumTransport,
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
