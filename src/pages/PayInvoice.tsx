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
  MoreHorizontal,
  Shield,
  Lock
} from "lucide-react"
import { downloadInvoicePDF } from "@/lib/generateInvoicePDF"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useInvoice } from "@/hooks/useInvoice"
import { useInvoiceNFT } from "@/hooks/useInvoiceNFT"
import { useReadContract, useWaitForTransactionReceipt, usePublicClient, useChainId, useSwitchChain, useAccount as useWagmiAccount, useWalletClient, useConnect, useDisconnect } from "wagmi"
import { useSendTransaction, useWallets, usePrivy } from "@privy-io/react-auth"
import { usePrivyAccount } from "@/hooks/usePrivyAccount"
import { useChainAddresses } from "@/hooks/useChainAddresses"
import { DemoUSDCABI, USDCABI, getUSDCABI, SettlementRouterABI, InvoiceRegistryABI, AdvanceEngineABI, VaultABI } from "@/lib/abis"
import { formatUnits, parseUnits, isAddress, encodeFunctionData } from "viem"
import { toast } from "sonner"
import { Link } from "react-router-dom"
import { getExplorerUrl, getExplorerAddressUrl, getPaymentLink, CHAIN_IDS } from "@/lib/chain-utils"
import { useSearchParams } from "react-router-dom"
import { supabase, isSupabaseConfigured } from "@/lib/supabase"
import { rejectInvoice as rejectInvoiceAction } from "@/hooks/useInvoice"
import { AlertTriangle, XCircle } from "lucide-react"
import { PRIVATE_PAYMENTS_ENABLED } from "@/lib/privacy/config"
import { PrivatePayButton } from "@/components/privacy/PrivatePayButton"
import { ShieldDialog } from "@/components/privacy/ShieldDialog"
import { usePrivateBalance } from "@/hooks/usePrivateBalance"

const STATUS_LABELS = {
  0: "Issued",
  1: "Financed",
  2: "Paid",
  3: "Cleared",
}

type PaymentMethod = "private" | "privy" | "card" | "bank"

