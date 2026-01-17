import { useState, useEffect } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { motion } from "framer-motion"
import { 
  ArrowLeft, 
  CheckCircle2, 
  Clock, 
  DollarSign,
  Loader2,
  ExternalLink,
  Copy,
  AlertCircle,
  Calendar,
  User,
  Sparkles,
  Wallet,
  CreditCard,
  Building2,
  Download,
  MoreHorizontal
} from "lucide-react"
import { downloadInvoicePDF } from "@/lib/generateInvoicePDF"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useInvoice } from "@/hooks/useInvoice"
import { useInvoiceNFT } from "@/hooks/useInvoiceNFT"
import { useReadContract, useWaitForTransactionReceipt, usePublicClient, useChainId, useSwitchChain } from "wagmi"
import { useSendTransaction, useWallets, usePrivy } from "@privy-io/react-auth"
import { usePrivyAccount } from "@/hooks/usePrivyAccount"
import { useChainAddresses } from "@/hooks/useChainAddresses"
import { DemoUSDCABI, USDCABI, getUSDCABI, SettlementRouterABI, InvoiceRegistryABI, AdvanceEngineABI, VaultABI } from "@/lib/abis"
import { formatUnits, parseUnits, isAddress, encodeFunctionData } from "viem"
import { toast } from "sonner"
import { Link } from "react-router-dom"
import { getExplorerUrl, getExplorerAddressUrl, getPaymentLink, CHAIN_IDS } from "@/lib/chain-utils"
import { useSearchParams } from "react-router-dom"

const STATUS_LABELS = {
  0: "Issued",
  1: "Financed",
  2: "Paid",
  3: "Cleared",
}

type PaymentMethod = "privy" | "card" | "bank"

