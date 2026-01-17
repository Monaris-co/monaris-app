import { useReadContract, useWaitForTransactionReceipt, useWatchContractEvent, useChainId } from 'wagmi';
import { useWallets, useSendTransaction } from '@privy-io/react-auth';
import { usePrivyAccount } from './usePrivyAccount';
import { useChainAddresses } from './useChainAddresses';
import { StakingABI, USMTPlusABI } from '@/lib/abis';
import { formatUnits, parseUnits, encodeFunctionData } from 'viem';
import { useState } from 'react';

export function useStaking() {
  const { address } = usePrivyAccount();
  const chainId = useChainId();
  const addresses = useChainAddresses();

  const { data: stakedBalance, isLoading: isLoadingStaked } = useReadContract({
    address: addresses.Staking as `0x${string}`,
    abi: StakingABI,
    functionName: 'getStakedBalance',
    args: address ? [address] : undefined,
    chainId,
    query: {
      enabled: !!addresses.Staking && !!address,
      refetchInterval: 30000,
    },
  });

  const { data: susmtBalance, isLoading: isLoadingSusmt } = useReadContract({
    address: addresses.Staking as `0x${string}`,
    abi: StakingABI,
    functionName: 'getSusmtBalance',
    args: address ? [address] : undefined,
    chainId,
    query: {
      enabled: !!addresses.Staking && !!address,
      refetchInterval: 30000,
    },
  });

  const { data: totalStaked } = useReadContract({
    address: addresses.Staking as `0x${string}`,
    abi: StakingABI,
    functionName: 'totalStaked',
    chainId,
    query: {
      enabled: !!addresses.Staking,
      refetchInterval: 30000,
    },
  });

  const isLoading = isLoadingStaked || isLoadingSusmt;

  return {
    stakedBalance: stakedBalance ? parseFloat(formatUnits(stakedBalance, 6)) : 0,
    susmtBalance: susmtBalance ? parseFloat(formatUnits(susmtBalance, 6)) : 0,
    totalStaked: totalStaked ? parseFloat(formatUnits(totalStaked, 6)) : 0,
    isLoading,
  };
}

export function useStake() {
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

  const stake = async (amount: string) => {
    if (!addresses.Staking) {
      throw new Error(`Staking address not configured for chain ${chainId}`);
    }

    if (!embeddedWallet) {
      throw new Error('No wallet available. Please connect your Privy embedded wallet.');
    }

    setIsPending(true);
    setError(null);

    try {
      const amountInWei = parseUnits(amount, 6);

      const data = encodeFunctionData({
        abi: StakingABI,
        functionName: 'stake',
        args: [amountInWei],
      });

      // Check if chain has gas sponsorship enabled (testnets + Arbitrum Mainnet)
      const isGasSponsored = chainId === 5003 || chainId === 421614 || chainId === 11155111 || chainId === 42161;
      const gasLimit = isGasSponsored ? 300000n : undefined; // Manual gas limit for sponsored chains to bypass estimation

      const transactionResult = await sendTransaction(
        {
          to: addresses.Staking as `0x${string}`,
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
    } catch (err: any) {
      setError(err);
      setIsPending(false);
      throw err;
    }
  };

  return {
    stake,
    hash: hash as `0x${string}` | undefined,
    isPending,
    isConfirming,
    isSuccess,
    error,
  };
}

export function useUnstake() {
  const { sendTransaction } = useSendTransaction();
  const { wallets } = useWallets();
  
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

  const unstake = async (amount: string) => {
    if (!addresses.Staking) {
      throw new Error('Staking address not configured');
    }

    if (!embeddedWallet) {
      throw new Error('No wallet available. Please connect your Privy embedded wallet.');
    }

    setIsPending(true);
    setError(null);

    try {
      const amountInWei = parseUnits(amount, 6);

      const data = encodeFunctionData({
        abi: StakingABI,
        functionName: 'unstake',
        args: [amountInWei],
      });

      // Check if chain has gas sponsorship enabled (testnets + Arbitrum Mainnet)
      const isGasSponsored = chainId === 5003 || chainId === 421614 || chainId === 11155111 || chainId === 42161;
      const gasLimit = isGasSponsored ? 300000n : undefined; // Manual gas limit for sponsored chains to bypass estimation

      const transactionResult = await sendTransaction(
        {
          to: addresses.Staking as `0x${string}`,
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
    } catch (err: any) {
      setError(err);
      setIsPending(false);
      throw err;
    }
  };

  return {
    unstake,
    hash: hash as `0x${string}` | undefined,
    isPending,
    isConfirming,
    isSuccess,
    error,
  };
}

export function useUSMTAllowance(spender?: string) {
  const { address } = usePrivyAccount();
  const { sendTransaction } = useSendTransaction();
  const { wallets } = useWallets();
  const chainId = useChainId();
  const addresses = useChainAddresses();

  const embeddedWallet = wallets.find(w => {
    const ct = w.connectorType?.toLowerCase() || '';
    const wct = w.walletClientType?.toLowerCase() || '';
    return ct === 'embedded' || wct === 'privy' || ct.includes('privy') || ct.includes('embedded');
  }) || wallets[0];

  const { data: allowance, refetch } = useReadContract({
    address: addresses.USMTPlus as `0x${string}`,
    abi: USMTPlusABI,
    functionName: 'allowance',
    args: address && spender ? [address, spender as `0x${string}`] : undefined,
    chainId,
    query: {
      enabled: !!address && !!spender && !!addresses.USMTPlus,
      refetchInterval: 15000,
    },
  });

  const [hash, setHash] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: hash as `0x${string}` | undefined,
    chainId,
    query: {
      enabled: !!hash,
    },
  });

  const approve = async (amount: bigint) => {
    if (!spender || !addresses.USMTPlus) {
      throw new Error('Spender or USMTPlus address not configured');
    }

    if (!embeddedWallet) {
      throw new Error('No wallet available. Please connect your Privy embedded wallet.');
    }

    setIsPending(true);

    try {
      const data = encodeFunctionData({
        abi: USMTPlusABI,
        functionName: 'approve',
        args: [spender as `0x${string}`, amount],
      });

      // Check if chain has gas sponsorship enabled (testnets + Arbitrum Mainnet)
      const isGasSponsored = chainId === 5003 || chainId === 421614 || chainId === 11155111 || chainId === 42161;
      const gasLimit = isGasSponsored ? 100000n : undefined; // Manual gas limit for approve (lower than other txs)

      const transactionResult = await sendTransaction(
        {
          to: addresses.USMTPlus as `0x${string}`,
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
    } catch (err: any) {
      setIsPending(false);
      throw err;
    }
  };

  return {
    allowance: allowance || BigInt(0),
    approve,
    hash: hash as `0x${string}` | undefined,
    isPending,
    isConfirming,
    isSuccess,
    refetch,
  };
}

