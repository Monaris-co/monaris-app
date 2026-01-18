import { motion } from "framer-motion"
import { useMemo, useState, useEffect } from "react"
import { 
  Zap, 
  TrendingUp, 
  Clock, 
  DollarSign,
  ArrowRight,
  Info,
  CheckCircle2,
  Loader2,
  Copy,
  Eye
} from "lucide-react"
import { Link } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { StatCard } from "@/components/ui/stat-card"
import { StatusBadge } from "@/components/ui/status-badge"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useSellerInvoicesWithData, InvoiceStatus } from "@/hooks/useInvoice"
import { useReputation } from "@/hooks/useReputation"
import { useAdvance, useTotalDebt, useRequestAdvance } from "@/hooks/useAdvance"
import { useVault } from "@/hooks/useVault"
import { formatUnits } from "viem"
import { toast } from "sonner"
import { useReadContract, usePublicClient, useChainId } from "wagmi"
import { InvoiceRegistryABI } from "@/lib/abis"
import { useChainAddresses } from "@/hooks/useChainAddresses"
import { getPaymentLink } from "@/lib/chain-utils"

const STATUS_MAP: Record<InvoiceStatus, string> = {
  0: "issued",
  1: "financed",
  2: "paid",
  3: "cleared",
}

export default function Financing() {
  const chainId = useChainId()
  const { invoices, isLoading: isLoadingInvoices } = useSellerInvoicesWithData()
  const { tierLabel, isLoading: isLoadingReputation } = useReputation()
  const { totalDebt, isLoading: isLoadingDebt } = useTotalDebt()
  const { totalLiquidity, totalBorrowed, isLoading: isLoadingVault } = useVault()

  // Check if on Arbitrum Mainnet (42161) - show coming soon message
  const isArbitrumMainnet = chainId === 42161

  // Calculate max LTV and APR based on tier
  const ltvMap: Record<string, number> = { A: 0.90, B: 0.65, C: 0.35 }
  // Tier C uses fixed 18% APR, other tiers use ranges
  const aprMap: Record<string, { min: number; max: number; fixed?: number }> = {
    A: { min: 6, max: 8 },
    B: { min: 8, max: 12 },
    C: { min: 15.25, max: 18, fixed: 18 }, // Fixed 18% APR for Tier C
  }

  const maxLTV = ltvMap[tierLabel] || 0.75
  const aprRange = aprMap[tierLabel] || { min: 8, max: 12 }
  // For Tier C, use fixed 18% APR
  const fixedApr = aprRange.fixed

  // Show coming soon message for Arbitrum Mainnet
  if (isArbitrumMainnet) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-8"
      >
        <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-6">
          <div className="rounded-full bg-primary/10 p-6">
            <Zap className="h-16 w-16 text-primary" />
          </div>
          <div className="text-center space-y-3">
            <h1 className="text-4xl font-bold tracking-tight">Financing</h1>
            <p className="text-xl text-muted-foreground">Coming Soon (Stay Tuned)</p>
            <p className="text-sm text-muted-foreground max-w-md">
              The financing feature is currently being deployed on Arbitrum Mainnet. 
              Please check back soon
            </p>
          </div>
        </div>
      </motion.div>
    )
  }

  // Eligible invoices (status === 0, "Issued") - for stats calculation
  const eligibleInvoices = useMemo(() => {
    if (!invoices) return []
    
    return invoices
      .filter(inv => inv.status === 0)
      .map(invoice => {
        const amount = parseFloat(formatUnits(invoice.amount, 6))
        const maxAdvance = amount * maxLTV
        const aprDisplay = fixedApr ? `${fixedApr}%` : `${aprRange.min}-${aprRange.max}%`
        
        return {
          id: `INV-${invoice.invoiceId.toString().padStart(6, '0')}`,
          invoiceId: invoice.invoiceId,
          buyer: `${invoice.buyer.slice(0, 6)}...${invoice.buyer.slice(-4)}`,
          buyerFull: invoice.buyer,
          amount,
          maxAdvance,
          apr: aprDisplay,
          tier: tierLabel,
          dueDate: new Date(Number(invoice.dueDate) * 1000),
        }
      })
  }, [invoices, maxLTV, aprRange, tierLabel, fixedApr])

  // All invoices for display (excluding status 1 which are shown in Active Positions)
  const allInvoices = useMemo(() => {
    if (!invoices) return []
    
    return invoices
      .filter(inv => inv.status !== 1) // Exclude financed invoices (they're in Active Positions)
      .map(invoice => {
        const amount = parseFloat(formatUnits(invoice.amount, 6))
        const maxAdvance = amount * maxLTV
        const aprDisplay = fixedApr ? `${fixedApr}%` : `${aprRange.min}-${aprRange.max}%`
        
        return {
          id: `INV-${invoice.invoiceId.toString().padStart(6, '0')}`,
          invoiceId: invoice.invoiceId,
          buyer: `${invoice.buyer.slice(0, 6)}...${invoice.buyer.slice(-4)}`,
          buyerFull: invoice.buyer,
          amount,
          maxAdvance,
          apr: aprDisplay,
          tier: tierLabel,
          dueDate: new Date(Number(invoice.dueDate) * 1000),
          status: invoice.status,
        }
      })
  }, [invoices, maxLTV, aprRange, tierLabel, fixedApr])

  // Active positions (status === 1, "Financed")
  const activePositions = useMemo(() => {
    if (!invoices) return []
    
    return invoices
      .filter(inv => inv.status === 1)
      .map(invoice => {
        const amount = parseFloat(formatUnits(invoice.amount, 6))
        return {
          invoiceId: invoice.invoiceId,
          id: `INV-${invoice.invoiceId.toString().padStart(6, '0')}`,
          dueDate: new Date(Number(invoice.dueDate) * 1000).toLocaleDateString(),
          dueDateTimestamp: Number(invoice.dueDate),
        }
      })
  }, [invoices])

  // Calculate stats
  const stats = useMemo(() => {
    const availableToAdvance = eligibleInvoices.reduce((sum, inv) => sum + inv.maxAdvance, 0)
    const totalDebtAmount = totalDebt ? parseFloat(formatUnits(totalDebt, 6)) : 0
    
    return {
      availableToAdvance,
      totalDebt: totalDebtAmount,
      eligibleCount: eligibleInvoices.length,
      activeCount: activePositions.length,
    }
  }, [eligibleInvoices, totalDebt, activePositions])

  // Calculate available liquidity (totalLiquidity - totalBorrowed)
  // Note: useVault already returns numbers (parseFloat), not bigints
  const availableLiquidity = useMemo(() => {
    const liquidity = totalLiquidity || 0
    const borrowed = totalBorrowed || 0
    return Math.max(0, liquidity - borrowed)
  }, [totalLiquidity, totalBorrowed])

  const isLoading = isLoadingInvoices || isLoadingReputation || isLoadingDebt || isLoadingVault

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8 px-3 sm:px-4 md:px-0"
    >
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Financing</h1>
        <p className="text-muted-foreground">
          Get instant advances on your outstanding invoices
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Available to Advance"
          value={isLoading ? "..." : `$${stats.availableToAdvance.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
          subtitle={isLoading ? "Loading..." : `${stats.eligibleCount} eligible invoice${stats.eligibleCount !== 1 ? 's' : ''}`}
          icon={DollarSign}
          variant="primary"
        />
        <StatCard
          title="Outstanding Advances"
          value={isLoading ? "..." : `$${stats.totalDebt.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
          subtitle={
            isLoading 
              ? "Loading..." 
              : stats.totalDebt === 0
              ? "No outstanding debt"
              : `${stats.activeCount} active position${stats.activeCount !== 1 ? 's' : ''}`
          }
          icon={Clock}
          variant="warning"
        />
        <StatCard
          title="Current Tier"
          value={isLoadingReputation ? "..." : tierLabel}
          subtitle={isLoadingReputation ? "Loading..." : `${(maxLTV * 100).toFixed(0)}% max LTV`}
          icon={TrendingUp}
        />
        <StatCard
          title="Est. APR Range"
          value={isLoadingReputation ? "..." : fixedApr ? `${fixedApr}%` : `${aprRange.min}-${aprRange.max}%`}
          subtitle={isLoadingReputation ? "Loading..." : "Based on your tier"}
          icon={Zap}
          variant="success"
        />
      </div>

      {/* Active positions */}
      {activePositions.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-6 shadow-md">
          <h2 className="mb-6 text-lg font-semibold">Active Positions</h2>
          <div className="space-y-4">
            {activePositions.map((position) => (
              <ActivePositionCard 
                key={position.id} 
                invoiceId={position.invoiceId} 
                dueDate={position.dueDate}
                dueDateTimestamp={position.dueDateTimestamp}
                aprRange={aprRange}
              />
            ))}
          </div>
        </div>
      )}

      {/* All invoices */}
      <div className="rounded-xl border border-border bg-card p-6 shadow-md">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">All Invoices</h2>
            <Tooltip>
              <TooltipTrigger>
                <Info className="h-4 w-4 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent>
                <p className="max-w-xs text-sm">
                  All your invoices. Only invoices with "Issued" status can receive advances.
                </p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        <div className="space-y-4">
          {isLoadingInvoices ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <span className="ml-3 text-muted-foreground">Loading invoices...</span>
            </div>
          ) : allInvoices.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <p className="text-muted-foreground mb-4">No invoices found</p>
              <p className="text-sm text-muted-foreground">Create invoices to get started</p>
            </div>
          ) : (
            allInvoices.map((invoice, index) => (
              <EligibleInvoiceCard
                key={invoice.id}
                invoice={invoice}
                index={index}
                maxLTV={maxLTV}
                aprRange={aprRange}
                fixedApr={fixedApr}
                availableLiquidity={availableLiquidity}
              />
            ))
          )}
        </div>
      </div>

      {/* How it works */}
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-6">
        <h3 className="mb-4 font-semibold">How Financing Works</h3>
        <div className="grid gap-4 md:grid-cols-4">
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold">1</div>
            <div>
              <p className="font-medium">Request Advance</p>
              <p className="text-sm text-muted-foreground">Choose an eligible invoice</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold">2</div>
            <div>
              <p className="font-medium">Receive Funds</p>
                      <p className="text-sm text-muted-foreground">Get USDC in minutes</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold">3</div>
            <div>
              <p className="font-medium">Invoice Paid</p>
              <p className="text-sm text-muted-foreground">Buyer pays the invoice</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold">4</div>
            <div>
              <p className="font-medium">Auto Settlement</p>
              <p className="text-sm text-muted-foreground">Advance repaid, you get the rest</p>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

