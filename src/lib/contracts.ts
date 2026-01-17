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
  MANTLE_SEPOLIA: 5003,
  MANTLE_MAINNET: 5000,
  ARBITRUM_SEPOLIA: 421614,
  ARBITRUM_MAINNET: 42161,
  ETH_SEPOLIA: 11155111,
  ETH_MAINNET: 1,
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
    InvoiceNFT: '0x300718D45Ac08894839261d81Adef42797B87854',
    InvoiceRegistry: '0x1a9751dE68C4B33463682BD3f9a54e6eDBc04F35',
    USMTPlus: '0x990cF8A72974739E3F918dA33793A8b639889520',
    Vault: '0xAc9B0123000328Bb3780e3138815C6f4A12160Be',
    Staking: '0x2099329241882Ad465e4B8455FC536f86df9Fff5',
    AdvanceEngine: '0x7Ad0CcE4cCa1A1bdF86bfFfaA0befb2c7B4118eC',
    Reputation: '0x43Ea89114A06f9A39dCbABa25F362b6FBf07260c',
    SettlementRouter: '0xc49F8d05751F5C12EC29b5fD91fb009fA52cd475',
  },
  // Arbitrum Sepolia (421614) - Testnet
  [CHAIN_IDS.ARBITRUM_SEPOLIA]: {
    DemoUSDC: '0x2De86556c08Df11E1D35223F0741791fBD847567',
    InvoiceNFT: '0x56D95C3f2613b29128F31f5cbE15aBaD43dAC7f0',
    InvoiceRegistry: '0x092511Bc54Ab7b17197FAaE5eedC889806bB94c5',
    USMTPlus: '0x5b91BF17b4149c083e7De4B9CD86e94cD40a0b28',
    Vault: '0x6a8B044A517B8e8f8B8F074bd981FA5149108BCb',
    Staking: '0x77F1F00B04B3d9b77D92c59FC85e94e69a60F29b',
    AdvanceEngine: '0x15127d7136187CBF1550B35897D495a1593Dd101',
    Reputation: '0x28F87D31F8305B13aFc71f69b0D1d188003d1BB3',
    SettlementRouter: '0x7630A3B6c362345d0E0D1f746dB231Ac4eB5302B',
  },
  // Mantle Sepolia (5003) - Testnet
  [CHAIN_IDS.MANTLE_SEPOLIA]: {
    DemoUSDC: '0x003aF3CFc2DeeE3751fe9e03083e45074ED493E4',
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

