// Hook to get contract addresses for current chain
import { useChainId } from 'wagmi';
import { useMemo } from 'react';
import { getContractAddressesForChainId, type ChainContractAddresses } from '@/lib/contracts';

/**
 * Hook to get contract addresses for the currently connected chain
 * Falls back to default chain (Mantle Sepolia) if no chain is connected
 * 
 * This hook automatically updates when the user switches chains,
 * ensuring the correct contract addresses are used for the selected network.
 */
export function useChainAddresses(): ChainContractAddresses {
  const chainId = useChainId();
  
  return useMemo(() => {
    const addresses = getContractAddressesForChainId(chainId);
    
    // Log when addresses change (in dev mode)
    if (import.meta.env.DEV) {
      console.log(`[useChainAddresses] Loaded addresses for chain ${chainId}`, {
        InvoiceRegistry: addresses.InvoiceRegistry,
        Vault: addresses.Vault,
        SettlementRouter: addresses.SettlementRouter,
      });
    }
    
    return addresses;
  }, [chainId]);
}

/**
 * Hook to get a specific contract address for the current chain
 */
export function useChainAddress(contractName: keyof ChainContractAddresses): string | undefined {
  const addresses = useChainAddresses();
  return addresses[contractName];
}