// Component for active position card
function ActivePositionCard({ 
  invoiceId, 
  dueDate,
  dueDateTimestamp,
  aprRange 
}: { 
  invoiceId: bigint
  dueDate: string
  dueDateTimestamp: number
  aprRange: { min: number; max: number; fixed?: number }
}) {
  const { advance, isLoading } = useAdvance(invoiceId)
  const chainId = useChainId()

  if (isLoading) {
    return (
      <div className="rounded-xl border border-warning/20 bg-warning/5 p-5">
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      </div>
    )
  }

  if (!advance) {
    return null
  }

  const advanceAmount = parseFloat(formatUnits(advance.advanceAmount, 6))
  
  // Recalculate interest and repayment using fixed APR (18% for Tier C) if applicable
  // Use the same formula as the contract: interest = principal * APR * (daysUntilDue / 365)
  let outstanding = parseFloat(formatUnits(advance.totalRepayment, 6))
  if (aprRange.fixed) {
    // Recalculate using fixed APR (e.g., 18% for Tier C)
    // Calculate from request time to due date (same as contract does)
    const requestedAtTimestamp = Number(advance.requestedAt)
    const daysUntilDue = Math.max(0, Math.floor((dueDateTimestamp - requestedAtTimestamp) / 86400))
    const principal = advanceAmount
    const interest = (principal * aprRange.fixed * daysUntilDue) / (100 * 365)
    outstanding = principal + interest
  }
  
  // Use tier-based APR (18% for Tier C, range for others)
  // This ensures consistency with the current tier and avoids showing outdated APR values
  const apr = aprRange.fixed ? `${aprRange.fixed}%` : `${aprRange.min}-${aprRange.max}%`

  return (
    <div className="rounded-xl border border-warning/20 bg-warning/5 p-5">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <Link 
              to={`/app/invoices/${invoiceId}`}
              className="font-semibold text-primary hover:underline"
            >
              INV-{invoiceId.toString().padStart(6, '0')}
            </Link>
            <StatusBadge status="financed">Active</StatusBadge>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-x-8 gap-y-2 text-sm md:grid-cols-4">
            <div>
              <p className="text-muted-foreground">Advance Amount</p>
              <p className="font-semibold number-display">${advanceAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Outstanding</p>
              <p className="font-semibold number-display text-warning">${outstanding.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            </div>
            <div>
              <p className="text-muted-foreground">APR</p>
              <p className="font-semibold">{apr}%</p>
            </div>
            <div>
              <p className="text-muted-foreground">Due Date</p>
              <p className="font-semibold">{dueDate}</p>
            </div>
          </div>
        </div>
      </div>
      
      <div className="mt-4 rounded-lg bg-card p-4">
        <div className="flex items-center gap-2 text-sm">
          <CheckCircle2 className="h-4 w-4 text-success" />
          <span className="text-muted-foreground">
            This advance will be automatically repaid when the buyer pays the invoice. No manual action needed.
          </span>
        </div>
      </div>
      
      {/* Payment Link Section */}
      <div className="mt-4 rounded-lg border border-primary/20 bg-primary/5 p-4">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <p className="text-sm font-medium text-primary mb-1">Share Payment Link with Buyer</p>
            <p className="text-xs text-muted-foreground">
              Send this link to the buyer so they can pay the invoice
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const link = getPaymentLink(chainId, invoiceId)
              navigator.clipboard.writeText(link)
              toast.success("Payment link copied!", {
                description: "Share this link with the buyer to receive payment",
              })
            }}
          >
            <Copy className="h-4 w-4 mr-2" />
            Copy Link
          </Button>
        </div>
        <div className="mt-2 rounded-md bg-background p-2 border border-border">
          <p className="text-xs font-mono text-muted-foreground break-all">
            {getPaymentLink(chainId, invoiceId)}
          </p>
        </div>
      </div>
    </div>
  )
}

