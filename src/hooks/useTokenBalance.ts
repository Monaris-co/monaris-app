import { useReadContract, useChainId } from 'wagmi';
import { useEffect, useMemo } from 'react';
import { usePrivyAccount } from './usePrivyAccount';
import { useChainAddresses } from './useChainAddresses';
import { DemoUSDCABI, ERC20ABI } from '@/lib/abis';
import { formatUnits } from 'viem';

// Hardcoded USDC address for Arbitrum Mainnet (official contract)
const ARBITRUM_USDC_ADDRESS = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';

/**
 * Hook to fetch USDC balance for the connected wallet
 * Uses real USDC (ERC20ABI) on mainnets, DemoUSDC on testnets
 */
export function useTokenBalance() {
  const { address } = usePrivyAccount();
  const chainId = useChainId();
  const addresses = useChainAddresses();

  // Determine if we're on a mainnet
  const isMainnet = chainId === 42161 || chainId === 1;

  // Get the correct USDC contract address
  // For Arbitrum Mainnet, use hardcoded address to ensure it's always correct
  const usdcContractAddress = useMemo(() => {
    if (chainId === 42161) {
      return ARBITRUM_USDC_ADDRESS; // Always use hardcoded for Arbitrum Mainnet
    }
    return addresses.DemoUSDC;
  }, [chainId, addresses.DemoUSDC]);

  // Select appropriate ABI
  const usdcABI = isMainnet ? ERC20ABI : DemoUSDCABI;

  // Only enable query if we have both wallet address and contract address
  const isEnabled = !!address && !!usdcContractAddress;

  // Debug logging
  useEffect(() => {
    if (import.meta.env.DEV) {
      console.log(`[useTokenBalance] Config:`, {
        chainId,
        isMainnet,
        walletAddress: address,
        usdcContractAddress,
        isEnabled,
        abiType: isMainnet ? 'ERC20ABI' : 'DemoUSDCABI',
      });
    }
  }, [chainId, isMainnet, address, usdcContractAddress, isEnabled]);

  const { data: balance, isLoading, error, refetch } = useReadContract({
    address: usdcContractAddress as `0x${string}`,
    abi: usdcABI,
    functionName: 'balanceOf',
    args: address ? [address as `0x${string}`] : undefined,
    chainId,
    query: {
      enabled: isEnabled,
      refetchInterval: 60_000,
      staleTime: 30_000,
      retry: 2,
      retryDelay: 3000,
    },
  });

  // Log result
  useEffect(() => {
    if (import.meta.env.DEV) {
      console.log(`[useTokenBalance] Result:`, {
        balance: balance !== undefined ? formatUnits(balance, 6) : 'undefined',
        isLoading,
        error: error?.message || 'none',
      });
    }
  }, [balance, isLoading, error]);

  return {
    balance: balance !== undefined ? parseFloat(formatUnits(balance, 6)) : 0,
    rawBalance: balance || BigInt(0),
    isLoading,
    error,
    refetch,
  };
}

