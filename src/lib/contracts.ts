export interface ContractsData {
  network: string;
  chainId: string;
  deployer: string;
  contracts: {
    DemoUSDC?: string;
    USMTPlus?: string;
    InvoiceNFT?: string;
    InvoiceRegistry?: string;
    Vault?: string;
    Staking?: string;
    AdvanceEngine?: string;
    Reputation?: string;
    SettlementRouter?: string;
    Treasury?: string;
    ProtocolFeeBps?: string;
  };
  deployedAt: string;
}

// Chain ID constants
export const CHAIN_IDS = {
  ARBITRUM_MAINNET: 42161,
} as const;

// Contract address configuration interface
export interface ChainContractAddresses {
  DemoUSDC?: string;
  USMTPlus?: string;
  InvoiceNFT?: string;
  InvoiceRegistry?: string;
  Vault?: string;
  Staking?: string;
  AdvanceEngine?: string;
  Reputation?: string;
  SettlementRouter?: string;
}

// Hardcoded contract addresses for each chain
// These are deployed and verified contracts - no need for env variables
const HARDCODED_ADDRESSES: Record<number, ChainContractAddresses> = {
  // Arbitrum Mainnet (42161)
  [CHAIN_IDS.ARBITRUM_MAINNET]: {
    DemoUSDC: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', // Real USDC on Arbitrum
    InvoiceNFT: '0x14F3b6cB45A8bfA56C167Ca4bBe01B54687Ddc31',
    InvoiceRegistry: '0x7a8060E483aecb1795224e7B56bB114bb4e23eB2',
    USMTPlus: '0x25082339C9A62B3A2d6B4F2b4455988027d05fe1',
    Vault: '0x61Cc69Ee831755F4EE866Af7f269322EedC3d537',
    Staking: '0x849298c38481a9d18E56fa6Cf2E3fFD3a3d7493e',
    AdvanceEngine: '0x0D8DC5f327bDD5043F0B10D08f025eAc4F82A08E',
    Reputation: '0x6baD5b67FA6ac72D2921D7171118A423a6fA8C73',
    SettlementRouter: '0x90379cDd2763123e69c9d021dA7A97f83B84336d',
  },
};

// Load contract addresses for a specific chain
function getContractAddressesForChain(chainId: number): ChainContractAddresses {
  // Use hardcoded addresses if available
  const hardcodedAddresses = HARDCODED_ADDRESSES[chainId];
  if (hardcodedAddresses) {
    if (import.meta.env.DEV) {
      console.log(`[Contracts] ✅ Using hardcoded addresses for chain ${chainId}`);
    }
    return hardcodedAddresses;
  }

  // Fallback to environment variables for other chains
  const getEnvVar = (contractName: string, chainId: number): string | undefined => {
    const chainSpecific = import.meta.env[`VITE_${chainId}_${contractName}`];
    if (chainSpecific) return chainSpecific;
    return import.meta.env[`VITE_${contractName}`];
  };

  const addresses: ChainContractAddresses = {
    DemoUSDC: getEnvVar('DEMO_USDC_ADDRESS', chainId),
    USMTPlus: getEnvVar('USMT_PLUS_ADDRESS', chainId),
    InvoiceNFT: getEnvVar('INVOICE_NFT_ADDRESS', chainId),
    InvoiceRegistry: getEnvVar('INVOICE_REGISTRY_ADDRESS', chainId),
    Vault: getEnvVar('VAULT_ADDRESS', chainId),
    Staking: getEnvVar('STAKING_ADDRESS', chainId),
    AdvanceEngine: getEnvVar('ADVANCE_ENGINE_ADDRESS', chainId),
    Reputation: getEnvVar('REPUTATION_ADDRESS', chainId),
    SettlementRouter: getEnvVar('SETTLEMENT_ROUTER_ADDRESS', chainId),
  };

  if (import.meta.env.DEV) {
    console.warn(`[Contracts] ⚠️ No hardcoded addresses for chain ${chainId}, using env vars`);
  }

  return addresses;
}

// Cache for contract addresses per chain
const contractAddressesCache = new Map<number, ChainContractAddresses>();

// Get contract addresses for current chain (defaults to Arbitrum Mainnet)
function getContractAddresses(chainId?: number): ChainContractAddresses {
  // If no chainId provided, try to get from current chain context
  // This will be overridden by hooks that know the current chain
  const effectiveChainId = chainId || parseInt(import.meta.env.VITE_DEFAULT_CHAIN_ID || '42161'); // Default to Arbitrum Mainnet
  
  // Always reload addresses (don't use cache) to ensure we get the latest hardcoded addresses
  // Cache was causing stale data when hardcoded addresses were added
  const addresses = getContractAddressesForChain(effectiveChainId);
  
  // Update cache for future reference
  contractAddressesCache.set(effectiveChainId, addresses);
  
  return addresses;
}

// Legacy export for backward compatibility (uses default chain)
export const contractAddresses = getContractAddresses();

// Export function to get addresses for specific chain
export function getContractAddressesForChainId(chainId: number): ChainContractAddresses {
  return getContractAddresses(chainId);
}

// Helper to check if contracts are configured for a chain
export function areContractsConfigured(chainId?: number): boolean {
  const addresses = getContractAddresses(chainId);
  return !!(
    addresses.DemoUSDC &&
    addresses.USMTPlus &&
    addresses.InvoiceRegistry &&
    addresses.Vault &&
    addresses.Staking &&
    addresses.AdvanceEngine &&
    addresses.Reputation &&
    addresses.SettlementRouter
  );
}

// Helper to get contract address with chain awareness
export function getContractAddress(
  contractName: keyof ChainContractAddresses,
  chainId?: number
): string | undefined {
  const addresses = getContractAddresses(chainId);
  return addresses[contractName];
}

