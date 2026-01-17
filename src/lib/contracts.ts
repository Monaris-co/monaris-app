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

// Load contract addresses for a specific chain
function getContractAddressesForChain(chainId: number): ChainContractAddresses {
  // Environment variable naming: VITE_<CHAIN_ID>_<CONTRACT_NAME>
  // Example: VITE_5003_DEMO_USDC_ADDRESS for Mantle Sepolia
  // Fallback: VITE_DEMO_USDC_ADDRESS (backward compatibility)
  
  const getEnvVar = (contractName: string, chainId: number): string | undefined => {
    // Try chain-specific first (e.g., VITE_421614_DEMO_USDC_ADDRESS for Arbitrum Sepolia)
    const chainSpecific = import.meta.env[`VITE_${chainId}_${contractName}`];
    if (chainSpecific) {
      if (import.meta.env.DEV) {
        console.log(`[Contracts] Using chain-specific address for ${contractName} on chain ${chainId}: ${chainSpecific}`);
      }
      return chainSpecific;
    }
    
    // Fallback to generic (backward compatibility)
    const generic = import.meta.env[`VITE_${contractName}`];
    if (generic && import.meta.env.DEV) {
      console.warn(`[Contracts] Using generic address for ${contractName} on chain ${chainId} (no chain-specific found): ${generic}`);
    }
    return generic;
  };

  // Hardcoded real USDC addresses for mainnets (these are the official contract addresses)
  // Note: Addresses are checksummed for consistency
  const REAL_USDC_ADDRESSES: Record<number, string> = {
    42161: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', // Arbitrum Mainnet - Real USDC (checksummed)
    1: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // Ethereum Mainnet - Real USDC (checksummed)
  };
  
  // Log when using hardcoded addresses in dev mode
  if (import.meta.env.DEV && REAL_USDC_ADDRESSES[chainId]) {
    console.log(`[Contracts] Using hardcoded USDC address for chain ${chainId}: ${REAL_USDC_ADDRESSES[chainId]}`);
  }

  const addresses: ChainContractAddresses = {
    DemoUSDC: getEnvVar('DEMO_USDC_ADDRESS', chainId) || 
      REAL_USDC_ADDRESSES[chainId] || // Use real USDC for mainnets if not in env
      (chainId === 5003 ? '0x003aF3CFc2DeeE3751fe9e03083e45074ED493E4' : undefined), // Default for Mantle Sepolia
    USMTPlus: getEnvVar('USMT_PLUS_ADDRESS', chainId),
    InvoiceNFT: getEnvVar('INVOICE_NFT_ADDRESS', chainId),
    InvoiceRegistry: getEnvVar('INVOICE_REGISTRY_ADDRESS', chainId),
    Vault: getEnvVar('VAULT_ADDRESS', chainId),
    Staking: getEnvVar('STAKING_ADDRESS', chainId),
    AdvanceEngine: getEnvVar('ADVANCE_ENGINE_ADDRESS', chainId),
    Reputation: getEnvVar('REPUTATION_ADDRESS', chainId),
    SettlementRouter: getEnvVar('SETTLEMENT_ROUTER_ADDRESS', chainId),
  };

  // Log in dev mode for debugging
  if (import.meta.env.DEV) {
    const hasAllContracts = !!(
      addresses.DemoUSDC &&
      addresses.InvoiceRegistry &&
      addresses.Vault &&
      addresses.SettlementRouter
    );
    if (hasAllContracts) {
      console.log(`[Contracts] ✅ Contracts configured for chain ${chainId}:`, {
        DemoUSDC: addresses.DemoUSDC,
        InvoiceRegistry: addresses.InvoiceRegistry,
        Vault: addresses.Vault,
        SettlementRouter: addresses.SettlementRouter,
      });
    } else {
      console.warn(`[Contracts] ⚠️ Missing contract addresses for chain ${chainId}. Add VITE_${chainId}_* addresses to .env`);
      console.warn(`[Contracts] Current addresses for chain ${chainId}:`, {
        DemoUSDC: addresses.DemoUSDC || 'MISSING',
        InvoiceRegistry: addresses.InvoiceRegistry || 'MISSING',
        Vault: addresses.Vault || 'MISSING',
        SettlementRouter: addresses.SettlementRouter || 'MISSING',
      });
    }
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

