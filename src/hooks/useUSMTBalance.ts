import { useReadContract, useChainId } from 'wagmi';
import { usePrivyAccount } from './usePrivyAccount';
import { useChainAddresses } from './useChainAddresses';
import { USMTPlusABI } from '@/lib/abis';
import { formatUnits } from 'viem';

/**
 * Hook to fetch USMT+ token balance for the connected wallet
 */
export function useUSMTBalance() {
  const { address } = usePrivyAccount();
  const chainId = useChainId();
  const addresses = useChainAddresses();

  // Only enable query if we have both address and contract address
  const isEnabled = !!address && !!addresses.USMTPlus;

  const { data: balance, isLoading, error, refetch } = useReadContract({
    address: addresses.USMTPlus as `0x${string}`,
    abi: USMTPlusABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId,
    query: {
      enabled: isEnabled,
      refetchInterval: isEnabled ? 120_000 : false,
      retry: 2,
      retryDelay: 3000,
    },
  });

  return {
    balance: balance ? parseFloat(formatUnits(balance, 6)) : 0, // USMT+ has 6 decimals
    rawBalance: balance || BigInt(0),
    isLoading,
    error,
    refetch,
  };
}

