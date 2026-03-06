import { motion } from "framer-motion"
import { useMemo, useEffect, useState, useRef } from "react"
import {
  FileText,
  Plus,
  TrendingUp,
  ArrowUpRight,
  ArrowRight,
  Clock,
  DollarSign,
  CheckCircle2,
  Zap,
  Loader2,
  ArrowUpLeft,
  Copy,
  ExternalLink,
  Coins,
  ChevronDown,
  QrCode,
  Download,
  Camera,
  X,
  AlertTriangle,
  Inbox,
} from "lucide-react"
import { Link } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { StatCard } from "@/components/ui/stat-card"
import { StatusBadge } from "@/components/ui/status-badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useSellerInvoicesWithData, InvoiceStatus, useBuyerInvoices, useSellerSupabaseInvoices, SupabaseInvoice, rejectInvoice as rejectInvoiceAction } from "@/hooks/useInvoice"
import { useReputation } from "@/hooks/useReputation"
import { useTokenBalance } from "@/hooks/useTokenBalance"
import { useUSMTBalance } from "@/hooks/useUSMTBalance"
import { usePrivyAccount } from "@/hooks/usePrivyAccount"
import { useSendTransaction, useWallets } from "@privy-io/react-auth"
import { useBalance, useWaitForTransactionReceipt, useChainId, usePublicClient } from "wagmi"
import { useChainAddresses } from "@/hooks/useChainAddresses"
import { DemoUSDCABI, USMTPlusABI, InvoiceRegistryABI } from "@/lib/abis"
import { formatUnits, parseUnits, encodeFunctionData, isAddress } from "viem"
import { supabase, isSupabaseConfigured } from "@/lib/supabase"
import { toast } from "sonner"
import { QRCodeSVG } from "qrcode.react"
import { getExplorerUrl, getChainMetadata } from "@/lib/chain-utils"

const STATUS_MAP: Record<InvoiceStatus, string> = {
  0: "issued",
  1: "financed",
  2: "paid",
  3: "cleared",
}

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
}

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 }
}

