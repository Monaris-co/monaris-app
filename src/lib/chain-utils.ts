import { getChainById, CHAIN_IDS, CHAIN_NAMES } from './wagmi-config';
import { getContractAddressesForChainId, areContractsConfigured } from './contracts';

export { CHAIN_IDS } from './wagmi-config';

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

export function getChainMetadata(chainId: number): ChainMetadata | null {
  const chain = getChainById(chainId);
  if (!chain) return null;

  const explorerUrls: Record<number, string> = {
    [CHAIN_IDS.ARBITRUM_MAINNET]: 'https://arbiscan.io',
  };

  const rpcUrls: Record<number, string> = {
    [CHAIN_IDS.ARBITRUM_MAINNET]: 'https://1rpc.io/arb',
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

export function getExplorerUrl(chainId: number | undefined, txHash: string): string {
  const effectiveChainId = chainId || CHAIN_IDS.ARBITRUM_MAINNET;
  const metadata = getChainMetadata(effectiveChainId);
  if (!metadata) return `https://arbiscan.io/tx/${txHash}`;
  return `${metadata.explorerUrl}/tx/${txHash}`;
}

export function getExplorerAddressUrl(chainId: number | undefined, address: string): string {
  const effectiveChainId = chainId || CHAIN_IDS.ARBITRUM_MAINNET;
  const metadata = getChainMetadata(effectiveChainId);
  if (!metadata) return `https://arbiscan.io/address/${address}`;
  return `${metadata.explorerUrl}/address/${address}`;
}

export function hasContractsDeployed(chainId: number): boolean {
  return areContractsConfigured(chainId);
}

export function getSupportedChainIds(): number[] {
  return Object.values(CHAIN_IDS);
}

export function getMainnetChainIds(): number[] {
  return [CHAIN_IDS.ARBITRUM_MAINNET];
}

export function formatChainId(chainId: number): string {
  return `0x${chainId.toString(16)}`;
}

export function parseChainId(hexString: string): number {
  return parseInt(hexString, 16);
}

export function getPaymentLink(chainId: number | undefined, invoiceId: string | bigint): string {
  const invoiceIdStr = typeof invoiceId === 'bigint' ? invoiceId.toString() : invoiceId;
  const effectiveChainId = chainId || CHAIN_IDS.ARBITRUM_MAINNET;
  return `${window.location.origin}/pay/${effectiveChainId}/${invoiceIdStr}`;
}
