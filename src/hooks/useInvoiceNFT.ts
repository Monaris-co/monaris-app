import { useReadContract, useChainId } from 'wagmi'
import { useChainAddresses } from './useChainAddresses'
import { Address } from 'viem'

// InvoiceNFT ABI (simplified - only functions we need)
const INVOICE_NFT_ABI = [
  {
    inputs: [{ internalType: 'uint256', name: 'invoiceId', type: 'uint256' }],
    name: 'getTokenId',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: 'tokenId', type: 'uint256' }],
    name: 'ownerOf',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: 'tokenId', type: 'uint256' }],
    name: 'tokenURI',
    outputs: [{ internalType: 'string', name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

/**
 * Hook to get InvoiceNFT token ID for an invoice
 */
export function useInvoiceNFT(invoiceId?: bigint) {
  const chainId = useChainId();
  const addresses = useChainAddresses();
  
  const { data: tokenId, isLoading, error } = useReadContract({
    address: addresses.InvoiceNFT as Address,
    abi: INVOICE_NFT_ABI,
    functionName: 'getTokenId',
    args: invoiceId ? [invoiceId] : undefined,
    chainId,
    query: {
      enabled: !!invoiceId && !!addresses.InvoiceNFT,
    },
  })

  return {
    tokenId: tokenId as bigint | undefined,
    isLoading,
    error,
    nftAddress: addresses.InvoiceNFT as Address | undefined,
  }
}

