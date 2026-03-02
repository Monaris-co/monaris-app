import { useReadContract, useWaitForTransactionReceipt, useWatchContractEvent, useChainId } from 'wagmi';
import { useSendTransaction, useWallets } from '@privy-io/react-auth';
import { usePrivyAccount } from './usePrivyAccount';
import { useChainAddresses } from './useChainAddresses';
import { AdvanceEngineABI } from '@/lib/abis';
import { formatUnits, parseUnits, encodeFunctionData } from 'viem';
import { useState } from 'react';

export interface Advance {
  invoiceId: bigint;
  seller: string;
  advanceAmount: bigint;
  principal: bigint;
  interest: bigint;
  totalRepayment: bigint;
  requestedAt: bigint;
  repaid: boolean;
}

/**
 * Hook to get advance details for a specific invoice
 */
export function useAdvance(invoiceId: bigint | string | undefined) {
  const chainId = useChainId();
  const addresses = useChainAddresses();
  
  const {
    data: advance,
    isLoading,
    error,
    refetch,
  } = useReadContract({
    address: addresses.AdvanceEngine as `0x${string}`,
    abi: AdvanceEngineABI,
    functionName: 'getAdvance',
    args: invoiceId ? [BigInt(invoiceId.toString())] : undefined,
    chainId,
    query: {
      enabled: !!invoiceId && !!addresses.AdvanceEngine,
      refetchInterval: 120_000,
    },
  });

  // Watch for advance events
  useWatchContractEvent({
    address: addresses.AdvanceEngine as `0x${string}`,
    abi: AdvanceEngineABI,
    eventName: 'AdvanceRequested',
    chainId,
    onLogs() {
      refetch();
    },
  });

  useWatchContractEvent({
    address: addresses.AdvanceEngine as `0x${string}`,
    abi: AdvanceEngineABI,
    eventName: 'AdvanceRepaid',
    chainId,
    onLogs() {
      refetch();
    },
  });

  return {
    advance: advance as Advance | undefined,
    isLoading,
    error,
    refetch,
  };
}

/**
 * Hook to get total debt for a seller
 */
export function useTotalDebt(sellerAddress?: string) {
  const { address } = usePrivyAccount();
  const chainId = useChainId();
  const addresses = useChainAddresses();
  const seller = sellerAddress || address;

  const {
    data: totalDebt,
    isLoading,
    error,
    refetch,
  } = useReadContract({
    address: addresses.AdvanceEngine as `0x${string}`,
    abi: AdvanceEngineABI,
    functionName: 'getTotalDebt',
    args: seller ? [seller as `0x${string}`] : undefined,
    chainId,
    query: {
      enabled: !!seller && !!addresses.AdvanceEngine,
      refetchInterval: 120_000,
    },
  });

  return {
    totalDebt: totalDebt as bigint | undefined,
    isLoading,
    error,
    refetch,
  };
}

/**
 * Hook to request an advance on an invoice
 * Uses Privy's embedded wallet for transaction signing
 */
