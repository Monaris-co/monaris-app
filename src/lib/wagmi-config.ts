import { createConfig } from '@privy-io/wagmi';
import { http, webSocket, defineChain } from 'viem';
import { mainnet, sepolia, arbitrum, arbitrumSepolia } from 'viem/chains';

// Mantle Sepolia Testnet configuration
export const mantleSepolia = defineChain({
  id: 5003,
  name: 'Mantle Sepolia Testnet',
  nativeCurrency: {
    decimals: 18,
    name: 'Mantle',
    symbol: 'MNT',
  },
  rpcUrls: {
    default: {
      http: ['https://rpc.sepolia.mantle.xyz'],
      webSocket: ['wss://mantle-sepolia.g.alchemy.com/v2/H2xLs5teY1MdED6Fe0lSX'],
    },
  },
  blockExplorers: {
    default: {
      name: 'Mantle Explorer',
      url: 'https://explorer.testnet.mantle.xyz',
    },
  },
  testnet: true,
});

// Mantle Mainnet (for future use)
export const mantleMainnet = defineChain({
  id: 5000,
  name: 'Mantle',
  nativeCurrency: {
    decimals: 18,
    name: 'Mantle',
    symbol: 'MNT',
  },
  rpcUrls: {
    default: {
      http: ['https://rpc.mantle.xyz'],
      webSocket: ['wss://ws.mantle.xyz'],
    },
  },
  blockExplorers: {
    default: {
      name: 'Mantle Explorer',
      url: 'https://explorer.mantle.xyz',
    },
  },
  testnet: false,
});

// Supported chains - all chains we support
export const supportedChains = [
  mantleSepolia,
  arbitrumSepolia,
  arbitrum,
  sepolia,
  mainnet,
] as const;

// Get chain RPC URL from environment or use defaults
// IMPORTANT: For chains with gas sponsorship enabled, Privy's createConfig will automatically
// use Privy's gas-sponsored RPC endpoints, so we don't need to specify them here
function getChainRpcUrl(chainId: number): string {
  const envKey = `VITE_RPC_URL_${chainId}`;
  const envValue = import.meta.env[envKey];
  
  if (envValue) return envValue;
  
  // Default RPC URLs (fallback only - Privy will use its own RPC for gas-sponsored chains)
  const defaults: Record<number, string> = {
    5003: 'https://rpc.sepolia.mantle.xyz',
    5000: 'https://rpc.mantle.xyz',
    421614: 'https://arbitrum-sepolia-rpc.publicnode.com', // Fallback if Privy RPC not available
    42161: 'https://arbitrum-one-rpc.publicnode.com',
    11155111: 'https://rpc.sepolia.org',
    1: 'https://eth.llamarpc.com',
  };
  
  return defaults[chainId] || '';
}

// Get chain WebSocket URL from environment or use defaults
function getChainWsUrl(chainId: number): string | undefined {
  const envKey = `VITE_WS_URL_${chainId}`;
  const envValue = import.meta.env[envKey];
  
  if (envValue) return envValue;
  
  // Default WebSocket URLs (optional, only for chains that support it)
  const defaults: Record<number, string | undefined> = {
    5003: 'wss://mantle-sepolia.g.alchemy.com/v2/H2xLs5teY1MdED6Fe0lSX',
    421614: undefined,
    42161: undefined,
    11155111: undefined,
    1: undefined,
  };
  
  return defaults[chainId];
}

// Chains with gas sponsorship enabled in Privy dashboard
// Privy's createConfig will automatically use Privy's gas-sponsored RPC for these
const GAS_SPONSORED_CHAINS = [421614, 11155111, 5003]; // Arbitrum Sepolia, Ethereum Sepolia, Mantle Sepolia

// Build transports object for all supported chains
// IMPORTANT: All chains MUST have transports defined. Privy's createConfig will automatically
// override transports for gas-sponsored chains with its own gas-sponsored RPC endpoints.
const transports: Record<number, ReturnType<typeof http> | ReturnType<typeof webSocket>> = {};
supportedChains.forEach((chain) => {
  // For gas-sponsored chains, Privy's createConfig will automatically use Privy's RPC
  // But we still need to provide a transport function (it will be overridden by Privy)
  if (GAS_SPONSORED_CHAINS.includes(chain.id)) {
    // Provide a fallback transport - Privy will override with its gas-sponsored RPC
    transports[chain.id] = http(getChainRpcUrl(chain.id));
    return;
  }
  
  if (chain.id === 42161) {
    transports[chain.id] = http('https://arbitrum-one-rpc.publicnode.com');
    return;
  }
  
  // For non-gas-sponsored chains, use WebSocket if available, otherwise HTTP
  const wsUrl = getChainWsUrl(chain.id);
  if (wsUrl) {
    transports[chain.id] = webSocket(wsUrl);
  } else {
    transports[chain.id] = http(getChainRpcUrl(chain.id));
  }
});

// Create Wagmi config using Privy's createConfig
// IMPORTANT: Privy's createConfig automatically handles gas-sponsored RPC endpoints
// for chains configured in Privy dashboard. By not specifying transports for those chains,
// Privy will automatically route transactions through its gas-sponsored endpoints.
export const wagmiConfig = createConfig({
  chains: supportedChains as any,
  transports: transports as any, // Only includes non-gas-sponsored chains
});

// Export chains for use in components
export const chains = supportedChains;

// Helper to get chain by ID
export function getChainById(chainId: number) {
  return supportedChains.find((chain) => chain.id === chainId);
}

// Helper to check if chain is supported
export function isChainSupported(chainId: number): boolean {
  return supportedChains.some((chain) => chain.id === chainId);
}

// Chain metadata helpers
export const CHAIN_NAMES: Record<number, string> = {
  5003: 'Mantle Sepolia',
  5000: 'Mantle',
  421614: 'Arbitrum Sepolia',
  42161: 'Arbitrum One',
  11155111: 'Ethereum Sepolia',
  1: 'Ethereum',
};

export const CHAIN_IDS = {
  MANTLE_SEPOLIA: 5003,
  MANTLE_MAINNET: 5000,
  ARBITRUM_SEPOLIA: 421614,
  ARBITRUM_MAINNET: 42161,
  ETH_SEPOLIA: 11155111,
  ETH_MAINNET: 1,
} as const;
