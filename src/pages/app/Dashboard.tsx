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
  Download
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
import { useSellerInvoicesWithData, InvoiceStatus } from "@/hooks/useInvoice"
import { useReputation } from "@/hooks/useReputation"
import { useTokenBalance } from "@/hooks/useTokenBalance"
import { useUSMTBalance } from "@/hooks/useUSMTBalance"
import { usePrivyAccount } from "@/hooks/usePrivyAccount"
import { useSendTransaction, useWallets } from "@privy-io/react-auth"
import { useBalance, useWaitForTransactionReceipt, useChainId } from "wagmi"
import { useChainAddresses } from "@/hooks/useChainAddresses"
import { DemoUSDCABI, USMTPlusABI } from "@/lib/abis"
import { formatUnits, parseUnits, encodeFunctionData, isAddress } from "viem"
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
  const { score, tierLabel, stats, isLoading: isLoadingReputation } = useReputation()
  const { balance: usdcBalance, isLoading: isLoadingBalance, error: balanceError } = useTokenBalance()
  const { balance: usmtBalance, isLoading: isLoadingUSMT } = useUSMTBalance()
  const { address } = usePrivyAccount()
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

  // Calculate stats from invoices
  const statsData = useMemo(() => {
    if (!invoices || invoices.length === 0) {
      return {
        outstanding: 0,
        outstandingCount: 0,
        clearedVolume: 0,
        advanceEligible: 0,
      }
    }

    // Outstanding (only issued or financed that haven't been paid/cleared)
    // Status 0 = Issued, Status 1 = Financed (both are outstanding)
    // Status 2 = Paid (being settled, should NOT be in outstanding)
    // Status 3 = Cleared (settlement complete, should NOT be in outstanding)
    const outstandingInvoices = invoices.filter(
      inv => inv.status === 0 || inv.status === 1
    )
    const outstanding = outstandingInvoices.reduce((sum, inv) => {
      return sum + parseFloat(formatUnits(inv.amount, 6))
    }, 0)

    // Cleared volume (status === 3)
    const clearedInvoices = invoices.filter(inv => inv.status === 3)
    const clearedVolume = clearedInvoices.reduce((sum, inv) => {
      return sum + parseFloat(formatUnits(inv.amount, 6))
    }, 0)

    // Advance eligible (issued invoices, up to 90% LTV for tier A, 65% for tier B, 35% for tier C)
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
  }, [invoices, effectiveTierLabel])

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
        className="bg-white dark:bg-[#1a1a2e] rounded-[32px] shadow-[0px_24px_32px_0px_rgba(0,0,0,0.04),0px_16px_24px_0px_rgba(0,0,0,0.04),0px_4px_8px_0px_rgba(0,0,0,0.04),0px_0px_1px_0px_rgba(0,0,0,0.04)] p-8"
      >
        {/* Page Header */}
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6 mb-8">
          <div>
            <h1 className="text-[32px] font-semibold text-[#404040] dark:text-white tracking-tight">Dashboard</h1>
            <p className="text-[#aeaeae] text-base mt-1">
              Get summary of your weekly online transactions here.
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
        <div className="grid lg:grid-cols-12 gap-4 sm:gap-6 mb-6">
          {/* Left: Balance Card */}
          <div className="lg:col-span-5">
            <div className="bg-white dark:bg-gray-800 rounded-[20px] sm:rounded-[28px] shadow-[0px_16px_24px_0px_rgba(0,0,0,0.06),0px_2px_6px_0px_rgba(0,0,0,0.04),0px_0px_1px_0px_rgba(0,0,0,0.04)] p-4 sm:p-6 h-full">
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
                              <stop offset="0%" stopColor="#10b981" />
                              <stop offset="100%" stopColor="#059669" />
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
                            style={{ filter: hoveredSegment === 'cleared' ? 'drop-shadow(0 0 6px #10b981)' : 'none' }}
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
                                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                                Live
                              </span>
                              <span className="text-lg font-bold text-[#1a1a1a] dark:text-white">
                                ${total.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                              </span>
                            </>
                          ) : (
                            <>
                              <span className={`text-lg font-bold ${
                                hoveredSegment === 'balance' ? 'text-blue-500' :
                                hoveredSegment === 'cleared' ? 'text-emerald-500' :
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
                          <div className={`absolute -top-1 left-1/2 -translate-x-1/2 -translate-y-full px-3 py-1.5 rounded-lg shadow-xl z-30 whitespace-nowrap ${
                            hoveredSegment === 'balance' ? 'bg-gradient-to-r from-blue-500 to-blue-600' :
                            hoveredSegment === 'cleared' ? 'bg-gradient-to-r from-emerald-500 to-emerald-600' :
                            'bg-gradient-to-r from-amber-500 to-amber-600'
                          }`}>
                            <p className="text-white text-xs font-medium">
                              ${hoveredSegment === 'balance' ? balanceVal.toLocaleString(undefined, { minimumFractionDigits: 2 }) :
                                hoveredSegment === 'cleared' ? clearedVal.toLocaleString(undefined, { minimumFractionDigits: 2 }) :
                                outstandingVal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </p>
                            <div className={`absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-[5px] border-r-[5px] border-t-[5px] border-transparent ${
                              hoveredSegment === 'balance' ? 'border-t-blue-600' :
                              hoveredSegment === 'cleared' ? 'border-t-emerald-600' :
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
                      <div className="w-2.5 h-2.5 rounded-full bg-gradient-to-r from-emerald-500 to-emerald-600" />
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
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      autoEarnEnabled 
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
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-md transition-transform ${
                      autoEarnEnabled ? 'translate-x-6' : 'translate-x-1'
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
            
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
              {/* Outstanding Card */}
              <div className="bg-white dark:bg-gray-800 rounded-[20px] sm:rounded-[28px] shadow-[0px_16px_24px_0px_rgba(0,0,0,0.06),0px_2px_6px_0px_rgba(0,0,0,0.04),0px_0px_1px_0px_rgba(0,0,0,0.04)] p-4 sm:p-5">
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
              <div className="bg-white dark:bg-gray-800 rounded-[20px] sm:rounded-[28px] shadow-[0px_16px_24px_0px_rgba(0,0,0,0.06),0px_2px_6px_0px_rgba(0,0,0,0.04),0px_0px_1px_0px_rgba(0,0,0,0.04)] p-4 sm:p-5">
                <p className="text-2xl font-semibold text-[#1a1a1a] dark:text-white">
                  ${isLoading ? "..." : statsData.advanceEligible.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </p>
                <p className="text-sm text-[#aeaeae] mt-1">Up to {maxLTV}% LTV</p>
                <div className="mt-4 w-10 h-10 rounded-lg bg-[#ddf9e4] flex items-center justify-center">
                  <Zap className="h-5 w-5 text-[#22c55e]" />
                </div>
                <p className="text-base font-medium text-[#404040] dark:text-white mt-3">Advance Eligible</p>
              </div>

              {/* Reputation Score Card */}
              <div className="bg-white dark:bg-gray-800 rounded-[20px] sm:rounded-[28px] shadow-[0px_16px_24px_0px_rgba(0,0,0,0.06),0px_2px_6px_0px_rgba(0,0,0,0.04),0px_0px_1px_0px_rgba(0,0,0,0.04)] p-4 sm:p-5">
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
              
              {/* Credit Card - Monaris Split Design */}
              <div className="flex flex-col items-center w-full">
                <div className="w-full max-w-[460px] relative group">
                  {/* Glow effect for pop-up - White/neutral */}
                  <div className="absolute -inset-3 bg-gradient-to-r from-white/30 via-white/15 to-white/30 rounded-[32px] blur-2xl opacity-60 group-hover:opacity-90 transition-opacity duration-300" />
                  <div className="absolute -inset-1 bg-gradient-to-br from-white/20 to-transparent rounded-[24px] blur-md" />
                  
                  {/* Card Container */}
                  <div className="relative rounded-[20px] overflow-hidden shadow-[0_40px_80px_-20px_rgba(255,255,255,0.15),0_20px_40px_-10px_rgba(255,255,255,0.1)] group-hover:shadow-[0_50px_100px_-25px_rgba(255,255,255,0.2),0_25px_50px_-12px_rgba(255,255,255,0.15)] transition-all duration-300 group-hover:-translate-y-1">
                    
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
                              <p className="text-[#1a1a1a]/50 text-[10px] font-semibold uppercase tracking-wider">Net Inflow (30d)</p>
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
                </div>
                
                {/* Carousel dots */}
                <div className="flex items-center justify-center gap-2 mt-5">
                  <div className="w-2.5 h-2.5 rounded-full bg-[#c8ff00]" />
                  <div className="w-2.5 h-2.5 rounded-full bg-gray-300" />
                  <div className="w-2.5 h-2.5 rounded-full bg-gray-300" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Section: Transactions & Statistics */}
        <div className="grid lg:grid-cols-12 gap-4 sm:gap-6">
          {/* Left Column: Transactions */}
          <div className="lg:col-span-6 space-y-4 sm:space-y-6">
            {/* Transaction History */}
            <div className="bg-white dark:bg-gray-800 rounded-[20px] sm:rounded-[19px] shadow-[0px_16px_24px_0px_rgba(0,0,0,0.06),0px_2px_6px_0px_rgba(0,0,0,0.04),0px_0px_1px_0px_rgba(0,0,0,0.04)] p-4 sm:p-6">
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
          <div className="lg:col-span-6 space-y-4">
            {/* Outcome Statistics */}
            <div className="bg-white dark:bg-gray-800 rounded-[20px] sm:rounded-[19px] shadow-[0px_16px_24px_0px_rgba(0,0,0,0.06),0px_2px_6px_0px_rgba(0,0,0,0.04),0px_0px_1px_0px_rgba(0,0,0,0.04)] p-4 sm:p-5">
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
                <div className="w-10 h-10 rounded bg-[#ddf9e4] flex items-center justify-center flex-shrink-0">
                  <TrendingUp className="h-5 w-5 text-[#22c55e]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="flex-1 h-2 rounded-full bg-[#f1f1f1] dark:bg-gray-700 overflow-hidden">
                      <div 
                        className="h-full rounded-full bg-gradient-to-r from-[#209d43] to-[#2bc255]"
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
            <div className="bg-gradient-to-b from-[#d4f542] to-[#c8ff00] rounded-[20px] sm:rounded-[19px] shadow-[0px_16px_24px_0px_rgba(0,0,0,0.06)] p-4 sm:p-6 text-[#1a1a1a] relative overflow-hidden">
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

      {/* Dialogs */}
      <WithdrawDialog
        open={withdrawDialogOpen}
        onOpenChange={setWithdrawDialogOpen}
        usdcBalance={usdcBalance}
        usdcRawBalance={0}
      />

      <ReceiveFundsDialog
        open={receiveFundsDialogOpen}
        onOpenChange={setReceiveFundsDialogOpen}
        address={address}
      />
    </motion.div>
  )
}

function WithdrawDialog({
  open,
  onOpenChange,
  usdcBalance,
  usdcRawBalance,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  usdcBalance: number
  usdcRawBalance: number
}) {
  const { address } = usePrivyAccount()
  const { sendTransaction } = useSendTransaction()
  const { wallets } = useWallets()
  const chainId = useChainId()
  const chainMetadata = getChainMetadata(chainId)
  const nativeTokenSymbol = chainMetadata?.nativeCurrency.symbol || "ETH"
  const addresses = useChainAddresses()
  const [tokenType, setTokenType] = useState<"USDC" | "NATIVE" | "USMT+">("USDC")
  const [withdrawAmount, setWithdrawAmount] = useState("")
  const [toAddress, setToAddress] = useState("")
  const [hash, setHash] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)
  const withdrawSuccessToastShown = useRef<string | null>(null)

  const embeddedWallet = wallets.find(w => {
    const ct = w.connectorType?.toLowerCase() || ''
    const wct = w.walletClientType?.toLowerCase() || ''
    return ct === 'embedded' || wct === 'privy' || ct.includes('privy') || ct.includes('embedded')
  }) || wallets[0]

  // Get native token balance (ETH/ArbETH on Arbitrum, MNT on Mantle)
  const { data: nativeBalance, isLoading: isLoadingNative } = useBalance({
    address: address as `0x${string}` | undefined,
    query: {
      enabled: !!address,
      refetchInterval: 20000,
    },
  })

  const nativeBalanceFormatted = nativeBalance ? parseFloat(formatUnits(nativeBalance.value, 18)) : 0

  // Get USMT+ balance
  const { balance: usmtBalance, isLoading: isLoadingUSMT } = useUSMTBalance()

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: hash as `0x${string}` | undefined,
    chainId,
    query: {
      enabled: !!hash,
      retry: 5,
      retryDelay: 1000, // Reduced from 2000ms to 1000ms for faster polling
    },
  })

  // Get current balance based on token type
  const currentBalance = tokenType === "USDC" ? usdcBalance : tokenType === "USMT+" ? usmtBalance : nativeBalanceFormatted
  const isLoadingBalance = tokenType === "USDC" ? false : tokenType === "USMT+" ? isLoadingUSMT : isLoadingNative

  // Handle withdraw success
  useEffect(() => {
    if (hash && isSuccess && withdrawSuccessToastShown.current !== hash) {
      withdrawSuccessToastShown.current = hash
      
      const copyToClipboard = () => {
        navigator.clipboard.writeText(hash)
        toast.success("Transaction hash copied!")
      }
      
      toast.success(
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-500 flex-shrink-0" />
          <span className="font-semibold">Withdrawal Successful!</span>
        </div>,
        {
          description: (
            <div className="space-y-3 mt-2">
               <p className="font-medium text-sm">Your withdrawal of {withdrawAmount} {tokenType} has been successfully sent to {toAddress.slice(0, 6)}...{toAddress.slice(-4)}.</p>
              
              <div className="space-y-2 pt-2 border-t border-border/50">
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">TRANSACTION HASH</span>
                  <div className="relative">
                    <Input
                      type="text"
                      value={hash}
                      readOnly
                      className="font-mono text-xs pr-10"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                      onClick={(e) => {
                        e.stopPropagation();
                        copyToClipboard();
                      }}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                
                <Button asChild className="w-full mt-4">
                  <a
                    href={getExplorerUrl(chainId, hash || '')}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    View on Explorer
                  </a>
                </Button>
                <Button variant="outline" className="w-full mt-2" onClick={() => {
                  setWithdrawAmount("")
                  setToAddress("")
                  onOpenChange(false)
                }}>
                  Done
                </Button>
              </div>
            </div>
          ),
          duration: 10000,
          id: 'withdraw-success',
        }
      )
      
      setWithdrawAmount("")
      setToAddress("")
      onOpenChange(false)
    }
  }, [hash, isSuccess, isConfirming, withdrawAmount, tokenType, toAddress, onOpenChange])

  const handleWithdraw = async () => {
    if (!withdrawAmount) {
      toast.error("Enter withdrawal amount")
      return
    }

    if (!toAddress || !isAddress(toAddress)) {
      toast.error("Invalid address", {
        description: "Please enter a valid Ethereum address",
      })
      return
    }

    const amount = parseFloat(withdrawAmount)
    if (isNaN(amount) || amount <= 0) {
      toast.error("Invalid amount", {
        description: "Amount must be greater than 0",
      })
      return
    }

    if (amount > currentBalance) {
       toast.error("Insufficient balance", {
         description: `You have ${currentBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${tokenType} available`,
       })
      return
    }

    if (!embeddedWallet) {
      toast.error("No wallet available", {
        description: "Please connect your Privy embedded wallet",
      })
      return
    }

    setIsPending(true)
    setHash(null)

    // Check if chain has gas sponsorship enabled (testnets + Arbitrum Mainnet)
    const isGasSponsored = chainId === 5003 || chainId === 421614 || chainId === 11155111 || chainId === 42161;
    const gasLimit = isGasSponsored ? 150000n : undefined; // Manual gas limit for ERC20 transfers

    try {
      if (tokenType === "USDC") {
        // Transfer USDC (ERC20 transfer)
        if (!addresses.DemoUSDC) {
          throw new Error(`USDC contract address not configured for chain ${chainId}`)
        }

        const amountBigInt = parseUnits(withdrawAmount, 6) // USDC has 6 decimals
        
        const data = encodeFunctionData({
          abi: DemoUSDCABI,
          functionName: "transfer",
          args: [toAddress as `0x${string}`, amountBigInt],
        })

        const result = await sendTransaction(
          {
            to: addresses.DemoUSDC as `0x${string}`,
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
        )

        setHash(result.hash)
      } else if (tokenType === "USMT+") {
        // Transfer USMT+ (ERC20 transfer)
        if (!addresses.USMTPlus) {
          throw new Error(`USMT+ contract address not configured for chain ${chainId}`)
        }

        const amountBigInt = parseUnits(withdrawAmount, 6) // USMT+ has 6 decimals
        
        const data = encodeFunctionData({
          abi: USMTPlusABI,
          functionName: "transfer",
          args: [toAddress as `0x${string}`, amountBigInt],
        })

        const result = await sendTransaction(
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
        )

        setHash(result.hash)
      } else if (tokenType === "NATIVE") {
        // Transfer native token (ETH/ArbETH on Arbitrum/Ethereum, MNT on Mantle)
        const amountBigInt = parseUnits(withdrawAmount, 18) // Native tokens have 18 decimals
        const nativeGasLimit = isGasSponsored ? 21000n : undefined; // Lower limit for native transfers
        
        const result = await sendTransaction(
          {
            to: toAddress as `0x${string}`,
            data: "0x" as `0x${string}`,
            value: amountBigInt,
            chainId,
            ...(nativeGasLimit && { gas: nativeGasLimit }), // Set manual gas limit for gas-sponsored chains
          },
          {
            address: embeddedWallet.address,
            sponsor: isGasSponsored, // Enable gas sponsorship for configured chains
            uiOptions: {
              showWalletUIs: false,
            },
          }
        )

        setHash(result.hash)
      }

      setIsPending(false)
    } catch (error: any) {
      setIsPending(false)
      toast.error("Withdrawal failed", {
        description: error.message || "Please try again",
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
         <DialogHeader>
           <DialogTitle>Withdraw Funds</DialogTitle>
           <DialogDescription>
             Send tokens to any address. Gas fees are paid in {nativeTokenSymbol}.
           </DialogDescription>
         </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Token Type Selector */}
          <div className="space-y-2">
            <Label htmlFor="tokenType">Token Type</Label>
            <Select value={tokenType} onValueChange={(value: "USDC" | "NATIVE" | "USMT+") => {
              setTokenType(value)
              setWithdrawAmount("") // Reset amount when changing token type
            }}>
              <SelectTrigger id="tokenType">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="USDC">USDC</SelectItem>
                <SelectItem value="USMT+">USMT+</SelectItem>
                <SelectItem value="NATIVE">{nativeTokenSymbol} (Native)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Current Balance */}
          <div className="rounded-lg border border-border bg-secondary/50 p-4">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Available Balance</span>
               <span className="text-lg font-semibold">
                 {isLoadingBalance ? "..." : `${currentBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${tokenType}`}
               </span>
            </div>
          </div>

          {/* Recipient Address */}
          <div className="space-y-2">
            <Label htmlFor="toAddress">Recipient Address</Label>
            <Input
              id="toAddress"
              type="text"
              placeholder="0x..."
              value={toAddress}
              onChange={(e) => setToAddress(e.target.value)}
              disabled={isPending || isConfirming}
            />
          </div>

          {/* Withdraw Amount Input */}
          <div className="space-y-2">
             <Label htmlFor="withdrawAmount">Amount to Withdraw</Label>
            <Input
              id="withdrawAmount"
              type="number"
              placeholder="0.00"
              value={withdrawAmount}
              onChange={(e) => setWithdrawAmount(e.target.value)}
              min="0"
              step="0.01"
              disabled={isPending || isConfirming || isLoadingBalance}
            />
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setWithdrawAmount((currentBalance * 0.25).toFixed(2))}
                disabled={currentBalance === 0 || isLoadingBalance}
              >
                25%
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setWithdrawAmount((currentBalance * 0.5).toFixed(2))}
                disabled={currentBalance === 0 || isLoadingBalance}
              >
                50%
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setWithdrawAmount((currentBalance * 0.75).toFixed(2))}
                disabled={currentBalance === 0 || isLoadingBalance}
              >
                75%
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setWithdrawAmount(currentBalance.toFixed(2))}
                disabled={currentBalance === 0 || isLoadingBalance}
              >
                Max
              </Button>
            </div>
          </div>

          {/* Withdraw Button */}
          <Button
            onClick={handleWithdraw}
            disabled={!withdrawAmount || !toAddress || isPending || isConfirming || parseFloat(withdrawAmount) <= 0 || parseFloat(withdrawAmount) > currentBalance || isLoadingBalance}
            className="w-full"
            variant="default"
          >
            {isPending || isConfirming ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {isPending ? "Waiting for wallet..." : "Processing..."}
              </>
            ) : (
               <>
                 <ArrowUpLeft className="mr-2 h-4 w-4" />
                 Send {withdrawAmount || "0"} {tokenType}
               </>
             )}
          </Button>
        </div>
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Receive Funds</DialogTitle>
          <DialogDescription>
            Scan this QR code or copy your wallet address to receive funds
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* QR Code */}
          <div className="flex justify-center">
            <div 
              ref={qrCodeRef}
              className="relative p-4 bg-white rounded-lg border border-border"
            >
              <QRCodeSVG
                value={address}
                size={256}
                level="H"
                includeMargin={false}
                imageSettings={{
                  src: '/monar.png',
                  height: 56,
                  width: 66,
                  excavate: true,
                }}
              />
            </div>
          </div>

          {/* Wallet Address */}
          <div className="space-y-2">
            <Label htmlFor="walletAddress">Wallet Address</Label>
            <div className="flex items-center gap-2">
              <Input
                id="walletAddress"
                type="text"
                value={address}
                readOnly
                className="font-mono text-sm"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={copyAddress}
                title="Copy Address"
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={copyAddress}
              className="flex-1"
            >
              <Copy className="h-4 w-4 mr-2" />
              Copy Address
            </Button>
            <Button
              variant="default"
              onClick={downloadQR}
              className="flex-1"
            >
              <Download className="h-4 w-4 mr-2" />
              Download QR
            </Button>
          </div>

          {/* Footer Text */}
          <p className="text-xs text-center text-muted-foreground">
            Share this QR code or address to receive funds on any supported chain
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