// Component for invoice card (shows all invoices, but only allows advance request for eligible ones)
function EligibleInvoiceCard({ 
  invoice, 
  index, 
  maxLTV, 
  aprRange,
  fixedApr,
  availableLiquidity 
}: { 
  invoice: {
    id: string
    invoiceId: bigint
    buyer: string
    buyerFull: string
    amount: number
    maxAdvance: number
    apr: string
    tier: string
    dueDate: Date
    status?: InvoiceStatus
  }
  index: number
  maxLTV: number
  aprRange: { min: number; max: number }
  fixedApr?: number
  availableLiquidity: number
}) {
  const { requestAdvance, hash, isPending, isConfirming, isSuccess, error } = useRequestAdvance()
  const [isRequesting, setIsRequesting] = useState(false)
  const chainId = useChainId()
  const addresses = useChainAddresses()
  const publicClient = usePublicClient({ chainId })
  // Check if invoice already has an advance (if it does, it's already financed and not eligible)
  // Note: useAdvance will error/revert if no advance exists, which is expected and fine
  // We only care if existingAdvance exists and has an advanceAmount > 0
  const { advance: existingAdvance } = useAdvance(invoice.invoiceId)

  // Determine if this invoice can request an advance (status === 0 and no existing advance)
  const canRequestAdvance = invoice.status === 0 && (!existingAdvance || !existingAdvance.advanceAmount || existingAdvance.advanceAmount === 0n)
  const hasEnoughLiquidity = availableLiquidity >= invoice.maxAdvance

  // Check invoice status in real-time - use this to disable button if status changed
  const { data: invoiceData, refetch: refetchInvoiceStatus } = useReadContract({
    address: addresses.InvoiceRegistry as `0x${string}`,
    abi: InvoiceRegistryABI,
    functionName: 'getInvoice',
    args: [invoice.invoiceId],
    chainId,
    query: {
      enabled: !!invoice.invoiceId && !!addresses.InvoiceRegistry,
      refetchInterval: 10000, // Reduced frequency to avoid rate limits
    },
  })

  // Check if invoice status is still "Issued" (0) - default to false if data unavailable to be safe
  // Also check if invoice already has an advance (which means it's already financed)
  const isInvoiceIssued = useMemo(() => {
    // If invoice already has an advance, it's not eligible
    // Note: existingAdvance will only exist if there IS an advance, error means no advance
    if (existingAdvance && existingAdvance.advanceAmount && existingAdvance.advanceAmount > 0n) {
      console.log(`Invoice ${invoice.invoiceId.toString()} already has an advance (${existingAdvance.advanceAmount.toString()}), not eligible`)
      return false
    }
    
    if (!invoiceData) {
      console.log(`Invoice ${invoice.invoiceId.toString()}: No invoiceData yet, button disabled`)
      return false // Don't allow if we can't verify status
    }
    
    try {
      const status = (invoiceData as any).status
      // Handle both bigint and number types
      const statusNum = typeof status === 'bigint' ? Number(status) : Number(status)
      const isIssued = statusNum === 0
      console.log(`Invoice ${invoice.invoiceId.toString()}: Status=${statusNum}, isIssued=${isIssued}`)
      return isIssued
    } catch (e) {
      console.error('Error checking invoice status:', e)
      return false
    }
  }, [invoiceData, existingAdvance, invoice.invoiceId])

  const handleRequestAdvance = async () => {
    if (!hasEnoughLiquidity) {
      toast.error("Insufficient Vault Liquidity", {
        description: `The vault only has $${availableLiquidity.toLocaleString(undefined, { maximumFractionDigits: 2 })} available. You need $${invoice.maxAdvance.toLocaleString(undefined, { maximumFractionDigits: 2 })}. Please wait for liquidity providers to deposit more funds.`,
        duration: 8000,
      })
      return
    }

    try {
      setIsRequesting(true)
      
      // Read invoice status directly from contract right before sending (most up-to-date)
      if (!publicClient || !addresses.InvoiceRegistry) {
        throw new Error("Unable to verify invoice status. Please try again.")
      }

      // CRITICAL: Check if invoice already has an advance FIRST (this is the most reliable check)
      console.log(`[Advance Request] Checking if invoice ${invoice.invoiceId.toString()} already has an advance...`)
      
      try {
        const AdvanceEngineABI = [
          "function getAdvance(uint256 invoiceId) external view returns (tuple(uint256 invoiceId, address seller, uint256 advanceAmount, uint256 principal, uint256 interest, uint256 totalRepayment, uint256 requestedAt, bool repaid))"
        ] as const
        
        const existingAdvanceCheck = await publicClient.readContract({
          address: addresses.AdvanceEngine as `0x${string}`,
          abi: AdvanceEngineABI,
          functionName: 'getAdvance',
          args: [invoice.invoiceId],
        }) as any
        
        if (existingAdvanceCheck && existingAdvanceCheck.advanceAmount > 0n) {
          console.error(`[Advance Request] BLOCKED: Invoice ${invoice.invoiceId.toString()} already has an advance!`)
          toast.error("Invoice already financed", {
            description: `This invoice already has an advance of ${(Number(existingAdvanceCheck.advanceAmount) / 1e6).toFixed(2)} USDC. It cannot be financed again. Please refresh the page.`,
            duration: 10000,
          })
          setIsRequesting(false)
          return
        }
        console.log(`[Advance Request] Invoice ${invoice.invoiceId.toString()} does not have an existing advance`)
      } catch (err: any) {
        // getAdvance will revert if no advance exists, which is what we want
        console.log(`[Advance Request] Invoice ${invoice.invoiceId.toString()} does not have an advance (expected revert)`)
      }
      
      // CRITICAL: Check if invoice already has an advance FIRST (this is the most reliable check)
      console.log(`[Advance Request] Checking if invoice ${invoice.invoiceId.toString()} already has an advance...`)
      
      try {
        const AdvanceEngineABI = [
          "function getAdvance(uint256 invoiceId) external view returns (tuple(uint256 invoiceId, address seller, uint256 advanceAmount, uint256 principal, uint256 interest, uint256 totalRepayment, uint256 requestedAt, bool repaid))"
        ] as const
        
        const existingAdvanceCheck = await publicClient.readContract({
          address: addresses.AdvanceEngine as `0x${string}`,
          abi: AdvanceEngineABI,
          functionName: 'getAdvance',
          args: [invoice.invoiceId],
        }) as any
        
        if (existingAdvanceCheck && existingAdvanceCheck.advanceAmount > 0n) {
          console.error(`[Advance Request] BLOCKED: Invoice ${invoice.invoiceId.toString()} already has an advance!`)
          toast.error("Invoice already financed", {
            description: `This invoice already has an advance of ${(Number(existingAdvanceCheck.advanceAmount) / 1e6).toFixed(2)} USDC. It cannot be financed again. Please refresh the page.`,
            duration: 10000,
          })
          setIsRequesting(false)
          return
        }
        console.log(`[Advance Request] Invoice ${invoice.invoiceId.toString()} does not have an existing advance`)
      } catch (err: any) {
        // getAdvance will revert if no advance exists, which is what we want
        console.log(`[Advance Request] Invoice ${invoice.invoiceId.toString()} does not have an advance (expected revert)`)
      }
      
      // CRITICAL: Read invoice status directly from contract right before sending
      // This ensures we have the absolute latest on-chain status
      console.log(`[Advance Request] Starting status check for invoice ${invoice.invoiceId.toString()}`)
      
      const currentInvoice = await publicClient.readContract({
        address: addresses.InvoiceRegistry as `0x${string}`,
        abi: InvoiceRegistryABI,
        functionName: 'getInvoice',
        args: [invoice.invoiceId],
      }) as any
      
      console.log(`[Advance Request] Invoice data received:`, {
        invoiceId: currentInvoice?.invoiceId?.toString(),
        status: currentInvoice?.status,
        seller: currentInvoice?.seller,
        buyer: currentInvoice?.buyer,
        amount: currentInvoice?.amount?.toString()
      })
      
      if (!currentInvoice || !currentInvoice.invoiceId || currentInvoice.invoiceId === 0n) {
        console.error(`[Advance Request] Invoice ${invoice.invoiceId.toString()} not found`)
        toast.error("Invoice not found", {
          description: "The invoice could not be found. Please refresh and try again.",
          duration: 8000,
        })
        setIsRequesting(false)
        return
      }

      // Check if invoice status is still "Issued" (status === 0)
      // Handle both bigint and number types
      const statusValue = currentInvoice.status
      const invoiceStatus = typeof statusValue === 'bigint' ? Number(statusValue) : Number(statusValue)
      
      console.log(`[Advance Request] Status check result for invoice ${invoice.invoiceId.toString()}:`, {
        statusValue,
        invoiceStatus,
        isIssued: invoiceStatus === 0,
        currentInvoice: {
          invoiceId: currentInvoice.invoiceId.toString(),
          status: invoiceStatus,
          seller: currentInvoice.seller,
          amount: currentInvoice.amount.toString()
        }
      })
      
      if (invoiceStatus !== 0) {
        const statusNames: Record<number, string> = {
          1: "Financed",
          2: "Paid",
          3: "Cleared"
        }
        const statusName = statusNames[invoiceStatus] || "Unknown"
        console.error(`[Advance Request] BLOCKED: Invoice ${invoice.invoiceId.toString()} status is ${statusName} (${invoiceStatus}), not Issued (0)`)
        toast.error("Invoice status changed", {
          description: `This invoice is no longer eligible for advance. Current status: ${statusName}. The invoice may have been paid or financed already. Please refresh the page.`,
          duration: 10000,
        })
        setIsRequesting(false)
        return
      }
      
      console.log(`[Advance Request] Status check PASSED for invoice ${invoice.invoiceId.toString()}, proceeding with requestAdvance...`)
      
      // Convert LTV percentage to basis points (e.g., 0.75 = 7500)
      const ltvBps = Math.floor(maxLTV * 10000)
      // Use fixed APR for Tier C (18%), otherwise use mid-point of APR range
      const aprToUse = fixedApr || ((aprRange.min + aprRange.max) / 2)
      const aprBps = Math.floor(aprToUse * 100)
      
      await requestAdvance(invoice.invoiceId, ltvBps, aprBps)
      
      // If we get here without error, transaction was submitted
      toast.success("Advance requested!", {
        description: "Your transaction is being processed...",
      })
    } catch (err: any) {
      console.error("Error requesting advance:", err)
      
      // Don't show error if transaction succeeded (has hash or isSuccess)
      // The "already known" error means transaction was submitted successfully
      const isAlreadyKnown = err?.message?.includes('already known') || 
                            err?.message?.includes('nonce too low') ||
                            err?.message?.includes('replacement transaction underpriced')
      
      if ((isAlreadyKnown && hash) || isSuccess) {
        // Transaction succeeded despite error, don't show error toast
        console.log('Transaction succeeded despite error:', err.message)
        toast.success("Advance requested!", {
          description: "Your transaction is being processed...",
        })
        return
      }
      
      // Handle specific error messages
      let errorMessage = err.message || "Please try again"
      if (err.message?.includes("Insufficient vault liquidity") || err.message?.includes("Insufficient liquidity")) {
        errorMessage = `The vault doesn't have enough liquidity. Available: $${availableLiquidity.toLocaleString(undefined, { maximumFractionDigits: 2 })}. Needed: $${invoice.maxAdvance.toLocaleString(undefined, { maximumFractionDigits: 2 })}.`
      } else if (err.message?.includes("Invalid status")) {
        errorMessage = "This invoice is no longer eligible for advance. It may have been paid or financed already. Please refresh the page to see the latest status."
      } else if (err.message?.includes("Not invoice seller")) {
        errorMessage = "You can only request advances on your own invoices."
      } else if (err.message?.includes("Must have valid access token") || err.message?.includes("Privy wallet")) {
        // Handle Privy authentication errors more gracefully
        errorMessage = "Please ensure you're logged in with your Privy wallet. Try refreshing the page."
      }
      
      toast.error("Failed to request advance", {
        description: errorMessage,
        duration: 10000,
      })
    } finally {
      setIsRequesting(false)
    }
  }

  const isLoading = isPending || isConfirming || isRequesting

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
      className="rounded-xl border border-border p-5 transition-all hover:border-primary/30 hover:shadow-md"
    >
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <Link 
              to={`/app/invoices/${invoice.invoiceId}`}
              className="font-semibold text-primary hover:underline"
            >
              {invoice.id}
            </Link>
            {invoice.status !== undefined && (
              <>
                <span className="text-muted-foreground">•</span>
                <StatusBadge status={STATUS_MAP[invoice.status] as any}>
                  {STATUS_MAP[invoice.status] || 'Unknown'}
                </StatusBadge>
              </>
            )}
            <span className="text-muted-foreground">•</span>
            <span className="text-muted-foreground font-mono text-sm">{invoice.buyer.slice(0, 6)}...{invoice.buyer.slice(-4)}</span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-x-8 gap-y-2 text-sm md:grid-cols-4">
            <div>
              <p className="text-muted-foreground">Invoice Amount</p>
              <p className="font-semibold number-display">${invoice.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Max Advance ({(maxLTV * 100).toFixed(0)}%)</p>
              <p className="font-semibold number-display text-primary">${invoice.maxAdvance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Est. APR</p>
              <p className="font-semibold">{fixedApr ? `${fixedApr}%` : `${aprRange.min}-${aprRange.max}%`}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Tier</p>
              <p className="font-semibold">{invoice.tier}</p>
            </div>
          </div>
        </div>
        <div className="flex-shrink-0">
          {canRequestAdvance ? (
            <Button 
              variant="hero"
              size="default"
              className="w-full sm:w-auto whitespace-nowrap"
              onClick={handleRequestAdvance}
              disabled={isLoading || !hasEnoughLiquidity || !isInvoiceIssued}
              title={
                !hasEnoughLiquidity 
                  ? `Insufficient vault liquidity. Available: $${availableLiquidity.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                  : !isInvoiceIssued 
                  ? "Invoice status has changed. This invoice is no longer eligible for advance."
                  : undefined
              }
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : !hasEnoughLiquidity ? (
                <>
                  <Zap className="mr-2 h-4 w-4" />
                  Insufficient Liquidity
                </>
              ) : (
                <>
                  <Zap className="mr-2 h-4 w-4" />
                  Request Advance
                </>
              )}
            </Button>
          ) : (
            <Button 
              variant="outline"
              size="default"
              className="w-full sm:w-auto whitespace-nowrap"
              asChild
            >
              <Link to={`/app/invoices/${invoice.invoiceId}`}>
                <Eye className="mr-2 h-4 w-4" />
                View Invoice
              </Link>
            </Button>
          )}
        </div>
      </div>
    </motion.div>
  )
}