export function useRequestAdvance() {
  const { sendTransaction } = useSendTransaction();
  const { wallets } = useWallets();
  const chainId = useChainId();
  const addresses = useChainAddresses();
  
  const embeddedWallet = wallets.find(w => {
    const ct = w.connectorType?.toLowerCase() || '';
    const wct = w.walletClientType?.toLowerCase() || '';
    return ct === 'embedded' || wct === 'privy' || ct.includes('privy') || ct.includes('embedded');
  }) || wallets[0];

  const [hash, setHash] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: hash as `0x${string}` | undefined,
    chainId,
    query: {
      enabled: !!hash,
      retry: 5,
      retryDelay: 1000, // Reduced from 2000ms to 1000ms for faster polling
    },
  });

  const requestAdvance = async (
    invoiceId: bigint | string,
    ltvBps: number, // Loan-to-value in basis points (e.g., 7500 = 75%)
    aprBps: number  // APR in basis points (e.g., 1000 = 10%)
  ) => {
    if (!addresses.AdvanceEngine) {
      throw new Error(`AdvanceEngine address not configured for chain ${chainId}`);
    }

    if (!embeddedWallet) {
      throw new Error('No wallet available. Please connect your Privy embedded wallet.');
    }

    setIsPending(true);
    setError(null);

    try {
      const data = encodeFunctionData({
        abi: AdvanceEngineABI,
        functionName: 'requestAdvance',
        args: [BigInt(invoiceId.toString()), BigInt(ltvBps), BigInt(aprBps)],
      });

      let transactionResult;
      try {
        // Check if chain has gas sponsorship enabled (testnets + Arbitrum Mainnet)
        const isGasSponsored = chainId === 5003 || chainId === 421614 || chainId === 11155111 || chainId === 42161;
        const gasLimit = isGasSponsored ? 500000n : undefined; // Manual gas limit for sponsored chains to bypass estimation

        transactionResult = await sendTransaction(
          {
            to: addresses.AdvanceEngine as `0x${string}`,
            data: data,
            value: 0n,
            chainId,
            ...(gasLimit && { gas: gasLimit }), // Set manual gas limit for gas-sponsored chains
          },
          {
            address: embeddedWallet.address,
            sponsor: isGasSponsored, // Enable gas sponsorship for configured chains
            uiOptions: {
              showWalletUIs: false,
            },
          }
        );

        setHash(transactionResult.hash);
        setIsPending(false);
        return transactionResult;
      } catch (txErr: any) {
        // Check if transaction was actually submitted (handle "already known" errors)
        const resultHash = transactionResult?.hash;
        const errorHash = txErr?.hash || 
          txErr?.transactionHash || 
          txErr?.data?.hash || 
          txErr?.receipt?.transactionHash ||
          txErr?.transaction?.hash ||
          txErr?.txHash ||
          txErr?.result?.hash;
        
        const txHash = resultHash || errorHash;
        const errorMessage = txErr?.message || txErr?.shortMessage || String(txErr);
        const errorMsgLower = errorMessage.toLowerCase();
        
        // Handle "already known" / "nonce too low" errors - transaction was submitted successfully
        if (errorMsgLower.includes('already known') || 
            errorMsgLower.includes('nonce too low') || 
            errorMsgLower.includes('replacement transaction underpriced') ||
            errorMsgLower.includes('Transaction appears to have been submitted')) {
          
          if (txHash) {
            console.log('✅ Transaction was submitted successfully despite error:', txHash);
            setHash(txHash);
            setIsPending(false);
            setError(null);
            return { hash: txHash };
          }
          
          // No hash found but transaction was submitted
          console.warn('⚠️ Transaction was submitted but hash not found');
          setIsPending(false);
          setError(null);
          return { hash: undefined };
        }
        
        // Enhanced error handling for "Invalid status" errors
        if (errorMsgLower.includes('invalid status') || errorMsgLower.includes('execution reverted: invalid status')) {
          const enhancedError = new Error(
            'This invoice is no longer eligible for advance. It may have been paid or financed already. Please refresh the page to see the latest status.'
          );
          enhancedError.cause = txErr;
          setError(enhancedError);
          setIsPending(false);
          throw enhancedError;
        }
        
        // If we have a hash, transaction was submitted
        if (txHash) {
          console.log('✅ Transaction submitted with hash:', txHash);
          setHash(txHash);
          setIsPending(false);
          setError(null);
          return { hash: txHash };
        }
        
        // Other errors
        setError(txErr);
        setIsPending(false);
        throw txErr;
      }
    } catch (err: any) {
      // Final catch for any unexpected errors
      setError(err);
      setIsPending(false);
      throw err;
    }
  };

  return {
    requestAdvance,
    hash: hash as `0x${string}` | undefined,
    isPending,
    isConfirming,
    isSuccess,
    error,
  };
}

