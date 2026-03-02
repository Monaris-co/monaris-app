// Chain utilities for multichain support

import { getChainById, CHAIN_IDS, CHAIN_NAMES } from './wagmi-config';
import { getContractAddressesForChainId, areContractsConfigured } from './contracts';

// Re-export CHAIN_IDS for convenience
export { CHAIN_IDS } from './wagmi-config';

// Chain metadata
export interface ChainMetadata {
  chainId: number;
  name: string;
  isTestnet: boolean;
  nativeCurrency: {
    symbol: string;
    name: string;
  };
  explorerUrl: string;
  rpcUrl: string;
}

// Get chain metadata
export function getChainMetadata(chainId: number): ChainMetadata | null {
  const chain = getChainById(chainId);
  if (!chain) return null;

  const explorerUrls: Record<number, string> = {
    [CHAIN_IDS.MANTLE_SEPOLIA]: 'https://explorer.testnet.mantle.xyz',
    [CHAIN_IDS.MANTLE_MAINNET]: 'https://explorer.mantle.xyz',
    [CHAIN_IDS.ARBITRUM_SEPOLIA]: 'https://sepolia-explorer.arbitrum.io',
    [CHAIN_IDS.ARBITRUM_MAINNET]: 'https://explorer.arbitrum.io',
    [CHAIN_IDS.ETH_SEPOLIA]: 'https://sepolia.etherscan.io',
    [CHAIN_IDS.ETH_MAINNET]: 'https://etherscan.io',
  };

  const rpcUrls: Record<number, string> = {
    [CHAIN_IDS.MANTLE_SEPOLIA]: 'https://rpc.sepolia.mantle.xyz',
    [CHAIN_IDS.MANTLE_MAINNET]: 'https://rpc.mantle.xyz',
    [CHAIN_IDS.ARBITRUM_SEPOLIA]: 'https://arbitrum-sepolia-rpc.publicnode.com', // Public RPC without CORS issues
    [CHAIN_IDS.ARBITRUM_MAINNET]: 'https://arbitrum-one-rpc.publicnode.com',
    [CHAIN_IDS.ETH_SEPOLIA]: 'https://rpc.sepolia.org',
    [CHAIN_IDS.ETH_MAINNET]: 'https://eth.llamarpc.com',
  };

  return {
    chainId,
    name: CHAIN_NAMES[chainId] || chain.name,
    isTestnet: chain.testnet || false,
    nativeCurrency: {
      symbol: chain.nativeCurrency.symbol,
      name: chain.nativeCurrency.name,
    },
    explorerUrl: explorerUrls[chainId] || chain.blockExplorers?.default?.url || '',
    rpcUrl: rpcUrls[chainId] || '',
  };
}

// Get explorer URL for transaction
// Defaults to Arbitrum Mainnet (42161) if chainId is not provided
export function getExplorerUrl(chainId: number | undefined, txHash: string): string {
  // Default to Arbitrum Mainnet if chainId is not provided
  const effectiveChainId = chainId || CHAIN_IDS.ARBITRUM_MAINNET;
  const metadata = getChainMetadata(effectiveChainId);
  if (!metadata) return '';
  return `${metadata.explorerUrl}/tx/${txHash}`;
}

// Get explorer URL for address
// Defaults to Arbitrum Mainnet (42161) if chainId is not provided
export function getExplorerAddressUrl(chainId: number | undefined, address: string): string {
  // Default to Arbitrum Mainnet if chainId is not provided
  const effectiveChainId = chainId || CHAIN_IDS.ARBITRUM_MAINNET;
  const metadata = getChainMetadata(effectiveChainId);
  if (!metadata) return '';
  return `${metadata.explorerUrl}/address/${address}`;
}

// Check if chain has contracts deployed
export function hasContractsDeployed(chainId: number): boolean {
  return areContractsConfigured(chainId);
}

// Get all supported chain IDs
export function getSupportedChainIds(): number[] {
  return Object.values(CHAIN_IDS);
}

// Get testnet chain IDs
export function getTestnetChainIds(): number[] {
  return [CHAIN_IDS.MANTLE_SEPOLIA, CHAIN_IDS.ARBITRUM_SEPOLIA, CHAIN_IDS.ETH_SEPOLIA];
}

// Get mainnet chain IDs
export function getMainnetChainIds(): number[] {
  return [CHAIN_IDS.MANTLE_MAINNET, CHAIN_IDS.ARBITRUM_MAINNET, CHAIN_IDS.ETH_MAINNET];
}

// Format chain ID for display
export function formatChainId(chainId: number): string {
  return `0x${chainId.toString(16)}`;
}

// Parse chain ID from hex string
export function parseChainId(hexString: string): number {
  return parseInt(hexString, 16);
}

/**
 * Generate a payment link for an invoice with chain ID
 * Format: /pay/:chainId/:invoiceId
 * Defaults to Arbitrum Mainnet (42161) if chainId is not provided
 */
export function getPaymentLink(chainId: number | undefined, invoiceId: string | bigint): string {
  const invoiceIdStr = typeof invoiceId === 'bigint' ? invoiceId.toString() : invoiceId;
  // Default to Arbitrum Mainnet if chainId is not provided
  const effectiveChainId = chainId || CHAIN_IDS.ARBITRUM_MAINNET;
  return `${window.location.origin}/pay/${effectiveChainId}/${invoiceIdStr}`;
}
