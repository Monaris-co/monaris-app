import { CHAIN_IDS } from '../contracts';
import type { PrivacyConfig } from './types';

export const PRIVATE_PAYMENTS_ENABLED =
  import.meta.env.VITE_PRIVATE_PAYMENTS_ENABLED === 'true';

export const RAILGUN_PROXY_CONTRACTS: Record<number, string> = {
  [CHAIN_IDS.ARBITRUM_MAINNET]: '0xFA7093CDD9EE6932B4eb2c9e1cde7CE00B1FA4b9',
  [CHAIN_IDS.ARBITRUM_SEPOLIA]: '', // no RAILGUN deployment on Arb Sepolia yet
};

const KNOWN_USDC: Record<number, string> = {
  [CHAIN_IDS.ARBITRUM_MAINNET]: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  [CHAIN_IDS.ARBITRUM_SEPOLIA]: '0x2De86556c08Df11E1D35223F0741791fBD847567',
};

const KNOWN_USDT: Record<number, string> = {
  [CHAIN_IDS.ARBITRUM_MAINNET]: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
};

export function getPrivacyConfig(chainId: number): PrivacyConfig {
  const rpcUrl =
    import.meta.env[`VITE_RPC_URL_${chainId}`] ||
    import.meta.env.VITE_MANTLE_RPC_URL ||
    '';

  return {
    enabled: PRIVATE_PAYMENTS_ENABLED && !!RAILGUN_PROXY_CONTRACTS[chainId],
    chainId,
    rpcUrl,
    usdcAddress: KNOWN_USDC[chainId] || '',
    usdtAddress: KNOWN_USDT[chainId],
  };
}

export const PRIVACY_WALLET_STORAGE_KEY = 'monaris_private_wallet';
export const PRIVACY_ARTIFACTS_PATH = '/railgun-artifacts';

export const SUPPORTED_PRIVATE_TOKENS = ['USDC', 'USDT'] as const;
export type SupportedPrivateToken = (typeof SUPPORTED_PRIVATE_TOKENS)[number];
