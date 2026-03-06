import { useState, useEffect, useCallback } from 'react';
import { useReadContract, useWaitForTransactionReceipt, useWatchContractEvent, useChainId, usePublicClient } from 'wagmi';
import { usePrivyAccount } from './usePrivyAccount';
import { useChainAddresses } from './useChainAddresses';
import { InvoiceRegistryABI } from '@/lib/abis';
import { useSendTransaction, useWallets } from '@privy-io/react-auth';
import { encodeFunctionData } from 'viem';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

export type InvoiceStatus = 0 | 1 | 2 | 3; // Issued | Financed | Paid | Cleared

export interface Invoice {
  invoiceId: bigint;
  seller: string;
  buyer: string;
  amount: bigint;
  dueDate: bigint;
  status: InvoiceStatus;
  metadataHash: string;
  createdAt: bigint;
  paidAt: bigint;
  clearedAt: bigint;
}

export function useInvoice(invoiceId: bigint | string | undefined) {
  const { address } = usePrivyAccount();
  const chainId = useChainId();
  const addresses = useChainAddresses();
  
  const {
    data: invoice,
    isLoading,
    error,
    refetch,
  } = useReadContract({
    address: addresses.InvoiceRegistry as `0x${string}`,
    abi: InvoiceRegistryABI,
    functionName: 'getInvoice',
    args: invoiceId ? [BigInt(invoiceId.toString())] : undefined,
    chainId,
    query: {
      enabled: !!invoiceId && !!addresses.InvoiceRegistry,
      refetchInterval: 60_000,
    },
  });

  // Watch for invoice events - simplified to just refetch on any event
  useWatchContractEvent({
    address: addresses.InvoiceRegistry as `0x${string}`,
    abi: InvoiceRegistryABI,
    eventName: 'InvoicePaid',
    chainId,
    onLogs() {
      refetch();
    },
  });

  useWatchContractEvent({
    address: addresses.InvoiceRegistry as `0x${string}`,
    abi: InvoiceRegistryABI,
    eventName: 'InvoiceCleared',
    chainId,
    onLogs() {
      refetch();
    },
  });

  return {
    invoice: invoice as Invoice | undefined,
    isLoading,
    error,
    refetch,
  };
}

