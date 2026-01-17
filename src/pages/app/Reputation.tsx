import { motion } from "framer-motion"
import { 
  Award, 
  TrendingUp, 
  FileCheck, 
  Clock, 
  AlertTriangle,
  Info,
  CheckCircle2,
  Lock,
  Loader2
} from "lucide-react"
import { StatCard } from "@/components/ui/stat-card"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useReputation } from "@/hooks/useReputation"
import { useSellerInvoicesWithData } from "@/hooks/useInvoice"
import { formatUnits } from "viem"
import { useMemo } from "react"

// Tier definitions matching contract logic
const tiers = [
  { 
    name: "Tier C", 
    minScore: 0, 
    maxScore: 510,  // Tier C: 0-499 (actually 0-450 but showing up to 499)
    maxLTV: "35%", 
    apr: "18%",
  },
  { 
    name: "Tier B", 
    minScore: 510,  // Tier B: 500-850 (as shown in UI)
    maxScore: 850,
    maxLTV: "55%", 
    apr: "10-14%",
  },
  { 
    name: "Tier A", 
    minScore: 850,  // Tier A: 850-1000
    maxScore: 1000, 
    maxLTV: "85%", 
    apr: "6-10%",
  },
]

export default function Reputation() {
  const { score, tierLabel, stats, isLoading: isLoadingReputation } = useReputation()
  const { invoices, isLoading: isLoadingInvoices } = useSellerInvoicesWithData()
  
  // Get cleared invoices (status === 3) to calculate stats - MUST BE FIRST
  const clearedInvoices = useMemo(() => {
    if (!invoices) return []
    return invoices.filter(inv => inv.status === 3)
  }, [invoices])
  
  // Calculate score from cleared invoices count (more accurate than on-chain if reputation wasn't updated)
  // Formula: 450 (base) + (clearedCount × 20 points per invoice)
  const clearedCount = clearedInvoices.length
  const calculatedScoreFromInvoices = 450 + (clearedCount * 20)
  
  // Use the higher of: hook score or calculated from invoices
  // This ensures we show correct score even if on-chain reputation is stale
  const currentScore = Math.max(
    score > 0 ? score : 510,
    calculatedScoreFromInvoices
  )
  
  // Determine current tier based on score
  // Tier C: 0-450, Tier B: 500-850, Tier A: 850-1000
  // Note: Scores 451-499 are still Tier C (until they reach 500 for Tier B)
  const currentTier = useMemo(() => {
    if (currentScore < 500) return 'C'  // Tier C: 0-499 (but UI shows 0-450)
    if (currentScore < 850) return 'B'  // Tier B: 500-849
    return 'A'  // Tier A: 850-1000
  }, [currentScore])
  
  // Get next tier threshold
  const nextTierScore = useMemo(() => {
    if (currentTier === 'C') return 500  // Next is Tier B (starts at 500)
    if (currentTier === 'B') return 850  // Next is Tier A (starts at 850)
    return 1000  // Max tier
  }, [currentTier])
  
  // Calculate stats from cleared invoices
  const calculatedStats = useMemo(() => {
    const clearedCount = clearedInvoices.length
    const totalVolume = clearedInvoices.reduce((sum, inv) => {
      return sum + parseFloat(formatUnits(inv.amount, 6))
    }, 0)
    
    return {
      invoicesCleared: clearedCount,
      totalVolume,
      // Use on-chain stats if available, otherwise use calculated
      score: stats?.score ? Number(stats.score) : currentScore,
      invoicesClearedCount: stats?.invoicesCleared ? Number(stats.invoicesCleared) : clearedCount,
      totalVolumeAmount: stats?.totalVolume ? Number(stats.totalVolume) / 1e6 : totalVolume, // stats stores in 6 decimals
    }
  }, [clearedInvoices, stats, currentScore])
  
  // Generate score history from cleared invoices (most recent first)
  const scoreHistory = useMemo(() => {
    const recentCleared = clearedInvoices
      .sort((a, b) => {
        const aTime = a.clearedAt ? Number(a.clearedAt) : 0
        const bTime = b.clearedAt ? Number(b.clearedAt) : 0
        return bTime - aTime
      })
      .slice(0, 5) // Show last 5 cleared invoices
    
    return recentCleared.map(inv => {
      const date = inv.clearedAt 
        ? new Date(Number(inv.clearedAt) * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        : 'N/A'
      
      return {
        event: `Invoice INV-${inv.invoiceId.toString().padStart(10, '0')} cleared`,
        change: 20, // 20 points per repayment
        date,
      }
    })
  }, [clearedInvoices])
  
  const isLoading = isLoadingReputation || isLoadingInvoices

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8"
    >
      {/* Header */}
      <div>
        <h1 className="text-[32px] font-semibold text-[#404040] dark:text-white tracking-tight">Reputation</h1>
        <p className="text-[#aeaeae] text-base mt-1">
          Your on-chain reputation score and unlock progression
        </p>
      </div>

      {/* Main score card */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-[20px] border border-[#e8e8e8] dark:border-gray-700 bg-white dark:bg-gray-800 p-8 shadow-[0px_20px_40px_-12px_rgba(0,0,0,0.08)]">
          <div className="flex items-start justify-between mb-8">
            <div>
              <p className="text-sm font-medium text-[#696969] mb-3">Your Reputation Score</p>
              <div className="flex items-end gap-3">
                {isLoading ? (
                  <Loader2 className="h-16 w-16 animate-spin text-[#aeaeae]" />
                ) : (
                  <>
                    <span className="text-7xl font-bold bg-gradient-to-r from-[#c8ff00] via-[#a8df00] to-[#7cb518] bg-clip-text text-transparent">{currentScore}</span>
                    <span className="mb-3 text-2xl font-medium text-[#c7c7c7]">/ 1000</span>
                  </>
                )}
              </div>
              {!isLoading && (
                <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#c8ff00]/15 text-[#5a8c1a]">
                  <TrendingUp className="h-4 w-4" />
                  <span className="text-sm font-semibold">Tier {currentTier} • {tierLabel}</span>
                </div>
              )}
            </div>
            <div className="rounded-2xl bg-gradient-to-br from-[#c8ff00]/20 to-[#c8ff00]/5 p-5 border border-[#c8ff00]/30">
              <Award className="h-12 w-12 text-[#7cb518]" />
            </div>
          </div>

          {/* Progress to next tier */}
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="font-semibold text-[#1a1a1a] dark:text-white">Progress to Tier {currentTier === 'C' ? 'B' : currentTier === 'B' ? 'A' : 'A+'}</span>
              <span className="text-sm font-medium text-[#696969] bg-[#f5f5f5] dark:bg-gray-700 px-3 py-1 rounded-full">
                {!isLoading && currentScore < nextTierScore ? `${nextTierScore - currentScore} points to go` : 'Max tier reached'}
              </span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-[#f1f1f1] dark:bg-gray-700 relative">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${(currentScore / 1000) * 100}%` }}
                transition={{ duration: 1, delay: 0.3 }}
                className="h-full rounded-full bg-gradient-to-r from-[#c8ff00] via-[#b8ef00] to-[#a8df00] shadow-[0_0_12px_rgba(200,255,0,0.4)]"
              />
            </div>
            <div className="flex justify-between text-xs font-medium">
              <span className="text-[#c7c7c7]">0</span>
              <span className="text-[#c8ff00] px-2 py-0.5 bg-[#c8ff00]/10 rounded">Tier C (450)</span>
              <span className="text-[#696969]">Tier B (500)</span>
              <span className="text-[#696969]">Tier A (850)</span>
              <span className="text-[#c7c7c7]">1000</span>
            </div>
          </div>
        </div>

        {/* Quick stats */}
        <div className="space-y-4">
          <StatCard
            title="Invoices Cleared"
            value={isLoading ? "..." : calculatedStats.invoicesClearedCount.toString()}
            icon={FileCheck}
            variant="success"
          />
          <StatCard
            title="Total Volume"
            value={isLoading ? "..." : `$${calculatedStats.totalVolumeAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
            icon={TrendingUp}
            variant="primary"
          />
          <StatCard
            title="Current Tier"
            value={isLoading ? "..." : `Tier ${currentTier}`}
            icon={Award}
          />
        </div>
      </div>

      {/* Tier ladder */}
      <div className="rounded-[20px] border border-[#e8e8e8] dark:border-gray-700 bg-white dark:bg-gray-800 p-6 shadow-[0px_20px_40px_-12px_rgba(0,0,0,0.08)]">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-[#1a1a1a] dark:text-white">Unlock Ladder</h2>
            <Tooltip>
              <TooltipTrigger>
                <div className="rounded-full bg-[#f1f1f1] dark:bg-gray-700 p-1">
                  <Info className="h-3.5 w-3.5 text-[#aeaeae]" />
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p className="max-w-xs text-sm">
                  Higher tiers unlock better financing terms including higher LTV and lower APR
                </p>
              </TooltipContent>
            </Tooltip>
          </div>
          <span className="text-sm font-medium text-[#c8ff00] bg-[#c8ff00]/10 px-3 py-1 rounded-full">3 Tiers</span>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {tiers.map((tier, index) => {
            const isCurrentTier = currentTier === tier.name.replace('Tier ', '')
            const isUnlocked = currentScore >= tier.minScore
            
            return (
            <motion.div
              key={tier.name}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className={`relative rounded-2xl border-2 p-5 transition-all ${
                isCurrentTier
                  ? "border-[#c8ff00] bg-gradient-to-br from-[#c8ff00]/10 to-[#c8ff00]/5 shadow-[0_8px_24px_-8px_rgba(200,255,0,0.25)]"
                  : isUnlocked
                  ? "border-[#e8e8e8] dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-[#c8ff00]/50 hover:shadow-md"
                  : "border-[#f1f1f1] dark:border-gray-700 bg-[#fafafa] dark:bg-gray-800/50 opacity-60"
              }`}
            >
              {isCurrentTier && (
                <div className="absolute -top-3 left-4 rounded-full bg-[#c8ff00] px-4 py-1 text-xs font-bold text-[#1a1a1a] shadow-sm">
                  Current
                </div>
              )}
              
              <div className="mb-4 flex items-center justify-between">
                <span className={`text-xl font-bold ${isCurrentTier ? 'text-[#5a8c1a]' : 'text-[#1a1a1a] dark:text-white'}`}>{tier.name}</span>
                {isUnlocked ? (
                  <div className="rounded-full bg-[#c8ff00]/20 p-1.5">
                    <CheckCircle2 className="h-5 w-5 text-[#7cb518]" />
                  </div>
                ) : (
                  <div className="rounded-full bg-[#f1f1f1] dark:bg-gray-700 p-1.5">
                    <Lock className="h-5 w-5 text-[#aeaeae]" />
                  </div>
                )}
              </div>
              
              <div className="space-y-3 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-[#696969]">Score Range</span>
                  <span className="font-semibold text-[#1a1a1a] dark:text-white">{tier.minScore}-{tier.maxScore}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[#696969]">Max LTV</span>
                  <span className={`font-semibold ${isCurrentTier ? 'text-[#7cb518]' : 'text-[#1a1a1a] dark:text-white'}`}>{tier.maxLTV}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[#696969]">APR Range</span>
                  <span className={`font-semibold ${isCurrentTier ? 'text-[#7cb518]' : 'text-[#1a1a1a] dark:text-white'}`}>{tier.apr}</span>
                </div>
              </div>
            </motion.div>
            )
          })}
        </div>
      </div>

      {/* Score history */}
      <div className="rounded-[20px] border border-[#e8e8e8] dark:border-gray-700 bg-white dark:bg-gray-800 p-6 shadow-[0px_20px_40px_-12px_rgba(0,0,0,0.08)]">
        <h2 className="mb-6 text-lg font-semibold text-[#1a1a1a] dark:text-white">Recent Score Changes</h2>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : scoreHistory.length === 0 ? (
          <div className="py-8 text-center text-[#aeaeae]">
            No cleared invoices yet. Clear invoices to earn reputation points.
          </div>
        ) : (
        <div className="space-y-3">
          {scoreHistory.map((item, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
              className="flex items-center justify-between rounded-xl bg-[#f8f8f8] dark:bg-gray-700/50 p-4 hover:bg-[#f1f1f1] dark:hover:bg-gray-700 transition-colors"
            >
              <div className="flex items-center gap-4">
                <div className={`rounded-xl p-2.5 ${
                  item.change > 0 ? "bg-[#c8ff00]/15 text-[#7cb518]" : "bg-[#f1f1f1] text-[#aeaeae]"
                }`}>
                  {item.change > 0 ? (
                    <TrendingUp className="h-5 w-5" />
                  ) : (
                    <FileCheck className="h-5 w-5" />
                  )}
                </div>
                <div>
                  <p className="font-medium text-[#1a1a1a] dark:text-white">{item.event}</p>
                  <p className="text-sm text-[#aeaeae]">{item.date}</p>
                </div>
              </div>
              {item.change !== 0 && (
                <span className={`font-bold px-3 py-1 rounded-full text-sm ${
                  item.change > 0 ? "bg-[#c8ff00]/15 text-[#5a8c1a]" : "text-destructive"
                }`}>
                  {item.change > 0 ? "+" : ""}{item.change} pts
                </span>
              )}
            </motion.div>
          ))}
        </div>
        )}
      </div>

      {/* Score explanation */}
      <div className="rounded-[20px] border-2 border-[#c8ff00]/40 bg-gradient-to-br from-[#c8ff00]/10 via-[#c8ff00]/5 to-transparent p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="rounded-xl bg-[#c8ff00]/20 p-2">
            <Info className="h-5 w-5 text-[#7cb518]" />
          </div>
          <h3 className="font-semibold text-[#1a1a1a] dark:text-white">How Your Score is Calculated</h3>
        </div>
        <p className="text-[#696969] dark:text-gray-400 mb-5">
          Your reputation score is calculated transparently using the following on-chain metrics:
        </p>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-xl bg-white dark:bg-gray-800 p-5 shadow-[0px_4px_16px_-4px_rgba(0,0,0,0.1)] border border-[#e8e8e8] dark:border-gray-700 hover:shadow-md hover:border-[#c8ff00]/30 transition-all">
            <p className="text-xs font-semibold text-[#7cb518] uppercase tracking-wide mb-2">Invoices Cleared</p>
            <p className="text-3xl font-bold text-[#1a1a1a] dark:text-white">{isLoading ? "..." : calculatedStats.invoicesClearedCount}</p>
          </div>
          <div className="rounded-xl bg-white dark:bg-gray-800 p-5 shadow-[0px_4px_16px_-4px_rgba(0,0,0,0.1)] border border-[#e8e8e8] dark:border-gray-700 hover:shadow-md hover:border-[#c8ff00]/30 transition-all">
            <p className="text-xs font-semibold text-[#7cb518] uppercase tracking-wide mb-2">Total Volume</p>
            <p className="text-3xl font-bold text-[#1a1a1a] dark:text-white">
              {isLoading ? "..." : `$${calculatedStats.totalVolumeAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
            </p>
          </div>
          <div className="rounded-xl bg-white dark:bg-gray-800 p-5 shadow-[0px_4px_16px_-4px_rgba(0,0,0,0.1)] border border-[#e8e8e8] dark:border-gray-700 hover:shadow-md hover:border-[#c8ff00]/30 transition-all">
            <p className="text-xs font-semibold text-[#7cb518] uppercase tracking-wide mb-2">Reputation Score</p>
            <p className="text-3xl font-bold text-[#1a1a1a] dark:text-white">{isLoading ? "..." : currentScore}</p>
          </div>
          <div className="rounded-xl bg-white dark:bg-gray-800 p-5 shadow-[0px_4px_16px_-4px_rgba(0,0,0,0.1)] border border-[#e8e8e8] dark:border-gray-700 hover:shadow-md hover:border-[#c8ff00]/30 transition-all">
            <p className="text-xs font-semibold text-[#7cb518] uppercase tracking-wide mb-2">Current Tier</p>
            <p className="text-3xl font-bold text-[#1a1a1a] dark:text-white">{isLoading ? "..." : `Tier ${currentTier}`}</p>
          </div>
          <div className="rounded-xl bg-white dark:bg-gray-800 p-5 shadow-[0px_4px_16px_-4px_rgba(0,0,0,0.1)] border border-[#e8e8e8] dark:border-gray-700 hover:shadow-md hover:border-[#c8ff00]/30 transition-all">
            <p className="text-xs font-semibold text-[#7cb518] uppercase tracking-wide mb-2">Points per Repayment</p>
            <p className="text-3xl font-bold text-[#c8ff00]">+20</p>
          </div>
          <div className="rounded-xl bg-gradient-to-br from-[#c8ff00]/15 to-[#c8ff00]/5 dark:from-[#c8ff00]/20 dark:to-[#c8ff00]/10 p-5 shadow-[0px_4px_16px_-4px_rgba(200,255,0,0.2)] border-2 border-[#c8ff00]/40">
            <p className="text-xs font-semibold text-[#5a8c1a] uppercase tracking-wide mb-2">Next Tier</p>
            <p className="text-3xl font-bold bg-gradient-to-r from-[#c8ff00] to-[#7cb518] bg-clip-text text-transparent">
              {isLoading ? "..." : currentScore < nextTierScore ? `${nextTierScore - currentScore} pts` : "Max"}
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