export default function PayInvoice() {
  const params = useParams<{ invoiceId?: string; chainId?: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { address } = usePrivyAccount()
  
  // Extract invoiceId and chainId from URL params
  // Support both formats: /pay/:chainId/:invoiceId and /pay/:invoiceId
  // When route is /pay/:chainId/:invoiceId, params.chainId = chainId, params.invoiceId = invoiceId
  // When route is /pay/:invoiceId (old format), params.invoiceId = invoiceId, params.chainId = undefined
  let invoiceId: string | undefined
  let urlChainIdParam: string | undefined
  
  if (params.chainId && params.invoiceId) {
    // New format: /pay/:chainId/:invoiceId
    urlChainIdParam = params.chainId
    invoiceId = params.invoiceId
  } else if (params.invoiceId) {
    // Old format: /pay/:invoiceId (backward compatibility)
    invoiceId = params.invoiceId
    urlChainIdParam = undefined
  } else {
    // Fallback (shouldn't happen, but handle gracefully)
    invoiceId = undefined
    urlChainIdParam = undefined
  }
  
  const queryChainId = searchParams.get('chainId')
  const targetChainId = urlChainIdParam || queryChainId ? parseInt(urlChainIdParam || queryChainId || '0', 10) : null
  
  const { invoice, isLoading: isLoadingInvoice } = useInvoice(invoiceId)
  const { tokenId, nftAddress, isLoading: isLoadingNFT } = useInvoiceNFT(invoiceId ? BigInt(invoiceId) : undefined)
  const { sendTransaction } = useSendTransaction()
  const { wallets } = useWallets()
  const { login, logout, ready, authenticated } = usePrivy()
  
  // Check if actually logged in - use address or wallets as the source of truth
  const isActuallyLoggedIn = authenticated && (address || wallets.length > 0)
  const currentChainId = useChainId()
  const addresses = useChainAddresses()
  const publicClient = usePublicClient({ chainId: currentChainId })
  const { switchChain } = useSwitchChain()
  
  // Determine the correct chain ID to use
  // Priority: URL param > query param > invoice's chain (if available) > current chain
  const chainId = targetChainId && targetChainId > 0 ? targetChainId : currentChainId
  
  // Auto-switch chain if URL has a different chainId than current chain
  useEffect(() => {
    if (targetChainId && targetChainId !== currentChainId && switchChain && Object.values(CHAIN_IDS).includes(targetChainId)) {
      console.log(`[PayInvoice] Auto-switching chain from ${currentChainId} to ${targetChainId} based on URL`)
      try {
        const result = switchChain({ chainId: targetChainId })
        // Check if result is a promise before calling .catch()
        if (result && typeof result.catch === 'function') {
          result.catch((error) => {
            console.error('[PayInvoice] Failed to auto-switch chain:', error)
            toast.error('Failed to switch chain', {
              description: `Please manually switch to chain ${targetChainId} to pay this invoice.`,
              duration: 8000,
            })
          })
        }
      } catch (error) {
        console.error('[PayInvoice] Error calling switchChain:', error)
        // switchChain might not be available yet, skip auto-switch
      }
    }
  }, [targetChainId, currentChainId, switchChain])
  
  // Update URL to include chainId if it's missing (for backward compatibility)
  useEffect(() => {
    if (invoiceId && targetChainId && targetChainId > 0 && currentChainId === targetChainId) {
      // If we're using the correct chain but URL doesn't have chainId, update it
      const expectedPath = `/pay/${targetChainId}/${invoiceId}`
      const currentPath = window.location.pathname
      if (currentPath !== expectedPath && !currentPath.startsWith(`/pay/${targetChainId}/`)) {
        // Only update if we're not already on the correct format
        navigate(expectedPath, { replace: true })
      }
    }
  }, [invoiceId, targetChainId, currentChainId, navigate])
  
  // Find the wallet that matches the currently connected address
  // This ensures we use the wallet the user actually connected (could be MetaMask, Privy, etc.)
  const connectedWallet = address 
    ? wallets.find(w => w.address.toLowerCase() === address.toLowerCase()) || wallets[0]
    : wallets[0]
  
  // Check if wallet is an embedded (Privy) wallet - only embedded wallets support gas sponsorship
  const isEmbeddedWallet = connectedWallet?.walletClientType === 'privy' || 
                           connectedWallet?.connectorType === 'embedded'
  
  // Check if contracts are configured for current chain
  useEffect(() => {
    if (authenticated && address && (!addresses.InvoiceRegistry || !addresses.SettlementRouter || !addresses.DemoUSDC)) {
      toast.error("Contracts Not Configured", {
        description: `Contract addresses are not configured for chain ${chainId}. Please switch to a supported chain or configure addresses.`,
        duration: 10000,
      })
    }
  }, [authenticated, address, chainId, addresses.InvoiceRegistry, addresses.SettlementRouter, addresses.DemoUSDC])
  
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("privy")
  const [cardNumber, setCardNumber] = useState("")
  const [cardExpiry, setCardExpiry] = useState("")
  const [cardCVC, setCardCVC] = useState("")
  const [step, setStep] = useState<"approve" | "pay" | "complete">("approve")
  const [approveHash, setApproveHash] = useState<`0x${string}` | null>(null)
  const [payHash, setPayHash] = useState<`0x${string}` | null>(null)
  const [isApproving, setIsApproving] = useState(false)
  const [isPaying, setIsPaying] = useState(false)
  
  // Get correct USDC ABI based on chain (real USDC for mainnet, DemoUSDC for testnet)
  const usdcABI = getUSDCABI(chainId)
  
  // Check allowance
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: addresses.DemoUSDC as `0x${string}`,
    abi: usdcABI,
    functionName: "allowance",
    args: address && addresses.SettlementRouter 
      ? [address, addresses.SettlementRouter as `0x${string}`]
      : undefined,
    chainId,
    query: {
      enabled: !!address && !!addresses.SettlementRouter && !!invoice,
      refetchInterval: 10000, // Reduced frequency to avoid rate limits
    },
  })
  
  const { isLoading: isApprovalConfirming } = useWaitForTransactionReceipt({
    hash: approveHash,
  })

  const { 
    isLoading: isPaymentConfirming, 
    isSuccess: isPaymentConfirmed,
    isError: isPaymentError,
    error: paymentError
  } = useWaitForTransactionReceipt({
    hash: payHash,
    chainId,
    query: {
      enabled: !!payHash, // Only wait if we have a transaction hash
    },
  })

  // Determine if approval is needed
  const needsApproval = invoice && allowance !== undefined && 
    allowance < invoice.amount && (invoice.status === 0 || invoice.status === 1)

  // Check for pending transactions on mount (recovery mechanism)
  useEffect(() => {
    if (invoiceId) {
      try {
        const pendingTxStr = localStorage.getItem(`pending_payment_${invoiceId}`)
        if (pendingTxStr) {
          const pendingTx = JSON.parse(pendingTxStr)
          // If pending tx is less than 30 minutes old, show a notice
          if (Date.now() - pendingTx.timestamp < 30 * 60 * 1000) {
            console.log('[Recovery] Found pending transaction:', pendingTx)
            toast.info("Pending transaction found", {
              description: (
                <div>
                  <p>A payment transaction was submitted recently.</p>
                  <a 
                    href={`https://arbiscan.io/tx/${pendingTx.txHash}`} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-primary underline"
                  >
                    Check status on Arbiscan →
                  </a>
                </div>
              ),
              duration: 15000,
            })
            // Set the hash so we can track it
            if (!payHash) {
              setPayHash(pendingTx.txHash as `0x${string}`)
            }
          } else {
            // Old pending tx, remove it
            localStorage.removeItem(`pending_payment_${invoiceId}`)
          }
        }
      } catch (e) {
        console.warn('Error checking pending transactions:', e)
      }
    }
  }, [invoiceId])

  // Watch for status changes
  useEffect(() => {
    if (invoice?.status === 2 || invoice?.status === 3) {
      setStep("complete")
      // Clear any pending transaction record
      if (invoiceId) {
        localStorage.removeItem(`pending_payment_${invoiceId}`)
      }
    }
  }, [invoice?.status, invoiceId])

  // Handle approval success
  useEffect(() => {
    if (approveHash && !isApprovalConfirming) {
      toast.success("USDC approved!", {
        description: "You can now pay the invoice",
      })
      refetchAllowance()
      setStep("pay")
    }
  }, [approveHash, isApprovalConfirming, refetchAllowance])

  // Handle payment transaction confirmation - ONLY show success when transaction is confirmed on-chain
  useEffect(() => {
    if (payHash && isPaymentConfirmed) {
      // Transaction is confirmed on-chain
      console.log('[Payment] Transaction confirmed on-chain:', payHash)
      toast.success("Payment confirmed!", {
        description: "Settlement is being finalized on-chain.",
      })
      setStep("complete")
      // Clear pending transaction record
      if (invoiceId) {
        localStorage.removeItem(`pending_payment_${invoiceId}`)
        setTimeout(() => {
          window.location.reload() // Force refresh to get latest invoice status
        }, 2000)
      }
    } else if (payHash && isPaymentError) {
      // Transaction failed on-chain
      console.error("Payment transaction failed:", paymentError)
      toast.error("Payment failed", {
        description: (
          <div>
            <p>{paymentError?.message || "Transaction was reverted."}</p>
            <a 
              href={`https://arbiscan.io/tx/${payHash}`} 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-primary underline"
            >
              View on Arbiscan →
            </a>
          </div>
        ),
        duration: 10000,
      })
      setIsPaying(false)
      // Don't clear the hash immediately - let user check on Arbiscan
      if (invoiceId) {
        localStorage.removeItem(`pending_payment_${invoiceId}`)
      }
    }
  }, [payHash, isPaymentConfirmed, isPaymentError, paymentError, invoiceId])

  const handleApprove = async () => {
    if (!invoice || !addresses.DemoUSDC || !addresses.SettlementRouter) {
      toast.error("Missing contract addresses")
      return
    }

    if (!address) {
      toast.error("Please connect your wallet first")
      return
    }

    if (!connectedWallet) {
      toast.error("No wallet available")
      return
    }

    // Ensure the connected wallet address matches the active address
    if (connectedWallet.address.toLowerCase() !== address.toLowerCase()) {
      toast.error("Wallet address mismatch", {
        description: "Please ensure you're using the connected wallet"
      })
      return
    }

    setIsApproving(true)
    try {
      const data = encodeFunctionData({
        abi: usdcABI,
        functionName: "approve",
        args: [
          addresses.SettlementRouter as `0x${string}`,
          invoice.amount,
        ],
      })

      // Check if chain has gas sponsorship enabled (testnets + Arbitrum Mainnet)
      // BUT only embedded wallets support sponsorship - external wallets (MetaMask, WalletConnect) do NOT
      const chainSupportsSponsorship = chainId === 5003 || chainId === 421614 || chainId === 11155111 || chainId === 42161;
      const canUseSponsoredTx = chainSupportsSponsorship && isEmbeddedWallet;

      // For external wallets, use their native provider directly
      if (!isEmbeddedWallet && connectedWallet) {
        try {
          // Get the wallet's ethereum provider
          const provider = await connectedWallet.getEthereumProvider()
          
          console.log('[Approval] Verifying wallet connection...')
          
          // IMPORTANT: First verify the connection is active by requesting accounts
          // This ensures WalletConnect session is properly established
          try {
            const accounts = await provider.request({ method: 'eth_accounts' })
            if (!accounts || accounts.length === 0) {
              // Try to request account access
              await provider.request({ method: 'eth_requestAccounts' })
            }
            console.log('[Approval] Wallet connection verified, accounts:', accounts)
          } catch (connError: any) {
            console.error('[Approval] Connection verification failed:', connError)
            toast.error("Wallet not connected", {
              description: "Please check your wallet app and approve the connection, then try again.",
              duration: 8000,
            })
            return
          }
          
          console.log('[Approval] Sending approval via external wallet provider...')
          toast.info("Check your wallet", {
            description: "Please confirm the approval transaction in your wallet app.",
            duration: 10000,
          })
          
          // Send transaction via the wallet's provider
          const txHash = await provider.request({
            method: 'eth_sendTransaction',
            params: [{
              from: address,
              to: addresses.DemoUSDC,
              data: data,
              value: '0x0',
            }],
          })
          
          console.log('[Approval] Transaction submitted:', txHash)
          
          setApproveHash(txHash as `0x${string}`)
          toast.success("Approval transaction submitted!", {
            description: (
              <div>
                <a 
                  href={`https://arbiscan.io/tx/${txHash}`} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-primary underline"
                >
                  View on Arbiscan →
                </a>
              </div>
            ),
            duration: 10000,
          })
          return
        } catch (providerError: any) {
          console.error("Provider transaction error:", providerError)
          // If "not authorized" error, prompt user to reconnect
          if (providerError.message?.includes('not been authorized') || 
              providerError.message?.includes('eth_accounts')) {
            toast.error("Wallet not authorized", {
              description: "Please disconnect and reconnect your wallet, then approve the connection request.",
              duration: 8000,
            })
            return
          }
          // User rejected
          if (providerError.code === 4001 || providerError.message?.includes('rejected')) {
            toast.error("Transaction rejected", {
              description: "You rejected the transaction in your wallet.",
              duration: 5000,
            })
            return
          }
          throw providerError
        }
      }

      // For embedded wallets, use Privy's sendTransaction with sponsorship
      const gasLimit = canUseSponsoredTx ? 100000n : undefined;
      const result = await sendTransaction(
        {
          to: addresses.DemoUSDC as `0x${string}`,
          data: data,
          value: 0n,
          chainId,
          ...(gasLimit && { gas: gasLimit }),
        },
        {
          address: connectedWallet.address,
          sponsor: canUseSponsoredTx,
          uiOptions: {
            showWalletUIs: false,
          },
        }
      )

      setApproveHash(result.hash)
      toast.success("Approval transaction submitted!")
    } catch (error: any) {
      console.error("Approval error:", error)
      
      // Handle specific error messages
      let errorMsg = error.message || "Please try again"
      if (errorMsg.includes('not been authorized') || errorMsg.includes('eth_accounts')) {
        errorMsg = "Wallet connection not authorized. Please disconnect and reconnect your wallet."
      } else if (errorMsg.includes('User rejected') || errorMsg.includes('user rejected')) {
        errorMsg = "Transaction was rejected by the user."
      }
      
      toast.error("Approval failed", {
        description: errorMsg,
      })
    } finally {
      setIsApproving(false)
    }
  }

  const handlePay = async () => {
    if (!invoice || !addresses.SettlementRouter || !invoiceId) {
      toast.error("Missing invoice data")
      return
    }

    if (!address) {
      toast.error("Please connect your wallet first")
      return
    }

    if (!connectedWallet) {
      toast.error("No wallet available")
      return
    }

    // Ensure the connected wallet address matches the active address
    if (connectedWallet.address.toLowerCase() !== address.toLowerCase()) {
      toast.error("Wallet address mismatch", {
        description: "Please ensure you're using the connected wallet"
      })
      return
    }

    // Only allow Privy wallet payment for now (card/bank are demo)
    if (paymentMethod !== "privy") {
      toast.info("Card and bank transfer are demo only. Please use Privy wallet to pay.")
      return
    }

    setIsPaying(true)
    try {
      // Pre-flight checks
      if (publicClient && address && invoice) {
        try {
          // 1. Check USDC balance
          const balance = await publicClient.readContract({
            address: addresses.DemoUSDC as `0x${string}`,
            abi: usdcABI,
            functionName: "balanceOf",
            args: [address],
          }) as bigint

          if (balance < invoice.amount) {
            toast.error("Insufficient USDC balance", {
              description: `You have ${formatUnits(balance, 6)} USDC, but need ${formatUnits(invoice.amount, 6)} USDC to pay this invoice.`,
              duration: 8000,
            })
            setIsPaying(false)
            return
          }

          // 2. Check USDC allowance
          const currentAllowance = await publicClient.readContract({
            address: addresses.DemoUSDC as `0x${string}`,
            abi: usdcABI,
            functionName: "allowance",
            args: [address, addresses.SettlementRouter as `0x${string}`],
          }) as bigint

          if (currentAllowance < invoice.amount) {
            toast.error("Insufficient USDC allowance", {
              description: `You have approved ${formatUnits(currentAllowance, 6)} USDC, but need ${formatUnits(invoice.amount, 6)} USDC. Please click 'Approve USDC' first.`,
              duration: 8000,
            })
            refetchAllowance()
            setIsPaying(false)
            return
          }

          // 3. Check invoice status directly from contract
          const onChainInvoice = await publicClient.readContract({
            address: addresses.InvoiceRegistry as `0x${string}`,
            abi: InvoiceRegistryABI,
            functionName: "getInvoice",
            args: [BigInt(invoiceId)],
          }) as any

          if (onChainInvoice.status === 3) {
            toast.error("Invoice already cleared", {
              description: "This invoice has already been paid and cleared.",
              duration: 8000,
            })
            setIsPaying(false)
            return
          }

          // 4. Verify buyer address
          if (address.toLowerCase() !== onChainInvoice.buyer.toLowerCase()) {
            toast.error("Not the invoice buyer", {
              description: "Only the buyer address can pay this invoice. Please connect the correct wallet.",
              duration: 8000,
            })
            setIsPaying(false)
            return
          }

          // 5. Check if invoice has an advance and verify repayment is valid
          try {
            // First check if advance exists and get repayment amount
            let repaymentAmount = 0n
            let advanceExists = false
            
            try {
              repaymentAmount = await publicClient.readContract({
                address: addresses.AdvanceEngine as `0x${string}`,
                abi: AdvanceEngineABI,
                functionName: "getRepaymentAmount",
                args: [BigInt(invoiceId)],
              }) as bigint
              
              if (repaymentAmount > 0n) {
                advanceExists = true
              }
            } catch (e) {
              // No advance exists - that's fine
              advanceExists = false
            }

            if (advanceExists && repaymentAmount > 0n) {
              // Invoice has an advance - get full advance details
              const advance = await publicClient.readContract({
                address: addresses.AdvanceEngine as `0x${string}`,
                abi: AdvanceEngineABI,
                functionName: "getAdvance",
                args: [BigInt(invoiceId)],
              }) as any

              // Check if advance was already marked as repaid
              if (advance.repaid) {
                toast.error("Advance already repaid", {
                  description: "This invoice's advance has already been repaid. Payment may have already been processed.",
                  duration: 8000,
                })
                setIsPaying(false)
                return
              }

              // Get the principal amount that was actually borrowed from vault
              const principalBorrowed = advance.advanceAmount || advance.principal || 0n

              // Check vault's totalBorrowed
              // Note: Vault tracks only principal borrowed, but we repay principal + interest
              // If vault's totalBorrowed is less than the principal borrowed for this invoice,
              // it means this invoice's advance was already repaid (or the invoice was already paid)
              const vaultTotalBorrowed = await publicClient.readContract({
                address: addresses.Vault as `0x${string}`,
                abi: VaultABI,
                functionName: "getTotalBorrowed",
              }) as bigint

              // The vault must have at least the principal amount still borrowed
              // If not, this advance was already repaid
              if (vaultTotalBorrowed < principalBorrowed) {
                toast.error("Advance already repaid", {
                  description: `The advance principal (${formatUnits(principalBorrowed, 6)} USDC) has already been repaid to the vault. This invoice may have already been paid. Please refresh the page to see the updated status.`,
                  duration: 10000,
                })
                setIsPaying(false)
                return
              }

              // Warning: If vault's totalBorrowed is less than repayment amount (principal + interest),
              // the transaction will revert with "Repay exceeds borrowed"
              // This can happen if interest accumulated, but it's expected behavior
              // We allow the transaction to proceed and let the contract handle the validation
              if (vaultTotalBorrowed < repaymentAmount) {
                // This is expected - repayment includes interest which is not tracked in vault's totalBorrowed
                // However, we still need vault to have enough to accept the principal portion
                // The contract will handle the actual validation
                console.log(`[Payment] Repayment (${formatUnits(repaymentAmount, 6)} USDC) includes interest. Vault has ${formatUnits(vaultTotalBorrowed, 6)} USDC borrowed. Proceeding - contract will validate.`)
              }
            }
          } catch (advanceCheckError: any) {
            // If getAdvance/getRepaymentAmount throws, invoice doesn't have an advance - that's fine
            console.log("[Payment Pre-flight] Advance check:", advanceCheckError.message)
          }
        } catch (preFlightError: any) {
          console.error("[Payment Pre-flight Check] Error:", preFlightError)
        }
      }

      const data = encodeFunctionData({
        abi: SettlementRouterABI,
        functionName: "payInvoice",
        args: [BigInt(invoiceId)],
      })

      // Check if chain has gas sponsorship enabled (testnets + Arbitrum Mainnet)
      // BUT only embedded wallets support sponsorship - external wallets (MetaMask, WalletConnect) do NOT
      const chainSupportsSponsorship = chainId === 5003 || chainId === 421614 || chainId === 11155111 || chainId === 42161;
      const canUseSponsoredTx = chainSupportsSponsorship && isEmbeddedWallet;

      // For external wallets, use their native provider directly
      if (!isEmbeddedWallet && connectedWallet) {
        try {
          // Get the wallet's ethereum provider
          const provider = await connectedWallet.getEthereumProvider()
          
          console.log('[Payment] Verifying wallet connection...')
          
          // IMPORTANT: First verify the connection is active by requesting accounts
          // This ensures WalletConnect session is properly established
          try {
            const accounts = await provider.request({ method: 'eth_accounts' })
            if (!accounts || accounts.length === 0) {
              // Try to request account access
              await provider.request({ method: 'eth_requestAccounts' })
            }
            console.log('[Payment] Wallet connection verified, accounts:', accounts)
          } catch (connError: any) {
            console.error('[Payment] Connection verification failed:', connError)
            toast.error("Wallet not connected", {
              description: "Please check your wallet app and approve the connection, then try again.",
              duration: 8000,
            })
            setIsPaying(false)
            return
          }
          
          console.log('[Payment] Sending transaction via external wallet provider...')
          toast.info("Check your wallet", {
            description: "Please confirm the payment transaction in your wallet app.",
            duration: 10000,
          })
          
          // Send transaction via the wallet's provider
          const txHash = await provider.request({
            method: 'eth_sendTransaction',
            params: [{
              from: address,
              to: addresses.SettlementRouter,
              data: data,
              value: '0x0',
            }],
          })
          
          console.log('[Payment] Transaction submitted:', txHash)
          
          // Store transaction hash in localStorage for recovery
          try {
            localStorage.setItem(`pending_payment_${invoiceId}`, JSON.stringify({
              txHash,
              chainId,
              invoiceId,
              timestamp: Date.now(),
              address,
            }))
          } catch (e) {
            console.warn('Could not save pending transaction to localStorage:', e)
          }
          
          setPayHash(txHash as `0x${string}`)
          toast.success("Transaction submitted!", {
            description: (
              <div>
                <p>Waiting for on-chain confirmation...</p>
                <a 
                  href={`https://arbiscan.io/tx/${txHash}`} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-primary underline"
                >
                  View on Arbiscan →
                </a>
              </div>
            ),
            duration: 15000,
          })
          return
        } catch (providerError: any) {
          console.error("Provider transaction error:", providerError)
          // If "not authorized" error, prompt user to reconnect
          if (providerError.message?.includes('not been authorized') || 
              providerError.message?.includes('eth_accounts')) {
            toast.error("Wallet not authorized", {
              description: "Please disconnect and reconnect your wallet, then approve the connection request.",
              duration: 8000,
            })
            setIsPaying(false)
            return
          }
          // User rejected
          if (providerError.code === 4001 || providerError.message?.includes('rejected')) {
            toast.error("Transaction rejected", {
              description: "You rejected the transaction in your wallet.",
              duration: 5000,
            })
            setIsPaying(false)
            return
          }
          throw providerError
        }
      }

      // For embedded wallets, use Privy's sendTransaction with sponsorship
      const gasLimit = canUseSponsoredTx ? 500000n : undefined;
      const result = await sendTransaction(
        {
          to: addresses.SettlementRouter as `0x${string}`,
          data: data,
          value: 0n,
          chainId,
          ...(gasLimit && { gas: gasLimit }),
        },
        {
          address: connectedWallet.address,
          sponsor: canUseSponsoredTx,
          uiOptions: {
            showWalletUIs: false,
          },
        }
      )

      setPayHash(result.hash)
      toast.info("Transaction submitted", {
        description: "Please confirm the transaction in your wallet, then wait for on-chain confirmation...",
        duration: 5000,
      })
    } catch (error: any) {
      console.error("Payment error:", error)
      
      let errorMessage = "Payment failed"
      let errorDescription = error.message || "Please try again"
      
      if (error.message?.includes('not been authorized') || error.message?.includes('eth_accounts')) {
        errorMessage = "Wallet not authorized"
        errorDescription = "Please disconnect and reconnect your wallet, then approve the connection request."
      } else if (error.message?.includes("User rejected") || error.message?.includes("user rejected")) {
        errorMessage = "Transaction rejected"
        errorDescription = "You rejected the transaction in your wallet."
      } else if (error.message?.includes("Not invoice buyer") || error.message?.includes("buyer")) {
        errorMessage = "Not the invoice buyer"
        errorDescription = "Only the buyer address can pay this invoice. Please connect the correct wallet."
      } else if (error.message?.includes("Already cleared") || error.message?.includes("cleared")) {
        errorMessage = "Invoice already cleared"
        errorDescription = "This invoice has already been paid and cleared."
      } else if (error.message?.includes("Execution reverted")) {
        errorMessage = "Transaction failed"
        errorDescription = "The transaction was rejected. Common causes: insufficient USDC allowance (try approving again), insufficient balance, or invoice already paid. Please check and try again."
      } else if (error.message?.includes("Repay exceeds borrowed")) {
        errorMessage = "Repayment error"
        errorDescription = "Cannot repay the advance - the amount exceeds what was borrowed. This invoice may have already been paid. Please refresh the page and check the invoice status."
      }
      
      toast.error(errorMessage, {
        description: errorDescription,
        duration: 8000,
      })
    } finally {
      setIsPaying(false)
    }
  }

  const copyPaymentLink = () => {
    if (!invoiceId) return
    const link = getPaymentLink(chainId, invoiceId)
    navigator.clipboard.writeText(link)
    toast.success("Payment link copied!")
  }

  // Debug: Log wallet comparison (must be before early returns)
  useEffect(() => {
    if (address && invoice) {
      console.log('🔍 Wallet comparison:', {
        connectedAddress: address,
        invoiceBuyer: invoice.buyer,
        connectedLower: address.toLowerCase(),
        buyerLower: invoice.buyer.toLowerCase(),
        isMatch: address.toLowerCase() === invoice.buyer.toLowerCase(),
      })
    }
  }, [address, invoice])

  if (isLoadingInvoice) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!invoice) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center space-y-4">
        <AlertCircle className="h-12 w-12 text-muted-foreground" />
        <h1 className="text-2xl font-bold">Invoice Not Found</h1>
        <p className="text-muted-foreground">This invoice does not exist or has been removed.</p>
        <Button asChild>
          <Link to="/">Go Home</Link>
        </Button>
      </div>
    )
  }

  const amountDisplay = parseFloat(formatUnits(invoice.amount, 6))
  const isBuyer = address?.toLowerCase() === invoice.buyer.toLowerCase()
  const isPastDue = Number(invoice.dueDate) < Math.floor(Date.now() / 1000)
  const dueDate = new Date(Number(invoice.dueDate) * 1000)
  
  // Get buyer metadata from localStorage
  const getInvoiceMetadata = () => {
    try {
      // Try invoice ID first
      const stored = localStorage.getItem(`invoice_metadata_${invoiceId}`)
      if (stored) {
        const parsed = JSON.parse(stored)
        console.log('📋 Invoice metadata found for invoice', invoiceId, ':', parsed)
        return parsed
      }
      
      // Try with BigInt version
      if (invoiceId) {
        const storedBigInt = localStorage.getItem(`invoice_metadata_${BigInt(invoiceId).toString()}`)
        if (storedBigInt) {
          const parsed = JSON.parse(storedBigInt)
          console.log('📋 Invoice metadata found (BigInt key):', parsed)
          return parsed
        }
      }
    } catch (e) {
      console.error('Error reading invoice metadata:', e)
    }
    
    console.log('⚠️ No invoice metadata found for invoice', invoiceId)
    console.log('🔍 Available localStorage keys:', Object.keys(localStorage).filter(k => k.includes('invoice_metadata')))
    return { buyerName: '', buyerEmail: '', sellerName: '' }
  }
  
  const metadata = getInvoiceMetadata()
  // Show buyer name if available, otherwise show formatted wallet address
  const buyerName = metadata.buyerName && metadata.buyerName.trim() !== '' 
    ? metadata.buyerName 
    : invoice.buyer.slice(0, 6) + '...' + invoice.buyer.slice(-4)
  const sellerName = metadata.sellerName && metadata.sellerName.trim() !== '' 
    ? metadata.sellerName 
    : 'Monaris Business'

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="mx-auto max-w-xl w-full">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          {/* Header */}
          <div className="mb-3 flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="h-8">
              <ArrowLeft className="mr-1 h-3.5 w-3.5" />
              Back
            </Button>
            <div className="flex items-center gap-2">
              {/* PDF download button hidden for now */}
              {false && invoice && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => {
                    if (!invoice) return
                    const createdAt = new Date(Number(invoice.createdAt) * 1000)
                    const paidAt = invoice.paidAt && invoice.paidAt > 0n 
                      ? new Date(Number(invoice.paidAt) * 1000) 
                      : undefined
                    const clearedAt = invoice.clearedAt && invoice.clearedAt > 0n 
                      ? new Date(Number(invoice.clearedAt) * 1000) 
                      : undefined
                    
                    const explorerLink = tokenId && nftAddress
                      ? getExplorerAddressUrl(chainId, nftAddress)
                      : undefined
                    
                    downloadInvoicePDF({
                      invoiceId: invoice.invoiceId.toString(),
                      sellerName,
                      buyerName,
                      buyerEmail: metadata.buyerEmail || undefined,
                      buyerAddress: invoice.buyer,
                      sellerAddress: invoice.seller,
                      amount: invoice.amount,
                      amountFormatted: amountDisplay.toFixed(2),
                      dueDate,
                      createdAt,
                      paidAt,
                      clearedAt,
                      status: invoice.status.toString(),
                      statusNumber: invoice.status as number,
                      statusLabel: STATUS_LABELS[invoice.status as keyof typeof STATUS_LABELS],
                      invoiceNumber: `INV-${invoice.invoiceId.toString().padStart(10, '0')}`,
                      description: `Payment for INV-${invoice.invoiceId.toString().padStart(6, '0')}`,
                      tokenId: tokenId?.toString(),
                      nftAddress,
                      explorerLink,
                    })
                    toast.success("Invoice PDF downloaded")
                  }}
                  className="h-8 gap-1.5"
                >
                  <Download className="h-3.5 w-3.5" />
                  PDF
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={copyPaymentLink} className="h-8 w-8 p-0">
                <Copy className="h-3.5 w-3.5" />
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={async () => {
                  if (!authenticated && !address && wallets.length === 0) {
                    toast.info('Not logged in')
                    return
                  }
                  try {
                    console.log('🔴 Starting logout process...')
                    
                    // First, try to disconnect any connected wallets
                    try {
                      const ethereum = (window as any).ethereum
                      if (ethereum && ethereum.isMetaMask && ethereum.request) {
                        // Try to disconnect MetaMask if connected
                        try {
                          await ethereum.request({ 
                            method: 'wallet_revokePermissions',
                            params: [{ eth_accounts: {} }]
                          }).catch(() => {
                            // Ignore if not supported
                          })
                        } catch (e) {
                          console.log('MetaMask disconnect not needed:', e)
                        }
                      }
                    } catch (e) {
                      console.log('Wallet disconnect attempt failed:', e)
                    }
                    
                    // Logout from Privy
                    console.log('🔴 Calling Privy logout...')
                    await logout()
                    
                    // Give Privy a moment to process
                    await new Promise(resolve => setTimeout(resolve, 500))
                    
                    console.log('✅ Logout successful')
                    toast.success('Logged out successfully')
                    
                    // Optionally clear local storage if needed (but keep invoice metadata)
                    // localStorage.clear() // Don't clear as it might clear invoice data
                    
                    // Stay on the same page - user can reconnect their wallet to pay
                  } catch (error: any) {
                    console.error('❌ Logout error:', error)
                    toast.error('Failed to logout', {
                      description: error?.message || 'Please try again or refresh the page'
                    })
                  }
                }}
                className="h-8 text-sm font-semibold px-3 border-2 border-red-500 bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700 hover:border-red-600 shadow-sm"
              >
                Logout
              </Button>
              <Button variant="ghost" size="sm" asChild className="h-8 w-8 p-0">
                  <a
                    href={getExplorerAddressUrl(chainId, addresses.InvoiceRegistry || '')}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                  <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </Button>
            </div>
          </div>

          {/* Invoice Details Card */}
          <div className="rounded-xl border border-border bg-card p-6 shadow-lg">
            {/* Amount Due - Prominent */}
            <div className="mb-4 text-center">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Amount Due</p>
              <p className="text-4xl font-bold">
                ${amountDisplay.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>

            {/* Invoice Info */}
            <div className="mb-4 space-y-3 border-b border-border pb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Due {dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                </div>
                {tokenId && (
                  <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                    <Sparkles className="h-3 w-3" />
                    Tokenized #{tokenId.toString()}
                  </div>
                )}
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Bill to</p>
                  <p className="text-sm font-medium">{buyerName}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">From</p>
                  <p className="text-sm font-medium">{sellerName}</p>
                </div>
              </div>
            </div>

            {/* Items Table */}
            <div className="mb-4 overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase">Item / Service</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase">Description</th>
                    <th className="px-3 py-2 text-center text-xs font-semibold text-muted-foreground uppercase">Qty</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground uppercase">Price</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground uppercase">Total</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="px-3 py-2.5 text-sm font-medium">Invoice Amount</td>
                    <td className="px-3 py-2.5 text-sm text-muted-foreground">Payment for INV-{invoice.invoiceId.toString().padStart(6, '0')}</td>
                    <td className="px-3 py-2.5 text-sm text-center">1</td>
                    <td className="px-3 py-2.5 text-sm text-right">${amountDisplay.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="px-3 py-2.5 text-sm font-semibold text-right">${amountDisplay.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Payment Method Selection */}
          {invoice.status < 2 && (
            <div className="rounded-xl border border-border bg-card p-5 shadow-lg">
              <h2 className="text-base font-semibold mb-3">Select a payment method</h2>
              
              {/* Payment Method Options */}
              <div className="mb-4 flex gap-2">
                <button
                  onClick={async () => {
                    if (!isBuyer && (!authenticated || !ready)) {
                      try {
                        await login()
                        toast.success("Please connect your wallet to pay this invoice")
                      } catch (error: any) {
                        console.error("Login error:", error)
                        toast.error("Failed to connect wallet", {
                          description: error?.message || "Please try again"
                        })
                      }
                    } else {
                      setPaymentMethod("privy")
                    }
                  }}
                  className={`flex-1 rounded-lg border-2 p-3 transition-all ${
                    paymentMethod === "privy"
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  <div className="flex items-center justify-center gap-2">
                    <Wallet className="h-4 w-4" />
                    <span className="font-medium text-sm">Wallet</span>
                  </div>
                </button>
                
                <button
                  onClick={() => setPaymentMethod("card")}
                  className={`flex-1 rounded-lg border-2 p-3 transition-all ${
                    paymentMethod === "card"
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  <div className="flex items-center justify-center gap-2">
                    <CreditCard className="h-4 w-4" />
                    <span className="font-medium text-sm">Card</span>
                  </div>
                </button>
                
                <button
                  onClick={() => setPaymentMethod("bank")}
                  className={`flex-1 rounded-lg border-2 p-3 transition-all ${
                    paymentMethod === "bank"
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  <div className="flex items-center justify-center gap-2">
                    <Building2 className="h-4 w-4" />
                    <span className="font-medium text-sm">Bank transfer</span>
                  </div>
                </button>
                
                <button
                  className="rounded-lg border-2 border-border p-3 hover:border-primary/50 transition-all"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </div>

              {/* Payment Form */}
              {paymentMethod === "privy" && (
                <div className="space-y-3">
                  {!isBuyer && (
                    <div className="rounded-lg border border-warning/20 bg-warning/5 p-3">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="h-4 w-4 text-warning mt-0.5 flex-shrink-0" />
                        <div className="flex-1">
                          <p className="text-sm font-medium mb-1">Connect the buyer wallet</p>
                          <p className="text-xs text-muted-foreground">
                            Buyer address: <span className="font-mono">{invoice.buyer.slice(0, 6)}...{invoice.buyer.slice(-4)}</span>
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {isBuyer && (
                    <>
                      {step === "approve" && needsApproval && (
                        <div className="space-y-2">
                          <div className="rounded-lg border border-warning/20 bg-warning/5 p-2">
                            <div className="flex items-center gap-2">
                              <AlertCircle className="h-3.5 w-3.5 text-warning" />
                              <span className="text-xs font-medium">Approve USDC to continue</span>
                      </div>
                    </div>
                    <Button
                      onClick={handleApprove}
                      disabled={isApproving || isApprovalConfirming}
                      className="w-full"
                            size="default"
                      variant="hero"
                    >
                      {isApproving || isApprovalConfirming ? (
                        <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                {isApproving ? "Waiting..." : "Confirming..."}
                        </>
                      ) : (
                              `Approve $${amountDisplay.toLocaleString()} USDC`
                      )}
                    </Button>
                  </div>
                )}

                {(step === "pay" || !needsApproval) && (
                    <Button
                      onClick={handlePay}
                      disabled={isPaying || isPaymentConfirming || needsApproval}
                      className="w-full"
                          size="default"
                      variant="hero"
                    >
                      {isPaying || isPaymentConfirming ? (
                        <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              {isPaying ? "Waiting for wallet confirmation..." : "Waiting for on-chain confirmation..."}
                        </>
                      ) : (
                        <>
                              <DollarSign className="mr-2 h-4 w-4" />
                              Pay ${amountDisplay.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </>
                      )}
                    </Button>
                      )}

                      {step === "complete" && (
                        <div className="rounded-lg border border-success/20 bg-success/5 p-3 text-center">
                          <CheckCircle2 className="mx-auto h-8 w-8 text-success" />
                          <h3 className="mt-2 text-base font-semibold">Payment Complete!</h3>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Settlement is being finalized on-chain.
                          </p>
                        </div>
                      )}
                    </>
                  )}
                  </div>
                )}

              {paymentMethod === "card" && (
                <div className="space-y-3">
                  <div className="rounded-lg border border-muted bg-muted/30 p-2">
                    <p className="text-xs text-muted-foreground">
                      Card payments are demo only. Please use Wallet to complete payment.
                    </p>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-medium mb-1 block">Card number</label>
                      <Input
                        placeholder="1234 1234 1234 1234"
                        value={cardNumber}
                        onChange={(e) => setCardNumber(e.target.value)}
                        disabled
                        className="h-9"
                      />
                      <div className="flex gap-2 mt-1.5">
                        <div className="h-5 w-8 bg-muted rounded"></div>
                        <div className="h-5 w-8 bg-muted rounded"></div>
                        <div className="h-5 w-8 bg-muted rounded"></div>
                        <div className="h-5 w-8 bg-muted rounded"></div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium mb-1 block">Expiration date</label>
                        <Input
                          placeholder="MM / YY"
                          value={cardExpiry}
                          onChange={(e) => setCardExpiry(e.target.value)}
                          disabled
                          className="h-9"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium mb-1 block">CVC</label>
                        <Input
                          placeholder="CVC"
                          value={cardCVC}
                          onChange={(e) => setCardCVC(e.target.value)}
                          disabled
                          className="h-9"
                        />
                      </div>
                    </div>
                  </div>
                  <Button
                    onClick={() => {
                      toast.info("Card payments are demo only. Please use Wallet to pay.")
                      setPaymentMethod("privy")
                    }}
                    className="w-full"
                    size="default"
                    variant="hero"
                    disabled
                  >
                    Pay ${amountDisplay.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </Button>
              </div>
            )}

              {paymentMethod === "bank" && (
                <div className="space-y-3">
                  <div className="rounded-lg border border-muted bg-muted/30 p-2">
                    <p className="text-xs text-muted-foreground">
                      Bank transfers are demo only. Please use Wallet to complete payment.
                </p>
              </div>
                  <Button
                    onClick={() => {
                      toast.info("Bank transfers are demo only. Please use Wallet to pay.")
                      setPaymentMethod("privy")
                    }}
                    className="w-full"
                    size="default"
                    variant="hero"
                    disabled
                  >
                    Pay ${amountDisplay.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </Button>
                </div>
              )}
              </div>
            )}

            {invoice.status >= 2 && (
            <div className="rounded-lg border border-success/20 bg-success/5 p-4 text-center">
              <CheckCircle2 className="mx-auto h-10 w-10 text-success" />
              <h3 className="mt-2 text-base font-semibold">
                {invoice.status === 3 ? "Invoice Cleared" : "Invoice Paid"}
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {invoice.status === 3 
                  ? "This invoice has been fully settled on-chain."
                  : "Payment has been received and settlement is in progress."}
              </p>
              </div>
            )}

          {/* Footer */}
          <div className="flex items-center justify-between mt-4">
            <div className="text-left text-xs text-muted-foreground">
              <p>Powered by Monaris</p>
              <div className="flex items-center gap-3 mt-1">
                <a href="#" className="hover:text-foreground transition-colors">Terms</a>
                <a href="#" className="hover:text-foreground transition-colors">Privacy</a>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <div className="h-2 w-2 rounded-full bg-current" style={{ 
                backgroundColor: isActuallyLoggedIn ? '#22c55e' : '#ef4444',
                opacity: isActuallyLoggedIn ? 1 : 0.5
              }} />
              <span>{isActuallyLoggedIn ? 'Connected' : 'Not connected'}</span>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