export function useCreateInvoice() {
  const { sendTransaction } = useSendTransaction();
  const { wallets } = useWallets();
  const chainId = useChainId();
  const addresses = useChainAddresses();
  
  // Find embedded wallet - prioritize it over any other wallet
  const embeddedWallet = wallets.find(w => {
    const ct = w.connectorType?.toLowerCase() || '';
    const wct = w.walletClientType?.toLowerCase() || '';
    return ct === 'embedded' || 
           wct === 'privy' ||
           ct.includes('privy') ||
           ct.includes('embedded');
  }) || wallets[0]; // Fallback to first wallet if no embedded found

  const [hash, setHash] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [lastSubmittedData, setLastSubmittedData] = useState<string | null>(null); // Prevent duplicate submissions
  const [txSubmittedNoHash, setTxSubmittedNoHash] = useState(false); // Flag when tx submitted but hash unknown

  const { isLoading: isConfirming, isSuccess, data: receipt } = useWaitForTransactionReceipt({
    hash: hash as `0x${string}` | undefined,
    chainId, // Use current chain ID
    query: {
      enabled: !!hash, // Only watch when hash exists
      retry: 5, // More retries for reliability
      retryDelay: 1000, // Reduced from 2000ms to 1000ms for faster polling
    },
  });

  const createInvoice = async (
    buyer: string,
    amount: string, // Amount in USDC (6 decimals)
    dueDate: number, // Unix timestamp
    metadataHash?: string
  ) => {
    if (!addresses.InvoiceRegistry) {
      throw new Error(`InvoiceRegistry address not configured for chain ${chainId}`);
    }

    if (!embeddedWallet) {
      throw new Error('No wallet available. Please connect your Privy embedded wallet.');
    }

    setIsPending(true);
    setError(null);

    try {
      // Convert amount to 6 decimals (USDC format)
      const amountInWei = BigInt(Math.floor(parseFloat(amount) * 1e6));
      
      // Encode function data
      const data = encodeFunctionData({
        abi: InvoiceRegistryABI,
        functionName: 'createInvoice',
        args: [
          buyer as `0x${string}`,
          amountInWei,
          BigInt(dueDate),
          metadataHash || '0x0000000000000000000000000000000000000000000000000000000000000000',
        ],
      });

      // Create a unique key for this transaction to prevent duplicates
      const txKey = `${buyer}-${amountInWei}-${dueDate}`;
      
      // Prevent duplicate submissions
      if (lastSubmittedData === txKey && hash) {
        console.log('Transaction already submitted, returning existing hash');
        setIsPending(false);
        return { hash: hash as `0x${string}` };
      }
      
      setLastSubmittedData(txKey);

      // Send transaction using Privy's sendTransaction (uses embedded wallet)
      // With noPromptOnSignature: true in config, transactions should sign automatically without pop-ups
      // Use current chain ID
      let transactionResult;
      try {
        // For gas-sponsored chains (testnets and mainnets with sponsorship enabled), set manual gas limit
        // to bypass balance check during estimation. Privy will still sponsor the actual gas fees,
        // but this prevents estimation from failing when wallet has 0 native token balance.
        const isGasSponsored = chainId === 5003 || chainId === 421614 || chainId === 11155111 || chainId === 42161;
        const gasLimit = isGasSponsored ? 3000000n : undefined; // 3M gas for invoice creation + NFT mint

        // First attempt: Let Privy estimate gas automatically (or use manual limit for gas-sponsored chains)
        transactionResult = await sendTransaction(
        {
          to: addresses.InvoiceRegistry as `0x${string}`,
          data: data,
          value: 0n,
          chainId,
          ...(gasLimit && { gas: gasLimit }), // Set manual gas limit for gas-sponsored chains to bypass estimation
        },
        {
          address: embeddedWallet.address, // Explicitly use embedded wallet
          sponsor: isGasSponsored, // Enable gas sponsorship for configured chains (testnets + Arbitrum Mainnet)
          uiOptions: {
            showWalletUIs: false, // CRITICAL: Hide transaction modal - transactions should auto-sign for embedded wallets
          },
        }
      );

        // Success! Set hash and return
        setHash(transactionResult.hash);
      setIsPending(false);
        return transactionResult;
    } catch (err: any) {
        // Transaction might have been submitted even if error was thrown
        // Try to extract hash from result (some libraries return result before throwing)
        const resultHash = transactionResult?.hash;
        
        // Also check error object for hash
        const errorHash = err?.hash || 
          err?.transactionHash || 
          err?.data?.hash || 
          err?.receipt?.transactionHash ||
          err?.transaction?.hash ||
          err?.txHash ||
          err?.result?.hash ||
          err?.response?.hash ||
          (err?.data && typeof err.data === 'object' ? err.data.hash : null);
        
        const txHash = resultHash || errorHash;
        
        // Handle gas estimation errors - RPC might not support eth_estimateGas
        // Or the transaction might be reverting due to contract state issues
        if (err?.message?.includes('eth_estimateGas') || 
            err?.message?.includes('EstimateGasExecutionError') ||
            err?.message?.includes('execution reverted') ||
            err?.code === -32601) {
          
          // If it's an execution revert, provide helpful error message
          if (err?.message?.includes('execution reverted')) {
            console.error('❌ Transaction would revert:', err);
            setIsPending(false);
            setError(new Error(
              'Transaction would fail. Possible causes: ' +
              '1) InvoiceNFT contract not properly configured (MINTER_ROLE or invoiceRegistry not set), ' +
              '2) Invalid invoice parameters, ' +
              '3) Contract address mismatch. Please verify contract deployment.'
            ));
            throw err;
          }
          
          // If gas estimation fails with unreasonable values, try with a reasonable manual limit
          if (err?.message?.includes('intrinsic gas too low') || 
              err?.message?.includes('gas too low')) {
            console.warn('⚠️ Gas estimation issue detected. Retrying with reasonable gas limit...');
            try {
              // Retry with a reasonable gas limit for invoice creation + NFT minting
              transactionResult = await sendTransaction(
              {
                to: addresses.InvoiceRegistry as `0x${string}`,
                data: data,
                value: 0n,
                chainId,
                gas: 3000000n, // 3M gas should be more than enough for invoice creation + NFT mint
              },
              {
                address: embeddedWallet.address,
                uiOptions: {
                  showWalletUIs: false,
                },
              }
              );
              setHash(transactionResult.hash);
              setIsPending(false);
              return transactionResult;
            } catch (retryErr: any) {
              console.error('❌ Retry with manual gas also failed:', retryErr);
              setIsPending(false);
              setError(new Error('Transaction failed. Please try again or check contract configuration.'));
              throw retryErr;
            }
          }
          
          console.warn('⚠️ Gas estimation failed (RPC may not support it). Transaction may still work if sent directly.');
          setIsPending(false);
          setError(new Error('Gas estimation failed. Please try again or check if the transaction was submitted.'));
          throw err;
        }
        
        // Handle "already known" error - transaction WAS submitted successfully
        if (err?.message?.includes('already known') || 
            err?.message?.includes('nonce too low') || 
            err?.message?.includes('replacement transaction underpriced') ||
            err?.message?.includes('Transaction appears to have been submitted')) {
          
          console.warn('⚠️ RPC returned "already known" - transaction was submitted successfully', {
            error: err,
            resultHash,
            errorHash,
            txHash,
          });
          
      if (txHash) {
            // Found the hash! Transaction was submitted
            console.log('✅ Found transaction hash, transaction was submitted:', txHash);
        setHash(txHash);
            setIsPending(false);
            setError(null);
        return { hash: txHash };
      }
      
          // No hash found, but transaction was submitted
          // Set flag so component can try to find it via alternative methods
          console.warn('⚠️ Transaction was submitted but hash not found. Will attempt to find it.');
          setIsPending(false);
        setError(null);
          setTxSubmittedNoHash(true); // Set flag so component can handle it
          // Return undefined hash but transaction was submitted
          return { hash: undefined };
        }
        
        // If we have a hash from anywhere, transaction was submitted
        if (txHash) {
          console.log('✅ Transaction submitted successfully with hash:', txHash);
          setHash(txHash);
        setIsPending(false);
          setError(null);
          return { hash: txHash };
        }
        
        // Handle temporary RPC errors (500 status, "Temporary internal error")
        const errorMessage = err?.message || String(err || '');
        const errorMsgLower = errorMessage.toLowerCase();
        const errorString = String(err || '');
        const errorStringLower = errorString.toLowerCase();
        
        // Check for various forms of temporary RPC errors
        const status500 = errorMessage.includes('Status: 500') || 
                         errorMessage.includes('status 500') ||
                         errorString.includes('Status: 500') ||
                         errorString.includes('status 500') ||
                         err?.status === 500 ||
                         err?.response?.status === 500;
        const isTemporaryRpcError = status500 || 
                                    errorMsgLower.includes('temporary internal error') ||
                                    errorStringLower.includes('temporary internal error') ||
                                    errorMsgLower.includes('please retry') ||
                                    errorStringLower.includes('please retry') ||
                                    err?.code === 19 ||
                                    err?.cause?.code === 19 ||
                                    (err?.cause && String(err.cause).includes('500')) ||
                                    (err?.details && String(err.details).includes('Temporary internal error'));
        
        if (isTemporaryRpcError) {
          console.warn('⚠️ Temporary RPC error detected. Suggesting retry...', {
            error: err,
            message: errorMessage,
            errorString,
            code: err?.code,
            status: err?.status,
          });
          const retryError = new Error(
            'Network temporarily unavailable. This is usually a temporary issue. Please wait a moment and try again.'
          );
          retryError.cause = err;
          setError(retryError);
          setIsPending(false);
          throw retryError;
        }
        
        // Handle insufficient funds error (reuse errorMessage declared above)
        // Check error message, details, cause, and nested error strings
        const errorDetails = err?.details ? String(err.details) : '';
        const errorCause = err?.cause ? String(err.cause) : '';
        const errorCauseLower = errorCause.toLowerCase();
        const errorDetailsLower = errorDetails.toLowerCase();
        
        const isInsufficientFunds = errorMsgLower.includes('insufficient funds') ||
                                   errorMsgLower.includes('insufficient balance') ||
                                   errorMessage.includes('overshot') ||
                                   errorStringLower.includes('insufficient funds') ||
                                   errorStringLower.includes('insufficient balance') ||
                                   errorStringLower.includes('overshot') ||
                                   errorDetailsLower.includes('insufficient funds') ||
                                   errorDetailsLower.includes('insufficient balance') ||
                                   errorDetailsLower.includes('overshot') ||
                                   errorCauseLower.includes('insufficient funds') ||
                                   errorCauseLower.includes('insufficient balance') ||
                                   errorCauseLower.includes('overshot') ||
                                   (err?.details && String(err.details).includes('insufficient funds'));
        
        if (isInsufficientFunds) {
          console.warn('⚠️ Insufficient funds for gas detected:', {
            error: err,
            message: errorMessage,
          });
          const fundsError = new Error(
            'Insufficient funds for gas fees. Please add more MNT (Mantle native token) to your wallet to cover transaction fees.'
          );
          fundsError.cause = err;
          setError(fundsError);
          setIsPending(false);
          throw fundsError;
        }
        
        // Handle user rejection
        if (err?.message?.includes('user rejected') || err?.message?.includes('User denied')) {
        setError(new Error('Transaction was rejected. Please try again.'));
          setIsPending(false);
        throw err;
        }
        
        // Other errors
        setError(err);
        setIsPending(false);
        throw err;
      }
    } catch (err: any) {
      // Final catch for any unexpected errors
      setIsPending(false);
      setError(err);
      throw err;
    }
  };

  // Log state changes for debugging
  useEffect(() => {
    if (hash) {
      console.log('📝 Invoice creation state:', {
        hash,
        isPending,
        isConfirming,
        isSuccess,
        receiptStatus: receipt?.status,
        error: error?.message,
      });
    }
  }, [hash, isPending, isConfirming, isSuccess, receipt, error]);

  return {
    createInvoice,
    hash: hash as `0x${string}` | undefined,
    isPending,
    isConfirming,
    isSuccess: isSuccess || (receipt?.status === 'success'), // Fallback check
    error,
    receipt, // Expose receipt for additional checks
    txSubmittedNoHash, // Expose flag for component to handle missing hash case
  };
}