export default function Dashboard() {
  const chainId = useChainId()
  const chainMetadata = getChainMetadata(chainId)
  const nativeTokenSymbol = chainMetadata?.nativeCurrency.symbol || "ETH"
  const addresses = useChainAddresses()
  const { invoices, isLoading: isLoadingInvoices, error: invoiceError } = useSellerInvoicesWithData()
  const { invoices: sellerSupaInvoices } = useSellerSupabaseInvoices()
  const { score, tierLabel, stats, isLoading: isLoadingReputation } = useReputation()
  const { balance: usdcBalance, isLoading: isLoadingBalance, error: balanceError } = useTokenBalance()
  const { balance: usmtBalance, isLoading: isLoadingUSMT } = useUSMTBalance()
  const { address } = usePrivyAccount()
  const { invoices: buyerInvoices, isLoading: isLoadingBuyerInvoices, refetch: refetchBuyerInvoices } = useBuyerInvoices()
  const publicClient = usePublicClient({ chainId })
  const [enrichedBuyerInvoices, setEnrichedBuyerInvoices] = useState<SupabaseInvoice[]>([])

  // Enrich buyer invoices with on-chain status & sync back to Supabase
  useEffect(() => {
    if (!buyerInvoices || buyerInvoices.length === 0 || !publicClient || !addresses.InvoiceRegistry) {
      setEnrichedBuyerInvoices(buyerInvoices || [])
      return
    }
    let cancelled = false
    const syncStatuses = async () => {
      const enriched = await Promise.all(
        buyerInvoices.map(async (inv) => {
          if (!inv.chain_invoice_id) return inv
          try {
            const onChain = await (publicClient.readContract as any)({
              address: addresses.InvoiceRegistry as `0x${string}`,
              abi: InvoiceRegistryABI,
              functionName: 'getInvoice',
              args: [BigInt(inv.chain_invoice_id)],
            }) as { status: number }
            const onChainStatus = STATUS_MAP[onChain.status as InvoiceStatus] || inv.status
            if (onChainStatus !== inv.status && isSupabaseConfigured()) {
              supabase.from('invoices').update({ status: onChainStatus }).eq('id', inv.id).then(() => {})
            }
            return { ...inv, status: onChainStatus }
          } catch {
            return inv
          }
        })
      )
      if (!cancelled) setEnrichedBuyerInvoices(enriched)
    }
    syncStatuses()
    return () => { cancelled = true }
  }, [buyerInvoices, publicClient, addresses.InvoiceRegistry])

  const { data: nativeBalance, isLoading: isLoadingNative } = useBalance({
    address: address as `0x${string}` | undefined,
    query: {
      enabled: !!address,
      refetchInterval: !!address ? 30000 : false, // Refresh every 30s only when address exists
      retry: 2, // Retry up to 2 times on failure
      retryDelay: 1000, // Wait 1s between retries
    },
  })

  // Convert native ETH/ArbETH to USD (approximate ETH price for display)
  // Note: In production, you'd want to fetch real-time ETH price from an oracle
  const ETH_PRICE_USD = 2500 // Approximate ETH price (you can fetch this from an API)
  const nativeBalanceFormatted = nativeBalance ? parseFloat(formatUnits(nativeBalance.value, 18)) : 0
  const nativeBalanceUSD = nativeBalanceFormatted * ETH_PRICE_USD

  // Calculate unified balance (sum of USDC + USMT+ + native ETH/ArbETH in USD)
  const unifiedBalance = useMemo(() => {
    const usdc = usdcBalance || 0
    const usmt = usmtBalance || 0
    const native = nativeBalanceUSD || 0
    return usdc + usmt + native
  }, [usdcBalance, usmtBalance, nativeBalanceUSD])

  // Only show loading if we're actually waiting for data (not just disabled queries)
  // If address or contract addresses are missing, we should show values immediately (0 or current)
  const hasAddress = !!address
  const hasUSDCAddress = !!addresses?.DemoUSDC
  const hasUSMTAddress = !!addresses?.USMTPlus

  // Only consider loading if we have the prerequisites and the query is actually loading
  const isLoadingAllBalances = (hasAddress && hasUSDCAddress && isLoadingBalance) ||
    (hasAddress && hasUSMTAddress && isLoadingUSMT) ||
    (hasAddress && isLoadingNative)
  const [withdrawDialogOpen, setWithdrawDialogOpen] = useState(false)
  const [receiveFundsDialogOpen, setReceiveFundsDialogOpen] = useState(false)
  const [hoveredSegment, setHoveredSegment] = useState<'balance' | 'cleared' | 'outstanding' | null>(null)
  const [isCardFlipped, setIsCardFlipped] = useState(false)
  const [autoEarnEnabled, setAutoEarnEnabled] = useState(() => {
    const saved = localStorage.getItem('autoEarnEnabled')
    return saved !== null ? JSON.parse(saved) : true
  })

  // Get cleared invoices (status === 3) - MUST BE BEFORE score calculation
  const clearedInvoices = useMemo(() => {
    if (!invoices) return []
    return invoices.filter(inv => inv.status === 3)
  }, [invoices])

  // Calculate score from cleared invoices count (more accurate than on-chain if reputation wasn't updated)
  // Formula: 450 (base) + (clearedCount × 20 points per invoice)
  const displayScore = useMemo(() => {
    const clearedCount = clearedInvoices.length
    const calculatedScoreFromInvoices = 450 + (clearedCount * 20)
    const hookScore = score > 0 ? score : 510
    const calculated = Math.max(hookScore, calculatedScoreFromInvoices)

    console.log('📊 Dashboard displayScore calculation:', {
      clearedCount,
      calculatedScoreFromInvoices,
      hookScore,
      finalDisplayScore: calculated,
      invoiceCount: invoices?.length,
      clearedInvoicesCount: clearedInvoices.length
    })

    return calculated
  }, [clearedInvoices, score, invoices?.length])

  // Calculate tier from score (score 510 should be Tier B)
  const displayTier = useMemo(() => {
    if (displayScore < 500) return 'C'
    if (displayScore < 850) return 'B'
    return 'A'
  }, [displayScore])

  // Use calculated tier for display (score 510 = Tier B)
  const effectiveTierLabel = displayTier

  // Log errors for debugging
  useEffect(() => {
    if (invoiceError) console.error('Dashboard: Invoice fetch error:', invoiceError)
    if (balanceError) console.error('Dashboard: Balance fetch error:', balanceError)
    console.log('Dashboard: Loading state', {
      isLoadingInvoices,
      isLoadingReputation,
      isLoadingBalance,
      isLoadingUSMT,
      isLoadingNative,
      isLoadingAllBalances,
    })
    console.log('Dashboard: Data state', {
      invoiceCount: invoices?.length,
      score,
      usdcBalance,
      usmtBalance,
      nativeBalanceFormatted,
      nativeBalanceUSD,
      unifiedBalance,
    })
    console.log('Dashboard: Addresses and prerequisites', {
      address,
      hasAddress,
      usdcAddress: addresses?.DemoUSDC,
      hasUSDCAddress,
      usmtAddress: addresses?.USMTPlus,
      hasUSMTAddress,
    })
  }, [invoiceError, balanceError, isLoadingInvoices, isLoadingReputation, isLoadingBalance, isLoadingUSMT, isLoadingNative, isLoadingAllBalances, invoices, score, usdcBalance, usmtBalance, nativeBalanceFormatted, nativeBalanceUSD, unifiedBalance, address, hasAddress, addresses, hasUSDCAddress, hasUSMTAddress])

  // Calculate stats from invoices (excluding rejected ones)
  const rejectedChainIds = useMemo(() => {
    const ids = new Set<number>()
    for (const si of (sellerSupaInvoices || [])) {
      if (si.status === 'rejected' && si.chain_invoice_id != null) {
        ids.add(si.chain_invoice_id)
      }
    }
    return ids
  }, [sellerSupaInvoices])

  const statsData = useMemo(() => {
    if (!invoices || invoices.length === 0) {
      return {
        outstanding: 0,
        outstandingCount: 0,
        clearedVolume: 0,
        advanceEligible: 0,
      }
    }

    // Exclude rejected invoices from all calculations
    const activeInvoices = invoices.filter(
      inv => !rejectedChainIds.has(Number(inv.invoiceId))
    )

    const outstandingInvoices = activeInvoices.filter(
      inv => inv.status === 0 || inv.status === 1
    )
    const outstanding = outstandingInvoices.reduce((sum, inv) => {
      return sum + parseFloat(formatUnits(inv.amount, 6))
    }, 0)

    const clearedInvoices = activeInvoices.filter(inv => inv.status === 3)
    const clearedVolume = clearedInvoices.reduce((sum, inv) => {
      return sum + parseFloat(formatUnits(inv.amount, 6))
    }, 0)

    const ltvMap: Record<string, number> = { A: 0.90, B: 0.65, C: 0.35 }
    const ltv = ltvMap[effectiveTierLabel] || 0.75
    const advanceEligible = outstandingInvoices.reduce((sum, inv) => {
      return sum + parseFloat(formatUnits(inv.amount, 6)) * ltv
    }, 0)

    return {
      outstanding,
      outstandingCount: outstandingInvoices.length,
      clearedVolume,
      advanceEligible,
    }
  }, [invoices, effectiveTierLabel, rejectedChainIds])

  // Get recent invoices (10 most recent)
  const recentInvoices = useMemo(() => {
    if (!invoices || invoices.length === 0) return []

    return invoices.slice(0, 10).map(invoice => {
      const invoiceDate = new Date(Number(invoice.createdAt) * 1000)
      const amount = parseFloat(formatUnits(invoice.amount, 6))

      return {
        id: `INV-${invoice.invoiceId.toString().padStart(6, '0')}`,
        invoiceId: invoice.invoiceId,
        buyer: `${invoice.buyer.slice(0, 6)}...${invoice.buyer.slice(-4)}`,
        amount,
        status: STATUS_MAP[invoice.status] as "issued" | "financed" | "paid" | "cleared",
        date: invoiceDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      }
    })
  }, [invoices])

  // Calculate progress to next tier (Tier A for Tier B users)
  const progressToNextTier = useMemo(() => {
    const tierThresholds = { C: 450, B: 500, A: 850 }
    const currentThreshold = tierThresholds[effectiveTierLabel as keyof typeof tierThresholds] || 500
    const nextTier = effectiveTierLabel === 'C' ? 'B' : effectiveTierLabel === 'B' ? 'A' : null
    const nextThreshold = nextTier ? tierThresholds[nextTier as keyof typeof tierThresholds] : 1000

    if (!nextTier) return 100

    const progress = ((displayScore - currentThreshold) / (nextThreshold - currentThreshold)) * 100
    return Math.max(0, Math.min(100, progress))
  }, [displayScore, effectiveTierLabel])

  const pointsToNextTier = useMemo(() => {
    const tierThresholds = { C: 450, B: 500, A: 850 }
    const currentThreshold = tierThresholds[effectiveTierLabel as keyof typeof tierThresholds] || 500
    const nextTier = effectiveTierLabel === 'C' ? 'B' : effectiveTierLabel === 'B' ? 'A' : null
    const nextThreshold = nextTier ? tierThresholds[nextTier as keyof typeof tierThresholds] : 1000

    if (!nextTier) return 0

    const needed = nextThreshold - displayScore
    return Math.max(0, needed)
  }, [displayScore, effectiveTierLabel])

  // Max LTV based on tier
  const maxLTV = useMemo(() => {
    const ltvMap: Record<string, number> = { A: 90, B: 65, C: 35 }
    return ltvMap[effectiveTierLabel] || 65
  }, [effectiveTierLabel])

  const isLoading = isLoadingInvoices || isLoadingReputation

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="space-y-6"
    >
      {/* Main Dashboard Container - Figma Style */}
      <motion.div
        variants={item}
        className="bg-white dark:bg-[#1a1a2e] rounded-[20px] sm:rounded-[32px] shadow-[0px_24px_32px_0px_rgba(0,0,0,0.04),0px_16px_24px_0px_rgba(0,0,0,0.04),0px_4px_8px_0px_rgba(0,0,0,0.04),0px_0px_1px_0px_rgba(0,0,0,0.04)] p-3 sm:p-8 mx-1 sm:mx-0"
      >
        {/* Page Header */}
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6 mb-8">
          <div>
            <h1 className="text-[32px] font-semibold text-[#404040] dark:text-white tracking-tight">Dashboard</h1>
            <p className="text-[#aeaeae] text-base mt-1">
              Get summary Cashflow Graph, Policy Router, Self-repaying Credit here
            </p>
          </div>

          {/* User Profile & Actions */}
          <div className="flex items-center gap-4">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-3 px-5 py-2.5 rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-[0px_2px_6px_0px_rgba(0,0,0,0.04)] hover:shadow-md transition-all">
                  <div className="w-8 h-8 rounded-full bg-[#197bbd]/10 flex items-center justify-center">
                    <DollarSign className="h-4 w-4 text-[#197bbd]" />
                  </div>
                  <div className="text-left">
                    <p className="text-xs text-[#aeaeae] font-medium">Total Balance</p>
                    <p className="text-lg font-semibold text-[#404040] dark:text-white">
                      {isLoadingAllBalances ? "..." : `$${unifiedBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                    </p>
                  </div>
                  <ChevronDown className="h-4 w-4 text-[#c7c7c7]" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64 p-3 rounded-2xl shadow-[0px_16px_24px_0px_rgba(0,0,0,0.06)]">
                <p className="text-xs font-semibold text-[#aeaeae] mb-2 px-1">Token Balances</p>
                <div className="space-y-1">
                  <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-[#f8f8f8] dark:bg-gray-800">
                    <span className="text-sm text-[#404040] dark:text-gray-300">USDC</span>
                    <span className="text-sm font-semibold text-[#404040] dark:text-white">
                      {isLoadingBalance ? "..." : usdcBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-[#f8f8f8] dark:bg-gray-800">
                    <span className="text-sm text-[#404040] dark:text-gray-300">USMT+</span>
                    <span className="text-sm font-semibold text-[#404040] dark:text-white">
                      {isLoadingUSMT ? "..." : usmtBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-[#f8f8f8] dark:bg-gray-800">
                    <span className="text-sm text-[#404040] dark:text-gray-300">{nativeTokenSymbol}</span>
                    <span className="text-sm font-semibold text-[#404040] dark:text-white">
                      {isLoadingNative ? "..." : nativeBalanceFormatted.toFixed(4)}
                    </span>
                  </div>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Cards Section - Balance & Stats */}
        <div className="grid lg:grid-cols-12 gap-2 sm:gap-6 mb-4 sm:mb-6">
          {/* Left: Balance Card */}
          <div className="lg:col-span-5">
            <div className="bg-white dark:bg-gray-800 rounded-[16px] sm:rounded-[28px] shadow-[0px_16px_24px_0px_rgba(0,0,0,0.06),0px_2px_6px_0px_rgba(0,0,0,0.04),0px_0px_1px_0px_rgba(0,0,0,0.04)] p-2.5 sm:p-6 h-full">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-[#1a1a1a] dark:text-white">Balance Overview</h2>
                <div className="flex gap-2">
                  <button
                    onClick={() => setReceiveFundsDialogOpen(true)}
                    className="p-2 rounded-lg bg-[#f0f7ff] dark:bg-blue-900/30 hover:bg-[#e0efff] transition-colors"
                  >
                    <QrCode className="h-4 w-4 text-[#197bbd]" />
                  </button>
                  <button
                    onClick={() => setWithdrawDialogOpen(true)}
                    className="p-2 rounded-lg bg-[#f0f7ff] dark:bg-blue-900/30 hover:bg-[#e0efff] transition-colors"
                  >
                    <ArrowUpLeft className="h-4 w-4 text-[#197bbd]" />
                  </button>
                </div>
              </div>

              {/* Balance Data with Circle Chart - Side by Side */}
              <div className="flex items-start gap-6 mb-6">
                {/* Left Side - Balance Data */}
                <div className="flex-1">
                  {/* Current Balance */}
                  <div className="mb-5">
                    <p className="text-sm font-medium text-[#aeaeae] mb-1">Current balance</p>
                    <p className="text-3xl font-bold text-[#197bbd]">
                      <span className="text-lg">$</span> {isLoadingAllBalances ? "..." : unifiedBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                  </div>

                  {/* Cleared Volume */}
                  <div className="mb-4">
                    <p className="text-sm font-medium text-[#aeaeae] mb-1">Cleared Volume</p>
                    <p className="text-xl font-bold text-[#439a86]">
                      <span className="text-base">$</span> {isLoading ? "..." : statsData.clearedVolume.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                  </div>

                  {/* Outstanding */}
                  <div>
                    <p className="text-sm font-medium text-[#aeaeae] mb-1">Outstanding</p>
                    <p className="text-xl font-bold text-[#f59e0b]">
                      <span className="text-base">$</span> {isLoading ? "..." : statsData.outstanding.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>

                {/* Right Side - Modern Radial Chart */}
                <div className="flex flex-col items-center justify-center">
                  {(() => {
                    const balanceVal = isLoadingAllBalances ? 0 : unifiedBalance;
                    const clearedVal = isLoading ? 0 : statsData.clearedVolume;
                    const outstandingVal = isLoading ? 0 : statsData.outstanding;
                    const total = balanceVal + clearedVal + outstandingVal;

                    const balancePercent = total > 0 ? (balanceVal / total) * 100 : 0;
                    const clearedPercent = total > 0 ? (clearedVal / total) * 100 : 0;
                    const outstandingPercent = total > 0 ? (outstandingVal / total) * 100 : 0;

                    return (
                      <div className="relative w-[140px] h-[140px]">
                        {/* SVG Radial Progress */}
                        <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                          <defs>
                            <linearGradient id="balanceGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                              <stop offset="0%" stopColor="#3b82f6" />
                              <stop offset="100%" stopColor="#1d4ed8" />
                            </linearGradient>
                            <linearGradient id="clearedGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                              <stop offset="0%" stopColor="#c8ff00" />
                              <stop offset="100%" stopColor="#a8df00" />
                            </linearGradient>
                            <linearGradient id="outstandingGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                              <stop offset="0%" stopColor="#f59e0b" />
                              <stop offset="100%" stopColor="#d97706" />
                            </linearGradient>
                          </defs>

                          {/* Background Track */}
                          <circle
                            cx="50"
                            cy="50"
                            r="42"
                            fill="none"
                            stroke="#f3f4f6"
                            strokeWidth="8"
                            className="dark:stroke-gray-700"
                          />

                          {/* Balance Ring (Outer) */}
                          <circle
                            cx="50"
                            cy="50"
                            r="42"
                            fill="none"
                            stroke="url(#balanceGradient)"
                            strokeWidth="8"
                            strokeLinecap="round"
                            strokeDasharray={`${balancePercent * 2.64} 264`}
                            className={`transition-all duration-700 ease-out cursor-pointer ${hoveredSegment === 'balance' ? 'opacity-100' : 'opacity-90'}`}
                            style={{ filter: hoveredSegment === 'balance' ? 'drop-shadow(0 0 6px #3b82f6)' : 'none' }}
                            onMouseEnter={() => setHoveredSegment('balance')}
                            onMouseLeave={() => setHoveredSegment(null)}
                          />

                          {/* Cleared Ring (Middle) */}
                          <circle
                            cx="50"
                            cy="50"
                            r="32"
                            fill="none"
                            stroke="url(#clearedGradient)"
                            strokeWidth="8"
                            strokeLinecap="round"
                            strokeDasharray={`${clearedPercent * 2.01} 201`}
                            className={`transition-all duration-700 ease-out cursor-pointer ${hoveredSegment === 'cleared' ? 'opacity-100' : 'opacity-90'}`}
                            style={{ filter: hoveredSegment === 'cleared' ? 'drop-shadow(0 0 6px #c8ff00)' : 'none' }}
                            onMouseEnter={() => setHoveredSegment('cleared')}
                            onMouseLeave={() => setHoveredSegment(null)}
                          />

                          {/* Outstanding Ring (Inner) */}
                          <circle
                            cx="50"
                            cy="50"
                            r="22"
                            fill="none"
                            stroke="url(#outstandingGradient)"
                            strokeWidth="8"
                            strokeLinecap="round"
                            strokeDasharray={`${outstandingPercent * 1.38} 138`}
                            className={`transition-all duration-700 ease-out cursor-pointer ${hoveredSegment === 'outstanding' ? 'opacity-100' : 'opacity-90'}`}
                            style={{ filter: hoveredSegment === 'outstanding' ? 'drop-shadow(0 0 6px #f59e0b)' : 'none' }}
                            onMouseEnter={() => setHoveredSegment('outstanding')}
                            onMouseLeave={() => setHoveredSegment(null)}
                          />
                        </svg>

                        {/* Center Content */}
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          {hoveredSegment === null ? (
                            <>
                              <span className="flex items-center gap-1 text-[9px] text-[#aeaeae] mb-0.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-[#c8ff00] animate-pulse" />
                                Live
                              </span>
                              <span className="text-lg font-bold text-[#1a1a1a] dark:text-white">
                                ${total.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                              </span>
                            </>
                          ) : (
                            <>
                              <span className={`text-lg font-bold ${hoveredSegment === 'balance' ? 'text-blue-500' :
                                hoveredSegment === 'cleared' ? 'text-[#7cb518]' :
                                  'text-amber-500'
                                }`}>
                                {hoveredSegment === 'balance' ? `${balancePercent.toFixed(0)}%` :
                                  hoveredSegment === 'cleared' ? `${clearedPercent.toFixed(0)}%` :
                                    `${outstandingPercent.toFixed(0)}%`}
                              </span>
                              <span className="text-[10px] text-[#696969] capitalize">{hoveredSegment}</span>
                            </>
                          )}
                        </div>

                        {/* Tooltip */}
                        {hoveredSegment && (
                          <div className={`absolute -top-1 left-1/2 -translate-x-1/2 -translate-y-full px-3 py-1.5 rounded-lg shadow-xl z-30 whitespace-nowrap ${hoveredSegment === 'balance' ? 'bg-gradient-to-r from-blue-500 to-blue-600' :
                            hoveredSegment === 'cleared' ? 'bg-gradient-to-r from-[#c8ff00] to-[#a8df00]' :
                              'bg-gradient-to-r from-amber-500 to-amber-600'
                            }`}>
                            <p className="text-white text-xs font-medium">
                              ${hoveredSegment === 'balance' ? balanceVal.toLocaleString(undefined, { minimumFractionDigits: 2 }) :
                                hoveredSegment === 'cleared' ? clearedVal.toLocaleString(undefined, { minimumFractionDigits: 2 }) :
                                  outstandingVal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </p>
                            <div className={`absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-[5px] border-r-[5px] border-t-[5px] border-transparent ${hoveredSegment === 'balance' ? 'border-t-blue-600' :
                              hoveredSegment === 'cleared' ? 'border-t-[#a8df00]' :
                                'border-t-amber-600'
                              }`} />
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Legend */}
                  <div className="flex items-center gap-4 mt-3">
                    <button
                      className={`flex items-center gap-1.5 transition-all ${hoveredSegment === 'balance' ? 'scale-105' : ''}`}
                      onMouseEnter={() => setHoveredSegment('balance')}
                      onMouseLeave={() => setHoveredSegment(null)}
                    >
                      <div className="w-2.5 h-2.5 rounded-full bg-gradient-to-r from-blue-500 to-blue-600" />
                      <span className="text-[10px] text-[#696969] dark:text-gray-400">Balance</span>
                    </button>
                    <button
                      className={`flex items-center gap-1.5 transition-all ${hoveredSegment === 'cleared' ? 'scale-105' : ''}`}
                      onMouseEnter={() => setHoveredSegment('cleared')}
                      onMouseLeave={() => setHoveredSegment(null)}
                    >
                      <div className="w-2.5 h-2.5 rounded-full bg-gradient-to-r from-[#c8ff00] to-[#a8df00]" />
                      <span className="text-[10px] text-[#696969] dark:text-gray-400">Cleared</span>
                    </button>
                    <button
                      className={`flex items-center gap-1.5 transition-all ${hoveredSegment === 'outstanding' ? 'scale-105' : ''}`}
                      onMouseEnter={() => setHoveredSegment('outstanding')}
                      onMouseLeave={() => setHoveredSegment(null)}
                    >
                      <div className="w-2.5 h-2.5 rounded-full bg-gradient-to-r from-amber-500 to-amber-600" />
                      <span className="text-[10px] text-[#696969] dark:text-gray-400">Pending</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Auto-Earn Toggle */}
              <div className="pt-4 border-t border-[#f1f1f1] dark:border-gray-700">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-[#1a1a1a] dark:text-white">Auto-Earn</p>
                    <p className="text-xs text-[#aeaeae]">Earn yield on idle balance</p>
                  </div>
                  <button
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${autoEarnEnabled
                      ? 'bg-[#c8ff00]'
                      : 'bg-gray-300 dark:bg-gray-600'
                      }`}
                    onClick={() => {
                      const newValue = !autoEarnEnabled
                      setAutoEarnEnabled(newValue)
                      localStorage.setItem('autoEarnEnabled', JSON.stringify(newValue))
                      toast.success(newValue ? 'Auto-Earn enabled' : 'Auto-Earn disabled', {
                        description: newValue
                          ? 'Your idle balance will now earn yield automatically'
                          : 'Auto-Earn has been turned off'
                      })
                    }}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-md transition-transform ${autoEarnEnabled ? 'translate-x-6' : 'translate-x-1'
                      }`} />
                  </button>
                </div>
              </div>

              {/* Quick Send Section */}
              <div className="pt-5 mt-5 border-t border-[#f1f1f1] dark:border-gray-700">
                <h3 className="text-lg font-semibold text-[#1a1a1a] dark:text-white mb-4">Quick Send</h3>

                {/* Recent Contacts */}
                <div className="flex items-center gap-4 mb-5 overflow-x-auto pb-2">
                  {/* Sample contacts - these would be dynamic in real app */}
                  {[
                    { name: 'Ann', image: '/image.png' },
                    { name: 'Monica', image: '/image copy.png' },
                    { name: 'John', image: '/image copy 3.png' },
                    { name: 'Mike', image: '/image copy 2.png' },
                  ].map((contact, index) => (
                    <button
                      key={index}
                      className="flex flex-col items-center gap-1.5 group flex-shrink-0"
                    >
                      <div className="w-12 h-12 rounded-full overflow-hidden ring-2 ring-transparent group-hover:ring-[#c8ff00] transition-all">
                        <img
                          src={contact.image}
                          alt={contact.name}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <span className="text-xs text-[#696969] dark:text-gray-400 group-hover:text-[#1a1a1a] dark:group-hover:text-white transition-colors">{contact.name}</span>
                    </button>
                  ))}

                  {/* Add New Button */}
                  <button className="flex flex-col items-center gap-1.5 group flex-shrink-0">
                    <div className="w-12 h-12 rounded-full border-2 border-dashed border-[#c8ff00] flex items-center justify-center group-hover:bg-[#c8ff00]/10 transition-colors">
                      <Plus className="h-5 w-5 text-[#c8ff00]" />
                    </div>
                    <span className="text-xs text-[#696969] dark:text-gray-400">Add New</span>
                  </button>
                </div>

                {/* Amount Input & Send Button */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                  <div className="flex-1 relative">
                    <input
                      type="number"
                      placeholder="0"
                      className="w-full h-12 pl-4 pr-10 rounded-xl border-2 border-[#e8e8e8] dark:border-gray-600 bg-white dark:bg-gray-800 text-[#1a1a1a] dark:text-white text-lg font-medium focus:border-[#c8ff00] focus:outline-none transition-colors"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[#aeaeae] font-medium">$</span>
                  </div>
                  <button className="h-12 px-5 rounded-xl bg-[#c8ff00] hover:bg-[#b8ef00] text-[#1a1a1a] font-semibold text-sm flex items-center justify-center gap-2 transition-colors whitespace-nowrap">
                    Send Transfer
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Goal Cards (Stats) */}
          <div className="lg:col-span-7">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-[#1a1a1a] dark:text-white">Invoice Stats</h2>
              <Link
                to="/app/invoices/new"
                className="flex items-center gap-1.5 text-sm font-medium text-[#197bbd] hover:text-[#1565a0] transition-colors"
              >
                <Plus className="h-4 w-4" />
                New Invoice
              </Link>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-4">
              {/* Outstanding Card */}
              <div className="bg-white dark:bg-gray-800 rounded-[16px] sm:rounded-[28px] shadow-[0px_16px_24px_0px_rgba(0,0,0,0.06),0px_2px_6px_0px_rgba(0,0,0,0.04),0px_0px_1px_0px_rgba(0,0,0,0.04)] p-2.5 sm:p-5">
                <p className="text-2xl font-semibold text-[#1a1a1a] dark:text-white">
                  ${isLoading ? "..." : statsData.outstanding.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </p>
                <p className="text-sm text-[#aeaeae] mt-1">Pending</p>
                <div className="mt-4 w-10 h-10 rounded-lg bg-[#ffeada] flex items-center justify-center">
                  <Clock className="h-5 w-5 text-[#f59e0b]" />
                </div>
                <p className="text-base font-medium text-[#404040] dark:text-white mt-3">Outstanding</p>
              </div>

              {/* Advance Eligible Card */}
              <div className="bg-white dark:bg-gray-800 rounded-[16px] sm:rounded-[28px] shadow-[0px_16px_24px_0px_rgba(0,0,0,0.06),0px_2px_6px_0px_rgba(0,0,0,0.04),0px_0px_1px_0px_rgba(0,0,0,0.04)] p-2.5 sm:p-5">
                <p className="text-2xl font-semibold text-[#1a1a1a] dark:text-white">
                  ${isLoading ? "..." : statsData.advanceEligible.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </p>
                <p className="text-sm text-[#aeaeae] mt-1">Up to {maxLTV}% LTV</p>
                <div className="mt-4 w-10 h-10 rounded-lg bg-[#c8ff00]/15 flex items-center justify-center">
                  <Zap className="h-5 w-5 text-[#7cb518]" />
                </div>
                <p className="text-base font-medium text-[#404040] dark:text-white mt-3">Advance Eligible</p>
              </div>

              {/* Reputation Score Card */}
              <div className="bg-white dark:bg-gray-800 rounded-[16px] sm:rounded-[28px] shadow-[0px_16px_24px_0px_rgba(0,0,0,0.06),0px_2px_6px_0px_rgba(0,0,0,0.04),0px_0px_1px_0px_rgba(0,0,0,0.04)] p-2.5 sm:p-5">
                <p className="text-2xl font-semibold text-[#1a1a1a] dark:text-white">
                  {isLoading ? "..." : displayScore}
                </p>
                <p className="text-sm text-[#aeaeae] mt-1">Tier {effectiveTierLabel}</p>
                <div className="mt-4 w-10 h-10 rounded-lg bg-[#e4f0ff] flex items-center justify-center">
                  <TrendingUp className="h-5 w-5 text-[#197bbd]" />
                </div>
                <p className="text-base font-medium text-[#404040] dark:text-white mt-3">Reputation</p>
              </div>
            </div>

            {/* Your Card Section */}
            <div className="mt-5">
              {/* Header with title and add button */}
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-[#1a1a1a] dark:text-white">Cashflow Card</h2>
                <button className="w-8 h-8 rounded-lg border-2 border-dashed border-[#197bbd] flex items-center justify-center hover:bg-[#f0f7ff] transition-colors">
                  <Plus className="h-4 w-4 text-[#197bbd]" />
                </button>
              </div>

              {/* Credit Card - Monaris Split Design with Flip Animation */}
              <div className="flex flex-col items-center w-full">
                <div
                  className="w-full max-w-[460px] relative group cursor-pointer select-none"
                  style={{ perspective: '1000px' }}
                  onMouseEnter={() => setIsCardFlipped(true)}
                  onMouseLeave={() => setIsCardFlipped(false)}
                  onClick={() => setIsCardFlipped(!isCardFlipped)}
                >
                  {/* Glow effect for pop-up - White/neutral */}
                  <div className="absolute -inset-3 bg-gradient-to-r from-white/30 via-white/15 to-white/30 rounded-[32px] blur-2xl opacity-60 group-hover:opacity-90 transition-opacity duration-300" />
                  <div className="absolute -inset-1 bg-gradient-to-br from-white/20 to-transparent rounded-[24px] blur-md" />

                  {/* Card Flip Container */}
                  <div
                    className="relative w-full transition-transform duration-700 ease-in-out"
                    style={{
                      transformStyle: 'preserve-3d',
                      transform: isCardFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)'
                    }}
                  >
                    {/* FRONT SIDE */}
                    <div
                      className="relative rounded-[20px] overflow-hidden shadow-[0_40px_80px_-20px_rgba(255,255,255,0.15),0_20px_40px_-10px_rgba(255,255,255,0.1)]"
                      style={{ backfaceVisibility: 'hidden' }}
                    >
                      {/* Split Card Layout */}
                      <div className="flex min-h-[260px]">
                        {/* Left Side - Lime/Monaris color with wave patterns */}
                        <div className="w-[65%] bg-gradient-to-br from-[#d4f542] via-[#c8ff00] to-[#a8df00] relative overflow-hidden">
                          {/* Wave patterns */}
                          <div className="absolute inset-0">
                            {/* Wave 1 - Lightest */}
                            <div className="absolute left-0 top-0 bottom-0 w-[35%] bg-gradient-to-r from-[#e8ffb3]/70 to-transparent"
                              style={{ clipPath: 'ellipse(100% 80% at 0% 50%)' }} />
                            {/* Wave 2 - Medium */}
                            <div className="absolute left-[15%] top-0 bottom-0 w-[40%] bg-gradient-to-r from-[#dcff85]/50 to-transparent"
                              style={{ clipPath: 'ellipse(80% 90% at 20% 50%)' }} />
                            {/* Wave 3 - Subtle */}
                            <div className="absolute left-[30%] top-0 bottom-0 w-[35%] bg-gradient-to-r from-[#c8ff00]/40 to-transparent"
                              style={{ clipPath: 'ellipse(70% 100% at 30% 50%)' }} />
                          </div>

                          {/* Card Content - Left Side */}
                          <div className="relative z-10 p-6 flex flex-col justify-between h-full">
                            {/* Top - Account Info */}
                            <div>
                              <p className="text-[#1a1a1a]/50 text-[10px] font-semibold uppercase tracking-wider mb-1">Cashflow Account</p>
                              <p className="text-[#1a1a1a]/80 text-sm font-mono">
                                {address ? `${address.slice(0, 6)}…${address.slice(-4)}` : '0x0000…0000'}
                              </p>
                            </div>

                            {/* Middle - Credit Limit */}
                            <div className="my-4">
                              <p className="text-[#1a1a1a]/50 text-[10px] font-semibold uppercase tracking-wider mb-1">Credit Limit</p>
                              <p className="text-[#1a1a1a] font-bold text-2xl">
                                ${isLoading ? "..." : statsData.outstanding.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                              </p>
                            </div>

                            {/* Bottom Info */}
                            <div className="flex items-end gap-6">
                              <div>
                                <p className="text-[#1a1a1a]/50 text-[10px] font-semibold uppercase tracking-wider">Net Inflow</p>
                                <p className="text-[#1a1a1a] font-bold text-base">
                                  +${isLoading ? "..." : statsData.clearedVolume.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                </p>
                              </div>
                              <div>
                                <p className="text-[#1a1a1a]/50 text-[10px] font-semibold uppercase tracking-wider">Credit Tier</p>
                                <p className="text-[#1a1a1a] font-bold text-base">{effectiveTierLabel}</p>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Right Side - Dark with noise texture */}
                        <div className="w-[35%] bg-[#0f0f14] relative overflow-hidden">
                          {/* Subtle noise texture */}
                          <div className="absolute inset-0 opacity-30" style={{
                            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
                          }} />

                          {/* Content - Right Side */}
                          <div className="relative z-10 p-5 flex flex-col h-full">
                            {/* Top - Monaris Logo */}
                            <div className="mb-auto">
                              <p className="text-white font-bold text-2xl italic tracking-tight">Monaris</p>
                            </div>

                            {/* Available Now */}
                            <div className="mb-2">
                              <p className="text-white/40 text-[10px] font-semibold uppercase tracking-wider mb-1">Available Now</p>
                              <p className="text-[#c8ff00] font-bold text-xl">
                                ${isLoading ? "..." : statsData.advanceEligible.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                              </p>
                            </div>

                            {/* Reserved */}
                            <div className="mb-4">
                              <p className="text-white/30 text-[9px] font-medium uppercase tracking-wider">Reserved</p>
                              <p className="text-white/50 text-sm font-semibold">
                                ${isLoading ? "..." : Math.max(0, statsData.outstanding - statsData.advanceEligible).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                              </p>
                            </div>

                            {/* Bottom - Badge */}
                            <div className="flex items-end justify-end">
                              <span className="text-[#c8ff00]/70 text-[9px] font-medium">Verified</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* BACK SIDE - Credit Card Style */}
                    <div
                      className="absolute inset-0 rounded-[20px] overflow-hidden shadow-[0_40px_80px_-20px_rgba(255,255,255,0.15),0_20px_40px_-10px_rgba(255,255,255,0.1)]"
                      style={{
                        backfaceVisibility: 'hidden',
                        transform: 'rotateY(180deg)'
                      }}
                    >
                      {/* Back Card Layout - Monaris Color Scheme */}
                      <div className="min-h-[260px] relative overflow-hidden">
                        {/* Solid Background - Monaris Lime Green (matches logo) */}
                        <div className="absolute inset-0 bg-[#c8ff00]" />

                        {/* Subtle pattern overlay */}
                        <div className="absolute inset-0 opacity-20" style={{
                          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23000000' fill-opacity='0.1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
                        }} />

                        {/* Content */}
                        <div className="relative z-10 p-6 flex flex-col h-full min-h-[165px]">
                          {/* Top - Cashflow-Backed left, Monaris Logo right */}
                          <div className="flex items-start justify-between">
                            <p className="text-[#1a1a1a]/70 text-[11px] font-semibold uppercase tracking-wider">Cashflow-Backed</p>
                            <img src="/monar.png" alt="Monaris" className="w-12 h-12 rounded-xl shadow-lg" />
                          </div>
                        </div>

                        {/* Bottom Dark Section */}
                        <div className="absolute bottom-0 left-0 right-0 bg-[#1a1a1a] p-5">
                          <div className="flex items-end justify-between">
                            {/* Left - Card Info */}
                            <div>
                              <p className="text-white/60 text-xs mb-0.5">02/30</p>
                              <p className="text-white font-semibold text-base tracking-wide">MONARIS LLC</p>
                              <p className="text-white/40 text-[10px] mt-2">Card connected by <span className="text-[#c8ff00]">avici</span> ending •••• 8009</p>
                            </div>

                            {/* Right - Chip Icon */}
                            <div className="w-12 h-10 rounded border-2 border-white/30 grid grid-cols-3 grid-rows-2 gap-0.5 p-1">
                              <div className="bg-white/20 rounded-sm" />
                              <div className="bg-white/20 rounded-sm" />
                              <div className="bg-white/20 rounded-sm" />
                              <div className="bg-white/20 rounded-sm" />
                              <div className="bg-white/20 rounded-sm" />
                              <div className="bg-white/20 rounded-sm" />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Carousel dots */}
                <div className="flex items-center justify-center gap-2 mt-5">
                  <div className={`w-2.5 h-2.5 rounded-full transition-colors ${!isCardFlipped ? 'bg-[#c8ff00]' : 'bg-gray-300'}`} />
                  <div className={`w-2.5 h-2.5 rounded-full transition-colors ${isCardFlipped ? 'bg-[#c8ff00]' : 'bg-gray-300'}`} />
                  <div className="w-2.5 h-2.5 rounded-full bg-gray-300" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Section: Transactions & Statistics */}
        <div className="grid lg:grid-cols-12 gap-2 sm:gap-6">
          {/* Left Column: Transactions */}
          <div className="lg:col-span-6 space-y-2 sm:space-y-6">
            {/* Transaction History */}
            <div className="bg-white dark:bg-gray-800 rounded-[16px] sm:rounded-[19px] shadow-[0px_16px_24px_0px_rgba(0,0,0,0.06),0px_2px_6px_0px_rgba(0,0,0,0.04),0px_0px_1px_0px_rgba(0,0,0,0.04)] p-2.5 sm:p-6">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-xl font-bold text-[#1a1a1a] dark:text-white">Transaction history</h2>
                <Link
                  to="/app/invoices"
                  className="text-sm font-medium text-[#197bbd] hover:text-[#1565a0]"
                >
                  View All →
                </Link>
              </div>

              {/* Table Header */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4 mb-3 px-2">
                <p className="text-sm text-[#aeaeae]">Receiver</p>
                <p className="text-sm text-[#aeaeae] hidden sm:block">Type</p>
                <p className="text-sm text-[#aeaeae] hidden sm:block">Date</p>
                <p className="text-sm text-[#aeaeae] text-right">Amount</p>
              </div>

              {/* Table Body */}
              <div className="space-y-0">
                {isLoadingInvoices ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-5 w-5 animate-spin text-[#aeaeae]" />
                  </div>
                ) : recentInvoices.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12">
                    <div className="w-12 h-12 rounded-xl bg-[#f1f1f1] dark:bg-gray-700 flex items-center justify-center mb-3">
                      <FileText className="h-5 w-5 text-[#aeaeae]" />
                    </div>
                    <p className="text-[#aeaeae] text-sm mb-4">No transactions yet</p>
                    <Link
                      to="/app/invoices/new"
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#c8ff00] hover:bg-[#b8ef00] text-[#1a1a1a] text-sm font-semibold transition-colors"
                    >
                      <Plus className="h-4 w-4" />
                      Create Invoice
                    </Link>
                  </div>
                ) : (
                  recentInvoices.map((invoice, index) => (
                    <Link
                      key={invoice.id}
                      to={`/app/invoices/${invoice.invoiceId}`}
                      className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4 items-center px-2 py-3 hover:bg-[#f8f8f8] dark:hover:bg-gray-700/50 rounded-lg transition-colors border-b border-[#f1f1f1] dark:border-gray-700 last:border-0"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-6 h-6 rounded bg-[#efefef] dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
                          <DollarSign className="h-3 w-3 text-[#404040] dark:text-gray-400" />
                        </div>
                        <span className="text-sm text-[#404040] dark:text-white font-medium truncate">{invoice.buyer}</span>
                      </div>
                      <span className="text-sm text-[#c7c7c7] hidden sm:block">
                        {invoice.status === 'cleared' ? 'Received' : invoice.status === 'paid' ? 'Pending' : 'Invoice'}
                      </span>
                      <span className="text-sm text-[#c7c7c7] hidden sm:block">{invoice.date}</span>
                      <span className="text-sm font-semibold text-[#404040] dark:text-white text-right">
                        ${invoice.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                    </Link>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Right Column: Statistics & CTA */}
          <div className="lg:col-span-6 space-y-2 sm:space-y-4">
            {/* Outcome Statistics */}
            <div className="bg-white dark:bg-gray-800 rounded-[16px] sm:rounded-[19px] shadow-[0px_16px_24px_0px_rgba(0,0,0,0.06),0px_2px_6px_0px_rgba(0,0,0,0.04),0px_0px_1px_0px_rgba(0,0,0,0.04)] p-2.5 sm:p-5">
              <h2 className="text-xl font-bold text-[#1a1a1a] dark:text-white mb-4">Reputation Breakdown</h2>

              {/* Progress Item: Invoices Cleared */}
              <div className="flex items-center gap-4 mb-4">
                <div className="w-10 h-10 rounded bg-[#ffeada] flex items-center justify-center flex-shrink-0">
                  <CheckCircle2 className="h-5 w-5 text-[#f59e0b]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="flex-1 h-2 rounded-full bg-[#f1f1f1] dark:bg-gray-700 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-[#f59e0b] to-[#fbbf24]"
                        style={{ width: `${Math.min((clearedInvoices.length / 10) * 100, 100)}%` }}
                      />
                    </div>
                    <span className="text-lg font-semibold text-[#1a1a1a] dark:text-white w-12 text-right">
                      {clearedInvoices.length * 10}%
                    </span>
                  </div>
                  <p className="text-sm text-[#aeaeae]">Invoices Cleared</p>
                </div>
              </div>

              {/* Progress Item: Payment History */}
              <div className="flex items-center gap-4 mb-4">
                <div className="w-10 h-10 rounded bg-[#c8ff00]/15 flex items-center justify-center flex-shrink-0">
                  <TrendingUp className="h-5 w-5 text-[#7cb518]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="flex-1 h-2 rounded-full bg-[#f1f1f1] dark:bg-gray-700 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-[#c8ff00] to-[#a8df00]"
                        style={{ width: `${progressToNextTier}%` }}
                      />
                    </div>
                    <span className="text-lg font-semibold text-[#1a1a1a] dark:text-white w-12 text-right">
                      {Math.round(progressToNextTier)}%
                    </span>
                  </div>
                  <p className="text-sm text-[#aeaeae]">Progress to Tier {effectiveTierLabel === 'C' ? 'B' : 'A'}</p>
                </div>
              </div>

              {/* Progress Item: Trust Score */}
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded bg-[#e4f0ff] flex items-center justify-center flex-shrink-0">
                  <Zap className="h-5 w-5 text-[#70a6e8]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="flex-1 h-2 rounded-full bg-[#f1f1f1] dark:bg-gray-700 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[#70a6e8]"
                        style={{ width: `${(displayScore / 1000) * 100}%` }}
                      />
                    </div>
                    <span className="text-lg font-semibold text-[#1a1a1a] dark:text-white w-12 text-right">
                      {Math.round((displayScore / 1000) * 100)}%
                    </span>
                  </div>
                  <p className="text-sm text-[#aeaeae]">Trust Score</p>
                </div>
              </div>
            </div>

            {/* Get Advance CTA Card */}
            <div className="bg-gradient-to-b from-[#d4f542] to-[#c8ff00] rounded-[16px] sm:rounded-[19px] shadow-[0px_16px_24px_0px_rgba(0,0,0,0.06)] p-2.5 sm:p-6 text-[#1a1a1a] relative overflow-hidden">
              {/* Decorative elements */}
              <div className="absolute top-0 left-0 w-16 h-16 bg-black/5 rounded-full -translate-x-1/2 -translate-y-1/2" />
              <div className="absolute bottom-0 right-0 w-20 h-20 bg-black/5 rounded-full translate-x-1/3 translate-y-1/3" />

              <div className="relative">
                <h3 className="text-xl font-semibold mb-1">Get great</h3>
                <h3 className="text-xl font-semibold mb-4">advance!</h3>

                <div className="bg-black/10 rounded-xl p-4 mb-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-black/60">Available</span>
                    <span className="text-lg font-bold">
                      ${isLoading ? "..." : statsData.advanceEligible.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </span>
                  </div>
                  <div className="flex justify-between items-center mt-2 text-sm">
                    <span className="text-black/40">APR from</span>
                    <span className="font-medium">{effectiveTierLabel === 'A' ? '6%' : effectiveTierLabel === 'B' ? '8%' : '18%'}</span>
                  </div>
                </div>

                <Link
                  to="/app/financing"
                  className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-[#1a1a1a] hover:bg-[#2a2a2a] text-white text-sm font-semibold transition-colors"
                >
                  Request Advance
                  <ArrowUpRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Received Invoices (Buyer View) */}
      {enrichedBuyerInvoices && enrichedBuyerInvoices.length > 0 && (
        <motion.div
          variants={item}
          className="bg-white dark:bg-[#1a1a2e] rounded-[20px] sm:rounded-[32px] shadow-[0px_24px_32px_0px_rgba(0,0,0,0.04),0px_16px_24px_0px_rgba(0,0,0,0.04),0px_4px_8px_0px_rgba(0,0,0,0.04)] p-3 sm:p-8 mx-1 sm:mx-0"
        >
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#c8ff00]/10 flex items-center justify-center">
                <Inbox className="h-5 w-5 text-[#c8ff00]" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-[#1a1a1a] dark:text-white">Received Invoices</h2>
                <p className="text-sm text-[#aeaeae]">Invoices sent to you by other businesses</p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {isLoadingBuyerInvoices ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-[#aeaeae]" />
              </div>
            ) : (
              enrichedBuyerInvoices.map((inv) => (
                <BuyerInvoiceCard key={inv.id} invoice={inv} onReject={() => refetchBuyerInvoices()} />
              ))
            )}
          </div>
        </motion.div>
      )}

      {/* Dialogs */}
      <WithdrawDialog
        open={withdrawDialogOpen}
        onOpenChange={setWithdrawDialogOpen}
        usdcBalance={usdcBalance}
        usdcRawBalance={0}
        usmtBalance={usmtBalance}
        nativeBalance={nativeBalanceFormatted}
        nativeTokenSymbol={nativeTokenSymbol}
      />

      <ReceiveFundsDialog
        open={receiveFundsDialogOpen}
        onOpenChange={setReceiveFundsDialogOpen}
        address={address}
      />

    </motion.div>
  )
}

type SendTokenOption = {
  id: string
  symbol: string
  name: string
  decimals: number
  enabled: boolean
  comingSoon?: boolean
}

const SEND_TOKEN_OPTIONS: SendTokenOption[] = [
  { id: 'USDC', symbol: 'USDC', name: 'USD Coin', decimals: 6, enabled: true },
  { id: 'ETH', symbol: 'ETH', name: 'Ethereum', decimals: 18, enabled: true },
  { id: 'USMT+', symbol: 'USMT+', name: 'USMT Plus', decimals: 18, enabled: false, comingSoon: true },
]

function UsdcTokenIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 2000 2000" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="1000" cy="1000" r="1000" fill="#2775CA" /><path d="M1275 1158.33c0-145.83-87.5-195.83-262.5-216.66-125-16.67-150-50-150-108.34 0-58.33 41.67-95.83 125-95.83 75 0 116.67 25 137.5 87.5 4.17 12.5 16.67 20.83 29.17 20.83h66.66c16.67 0 29.17-12.5 29.17-29.16v-4.17c-20.83-91.67-95.83-162.5-191.67-175V533.33c0-16.66-12.5-29.16-33.33-33.33h-62.5c-16.67 0-29.17 12.5-33.33 33.33v100c-129.17 16.67-212.5 100-212.5 204.17 0 137.5 83.33 191.66 258.33 212.5 116.67 20.83 154.17 45.83 154.17 112.5 0 66.66-58.34 112.5-137.5 112.5-108.34 0-145.84-45.84-158.34-108.34-4.16-16.66-16.66-25-29.16-25h-70.84c-16.66 0-29.16 12.5-29.16 29.17v4.17c25 100 87.5 158.33 229.16 179.16V1462.5c0 16.67 12.5 29.17 33.34 33.33h62.5c16.66 0 29.16-12.5 33.33-33.33v-104.17c129.17-20.83 216.67-108.33 216.67-216.66z" fill="white" /><path d="M787.5 1595.83c-325-116.66-491.67-479.16-379.17-800 66.67-195.83 220.84-345.83 379.17-408.33 16.67-8.34 25-20.84 25-41.67v-58.33c0-16.67-8.33-29.17-25-33.34-4.17 0-12.5 0-16.67 4.17-395.83 125-612.5 545.83-487.5 941.67 75 237.5 262.5 420.83 487.5 495.83 16.67 8.33 33.34 0 37.5-16.67 4.17-4.16 4.17-12.5 4.17-16.66v-58.34c0-12.5-12.5-25-25-8.33zM1229.17 258.33c-16.67-8.33-33.34 0-37.5 16.67-4.17 4.17-4.17 12.5-4.17 16.67v58.33c0 16.67 12.5 29.17 25 41.67 325 116.67 491.67 479.17 379.17 800-66.67 195.83-220.84 345.83-379.17 408.33-16.67 8.34-25 20.84-25 41.67v58.33c0 16.67 8.33 29.17 25 33.34 4.17 0 12.5 0 16.67-4.17 395.83-125 612.5-545.83 487.5-941.67-75-241.66-266.67-425-487.5-529.17z" fill="white" /></svg>
  )
}

function EthTokenIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="16" r="16" fill="#627EEA" />
      <path d="M16.498 4v8.87l7.497 3.35L16.498 4z" fill="white" fillOpacity="0.6" />
      <path d="M16.498 4L9 16.22l7.498-3.35V4z" fill="white" />
      <path d="M16.498 21.968v6.027L24 17.616l-7.502 4.352z" fill="white" fillOpacity="0.6" />
      <path d="M16.498 27.995v-6.028L9 17.616l7.498 10.379z" fill="white" />
      <path d="M16.498 20.573l7.497-4.353-7.497-3.348v7.701z" fill="white" fillOpacity="0.2" />
      <path d="M9 16.22l7.498 4.353v-7.701L9 16.22z" fill="white" fillOpacity="0.6" />
    </svg>
  )
}

function UsmtPlusTokenIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="16" r="16" fill="#1a1a1a" />
      <circle cx="16" cy="16" r="14.5" stroke="#c8ff00" strokeWidth="1" />
      <text x="16" y="18" textAnchor="middle" fill="#c8ff00" fontSize="9" fontWeight="700" fontFamily="Inter, system-ui, sans-serif">U+</text>
    </svg>
  )
}

const TOKEN_ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  'USDC': UsdcTokenIcon,
  'ETH': EthTokenIcon,
  'USMT+': UsmtPlusTokenIcon,
}

function BuyerInvoiceCard({ invoice, onReject }: { invoice: SupabaseInvoice; onReject: () => void }) {
  const chainId = useChainId()
  const [isRejecting, setIsRejecting] = useState(false)

  const handleReject = async () => {
    if (!confirm('Reject this invoice? The seller will be notified.')) return
    setIsRejecting(true)
    try {
      await rejectInvoiceAction(invoice.id, invoice.seller_address, invoice.invoice_number || invoice.id.slice(0, 8))
      toast.success('Invoice rejected')
      onReject()
    } catch (err: any) {
      toast.error('Failed to reject', { description: err?.message })
    } finally {
      setIsRejecting(false)
    }
  }

  const isRejected = invoice.status === 'rejected'
  const isPaid = invoice.status === 'paid' || invoice.status === 'cleared'
  const dueDate = new Date(invoice.due_date)
  const payLink = invoice.chain_invoice_id ? `/pay/${invoice.chain_id}/${invoice.chain_invoice_id}` : null

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl border border-[#f1f1f1] dark:border-gray-700 bg-white dark:bg-gray-800 shadow-[0px_2px_6px_0px_rgba(0,0,0,0.04)]">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <p className="text-sm font-semibold text-[#1a1a1a] dark:text-white truncate">
            {invoice.invoice_number || `INV-${(invoice.chain_invoice_id || '').toString().padStart(6, '0')}`}
          </p>
          {isRejected && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-xs font-medium text-red-700 dark:text-red-300">
              Rejected
            </span>
          )}
          {isPaid && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-[#c8ff00]/15 dark:bg-[#c8ff00]/10 text-xs font-medium text-[#7cb518] dark:text-[#c8ff00]">
              Paid
            </span>
          )}
          {!isRejected && !isPaid && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-orange-100 dark:bg-orange-900/30 text-xs font-medium text-orange-700 dark:text-orange-300">
              {invoice.status === 'financed' ? 'Financed' : 'Issued'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-4 text-xs text-[#aeaeae]">
          <span>From: {invoice.seller_name || `${invoice.seller_address.slice(0, 6)}...${invoice.seller_address.slice(-4)}`}</span>
          <span>Due: {dueDate.toLocaleDateString()}</span>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <p className="text-lg font-bold text-[#1a1a1a] dark:text-white whitespace-nowrap">
          ${invoice.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </p>
        {!isRejected && !isPaid && payLink && (
          <div className="flex items-center gap-2">
            <Link
              to={payLink}
              className="px-4 py-2 rounded-xl bg-[#c8ff00] hover:bg-[#b8ef00] text-[#1a1a1a] text-sm font-semibold transition-colors"
            >
              Pay
            </Link>
            <button
              onClick={handleReject}
              disabled={isRejecting}
              className="px-3 py-2 rounded-xl border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 text-sm font-medium hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
            >
              {isRejecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertTriangle className="h-4 w-4" />}
            </button>
          </div>
        )}
        {isPaid && payLink && (
          <Link
            to={payLink}
            className="px-4 py-2 rounded-xl border border-[#e8e8e8] dark:border-gray-700 text-sm font-medium text-[#696969] dark:text-gray-400 hover:bg-[#f8f8f8] dark:hover:bg-gray-800 transition-colors"
          >
            View
          </Link>
        )}
      </div>
    </div>
  )
}

function WithdrawDialog({
  open,
  onOpenChange,
  usdcBalance,
  usdcRawBalance,
  usmtBalance = 0,
  nativeBalance = 0,
  nativeTokenSymbol = 'ETH',
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  usdcBalance: number
  usdcRawBalance: number
  usmtBalance?: number
  nativeBalance?: number
  nativeTokenSymbol?: string
}) {
  const { address } = usePrivyAccount()
  const { sendTransaction } = useSendTransaction()
  const { wallets } = useWallets()
  const chainId = useChainId()
  const addresses = useChainAddresses()
  const [withdrawAmount, setWithdrawAmount] = useState("")
  const [toAddress, setToAddress] = useState("")
  const [hash, setHash] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)
  const [step, setStep] = useState<'input' | 'sending' | 'confirming' | 'done'>('input')
  const [showScanner, setShowScanner] = useState(false)
  const [selectedTokenId, setSelectedTokenId] = useState('USDC')
  const [showTokenDropdown, setShowTokenDropdown] = useState(false)
  const scannerRef = useRef<any>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const scannerContainerId = "qr-reader-withdraw"

  const selectedToken = SEND_TOKEN_OPTIONS.find(t => t.id === selectedTokenId) || SEND_TOKEN_OPTIONS[0]
  const SelectedIcon = TOKEN_ICON_MAP[selectedTokenId] || UsdcTokenIcon

  const getTokenBalance = (id: string) => {
    if (id === 'USDC') return usdcBalance
    if (id === 'ETH') return nativeBalance
    if (id === 'USMT+') return usmtBalance
    return 0
  }

  const currentBalance = getTokenBalance(selectedTokenId)

  const embeddedWallet = wallets.find(w => {
    const ct = w.connectorType?.toLowerCase() || ''
    const wct = w.walletClientType?.toLowerCase() || ''
    return ct === 'embedded' || wct === 'privy' || ct.includes('privy') || ct.includes('embedded')
  }) || wallets[0]

  useEffect(() => {
    if (!showTokenDropdown) return
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowTokenDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showTokenDropdown])

  const stopScanner = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop()
        scannerRef.current.clear()
      } catch { }
      scannerRef.current = null
    }
    setShowScanner(false)
  }

  const startScanner = async () => {
    setShowScanner(true)
    setTimeout(async () => {
      try {
        const { Html5Qrcode } = await import('html5-qrcode')
        const scanner = new Html5Qrcode(scannerContainerId)
        scannerRef.current = scanner
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 200, height: 200 } },
          (decodedText: string) => {
            let addr = decodedText
            if (addr.startsWith('ethereum:')) addr = addr.replace('ethereum:', '')
            if (addr.includes('@')) addr = addr.split('@')[0]
            if (addr.startsWith('0x') && addr.length >= 42) {
              setToAddress(addr.substring(0, 42))
            } else {
              setToAddress(addr)
            }
            stopScanner()
          },
          () => { }
        )
      } catch (err) {
        console.error('QR scanner error:', err)
        setShowScanner(false)
      }
    }, 100)
  }

  useEffect(() => {
    if (!open) stopScanner()
  }, [open])

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: hash as `0x${string}` | undefined,
    chainId,
    query: {
      enabled: !!hash,
      retry: 5,
      retryDelay: 1000,
    },
  })

  if (isSuccess && step === 'confirming') {
    setStep('done')
  }

  const handleWithdraw = async () => {
    if (!withdrawAmount) {
      toast.error("Enter withdrawal amount")
      return
    }
    if (!toAddress || !isAddress(toAddress)) {
      toast.error("Invalid address", { description: "Please enter a valid Ethereum address" })
      return
    }
    const amount = parseFloat(withdrawAmount)
    if (isNaN(amount) || amount <= 0) {
      toast.error("Invalid amount", { description: "Amount must be greater than 0" })
      return
    }
    if (amount > currentBalance) {
      toast.error("Insufficient balance", {
        description: `You have ${currentBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${selectedToken.symbol} available`,
      })
      return
    }
    if (!embeddedWallet) {
      toast.error("No wallet available", { description: "Please connect your Privy embedded wallet" })
      return
    }

    setIsPending(true)
    setStep('sending')
    setHash(null)

    const isGasSponsored = chainId === 5003 || chainId === 421614 || chainId === 11155111 || chainId === 42161
    const gasLimit = isGasSponsored ? 150000n : undefined

    try {
      if (selectedTokenId === 'ETH') {
        const amountBigInt = parseUnits(withdrawAmount, 18)
        const result = await sendTransaction(
          {
            to: toAddress as `0x${string}`,
            value: amountBigInt,
            chainId,
            ...(gasLimit && { gas: gasLimit }),
          },
          {
            address: embeddedWallet.address,
            sponsor: isGasSponsored,
            uiOptions: { showWalletUIs: false },
          }
        )
        setHash(result.hash)
        setStep('confirming')
      } else {
        const contractAddress = selectedTokenId === 'USDC' ? addresses.DemoUSDC : addresses.USMTPlus
        if (!contractAddress) {
          throw new Error(`${selectedToken.symbol} contract address not configured for chain ${chainId}`)
        }

        const abi = selectedTokenId === 'USDC' ? DemoUSDCABI : USMTPlusABI
        const amountBigInt = parseUnits(withdrawAmount, selectedToken.decimals)
        const data = encodeFunctionData({
          abi,
          functionName: "transfer",
          args: [toAddress as `0x${string}`, amountBigInt],
        })

        const result = await sendTransaction(
          {
            to: contractAddress as `0x${string}`,
            data,
            value: 0n,
            chainId,
            ...(gasLimit && { gas: gasLimit }),
          },
          {
            address: embeddedWallet.address,
            sponsor: isGasSponsored,
            uiOptions: { showWalletUIs: false },
          }
        )
        setHash(result.hash)
        setStep('confirming')
      }

      setIsPending(false)
    } catch (error: any) {
      setIsPending(false)
      setStep('input')
      toast.error("Transfer failed", { description: error.message || "Please try again" })
    }
  }

  const resetDialog = () => {
    setWithdrawAmount("")
    setToAddress("")
    setHash(null)
    setIsPending(false)
    setStep('input')
    setSelectedTokenId('USDC')
    setShowTokenDropdown(false)
  }

  const parsedWithdrawAmount = parseFloat(withdrawAmount) || 0
  const isValidAddress = toAddress.length > 0 && isAddress(toAddress)
  const isDisabled = !withdrawAmount || !toAddress || isPending || isConfirming || parsedWithdrawAmount <= 0 || parsedWithdrawAmount > currentBalance

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetDialog(); onOpenChange(v); }}>
      <DialogContent className="w-[calc(100vw-32px)] sm:w-full sm:max-w-[440px] p-0 overflow-visible border border-[#2a2a2a] dark:border-[#2a2a2a] rounded-[24px] bg-white dark:bg-[#111111] shadow-[0px_32px_64px_-16px_rgba(0,0,0,0.35)]">

        {step === 'done' ? (
          <div className="px-5 py-8 flex flex-col items-center text-center space-y-5 w-full max-w-full min-w-0 overflow-hidden">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-[#c8ff00] to-[#a8df00] shadow-[0_2px_12px_rgba(200,255,0,0.3)] flex items-center justify-center shrink-0">
              <CheckCircle2 className="h-7 w-7 text-[#1a1a1a]" strokeWidth={2.5} />
            </div>
            <div className="w-full shrink-0">
              <h3 className="text-lg font-bold text-[#1a1a1a] dark:text-white tracking-tight">Sent Successfully</h3>
              <p className="text-[13px] text-[#888] mt-1.5">
                {withdrawAmount} {selectedToken.symbol} sent to {toAddress.slice(0, 6)}...{toAddress.slice(-4)}
              </p>
            </div>
            {hash && (
              <div className="space-y-2 w-full max-w-full overflow-hidden shrink-0">
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-[#fafafa] dark:bg-[#151515] border border-[#222] dark:border-[#333] w-full max-w-full overflow-hidden">
                  <div className="flex-1 min-w-0 overflow-hidden text-left">
                    <span className="text-[11px] font-mono text-[#888] truncate block w-full">{hash}</span>
                  </div>
                  <button
                    onClick={() => { navigator.clipboard.writeText(hash); toast.success("Copied!"); }}
                    className="p-1.5 rounded-lg hover:bg-[#e0e0e0] dark:hover:bg-[#222] transition-colors flex-shrink-0"
                  >
                    <Copy className="h-3.5 w-3.5 text-[#666]" />
                  </button>
                </div>
                <a
                  href={getExplorerUrl(chainId, hash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border border-[#222] dark:border-[#333] text-[12px] font-semibold text-[#1a1a1a] dark:text-[#aaa] hover:bg-[#fafafa] dark:hover:bg-[#151515] transition-colors"
                >
                  <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate max-w-[80%]">View on Explorer</span>
                </a>
              </div>
            )}
            <div className="pt-2 w-full shrink-0">
              <button
                onClick={() => { resetDialog(); onOpenChange(false); }}
                className="w-full py-3.5 rounded-xl bg-[#c8ff00] hover:bg-[#bbee00] text-[#1a1a1a] font-bold text-[14px] transition-all shadow-[0_4px_16px_rgba(200,255,0,0.2)] shrink-0"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="px-5 pt-5 pb-3 border-b border-[#222]/15 dark:border-[#333] shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-[12px] bg-gradient-to-br from-[#c8ff00] to-[#a8df00] shadow-[0_2px_8px_rgba(200,255,0,0.3)] flex items-center justify-center">
                  <svg className="h-4 w-4 text-[#1a1a1a]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17l9.2-9.2M17 17V7H7" /></svg>
                </div>
                <div>
                  <h2 className="text-[17px] font-bold text-[#1a1a1a] dark:text-white tracking-tight" style={{ fontFamily: "'Inter', 'SF Pro Display', system-ui, sans-serif" }}>Send {selectedToken.symbol}</h2>
                  <p className="text-[11px] text-[#aeaeae]">Transfer to any wallet address</p>
                </div>
              </div>
            </div>

            <div className="px-5 pb-4 pt-4 space-y-4 overflow-y-auto max-h-[80vh] sm:max-h-[calc(85vh-76px)]">
              {/* Token selector card */}
              <div className="rounded-2xl border-2 border-[#1a1a1a]/10 dark:border-[#333] bg-[#fafafa] dark:bg-[#151515] overflow-visible relative" ref={dropdownRef}>
                <button
                  type="button"
                  onClick={() => setShowTokenDropdown(!showTokenDropdown)}
                  className="w-full flex items-center gap-3 p-4 hover:bg-[#f2f2f2] dark:hover:bg-[#1a1a1a] transition-colors rounded-2xl"
                >
                  <SelectedIcon className="w-10 h-10 flex-shrink-0" />
                  <div className="flex-1 min-w-0 text-left">
                    <div className="flex items-center gap-1.5">
                      <p className="text-[14px] font-bold text-[#1a1a1a] dark:text-white" style={{ fontFamily: "'Inter', 'SF Pro Display', system-ui, sans-serif" }}>{selectedToken.symbol}</p>
                      <ChevronDown className={`h-3.5 w-3.5 text-[#999] transition-transform duration-200 ${showTokenDropdown ? 'rotate-180' : ''}`} />
                    </div>
                    <p className="text-[11px] text-[#aeaeae] mt-0.5">{selectedToken.name}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[16px] font-bold text-[#1a1a1a] dark:text-white tabular-nums" style={{ fontFamily: "'Inter', 'SF Pro Display', system-ui, sans-serif" }}>
                      {currentBalance.toLocaleString(undefined, { minimumFractionDigits: selectedTokenId === 'ETH' ? 4 : 2, maximumFractionDigits: selectedTokenId === 'ETH' ? 6 : 2 })}
                    </p>
                    <p className="text-[11px] text-[#aeaeae] mt-0.5">Available</p>
                  </div>
                </button>

                {showTokenDropdown && (
                  <div className="absolute left-0 right-0 top-full z-50 mt-1 mx-2 rounded-xl border border-[#e0e0e0] dark:border-[#2a2a2a] bg-white dark:bg-[#151515] shadow-[0_8px_24px_rgba(0,0,0,0.12)] overflow-hidden">
                    {SEND_TOKEN_OPTIONS.map((tk) => {
                      const TkIcon = TOKEN_ICON_MAP[tk.id] || UsdcTokenIcon
                      const isSelected = tk.id === selectedTokenId
                      const tkBal = getTokenBalance(tk.id)
                      return (
                        <button
                          key={tk.id}
                          type="button"
                          disabled={!tk.enabled}
                          onClick={() => {
                            if (!tk.enabled) return
                            setSelectedTokenId(tk.id)
                            setWithdrawAmount('')
                            setShowTokenDropdown(false)
                          }}
                          className={`w-full flex items-center justify-between px-4 py-3 transition-colors ${!tk.enabled
                            ? 'opacity-45 cursor-not-allowed'
                            : isSelected
                              ? 'bg-[#c8ff00]/10'
                              : 'hover:bg-[#f5f5f5] dark:hover:bg-[#1a1a1a]'
                            }`}
                        >
                          <div className="flex items-center gap-3">
                            <TkIcon className="w-8 h-8" />
                            <div className="text-left">
                              <div className="flex items-center gap-2">
                                <span className="text-[13px] font-bold text-[#1a1a1a] dark:text-white">{tk.symbol}</span>
                                {tk.comingSoon && (
                                  <span className="px-1.5 py-0.5 rounded-md bg-[#c8ff00]/20 text-[8px] font-bold text-[#7cb518] uppercase tracking-wide">Soon</span>
                                )}
                                {isSelected && (
                                  <CheckCircle2 className="h-3.5 w-3.5 text-[#7cb518]" />
                                )}
                              </div>
                              <span className="block text-[10px] text-[#999]">{tk.name}</span>
                            </div>
                          </div>
                          <span className="text-[13px] font-bold text-[#1a1a1a] dark:text-white tabular-nums" style={{ fontFamily: "'SF Mono', 'Fira Code', monospace" }}>
                            {tkBal.toLocaleString(undefined, { minimumFractionDigits: tk.id === 'ETH' ? 4 : 2, maximumFractionDigits: tk.id === 'ETH' ? 6 : 2 })}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Recipient */}
              <div>
                <label className="block text-[12px] font-semibold text-[#1a1a1a] dark:text-[#ccc] mb-2" style={{ fontFamily: "'Inter', 'SF Pro Display', system-ui, sans-serif" }}>Recipient Address</label>
                <div className="flex items-stretch gap-2.5">
                  <div className="flex-1 relative">
                    <input
                      type="text"
                      placeholder="Enter wallet address (0x...)"
                      value={toAddress}
                      onChange={(e) => setToAddress(e.target.value)}
                      disabled={isPending || isConfirming}
                      className="w-full h-12 bg-white dark:bg-[#1a1a1a] border-2 border-[#1a1a1a]/15 dark:border-[#333] focus:border-[#1a1a1a] dark:focus:border-[#c8ff00] rounded-xl px-4 text-[13px] text-[#1a1a1a] dark:text-white placeholder:text-[#bbb] dark:placeholder:text-[#555] outline-none transition-colors disabled:opacity-50" style={{ fontFamily: "'SF Mono', 'Fira Code', 'Menlo', monospace" }}
                    />
                  </div>
                  <button
                    onClick={showScanner ? stopScanner : startScanner}
                    disabled={isPending || isConfirming}
                    className="w-12 h-12 flex items-center justify-center rounded-xl border-2 border-[#1a1a1a]/15 dark:border-[#333] bg-white dark:bg-[#1a1a1a] hover:border-[#1a1a1a] dark:hover:border-[#c8ff00] transition-colors disabled:opacity-50"
                  >
                    {showScanner ? <X className="h-4 w-4 text-[#666]" /> : (
                      <svg className="h-[18px] w-[18px] text-[#666]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2" /><path d="M17 3h2a2 2 0 0 1 2 2v2" /><path d="M21 17v2a2 2 0 0 1-2 2h-2" /><path d="M7 21H5a2 2 0 0 1-2-2v-2" /><rect x="7" y="7" width="10" height="10" rx="1" /></svg>
                    )}
                  </button>
                </div>
                {showScanner && (
                  <div className="mt-2 rounded-xl overflow-hidden border-2 border-[#1a1a1a]/15 dark:border-[#333] bg-black">
                    <div id={scannerContainerId} className="w-full" />
                    <p className="text-[11px] text-center text-[#888] py-2 bg-[#fafafa] dark:bg-[#151515]">
                      Point camera at a wallet QR code
                    </p>
                  </div>
                )}
              </div>

              {/* Amount */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[12px] font-semibold text-[#1a1a1a] dark:text-[#ccc]" style={{ fontFamily: "'Inter', 'SF Pro Display', system-ui, sans-serif" }}>Amount</label>
                  <button
                    onClick={() => setWithdrawAmount(selectedTokenId === 'ETH' ? currentBalance.toFixed(6) : currentBalance.toFixed(2))}
                    disabled={currentBalance === 0}
                    className="text-[11px] font-bold text-[#7cb518] hover:text-[#6aa516] transition-colors disabled:opacity-30"
                  >
                    Use Max
                  </button>
                </div>
                <div className="relative">
                  <input
                    type="number"
                    placeholder="0.00"
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                    min="0"
                    step={selectedTokenId === 'ETH' ? '0.0001' : '0.01'}
                    disabled={isPending || isConfirming}
                    className="w-full h-[60px] bg-white dark:bg-[#1a1a1a] border-2 border-[#1a1a1a]/15 dark:border-[#333] focus:border-[#1a1a1a] dark:focus:border-[#c8ff00] rounded-xl pl-5 pr-[110px] text-[24px] font-bold text-[#1a1a1a] dark:text-white placeholder:text-[#d1d1d1] dark:placeholder:text-[#444] outline-none transition-colors disabled:opacity-50" style={{ fontFamily: "'Inter', 'SF Pro Display', system-ui, sans-serif" }}
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2 bg-[#f0f0f0] dark:bg-[#222] pl-2.5 pr-3 py-1.5 rounded-lg border border-[#1a1a1a]/10 dark:border-[#444]">
                    <SelectedIcon className="w-5 h-5 flex-shrink-0" />
                    <span className="text-[12px] font-bold text-[#1a1a1a] dark:text-white" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>{selectedToken.symbol}</span>
                  </div>
                </div>
                <div className="flex gap-2 mt-2.5">
                  {[0.25, 0.5, 0.75, 1].map((pct) => (
                    <button
                      key={pct}
                      onClick={() => setWithdrawAmount(selectedTokenId === 'ETH' ? (currentBalance * pct).toFixed(6) : (currentBalance * pct).toFixed(2))}
                      disabled={currentBalance === 0}
                      className="flex-1 py-2 rounded-lg border-2 border-[#1a1a1a]/10 dark:border-[#333] bg-white dark:bg-[#1a1a1a] text-[11px] font-bold text-[#666] dark:text-[#888] hover:border-[#1a1a1a] dark:hover:border-[#c8ff00] hover:text-[#1a1a1a] dark:hover:text-[#c8ff00] transition-all disabled:opacity-30"
                    >
                      {pct === 1 ? 'MAX' : `${pct * 100}%`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Summary */}
              {parsedWithdrawAmount > 0 && isValidAddress && (
                <div className="rounded-xl border-2 border-[#1a1a1a]/10 dark:border-[#333] bg-[#fafafa] dark:bg-[#151515] px-4 py-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] text-[#aeaeae]">Sending</span>
                    <span className="text-[13px] font-bold text-[#1a1a1a] dark:text-white">{withdrawAmount} {selectedToken.symbol}</span>
                  </div>
                  <div className="flex items-center justify-between mt-1.5">
                    <span className="text-[12px] text-[#aeaeae]">To</span>
                    <span className="text-[12px] text-[#666] dark:text-[#aaa]" style={{ fontFamily: "'SF Mono', 'Fira Code', monospace" }}>{toAddress.slice(0, 8)}...{toAddress.slice(-6)}</span>
                  </div>
                </div>
              )}

              {/* Processing */}
              {(step === 'sending' || step === 'confirming') && (
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-[#c8ff00]/30 bg-[#c8ff00]/8">
                  <div className="w-5 h-5 rounded-full border-2 border-[#c8ff00] border-t-[#c8ff00]/20 animate-spin" />
                  <span className="text-[13px] font-bold text-[#1a1a1a] dark:text-white">{step === 'sending' ? "Sending transaction..." : "Confirming on-chain..."}</span>
                </div>
              )}
            </div>

            {/* Action button - Pinned outside scroll block */}
            {!(step === 'sending' || step === 'confirming') && (
              <div className="px-4 pb-4 pt-1 shrink-0 bg-white dark:bg-[#0a0a0a]">
                <button
                  onClick={handleWithdraw}
                  disabled={isDisabled}
                  className="w-full flex items-center justify-center gap-2.5 py-4 rounded-xl bg-[#c8ff00] hover:bg-[#bbee00] text-[#1a1a1a] font-bold text-[14px] transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-[0_4px_16px_rgba(200,255,0,0.25)] hover:shadow-[0_4px_24px_rgba(200,255,0,0.4)]" style={{ fontFamily: "'Inter', 'SF Pro Display', system-ui, sans-serif" }}
                >
                  <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17l9.2-9.2M17 17V7H7" /></svg>
                  Send {parsedWithdrawAmount > 0 ? withdrawAmount : "0"} {selectedToken.symbol}
                </button>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function ReceiveFundsDialog({
  open,
  onOpenChange,
  address,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  address: string | undefined
}) {
  const qrCodeRef = useRef<HTMLDivElement>(null)

  const copyAddress = () => {
    if (!address) return
    navigator.clipboard.writeText(address)
    toast.success("Address copied to clipboard!")
  }

  const downloadQR = () => {
    if (!qrCodeRef.current || !address) return

    try {
      // Get the SVG element from the QR code
      const svgElement = qrCodeRef.current.querySelector('svg')
      if (!svgElement) {
        toast.error("QR code not found")
        return
      }

      // Create a canvas to render the SVG with the logo
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        toast.error("Failed to create canvas")
        return
      }

      const size = 512
      canvas.width = size
      canvas.height = size

      // Create an image from the SVG
      const svgData = new XMLSerializer().serializeToString(svgElement)
      const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' })
      const svgUrl = URL.createObjectURL(svgBlob)

      const img = new Image()
      img.onload = () => {
        // Draw the QR code
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, size, size)
        ctx.drawImage(img, 0, 0, size, size)

        // Load and draw the Monaris logo in the center
        const logoImg = new Image()
        logoImg.crossOrigin = 'anonymous'
        logoImg.onload = () => {
          const logoSize = size * 0.15 // 15% of QR code size (reduced from 20%)
          const logoX = (size - logoSize) / 2
          const logoY = (size - logoSize) / 2

          // Draw white background circle for logo
          ctx.fillStyle = '#ffffff'
          ctx.beginPath()
          ctx.arc(size / 2, size / 2, logoSize / 2 + 6, 0, 2 * Math.PI)
          ctx.fill()

          // Draw the logo
          ctx.drawImage(logoImg, logoX, logoY, logoSize, logoSize)

          // Convert to blob and download
          canvas.toBlob((blob) => {
            if (blob) {
              const url = URL.createObjectURL(blob)
              const link = document.createElement('a')
              link.href = url
              link.download = `monaris-wallet-qr-${address.slice(0, 8)}.png`
              document.body.appendChild(link)
              link.click()
              document.body.removeChild(link)
              URL.revokeObjectURL(url)
              toast.success("QR code downloaded!")
            }
          }, 'image/png')
        }
        logoImg.onerror = () => {
          // If logo fails to load, just download QR without logo
          canvas.toBlob((blob) => {
            if (blob) {
              const url = URL.createObjectURL(blob)
              const link = document.createElement('a')
              link.href = url
              link.download = `monaris-wallet-qr-${address.slice(0, 8)}.png`
              document.body.appendChild(link)
              link.click()
              document.body.removeChild(link)
              URL.revokeObjectURL(url)
              toast.success("QR code downloaded!")
            }
          }, 'image/png')
        }
        logoImg.src = '/monar.png'
      }
      img.src = svgUrl
    } catch (error) {
      console.error('Error downloading QR code:', error)
      toast.error("Failed to download QR code")
    }
  }

  if (!address) {
    return null
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-32px)] sm:w-full sm:max-w-[440px] p-0 overflow-hidden border border-[#2a2a2a] dark:border-[#2a2a2a] rounded-[24px] bg-white dark:bg-[#111111] shadow-[0px_32px_64px_-16px_rgba(0,0,0,0.35)]">

        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-[#222]/15 dark:border-[#333]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-[14px] bg-[#c8ff00] flex items-center justify-center">
              <svg className="h-5 w-5 text-[#1a1a1a]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
            </div>
            <div>
              <h2 className="text-[18px] font-bold text-[#1a1a1a] dark:text-white tracking-tight" style={{ fontFamily: "'Inter', 'SF Pro Display', system-ui, sans-serif" }}>Receive Funds</h2>
              <p className="text-[12px] text-[#aeaeae] mt-0.5">Scan QR or copy your wallet address</p>
            </div>
          </div>
        </div>

        <div className="px-6 pb-6 pt-5 space-y-5">
          {/* QR Code */}
          <div className="flex justify-center">
            <div
              ref={qrCodeRef}
              className="relative p-4 bg-white rounded-2xl border-2 border-[#1a1a1a]/10 dark:border-[#333]"
            >
              <QRCodeSVG
                value={address}
                size={200}
                level="H"
                includeMargin={false}
                imageSettings={{
                  src: '/monar.png',
                  height: 44,
                  width: 52,
                  excavate: true,
                }}
              />
            </div>
          </div>

          {/* Wallet Address */}
          <div>
            <label className="block text-[12px] font-semibold text-[#1a1a1a] dark:text-[#ccc] mb-2" style={{ fontFamily: "'Inter', 'SF Pro Display', system-ui, sans-serif" }}>Wallet Address</label>
            <div className="flex items-stretch gap-2">
              <div className="flex-1 min-w-0 bg-[#fafafa] dark:bg-[#151515] border-2 border-[#1a1a1a]/10 dark:border-[#333] rounded-xl px-4 flex items-center h-12">
                <span className="text-[12px] text-[#1a1a1a] dark:text-white truncate block" style={{ fontFamily: "'SF Mono', 'Fira Code', 'Menlo', monospace" }}>{address}</span>
              </div>
              <button
                onClick={copyAddress}
                className="w-12 h-12 flex items-center justify-center rounded-xl border-2 border-[#1a1a1a]/10 dark:border-[#333] bg-white dark:bg-[#1a1a1a] hover:border-[#1a1a1a] dark:hover:border-[#c8ff00] transition-colors"
                title="Copy Address"
              >
                <Copy className="h-4 w-4 text-[#666]" />
              </button>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2.5">
            <button
              onClick={copyAddress}
              className="flex-1 flex items-center justify-center gap-2 h-12 rounded-xl border-2 border-[#1a1a1a]/10 dark:border-[#333] bg-white dark:bg-[#1a1a1a] text-[#1a1a1a] dark:text-white font-bold text-[13px] hover:border-[#1a1a1a] dark:hover:border-[#c8ff00] transition-all" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
            >
              <Copy className="h-4 w-4" />
              Copy Address
            </button>
            <button
              onClick={downloadQR}
              className="flex-1 flex items-center justify-center gap-2 h-12 rounded-xl bg-[#c8ff00] hover:bg-[#bbee00] text-[#1a1a1a] font-bold text-[13px] transition-all shadow-[0_4px_16px_rgba(200,255,0,0.25)]" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
            >
              <Download className="h-4 w-4" />
              Download QR
            </button>
          </div>

          {/* Footer */}
          <div className="flex items-start gap-2.5 px-3.5 py-3 rounded-xl border-2 border-[#1a1a1a]/10 dark:border-[#333] bg-[#fafafa] dark:bg-[#151515]">
            <svg className="h-4 w-4 text-[#aeaeae] mt-0.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></svg>
            <p className="text-[11px] text-[#888] leading-relaxed">
              Share QR code or address to receive funds on any supported chain
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
