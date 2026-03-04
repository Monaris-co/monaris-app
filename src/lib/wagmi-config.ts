import { createConfig } from '@privy-io/wagmi';
import { http, fallback, webSocket } from 'viem';
import { arbitrum } from 'viem/chains';

export const supportedChains = [arbitrum] as const;

const KNOWN_BAD_RPCS = ['pocket.network', 'llamarpc.com', '1rpc.io'];
const envRpc = import.meta.env.VITE_RPC_URL_42161;
const useEnvRpc = envRpc && !KNOWN_BAD_RPCS.some(bad => envRpc.includes(bad));

const arbitrumTransport = fallback(
  [
    webSocket('wss://arb-mainnet.g.alchemy.com/v2/lA12jxcK7XSr4_xdTRtMG'),
    http('https://arb-mainnet.g.alchemy.com/v2/lA12jxcK7XSr4_xdTRtMG'),
    ...(useEnvRpc ? [http(envRpc)] : []),
    http('https://rpc.ankr.com/arbitrum'),
    http('https://arbitrum.drpc.org'),
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