export function useSellerInvoices(sellerAddress?: string) {
  const { address } = usePrivyAccount();
  const chainId = useChainId();
  const addresses = useChainAddresses();
  const seller = sellerAddress || address;

  const {
    data: invoiceIds,
    isLoading,
    error,
    refetch,
  } = useReadContract({
    address: addresses.InvoiceRegistry as `0x${string}`,
    abi: InvoiceRegistryABI,
    functionName: 'getSellerInvoices',
    args: seller ? [seller as `0x${string}`] : undefined,
    chainId,
    query: {
      enabled: !!seller && !!addresses.InvoiceRegistry,
      refetchInterval: 60_000,
    },
  });

  return {
    invoiceIds: invoiceIds as bigint[] | undefined,
    isLoading,
    error,
    refetch,
  };
}

// Hook to fetch all seller invoices with full data
export function useSellerInvoicesWithData(sellerAddress?: string) {
  const { invoiceIds, isLoading: isLoadingIds, error: idsError, refetch: refetchIds } = useSellerInvoices(sellerAddress);
  const chainId = useChainId();
  const addresses = useChainAddresses();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [isLoadingInvoices, setIsLoadingInvoices] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const publicClient = usePublicClient({ chainId });

  // Fetch invoice data for each ID
  useEffect(() => {
    if (!invoiceIds || invoiceIds.length === 0 || !addresses.InvoiceRegistry || !publicClient) {
      setInvoices([]);
      setIsLoadingInvoices(false);
      return;
    }

    setIsLoadingInvoices(true);
    setError(null);

    const fetchInvoices = async () => {
      try {
        // Fetch all invoices in parallel with timeout
        const invoicePromises = invoiceIds.map(async (invoiceId) => {
          try {
            // Add timeout to prevent hanging
            const timeoutPromise = new Promise<null>((_, reject) => 
              setTimeout(() => reject(new Error('Timeout')), 10000)
            );
            
            const fetchPromise = publicClient.readContract({
              address: addresses.InvoiceRegistry as `0x${string}`,
              abi: InvoiceRegistryABI,
              functionName: 'getInvoice',
              args: [invoiceId],
            }) as Promise<Invoice>;
            
            const invoice = await Promise.race([fetchPromise, timeoutPromise]) as Invoice;
            return invoice;
          } catch (err) {
            console.error(`Error fetching invoice ${invoiceId}:`, err);
            return null;
          }
        });

        const fetchedInvoices = await Promise.all(invoicePromises);
        // Filter out null values and sort by createdAt (newest first)
        const validInvoices = fetchedInvoices
          .filter((inv): inv is Invoice => inv !== null)
          .sort((a, b) => {
            const aTime = Number(a.createdAt);
            const bTime = Number(b.createdAt);
            return bTime - aTime; // Newest first
          });

        setInvoices(validInvoices);
      } catch (err) {
        console.error('Error fetching invoices:', err);
        setError(err instanceof Error ? err : new Error('Failed to fetch invoices'));
      } finally {
        setIsLoadingInvoices(false);
      }
    };

    // Add a small delay to batch requests
    const timeoutId = setTimeout(fetchInvoices, 100);
    return () => clearTimeout(timeoutId);
  }, [invoiceIds, publicClient, addresses.InvoiceRegistry]);

  // Watch for invoice events to refetch (simplified to reduce load)
  // Only watch for critical events and debounce refetches
  useWatchContractEvent({
    address: addresses.InvoiceRegistry as `0x${string}`,
    abi: InvoiceRegistryABI,
    eventName: 'InvoiceCreated',
    chainId,
    onLogs() {
      // Debounce refetch to avoid rapid calls
      setTimeout(() => refetchIds(), 1000);
    },
  });

  useWatchContractEvent({
    address: addresses.InvoiceRegistry as `0x${string}`,
    abi: InvoiceRegistryABI,
    eventName: 'InvoiceCleared',
    chainId,
    onLogs() {
      // Debounce refetch to avoid rapid calls
      setTimeout(() => refetchIds(), 2000);
    },
  });

  return {
    invoices,
    isLoading: isLoadingIds || isLoadingInvoices,
    error: idsError || error,
    refetch: refetchIds,
  };
}