export default function PayInvoice() {
  const params = useParams<{ invoiceId?: string; chainId?: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const privyAccount = usePrivyAccount()
  const wagmiAccount = useWagmiAccount()
  const { data: walletClient } = useWalletClient()
  const [manuallyDisconnected, setManuallyDisconnected] = useState(() => 
    sessionStorage.getItem('pay_disconnected') === 'true'
  )
  
  // Use wagmi address as fallback when Privy auth fails but wallet is connected
  const address = manuallyDisconnected ? undefined : (privyAccount.address || wagmiAccount.address)
  
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
  
  // Fetch invoice metadata from Supabase (persisted across devices)
  const [supabaseMetadata, setSupabaseMetadata] = useState<{
    id?: string; buyer_name?: string; buyer_email?: string; memo?: string; line_items?: any[];
    seller_name?: string; invoice_number?: string; status?: string; is_draft?: boolean;
  } | null>(null)
  useEffect(() => {
    if (!invoiceId || !isSupabaseConfigured()) return
    const cid = targetChainId || 42161
    supabase
      .from('invoices')
      .select('id, buyer_name, buyer_email, memo, line_items, seller_name, invoice_number, status, is_draft')
      .eq('chain_invoice_id', Number(invoiceId))
      .eq('chain_id', cid)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setSupabaseMetadata(data)
          if (data.status === 'rejected') setIsRejected(true)
        }
      })
  }, [invoiceId, targetChainId])

  const { invoice, isLoading: isLoadingInvoice } = useInvoice(invoiceId)
  const { tokenId, nftAddress, isLoading: isLoadingNFT } = useInvoiceNFT(invoiceId ? BigInt(invoiceId) : undefined)
  const { sendTransaction } = useSendTransaction()
  const { wallets } = useWallets()
  const { login, logout, ready, authenticated } = usePrivy()
  const { connect, connectors } = useConnect()
  const { disconnect } = useDisconnect()

  const nukeWalletConnection = () => {
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith('wagmi') || key.startsWith('privy') || key.startsWith('wc@') || key.startsWith('walletconnect')) {
        localStorage.removeItem(key)
      }
    })
    sessionStorage.setItem('pay_disconnected', 'true')
    disconnect()
    if (authenticated) logout().catch(() => {})
    // Revoke MetaMask permissions so next connect shows account picker
    const eth = (window as any).ethereum
    if (eth?.request) {
      eth.request({ method: 'wallet_revokePermissions', params: [{ eth_accounts: {} }] }).catch(() => {})
    }
    window.location.reload()
  }

  const connectWallet = () => {
    sessionStorage.removeItem('pay_disconnected')
    setManuallyDisconnected(false)
    login()
    toast.info("Check your wallet extension", {
      description: "If you don't see a popup, click the MetaMask icon in your browser toolbar to sign.",
      duration: 8000,
    })
  }
  
  // Check if actually logged in - Privy auth OR wagmi wallet connected (but not if user disconnected)
  const isActuallyLoggedIn = !manuallyDisconnected && ((authenticated && (address || wallets.length > 0)) || wagmiAccount.isConnected)
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
  const connectedWallet = address 
    ? wallets.find(w => w.address.toLowerCase() === address.toLowerCase()) || wallets[0]
    : wallets[0]
  
  // Check if wallet is an embedded (Privy) wallet - only embedded wallets support gas sponsorship
  const isEmbeddedWallet = connectedWallet?.walletClientType === 'privy' || 
                           connectedWallet?.connectorType === 'embedded'

  // Whether we should use wagmi's wallet client directly (fallback when Privy auth isn't active)
  const useWagmiFallback = !authenticated && wagmiAccount.isConnected && !!walletClient
  
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
  const [shieldDialogOpen, setShieldDialogOpen] = useState(false)
  const { privateUsdcBalance, isEnabled: isPrivacyEnabled } = usePrivateBalance()
  const [cardNumber, setCardNumber] = useState("")
  const [cardExpiry, setCardExpiry] = useState("")
  const [cardCVC, setCardCVC] = useState("")
  const [step, setStep] = useState<"approve" | "pay" | "complete">("approve")
  const [approveHash, setApproveHash] = useState<`0x${string}` | null>(null)
  const [payHash, setPayHash] = useState<`0x${string}` | null>(null)
  const [isApproving, setIsApproving] = useState(false)
  const [isPaying, setIsPaying] = useState(false)
  const [isRejecting, setIsRejecting] = useState(false)
  const [isRejected, setIsRejected] = useState(false)
  
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
      console.log('[Payment] Transaction confirmed on-chain:', payHash)
      toast.success("Payment confirmed!", {
        description: "Settlement is being finalized on-chain.",
      })
      setStep("complete")

      // Sync Supabase status + notify seller (mirrors the notification pattern used elsewhere)
      if (invoiceId && isSupabaseConfigured() && invoice) {
        const cid = targetChainId || 42161
        const amtStr = formatUnits(invoice.amount, 6)
        const invNum = supabaseMetadata?.invoice_number || `INV-${invoiceId}`

        const syncPayment = async () => {
          try {
            // 1) Try to update existing Supabase row
            const { data: updated, error: updateErr } = await supabase
              .from('invoices')
              .update({
                status: 'paid',
                tx_hash: payHash,
                payment_completed_at: new Date().toISOString(),
              })
              .eq('chain_invoice_id', Number(invoiceId))
              .eq('chain_id', cid)
              .select('id')
              .maybeSingle()

            // 2) If no row existed, insert one so it shows in both seller & buyer lists
            if (!updated && !updateErr) {
              await supabase.from('invoices').insert({
                chain_invoice_id: Number(invoiceId),
                chain_id: cid,
                seller_address: invoice.seller.toLowerCase(),
                buyer_address: invoice.buyer.toLowerCase(),
                amount: parseFloat(amtStr),
                due_date: new Date(Number(invoice.dueDate) * 1000).toISOString(),
                status: 'paid',
                tx_hash: payHash,
                is_draft: false,
                payment_completed_at: new Date().toISOString(),
                invoice_number: invNum,
              })
            }
            if (updateErr) console.warn('[Payment] Supabase update failed:', updateErr.message)

            // 3) Notify the seller that the invoice was paid
            await supabase.from('notifications').insert({
              recipient_address: invoice.seller.toLowerCase(),
              type: 'invoice_paid',
              title: 'Invoice Paid',
              message: `Invoice ${invNum} was paid for $${parseFloat(amtStr).toFixed(2)}`,
              chain_invoice_id: Number(invoiceId),
              chain_id: cid,
            })
            console.log('[Payment] Supabase synced + seller notified')
          } catch (err: any) {
            console.warn('[Payment] Supabase sync error:', err?.message)
          }
        }
        syncPayment()
      }

      if (invoiceId) {
        localStorage.removeItem(`pending_payment_${invoiceId}`)
        setTimeout(() => {
          window.location.reload()
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

      const explorerBaseUrl = getExplorerUrl(chainId, '')?.replace(/\/tx\/$/, '') || 'https://arbiscan.io'

      // Path 1: Use wagmi wallet client directly (most reliable for external wallets)
      if (useWagmiFallback && walletClient) {
        console.log('[Approval] Using wagmi wallet client...')
        const txHash = await walletClient.sendTransaction({
          to: addresses.DemoUSDC as `0x${string}`,
          data: data,
          value: 0n,
          chain: walletClient.chain,
          account: address as `0x${string}`,
        })
        console.log('[Approval] Transaction submitted:', txHash)
        setApproveHash(txHash)
        toast.success("Approval transaction submitted!")
        return
      }

      // Path 2: Privy external wallet provider
      if (!isEmbeddedWallet && connectedWallet) {
        try {
          const provider = await connectedWallet.getEthereumProvider()
          
          try {
            const accounts = await provider.request({ method: 'eth_accounts' })
            if (!accounts || accounts.length === 0) {
              await provider.request({ method: 'eth_requestAccounts' })
            }
          } catch (connError: any) {
            console.error('[Approval] Connection verification failed:', connError)
            toast.error("Wallet not connected", {
              description: "Please check your wallet app and approve the connection, then try again.",
              duration: 8000,
            })
            return
          }
          
          toast.info("Check your wallet", {
            description: "Please confirm the approval transaction in your wallet app.",
            duration: 10000,
          })
          
          const txHash = await provider.request({
            method: 'eth_sendTransaction',
            params: [{
              from: address,
              to: addresses.DemoUSDC,
              data: data,
              value: '0x0',
            }],
          })
          
          setApproveHash(txHash as `0x${string}`)
          toast.success("Approval transaction submitted!")
          return
        } catch (providerError: any) {
          console.error("Provider transaction error:", providerError)
          if (providerError.code === 4001 || providerError.message?.includes('rejected')) {
            toast.error("Transaction rejected")
            return
          }
          throw providerError
        }
      }

      // Path 3: Privy embedded wallet with gas sponsorship
      const chainSupportsSponsorship = chainId === 5003 || chainId === 421614 || chainId === 11155111 || chainId === 42161;
      const canUseSponsoredTx = chainSupportsSponsorship && isEmbeddedWallet;
      const gasLimit = canUseSponsoredTx ? 100000n : undefined;

      if (!connectedWallet) {
        toast.error("No wallet available. Please connect a wallet first.")
        return
      }

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
          uiOptions: { showWalletUIs: false },
        }
      )

      setApproveHash(result.hash)
      toast.success("Approval transaction submitted!")
    } catch (error: any) {
      console.error("Approval error:", error)
      
      let errorMsg = error.message || "Please try again"
      if (errorMsg.includes('User rejected') || errorMsg.includes('user rejected')) {
        errorMsg = "Transaction was rejected by the user."
      }
      
      toast.error("Approval failed", { description: errorMsg })
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

    if (!connectedWallet && !useWagmiFallback) {
      toast.error("No wallet available. Please connect a wallet.")
      return
    }

    if (paymentMethod !== "privy") {
      toast.info("Card and bank transfer are demo only. Please use Wallet to pay.")
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

          // 4. Check if invoice has an advance and verify repayment is valid
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

      const payFn = isBuyer ? "payInvoice" : "payInvoiceOnBehalf"
      const data = encodeFunctionData({
        abi: SettlementRouterABI,
        functionName: payFn,
        args: [BigInt(invoiceId)],
      })

      // Path 1: Use wagmi wallet client directly (most reliable for external wallets)
      if (useWagmiFallback && walletClient) {
        console.log('[Payment] Using wagmi wallet client...')
        const txHash = await walletClient.sendTransaction({
          to: addresses.SettlementRouter as `0x${string}`,
          data: data,
          value: 0n,
          chain: walletClient.chain,
          account: address as `0x${string}`,
        })
        console.log('[Payment] Transaction submitted:', txHash)
        try {
          localStorage.setItem(`pending_payment_${invoiceId}`, JSON.stringify({
            txHash, chainId, invoiceId, timestamp: Date.now(), address,
          }))
        } catch (e) { /* ignore */ }
        setPayHash(txHash)
        toast.success("Transaction submitted!", {
          description: "Waiting for on-chain confirmation...",
          duration: 10000,
        })
        return
      }

      // Path 2: Privy external wallet provider
      if (!isEmbeddedWallet && connectedWallet) {
        try {
          const provider = await connectedWallet.getEthereumProvider()
          
          try {
            const accounts = await provider.request({ method: 'eth_accounts' })
            if (!accounts || accounts.length === 0) {
              await provider.request({ method: 'eth_requestAccounts' })
            }
          } catch (connError: any) {
            console.error('[Payment] Connection verification failed:', connError)
            toast.error("Wallet not connected", {
              description: "Please check your wallet app and try again.",
              duration: 8000,
            })
            setIsPaying(false)
            return
          }
          
          toast.info("Check your wallet", {
            description: "Please confirm the payment transaction in your wallet app.",
            duration: 10000,
          })
          
          const txHash = await provider.request({
            method: 'eth_sendTransaction',
            params: [{
              from: address,
              to: addresses.SettlementRouter,
              data: data,
              value: '0x0',
            }],
          })
          
          try {
            localStorage.setItem(`pending_payment_${invoiceId}`, JSON.stringify({
              txHash, chainId, invoiceId, timestamp: Date.now(), address,
            }))
          } catch (e) { /* ignore */ }
          
          setPayHash(txHash as `0x${string}`)
          toast.success("Transaction submitted!", {
            description: "Waiting for on-chain confirmation...",
            duration: 10000,
          })
          return
        } catch (providerError: any) {
          console.error("Provider transaction error:", providerError)
          if (providerError.code === 4001 || providerError.message?.includes('rejected')) {
            toast.error("Transaction rejected")
            setIsPaying(false)
            return
          }
          throw providerError
        }
      }

      // Path 3: Privy embedded wallet with gas sponsorship
      const chainSupportsSponsorship = chainId === 5003 || chainId === 421614 || chainId === 11155111 || chainId === 42161;
      const canUseSponsoredTx = chainSupportsSponsorship && isEmbeddedWallet;
      const gasLimit = canUseSponsoredTx ? 500000n : undefined;

      if (!connectedWallet) {
        toast.error("No wallet available. Please connect a wallet first.")
        setIsPaying(false)
        return
      }

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
          uiOptions: { showWalletUIs: false },
        }
      )

      setPayHash(result.hash)
      toast.info("Transaction submitted", {
        description: "Waiting for on-chain confirmation...",
        duration: 5000,
      })
    } catch (error: any) {
      console.error("Payment error:", error)
      
      let errorMessage = "Payment failed"
      let errorDescription = error.message || "Please try again"
      
      if (error.message?.includes("User rejected") || error.message?.includes("user rejected")) {
        errorMessage = "Transaction rejected"
        errorDescription = "You rejected the transaction in your wallet."
      } else if (error.message?.includes("Already cleared") || error.message?.includes("cleared")) {
        errorMessage = "Invoice already cleared"
        errorDescription = "This invoice has already been paid and cleared."
      } else if (error.message?.includes("Execution reverted")) {
        errorMessage = "Transaction failed"
        errorDescription = "Insufficient USDC allowance or balance, or invoice already paid. Please check and try again."
      } else if (error.message?.includes("Repay exceeds borrowed")) {
        errorMessage = "Repayment error"
        errorDescription = "This invoice may have already been paid. Please refresh the page."
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

  const handleReject = async () => {
    if (!supabaseMetadata?.id || !invoice) return
    if (!confirm('Reject this invoice? The seller will be notified.')) return
    setIsRejecting(true)
    try {
      const invNum = supabaseMetadata.invoice_number || `INV-${invoiceId}`
      await rejectInvoiceAction(supabaseMetadata.id, invoice.seller, invNum)
      setIsRejected(true)
      toast.success("Invoice rejected", { description: "The seller has been notified." })
    } catch (err: any) {
      toast.error("Failed to reject", { description: err?.message })
    } finally {
      setIsRejecting(false)
    }
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
      <div className="flex min-h-screen items-center justify-center bg-[#0a0a0a]">
        <Loader2 className="h-8 w-8 animate-spin text-[#c8ff00]" />
      </div>
    )
  }

  if (!invoice) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center space-y-4 bg-[#0a0a0a]">
        <AlertCircle className="h-12 w-12 text-white/30" />
        <h1 className="text-2xl font-bold text-white">Invoice Not Found</h1>
        <p className="text-white/50">This invoice does not exist or has been removed.</p>
        <Button asChild className="bg-[#c8ff00] text-black font-semibold hover:bg-[#d4ff33] border-0">
          <Link to="/">Go Home</Link>
        </Button>
      </div>
    )
  }

  const amountDisplay = parseFloat(formatUnits(invoice.amount, 6))
  const isBuyer = address?.toLowerCase() === invoice.buyer.toLowerCase()
  const isPastDue = Number(invoice.dueDate) < Math.floor(Date.now() / 1000)
  const dueDate = new Date(Number(invoice.dueDate) * 1000)
  
  // Get buyer metadata — Supabase first, localStorage as fallback
  const getInvoiceMetadata = () => {
    if (supabaseMetadata) {
      return {
        buyerName: supabaseMetadata.buyer_name || '',
        buyerEmail: supabaseMetadata.buyer_email || '',
        memo: supabaseMetadata.memo || '',
        lineItems: supabaseMetadata.line_items || [],
        sellerName: '',
      }
    }
    try {
      const stored = localStorage.getItem(`invoice_metadata_${invoiceId}`)
      if (stored) return JSON.parse(stored)
      if (invoiceId) {
        const storedBigInt = localStorage.getItem(`invoice_metadata_${BigInt(invoiceId).toString()}`)
        if (storedBigInt) return JSON.parse(storedBigInt)
      }
    } catch (e) {
      console.error('Error reading invoice metadata:', e)
    }
    return { buyerName: '', buyerEmail: '', sellerName: '' }
  }

  const metadata = getInvoiceMetadata()
  const buyerName = metadata.buyerName && metadata.buyerName.trim() !== '' 
    ? metadata.buyerName 
    : invoice.buyer.slice(0, 6) + '...' + invoice.buyer.slice(-4)
  const sellerName = (supabaseMetadata?.seller_name || metadata.sellerName || '').trim() || 'Monaris Business'

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-4">
      <div className="mx-auto max-w-xl w-full">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          {/* Header */}
          <div className="mb-3 flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="h-8 text-white/60 hover:text-white hover:bg-white/5">
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
              <Button variant="ghost" size="sm" onClick={copyPaymentLink} className="h-8 w-8 p-0 text-white/40 hover:text-white hover:bg-white/5">
                <Copy className="h-3.5 w-3.5" />
              </Button>
              {isActuallyLoggedIn ? (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={nukeWalletConnection}
                  className="h-8 text-sm font-semibold px-3 border border-red-500/50 bg-red-500/10 text-red-400 hover:bg-red-500/20 hover:text-red-300 shadow-sm"
                >
                  {address ? `${address.slice(0, 6)}...${address.slice(-4)}` : 'Disconnect'}
                </Button>
              ) : (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={connectWallet}
                  className="h-8 text-sm font-semibold px-3 border border-[#c8ff00]/50 bg-[#c8ff00]/10 text-[#c8ff00] hover:bg-[#c8ff00]/20 shadow-sm"
                >
                  Connect Wallet
                </Button>
              )}
              <Button variant="ghost" size="sm" asChild className="h-8 w-8 p-0 text-white/40 hover:text-white hover:bg-white/5">
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
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-xl p-6 shadow-2xl">
            <div className="mb-4 text-center">
              <p className="text-xs font-medium text-white/40 uppercase tracking-widest mb-1">Amount Due</p>
              <p className="text-4xl font-bold text-white">
                ${amountDisplay.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>

            <div className="mb-4 space-y-3 border-b border-white/[0.06] pb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-white/40" />
                  <span className="text-sm text-white/50">Due {dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                </div>
                {tokenId && (
                  <div className="inline-flex items-center gap-1.5 rounded-full bg-[#c8ff00]/10 border border-[#c8ff00]/20 px-3 py-1 text-xs font-medium text-[#c8ff00]">
                    <Sparkles className="h-3 w-3" />
                    Tokenized #{tokenId.toString()}
                  </div>
                )}
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-medium text-white/40 mb-1">Bill to</p>
                  <p className="text-sm font-medium text-white">{buyerName}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-white/40 mb-1">From</p>
                  <p className="text-sm font-medium text-white">{sellerName}</p>
                </div>
              </div>
            </div>

            <div className="mb-4 overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    <th className="px-3 py-2 text-left text-xs font-semibold text-white/40 uppercase">Item / Service</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-white/40 uppercase">Description</th>
                    <th className="px-3 py-2 text-center text-xs font-semibold text-white/40 uppercase">Qty</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-white/40 uppercase">Price</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-white/40 uppercase">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {metadata.lineItems && metadata.lineItems.length > 0 ? (
                    metadata.lineItems.map((item: any, idx: number) => (
                      <tr key={idx}>
                        <td className="px-3 py-2.5 text-sm font-medium text-white">{item.description || `Item ${idx + 1}`}</td>
                        <td className="px-3 py-2.5 text-sm text-white/50">Payment for {supabaseMetadata?.invoice_number || `INV-${invoice.invoiceId.toString().padStart(6, '0')}`}</td>
                        <td className="px-3 py-2.5 text-sm text-center text-white/70">{item.quantity || 1}</td>
                        <td className="px-3 py-2.5 text-sm text-right text-white/70">${(item.rate || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td className="px-3 py-2.5 text-sm font-semibold text-right text-white">${((item.quantity || 1) * (item.rate || 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="px-3 py-2.5 text-sm font-medium text-white">Invoice Amount</td>
                      <td className="px-3 py-2.5 text-sm text-white/50">Payment for {supabaseMetadata?.invoice_number || `INV-${invoice.invoiceId.toString().padStart(6, '0')}`}</td>
                      <td className="px-3 py-2.5 text-sm text-center text-white/70">1</td>
                      <td className="px-3 py-2.5 text-sm text-right text-white/70">${amountDisplay.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td className="px-3 py-2.5 text-sm font-semibold text-right text-white">${amountDisplay.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Memo */}
            {metadata.memo && (
              <div className="mt-3 px-3 py-2.5 rounded-lg bg-white/[0.04] border border-white/[0.06]">
                <p className="text-xs font-medium text-white/40 mb-1">Memo</p>
                <p className="text-sm text-white/70">{metadata.memo}</p>
              </div>
            )}
          </div>

          {/* Rejected banner */}
          {isRejected && (
            <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 flex items-center gap-3">
              <XCircle className="h-6 w-6 text-red-400 flex-shrink-0" />
              <div>
                <h3 className="text-sm font-semibold text-white">Invoice Rejected</h3>
                <p className="text-xs text-white/50 mt-0.5">You rejected this invoice. The seller has been notified.</p>
              </div>
            </div>
          )}

          {/* Payment Method Selection */}
          {invoice.status < 2 && (
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-xl p-5 shadow-2xl">
              <h2 className="text-base font-semibold mb-3 text-white">Select a payment method</h2>
              
              {/* Payment Method Options */}
              <div className="mb-4 flex gap-2">
                <button
                  disabled
                  className="flex-1 rounded-xl border border-white/[0.08] p-3 opacity-50 cursor-not-allowed relative"
                >
                  <div className="flex items-center justify-center gap-2 text-white/40">
                    <Shield className="h-4 w-4" />
                    <span className="font-medium text-sm">Private</span>
                  </div>
                  <p className="text-[9px] text-[#c8ff00] mt-0.5 text-center font-semibold">Coming Soon</p>
                </button>
                <button
                  onClick={() => {
                    setPaymentMethod("privy")
                    if (!address) connectWallet()
                  }}
                  className={`flex-1 rounded-xl border p-3 transition-all ${
                    paymentMethod === "privy"
                      ? "border-[#c8ff00]/60 bg-[#c8ff00]/10 text-[#c8ff00]"
                      : "border-white/[0.08] text-white/60 hover:border-white/20 hover:text-white/80"
                  }`}
                >
                  <div className="flex items-center justify-center gap-2">
                    <Wallet className="h-4 w-4" />
                    <span className="font-medium text-sm">{isPrivacyEnabled ? "Public" : "Wallet"}</span>
                  </div>
                </button>
                
                <button
                  disabled
                  className="flex-1 rounded-xl border border-white/[0.08] p-3 opacity-50 cursor-not-allowed"
                >
                  <div className="flex items-center justify-center gap-2 text-white/40">
                    <CreditCard className="h-4 w-4" />
                    <span className="font-medium text-sm">Card</span>
                  </div>
                  <p className="text-[9px] text-[#c8ff00] mt-0.5 text-center font-semibold">Coming Soon</p>
                </button>
                
                <button
                  disabled
                  className="flex-1 rounded-xl border border-white/[0.08] p-3 opacity-50 cursor-not-allowed"
                >
                  <div className="flex items-center justify-center gap-2 text-white/40">
                    <Building2 className="h-4 w-4" />
                    <span className="font-medium text-sm">Bank transfer</span>
                  </div>
                  <p className="text-[9px] text-[#c8ff00] mt-0.5 text-center font-semibold">Coming Soon</p>
                </button>
                
                <button
                  className="rounded-xl border border-white/[0.08] p-3 hover:border-white/20 text-white/40 hover:text-white/60 transition-all"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </div>

              {/* Private Payment Form */}
              {paymentMethod === "private" && isPrivacyEnabled && (
                <div className="space-y-3">
                  {!address ? (
                    <div className="text-center py-4">
                      <Lock className="mx-auto h-8 w-8 text-white/30 mb-2" />
                      <p className="text-sm text-white/50 mb-3">
                        Connect your wallet to pay privately
                      </p>
                      <Button onClick={connectWallet} className="w-full bg-[#c8ff00] text-black font-semibold hover:bg-[#d4ff33] border-0">
                        Connect & Pay Privately
                      </Button>
                    </div>
                  ) : (
                    <>
                      <div className="rounded-lg border border-[#c8ff00]/20 bg-[#c8ff00]/5 p-3">
                        <div className="flex items-start gap-2">
                          <Shield className="h-4 w-4 text-[#c8ff00] mt-0.5 flex-shrink-0" />
                          <div>
                            <p className="text-xs font-medium text-white">Private Payment</p>
                            <p className="text-[10px] text-white/50 mt-0.5">
                              Sender, receiver and amount are hidden from on-chain observers
                            </p>
                          </div>
                        </div>
                      </div>

                      {privateUsdcBalance < amountDisplay && (
                        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
                          <div className="flex items-start gap-2">
                            <AlertCircle className="h-4 w-4 text-amber-400 mt-0.5 flex-shrink-0" />
                            <div>
                              <p className="text-xs font-medium text-white">Insufficient private balance</p>
                              <p className="text-[10px] text-white/50 mt-0.5">
                                You have {privateUsdcBalance.toFixed(2)} USDC in your private balance.
                                Shield more funds to pay privately.
                              </p>
                              <Button
                                size="sm"
                                className="mt-2 h-7 text-xs border border-white/10 bg-white/5 text-white hover:bg-white/10"
                                onClick={() => setShieldDialogOpen(true)}
                              >
                                <Shield className="mr-1 h-3 w-3" />
                                Add Funds to Private Balance
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}

                      <PrivatePayButton
                        invoiceId={invoiceId || ''}
                        sellerAddress={invoice.seller}
                        tokenAddress={addresses.DemoUSDC || ''}
                        amount={invoice.amount}
                        chainId={chainId}
                        onSuccess={(txRef) => {
                          setStep("complete")
                          toast.success("Invoice paid privately!")
                        }}
                        onInsufficientBalance={() => setShieldDialogOpen(true)}
                        disabled={isPaying || step === "complete"}
                      />

                      {step === "complete" && (
                        <div className="rounded-lg border border-[#c8ff00]/20 bg-[#c8ff00]/5 p-3 text-center">
                          <CheckCircle2 className="mx-auto h-8 w-8 text-[#c8ff00]" />
                          <h3 className="mt-2 text-base font-semibold text-white">Paid Privately!</h3>
                          <p className="mt-1 text-xs text-white/50">
                            Payment is confirmed. The transfer details are hidden on-chain.
                          </p>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Public Wallet Payment Form */}
              {paymentMethod === "privy" && (
                <div className="space-y-3">
                  {!isBuyer && address && (
                    <div className="rounded-lg border border-blue-400/20 bg-blue-400/10 p-3">
                      <div className="flex items-start gap-2">
                        <User className="h-4 w-4 text-blue-400 mt-0.5 flex-shrink-0" />
                        <div className="flex-1">
                          <p className="text-sm font-medium mb-1 text-white">Paying on behalf</p>
                          <p className="text-xs text-white/50">
                            You're paying this invoice on behalf of <span className="font-mono text-white/70">{invoice.buyer.slice(0, 6)}...{invoice.buyer.slice(-4)}</span>
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {address && (
                    <>
                      {step === "approve" && needsApproval && (
                        <div className="space-y-2">
                          <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-2">
                            <div className="flex items-center gap-2">
                              <AlertCircle className="h-3.5 w-3.5 text-amber-400" />
                              <span className="text-xs font-medium text-white/80">Approve USDC to continue</span>
                      </div>
                    </div>
                    <Button
                      onClick={handleApprove}
                      disabled={isApproving || isApprovalConfirming}
                      className="w-full bg-[#c8ff00] text-black font-semibold hover:bg-[#d4ff33] border-0 disabled:bg-[#c8ff00]/50 disabled:text-black/50"
                            size="default"
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
                      className="w-full bg-[#c8ff00] text-black font-semibold hover:bg-[#d4ff33] border-0 disabled:bg-[#c8ff00]/50 disabled:text-black/50"
                          size="default"
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
                        <div className="rounded-lg border border-[#c8ff00]/20 bg-[#c8ff00]/5 p-3 text-center">
                          <CheckCircle2 className="mx-auto h-8 w-8 text-[#c8ff00]" />
                          <h3 className="mt-2 text-base font-semibold text-white">Payment Complete!</h3>
                          <p className="mt-1 text-xs text-white/50">
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
                  <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2">
                    <p className="text-xs text-white/40">
                      Card payments are demo only. Please use Wallet to complete payment.
                    </p>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-medium mb-1 block text-white/60">Card number</label>
                      <Input
                        placeholder="1234 1234 1234 1234"
                        value={cardNumber}
                        onChange={(e) => setCardNumber(e.target.value)}
                        disabled
                        className="h-9 bg-white/[0.04] border-white/[0.08] text-white placeholder:text-white/20"
                      />
                      <div className="flex gap-2 mt-1.5">
                        <div className="h-5 w-8 bg-white/[0.06] rounded"></div>
                        <div className="h-5 w-8 bg-white/[0.06] rounded"></div>
                        <div className="h-5 w-8 bg-white/[0.06] rounded"></div>
                        <div className="h-5 w-8 bg-white/[0.06] rounded"></div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium mb-1 block text-white/60">Expiration date</label>
                        <Input
                          placeholder="MM / YY"
                          value={cardExpiry}
                          onChange={(e) => setCardExpiry(e.target.value)}
                          disabled
                          className="h-9 bg-white/[0.04] border-white/[0.08] text-white placeholder:text-white/20"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium mb-1 block text-white/60">CVC</label>
                        <Input
                          placeholder="CVC"
                          value={cardCVC}
                          onChange={(e) => setCardCVC(e.target.value)}
                          disabled
                          className="h-9 bg-white/[0.04] border-white/[0.08] text-white placeholder:text-white/20"
                        />
                      </div>
                    </div>
                  </div>
                  <Button
                    onClick={() => {
                      toast.info("Card payments are demo only. Please use Wallet to pay.")
                      setPaymentMethod("privy")
                    }}
                    className="w-full bg-[#c8ff00]/50 text-black/50 font-semibold border-0 cursor-not-allowed"
                    size="default"
                    disabled
                  >
                    Pay ${amountDisplay.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </Button>
              </div>
            )}

              {paymentMethod === "bank" && (
                <div className="space-y-3">
                  <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2">
                    <p className="text-xs text-white/40">
                      Bank transfers are demo only. Please use Wallet to complete payment.
                </p>
              </div>
                  <Button
                    onClick={() => {
                      toast.info("Bank transfers are demo only. Please use Wallet to pay.")
                      setPaymentMethod("privy")
                    }}
                    className="w-full bg-[#c8ff00]/50 text-black/50 font-semibold border-0 cursor-not-allowed"
                    size="default"
                    disabled
                  >
                    Pay ${amountDisplay.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </Button>
                </div>
              )}
              {/* Reject button */}
              {!isRejected && isBuyer && supabaseMetadata?.id && (
                <div className="mt-3 pt-3 border-t border-white/[0.06]">
                  <button
                    onClick={handleReject}
                    disabled={isRejecting}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-red-500/30 text-red-400 text-sm font-medium hover:bg-red-500/10 transition-colors disabled:opacity-50"
                  >
                    {isRejecting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <AlertTriangle className="h-4 w-4" />
                    )}
                    {isRejecting ? 'Rejecting...' : 'Reject Invoice'}
                  </button>
                </div>
              )}
            </div>
          )}

            {invoice.status >= 2 && (
            <div className="rounded-2xl border border-[#c8ff00]/20 bg-[#c8ff00]/5 p-4 text-center">
              <CheckCircle2 className="mx-auto h-10 w-10 text-[#c8ff00]" />
              <h3 className="mt-2 text-base font-semibold text-white">
                {invoice.status === 3 ? "Invoice Cleared" : "Invoice Paid"}
              </h3>
              <p className="mt-1 text-xs text-white/50">
                {invoice.status === 3 
                  ? "This invoice has been fully settled on-chain."
                  : "Payment has been received and settlement is in progress."}
              </p>
              </div>
            )}

          {/* Footer */}
          <div className="flex items-center justify-between mt-4">
            <div className="text-left text-xs text-white/30">
              <p>Powered by <span className="text-[#c8ff00]/60 font-medium">Monaris</span></p>
              <div className="flex items-center gap-3 mt-1">
                <a href="#" className="hover:text-white/60 transition-colors">Terms</a>
                <a href="#" className="hover:text-white/60 transition-colors">Privacy</a>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-white/40">
              <div className="h-2 w-2 rounded-full flex-shrink-0" style={{ 
                backgroundColor: isActuallyLoggedIn ? '#c8ff00' : '#ef4444',
                opacity: isActuallyLoggedIn ? 1 : 0.5
              }} />
              {isActuallyLoggedIn && address ? (
                <>
                  <span className="font-mono">{address.slice(0, 6)}...{address.slice(-4)}</span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(address)
                      toast.success("Address copied to clipboard")
                    }}
                    className="hover:text-white/70 transition-colors"
                    title="Copy full address"
                  >
                    <Copy className="h-3 w-3" />
                  </button>
                </>
              ) : (
                <span>Not connected</span>
              )}
            </div>
          </div>
        </motion.div>
      </div>

      {isPrivacyEnabled && (
        <ShieldDialog
          open={shieldDialogOpen}
          onOpenChange={setShieldDialogOpen}
        />
      )}
    </div>
  )
}