// ─── Supabase-backed types & hooks ────────────────────────────────────────────

export interface SupabaseInvoice {
  id: string;
  chain_invoice_id: number | null;
  chain_id: number;
  seller_address: string;
  buyer_address: string;
  amount: number;
  due_date: string;
  status: string;
  tx_hash: string | null;
  buyer_name: string | null;
  buyer_email: string | null;
  memo: string | null;
  line_items: { description: string; quantity: number; rate: number }[] | null;
  is_draft: boolean;
  seller_name: string | null;
  invoice_number: string | null;
  created_at: string;
  updated_at: string;
}

export function useSellerSupabaseInvoices(sellerAddress?: string) {
  const { address } = usePrivyAccount();
  const chainId = useChainId();
  const seller = (sellerAddress || address)?.toLowerCase();
  const [invoices, setInvoices] = useState<SupabaseInvoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchInvoices = useCallback(async () => {
    if (!seller || !isSupabaseConfigured()) {
      setInvoices([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const { data, error: err } = await supabase
        .from('invoices')
        .select('*')
        .eq('seller_address', seller)
        .order('updated_at', { ascending: false });
      if (err) throw new Error(err.message);
      setInvoices((data as SupabaseInvoice[]) || []);
      setError(null);
    } catch (e: any) {
      setError(e);
    } finally {
      setIsLoading(false);
    }
  }, [seller]);

  useEffect(() => { fetchInvoices(); }, [fetchInvoices]);

  return { invoices, isLoading, error, refetch: fetchInvoices };
}

export function useBuyerInvoices(buyerAddress?: string) {
  const { address } = usePrivyAccount();
  const buyer = (buyerAddress || address)?.toLowerCase();
  const [invoices, setInvoices] = useState<SupabaseInvoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchInvoices = useCallback(async () => {
    if (!buyer || !isSupabaseConfigured()) {
      setInvoices([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const { data, error: err } = await supabase
        .from('invoices')
        .select('*')
        .eq('buyer_address', buyer)
        .eq('is_draft', false)
        .neq('status', 'rejected')
        .order('created_at', { ascending: false });
      if (err) throw new Error(err.message);
      setInvoices((data as SupabaseInvoice[]) || []);
      setError(null);
    } catch (e: any) {
      setError(e);
    } finally {
      setIsLoading(false);
    }
  }, [buyer]);

  useEffect(() => { fetchInvoices(); }, [fetchInvoices]);

  return { invoices, isLoading, error, refetch: fetchInvoices };
}

export function useSupabaseInvoice(invoiceUuid?: string) {
  const [invoice, setInvoice] = useState<SupabaseInvoice | null>(null);
  const [isLoading, setIsLoading] = useState(!!invoiceUuid);
  const [error, setError] = useState<Error | null>(null);

  const fetchInvoice = useCallback(async () => {
    if (!invoiceUuid || !isSupabaseConfigured()) {
      setInvoice(null);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const { data, error: err } = await supabase
        .from('invoices')
        .select('*')
        .eq('id', invoiceUuid)
        .single();
      if (err) throw new Error(err.message);
      setInvoice(data as SupabaseInvoice);
      setError(null);
    } catch (e: any) {
      setError(e);
    } finally {
      setIsLoading(false);
    }
  }, [invoiceUuid]);

  useEffect(() => { fetchInvoice(); }, [fetchInvoice]);

  return { invoice, isLoading, error, refetch: fetchInvoice };
}

export async function saveDraftInvoice(data: {
  id?: string;
  chain_id: number;
  seller_address: string;
  buyer_address: string;
  amount: number;
  due_date: string;
  buyer_name?: string;
  buyer_email?: string;
  memo?: string;
  line_items?: { description: string; quantity: number; rate: number }[];
  seller_name?: string;
  invoice_number?: string;
}): Promise<{ id: string } | null> {
  if (!isSupabaseConfigured()) return null;

  const row = {
    chain_id: data.chain_id,
    seller_address: data.seller_address.toLowerCase(),
    buyer_address: data.buyer_address.toLowerCase(),
    amount: data.amount,
    due_date: data.due_date,
    status: 'draft',
    is_draft: true,
    buyer_name: data.buyer_name || null,
    buyer_email: data.buyer_email || null,
    memo: data.memo || null,
    line_items: data.line_items || null,
    seller_name: data.seller_name || null,
    invoice_number: data.invoice_number || null,
    updated_at: new Date().toISOString(),
  };

  if (data.id) {
    const { error } = await supabase
      .from('invoices')
      .update(row)
      .eq('id', data.id);
    if (error) throw new Error(error.message);
    return { id: data.id };
  }

  const { data: inserted, error } = await supabase
    .from('invoices')
    .insert({ ...row, chain_invoice_id: null })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  return inserted as { id: string };
}

export async function publishDraftOnChain(
  invoiceUuid: string,
  chainInvoiceId: number,
  txHash: string,
): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const { error } = await supabase
    .from('invoices')
    .update({
      chain_invoice_id: chainInvoiceId,
      is_draft: false,
      status: 'issued',
      tx_hash: txHash,
      updated_at: new Date().toISOString(),
    })
    .eq('id', invoiceUuid);
  if (error) throw new Error(error.message);
}

export async function deleteDraftInvoice(invoiceUuid: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const { error } = await supabase
    .from('invoices')
    .delete()
    .eq('id', invoiceUuid)
    .eq('is_draft', true);
  if (error) throw new Error(error.message);
}

export async function rejectInvoice(
  invoiceUuid: string,
  sellerAddress: string,
  invoiceNumber: string,
): Promise<void> {
  if (!isSupabaseConfigured()) return;

  const { error: updateErr } = await supabase
    .from('invoices')
    .update({ status: 'rejected', updated_at: new Date().toISOString() })
    .eq('id', invoiceUuid);
  if (updateErr) throw new Error(updateErr.message);

  await supabase.from('notifications').insert({
    recipient_address: sellerAddress.toLowerCase(),
    type: 'invoice_rejected',
    title: 'Invoice Rejected',
    message: `Buyer rejected invoice ${invoiceNumber || invoiceUuid.slice(0, 8)}`,
    invoice_id: invoiceUuid,
  });
}

export async function getNextInvoiceNumber(sellerAddress: string): Promise<string> {
  if (!isSupabaseConfigured()) return 'INV-0001';
  const { count } = await supabase
    .from('invoices')
    .select('id', { count: 'exact', head: true })
    .eq('seller_address', sellerAddress.toLowerCase());
  const num = (count || 0) + 1;
  return `INV-${num.toString().padStart(4, '0')}`;
}

