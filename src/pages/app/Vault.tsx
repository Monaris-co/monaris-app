import { motion } from "framer-motion"
import { 
  TrendingUp, 
  Vault as VaultIcon, 
  ArrowUpRight, 
  ArrowDownRight,
  ArrowRight,
  Info,
  Plus,
  LineChart,
  Shield,
  CheckSquare,
  Activity,
  Loader2,
  X,
  CheckCircle2,
  Copy,
  ExternalLink
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { StatCard } from "@/components/ui/stat-card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useVault, useDepositVault, useWithdrawVault, useUSDCAllowance } from "@/hooks/useVault"
import { useTokenBalance } from "@/hooks/useTokenBalance"
import { useChainAddresses } from "@/hooks/useChainAddresses"
import { useChainId } from "wagmi"
import { useMemo, useState, useEffect, useRef } from "react"
import { parseUnits, formatUnits } from "viem"
import { toast } from "sonner"
import { getExplorerUrl } from "@/lib/chain-utils"

export default function Vault() {
  const { totalLiquidity, totalBorrowed, utilizationRate, userBalance, userShares, totalShares, isLoading } = useVault()
  const chainId = useChainId()
  const addresses = useChainAddresses()
  const [depositSectionOpen, setDepositSectionOpen] = useState(false)
  const [withdrawDialogOpen, setWithdrawDialogOpen] = useState(false)

  // Check if on Arbitrum Mainnet (42161) - show coming soon message
  const isArbitrumMainnet = chainId === 42161

  // Calculate utilization rate as percentage
  const utilizationRatePercent = useMemo(() => {
    return (utilizationRate * 100).toFixed(1)
  }, [utilizationRate])

  // Calculate user's vault share percentage
  const userVaultSharePercent = useMemo(() => {
    if (totalLiquidity === 0 || userBalance === 0) return 0
    return ((userBalance / totalLiquidity) * 100).toFixed(2)
  }, [totalLiquidity, userBalance])

  // Calculate estimated monthly earnings (simplified - would need actual APR calculation)
  const estimatedMonthlyEarnings = useMemo(() => {
    if (userBalance === 0) return 0
    // Rough estimate: assume 6% APR / 12 months
    return (userBalance * 0.06) / 12
  }, [userBalance])

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
            <VaultIcon className="h-16 w-16 text-primary" />
          </div>
          <div className="text-center space-y-3">
            <h1 className="text-4xl font-bold tracking-tight">Funding Pool</h1>
            <p className="text-xl text-muted-foreground">Coming Soon (Stay Tuned)</p>
            <p className="text-sm text-muted-foreground max-w-md">
              The funding pool feature is currently being deployed on Arbitrum Mainnet. 
              Please check back soon
            </p>
          </div>
        </div>
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8 px-3 sm:px-4 md:px-0"
    >
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Funding Pool</h1>
        <h2 className="text-lg text-muted-foreground mt-2 font-medium">
          Provide liquidity to the Monaris financing engine and earn protocol fees.
        </h2>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-3">
        <Button variant="outline" className="gap-2">
          <LineChart className="h-4 w-4" />
          Health Report
        </Button>
        <Button variant="hero" className="gap-2" onClick={() => setDepositSectionOpen(true)}>
          <Plus className="h-4 w-4" />
          + Deposit USDC
        </Button>
      </div>

      {/* Key Metrics Section */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="TOTAL VALUE LOCKED"
          value={isLoading ? "..." : `$${totalLiquidity.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
          icon={VaultIcon}
          isLoading={isLoading}
        />
        <MetricCard
          title="UTILIZATION RATE"
          value={isLoading ? "..." : `${utilizationRatePercent}%`}
          status={utilizationRate < 0.8 ? "Stable" : utilizationRate < 0.9 ? "High" : "Very High"}
          icon={TrendingUp}
          isLoading={isLoading}
        />
        <MetricCard
          title="TOTAL BORROWED"
          value={isLoading ? "..." : `$${totalBorrowed.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
          icon={TrendingUp}
          isLoading={isLoading}
        />
        <MetricCard
          title="AVAILABLE LIQUIDITY"
          value={isLoading ? "..." : `$${(totalLiquidity - totalBorrowed).toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
          icon={VaultIcon}
          isLoading={isLoading}
        />
      </div>

      {/* Main Content: Exposure by Tier + Your Position */}
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        {/* Left: Exposure by Tier */}
        <div className="rounded-xl border border-border bg-card p-6 shadow-md">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Exposure by Tier</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Risk distribution across seller reputation tiers
              </p>
            </div>
            <div className="rounded-full border border-border bg-secondary/50 px-3 py-1.5">
              <span className="text-xs font-medium text-muted-foreground">Updated Real-Time</span>
            </div>
          </div>

          {/* Chart with dashed grid lines */}
          <div className="relative mb-6 h-48">
            {/* Dashed vertical grid lines */}
            <div className="absolute inset-0">
              {[0, 25, 50, 75, 100].map((val) => (
                <div
                  key={val}
                  className="absolute top-0 h-full border-l border-dashed border-border"
                  style={{ left: `${val}%` }}
                />
              ))}
            </div>

            {/* Bars */}
            <div className="relative h-full flex flex-col justify-center gap-6">
              <TierBar percentage={45} color="bg-success" />
              <TierBar percentage={30} color="bg-info" />
              <TierBar percentage={15} color="bg-warning" />
              <TierBar percentage={10} color="bg-muted" />
            </div>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-6 border-t border-border pt-4">
            <LegendItem label="TIER A" percentage={45} color="bg-success" />
            <LegendItem label="TIER B" percentage={30} color="bg-info" />
            <LegendItem label="TIER C" percentage={15} color="bg-warning" />
            <LegendItem label="RESERVE" percentage={10} color="bg-muted" />
          </div>
        </div>

        {/* Right: Your Position */}
        <div className="relative rounded-xl border border-border bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6 shadow-xl overflow-hidden">
          {/* Background pattern */}
          <div className="absolute inset-0 opacity-5">
            <div className="absolute bottom-0 right-0 h-32 w-32 translate-x-1/2 translate-y-1/2 rounded-full border border-primary/20" />
            <div className="absolute bottom-0 right-0 h-20 w-20 translate-x-1/4 translate-y-1/4 rounded-full border border-primary/20" />
          </div>

          <div className="relative">
            <h2 className="mb-6 text-lg font-semibold text-primary">Your Position</h2>

            <div className="mb-6 space-y-4">
              <div>
                <p className="mb-1 text-xs font-medium text-primary-foreground/60">TOTAL BALANCE</p>
                {isLoading ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-6 w-6 animate-spin text-white" />
                    <span className="text-3xl font-bold text-white">Loading...</span>
                  </div>
                 ) : (
                   <p className="text-3xl font-bold text-white">
                     {userBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
                     <span className="text-xl text-primary-foreground/80">USMT+</span>
                   </p>
                 )}
              </div>

              {!isLoading && userBalance > 0 && (
                <>
              <div className="flex items-center gap-2">
                <ArrowUpRight className="h-4 w-4 text-success" />
                <div>
                      <p className="text-xs text-primary-foreground/60">USMT+ Tokens</p>
                      <p className="text-lg font-semibold text-success">
                        {formatUnits(userShares, 6)}
                      </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 rounded-lg bg-black/20 p-3">
                <div>
                  <p className="text-xs text-primary-foreground/60">Vault Share</p>
                      <p className="text-sm font-semibold text-white">
                        {userVaultSharePercent}%
                      </p>
                </div>
                <div>
                  <p className="text-xs text-primary-foreground/60">Est. Monthly</p>
                      <p className="text-sm font-semibold text-white">
                        ~${estimatedMonthlyEarnings.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                    </div>
                  </div>
                </>
              )}

               {!isLoading && userBalance === 0 && (
                 <div className="rounded-lg bg-black/20 p-4 text-center">
                   <p className="text-sm text-primary-foreground/60">
                     No position yet. Deposit USDC to receive USMT+ tokens.
                   </p>
                 </div>
               )}
            </div>

            <div className="flex gap-3">
              <Button 
                variant="default" 
                size="sm" 
                className="flex-1 bg-primary/20 hover:bg-primary/30 text-white border-primary/30"
                onClick={() => setDepositSectionOpen(true)}
              >
                Deposit
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                className="flex-1 bg-transparent hover:bg-white/10 text-white border-white/20"
                onClick={() => setWithdrawDialogOpen(true)}
                disabled={userBalance === 0}
              >
                Withdraw
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Deposit Dialog */}
      <DepositDialog 
        open={depositSectionOpen}
        onOpenChange={setDepositSectionOpen}
      />

      {/* Withdraw Dialog */}
      <WithdrawDialog 
        open={withdrawDialogOpen} 
        onOpenChange={setWithdrawDialogOpen}
        userBalance={userBalance}
        userShares={userShares}
        totalLiquidity={totalLiquidity}
        totalShares={totalShares}
      />

      {/* Staking Section */}
      <div className="relative rounded-xl border border-border bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-8 shadow-xl overflow-hidden">
        {/* Background pattern */}
        <div className="absolute inset-0 opacity-5">
          <div className="absolute top-0 right-0 h-32 w-32 translate-x-1/2 -translate-y-1/2 rounded-full border border-primary/20" />
          <div className="absolute bottom-0 left-0 h-20 w-20 -translate-x-1/4 translate-y-1/4 rounded-full border border-primary/20" />
        </div>

        <div className="relative">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6 mb-6">
            <div className="flex-1">
              <h2 className="text-3xl font-bold text-white mb-2">Stake USMT+ → receive sUSMT+</h2>
              <p className="text-primary-foreground/80 text-lg">
                Lockup period • Cashflow credit-backed 15-25% APY
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-xs text-primary-foreground/60 mb-1">Estimated APY</p>
                <p className="text-4xl font-bold text-[#FFD700]">25.6%</p>
              </div>
            </div>
          </div>

          {/* Features Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="flex items-start gap-3 p-4 rounded-lg bg-black/20 border border-white/10">
              <CheckCircle2 className="h-5 w-5 text-success mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-semibold text-sm text-white">Liquidity buffer</p>
                <p className="text-xs text-primary-foreground/60">Priority withdrawals</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-4 rounded-lg bg-black/20 border border-white/10">
              <CheckCircle2 className="h-5 w-5 text-success mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-semibold text-sm text-white">Cashflow credit-backed</p>
                <p className="text-xs text-primary-foreground/60">first-loss / cooldown / higher yield</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-4 rounded-lg bg-black/20 border border-white/10">
              <CheckCircle2 className="h-5 w-5 text-success mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-semibold text-sm text-white">Enhanced Yield</p>
                <p className="text-xs text-primary-foreground/60">15-25% APY range</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-4 rounded-lg bg-black/20 border border-white/10">
              <CheckCircle2 className="h-5 w-5 text-success mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-semibold text-sm text-white">Lockup Period</p>
                <p className="text-xs text-primary-foreground/60">Flexible staking options</p>
              </div>
            </div>
          </div>

          {/* Action Button */}
          <div className="flex justify-center">
            <Button 
              variant="default"
              size="lg"
              className="bg-[#8B9A5B] hover:bg-[#7A8A4A] text-white px-8 py-6 text-lg font-semibold"
              onClick={() => {
                // TODO: Open staking dialog
                toast.info("Staking dialog coming soon")
              }}
            >
              Stake USMT+ (coming soon)
            </Button>
          </div>
        </div>
      </div>

      {/* Security & Transparency */}
      <div className="grid gap-6 md:grid-cols-3">
        <SecurityCard
          icon={Shield}
          title="Non-Custodial"
          description="Funds are managed by audited smart contracts on Mantle. You always retain ownership."
        />
        <SecurityCard
          icon={CheckSquare}
          title="Liquidity Reserve"
          description="A 10% reserve is maintained at all times to ensure smooth withdrawals."
        />
        <SecurityCard
          icon={Activity}
          title="Risk Engine"
          description="Dynamic credit scoring and zkTLS proofs prevent bad debt and fraud."
        />
      </div>
    </motion.div>
  )
}

function MetricCard({
  title,
  value,
  trend,
  status,
  icon: Icon,
  isLoading = false,
}: {
  title: string
  value: string
  trend?: string
  status?: string
  icon: any
  isLoading?: boolean
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-md">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {title}
        </p>
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : (
        <Icon className="h-4 w-4 text-muted-foreground" />
        )}
      </div>
      <p className="mb-2 text-3xl font-bold tracking-tight text-foreground">{value}</p>
      {trend && !isLoading && (
        <p className="text-sm font-medium text-success flex items-center gap-1">
          <ArrowUpRight className="h-3 w-3" />
          {trend}
        </p>
      )}
      {status && !isLoading && (
        <p className="text-sm font-medium text-muted-foreground">{status}</p>
      )}
    </div>
  )
}

function TierBar({
  percentage,
  color,
}: {
  percentage: number
  color: string
}) {
  return (
    <div className="relative h-6 w-full">
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${percentage}%` }}
        transition={{ duration: 0.8, delay: 0.2 }}
        className={`h-full ${color} rounded`}
      />
    </div>
  )
}

function LegendItem({
  label,
  percentage,
  color,
}: {
  label: string
  percentage: number
  color: string
}) {
  return (
    <div className="flex items-center gap-2">
      <div className={`h-2.5 w-2.5 rounded-full ${color}`} />
      <span className="text-sm font-medium text-foreground">
        {label} <span className="font-semibold">{percentage}%</span>
      </span>
    </div>
  )
}

function SecurityCard({
  icon: Icon,
  title,
  description,
}: {
  icon: any
  title: string
  description: string
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-md">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
        <Icon className="h-6 w-6 text-primary" />
      </div>
      <h3 className="mb-2 font-semibold">{title}</h3>
      <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
    </div>
  )
}

function DepositDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const chainId = useChainId()
  const addresses = useChainAddresses()
  const [depositAmount, setDepositAmount] = useState("")
  const [successModalOpen, setSuccessModalOpen] = useState(false)
  const [successHash, setSuccessHash] = useState<string | null>(null)
  const [successAmount, setSuccessAmount] = useState<string>("")
  const depositSuccessToastShown = useRef<string | null>(null)
  const { balance: tokenBalance, isLoading: isLoadingBalance } = useTokenBalance()
  const { allowance, approve: approveUSDC, isPending: isApproving, isConfirming: isApprovalConfirming, isSuccess: isApprovalSuccess, hash: approveHash, refetch: refetchAllowance } = useUSDCAllowance(addresses.Vault)
  const { deposit, hash: depositHash, isPending: isDepositing, isConfirming: isDepositConfirming, isSuccess: isDepositSuccess } = useDepositVault()
  const { userBalance: vaultUSMTBalance, totalLiquidity, totalShares } = useVault()
  
  // State to track if we're waiting for allowance to update after approval
  const [isWaitingForAllowanceUpdate, setIsWaitingForAllowanceUpdate] = useState(false)

  // Calculate needed allowance - handle invalid amounts safely
  const depositAmountBigInt = useMemo(() => {
    if (!depositAmount || isNaN(parseFloat(depositAmount)) || parseFloat(depositAmount) <= 0) {
      return BigInt(0)
    }
    try {
      return parseUnits(depositAmount, 6)
    } catch (e) {
      console.error("Error parsing deposit amount:", e)
      return BigInt(0)
    }
  }, [depositAmount])
  
  // Check if approval is needed - account for potential timing issues
  const needsApproval = useMemo(() => {
    if (depositAmountBigInt === BigInt(0)) return false
    if (isWaitingForAllowanceUpdate) return true // Still waiting for allowance update
    return allowance < depositAmountBigInt
  }, [depositAmountBigInt, allowance, isWaitingForAllowanceUpdate])

  // USMT+ is minted 1:1 with USDC deposit
  const usmtToReceive = useMemo(() => {
    if (!depositAmount || parseFloat(depositAmount) <= 0) return 0
    // 1:1 ratio - deposit USDC, receive USMT+
    return parseFloat(depositAmount)
  }, [depositAmount])

  // Debug logging for allowance check
  useEffect(() => {
    if (depositAmountBigInt > 0) {
      console.log('🔍 Deposit allowance check:', {
        depositAmount: depositAmount,
        depositAmountBigInt: depositAmountBigInt.toString(),
        allowance: allowance.toString(),
        needsApproval,
        vaultAddress: addresses.Vault,
        tokenBalance,
      })
      
      // Warn if trying to deposit without approval
      if (needsApproval) {
        console.warn('⚠️ Approval required before deposit. Current allowance:', allowance.toString(), 'Required:', depositAmountBigInt.toString())
      }
    }
  }, [depositAmount, depositAmountBigInt, allowance, needsApproval, tokenBalance])

  // Handle deposit success - show centered modal with green checkmark and transaction hash when confirmed
  useEffect(() => {
    if (depositHash && isDepositSuccess && depositSuccessToastShown.current !== depositHash) {
      depositSuccessToastShown.current = depositHash
      setSuccessHash(depositHash)
      setSuccessAmount(depositAmount) // Store amount before clearing
      setSuccessModalOpen(true)
      setDepositAmount("")
      onOpenChange(false)
    }
  }, [depositHash, isDepositSuccess, isDepositConfirming, depositAmount, onOpenChange, open])

  const approvalSuccessToastShown = useRef<string | null>(null)

  // Handle approval success - show toast with green checkmark and transaction hash when confirmed
  useEffect(() => {
    if (approveHash && isApprovalSuccess && approvalSuccessToastShown.current !== approveHash) {
      approvalSuccessToastShown.current = approveHash
      
      const copyToClipboard = () => {
        navigator.clipboard.writeText(approveHash)
        toast.success("Transaction hash copied!")
      }
      
      toast.success(
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-500 flex-shrink-0" />
          <span className="font-semibold">Approval Successful!</span>
        </div>,
        {
          description: (
            <div className="space-y-3 mt-2">
               <p className="font-medium text-sm">USDC approval has been successfully processed. You can now deposit.</p>
              
              <div className="space-y-2 pt-2 border-t border-border/50">
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">TRANSACTION HASH</span>
                  <div className="relative">
                    <Input
                      type="text"
                      value={approveHash}
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
                    href={getExplorerUrl(chainId, approveHash || '')}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    View on Explorer
                  </a>
                </Button>
              </div>
            </div>
          ),
          duration: 10000,
          id: 'approval-success',
        }
      )
      
      // Set waiting state and refetch allowance after a short delay
      setIsWaitingForAllowanceUpdate(true)
      const timer1 = setTimeout(async () => {
        await refetchAllowance()
      }, 2000) // Wait 2 seconds for blockchain to update
      const timer2 = setTimeout(async () => {
        await refetchAllowance()
        setIsWaitingForAllowanceUpdate(false) // Clear waiting state after refetch
      }, 4000) // Second refetch to ensure we get updated value
      
      return () => {
        clearTimeout(timer1)
        clearTimeout(timer2)
      }
    }
  }, [approveHash, isApprovalSuccess, refetchAllowance])

  const handleApprove = async () => {
    try {
      // Approve a large amount to avoid repeated approvals
      const maxApproval = parseUnits("1000000", 6) // 1M USDC
      await approveUSDC(maxApproval)
    } catch (error: any) {
      console.error("Approval error:", error)
      toast.error("Approval failed", {
        description: error.message || "Please try again",
      })
    }
  }

  const handleDeposit = async () => {
    if (!depositAmount) {
      toast.error("Enter deposit amount")
      return
    }

    const amount = parseFloat(depositAmount)
    if (isNaN(amount) || amount <= 0) {
      toast.error("Invalid amount", {
        description: "Amount must be greater than 0",
      })
      return
    }

    if (amount > tokenBalance) {
      toast.error("Insufficient balance", {
         description: `You have ${tokenBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC`,
      })
      return
    }

    // Check if approval is needed - double check before sending transaction
    if (depositAmountBigInt === BigInt(0)) {
      toast.error("Invalid amount", {
        description: "Please enter a valid deposit amount.",
      })
      return
    }
    
    // Final check - ensure we have sufficient allowance (double check before sending transaction)
    // The button should already be disabled if needsApproval is true, but this is a safety check
    if (needsApproval || allowance < depositAmountBigInt) {
       toast.error("Approval required", {
         description: "Please click 'Approve USDC' button first, wait for it to complete, and then try depositing again.",
        duration: 8000,
      })
      return
    }

    try {
      await deposit(depositAmount)
    } catch (error: any) {
      console.error("Deposit error:", error)
      
      // Extract error message with enhanced detection
      let errorMessage = error?.message || error?.shortMessage || String(error);
      
      // Check if using old contract addresses first
      if (errorMessage.includes('OLD contract addresses') || errorMessage.includes('update your .env')) {
        toast.error("Configuration Error", {
          description: (
            <div className="space-y-2">
              <p className="font-semibold">Using OLD contract addresses!</p>
              <p className="text-sm">Please update your .env file with these NEW addresses:</p>
              <div className="text-xs font-mono bg-muted p-2 rounded space-y-1">
                <div>VITE_DEMO_USDC_ADDRESS=0x2De86556c08Df11E1D35223F0741791fBD847567</div>
                <div>VITE_VAULT_ADDRESS=0x6a8B044A517B8e8f8B8F074bd981FA5149108BCb</div>
                <div>VITE_INVOICE_REGISTRY_ADDRESS=0x092511Bc54Ab7b17197FAaE5eedC889806bB94c5</div>
                <div>VITE_ADVANCE_ENGINE_ADDRESS=0x15127d7136187CBF1550B35897D495a1593Dd101</div>
                <div>VITE_REPUTATION_ADDRESS=0x28F87D31F8305B13aFc71f69b0D1d188003d1BB3</div>
                <div>VITE_SETTLEMENT_ROUTER_ADDRESS=0x7630A3B6c362345d0E0D1f746dB231Ac4eB5302B</div>
              </div>
              <p className="text-xs text-muted-foreground">Then restart your dev server.</p>
            </div>
          ),
          duration: 15000,
        })
        return
      }

      // Check for allowance/approval errors (most common cause of execution reverted)
      const errorMsgLower = errorMessage.toLowerCase()
       if (errorMsgLower.includes('allowance') || 
           errorMsgLower.includes('approval') || 
           errorMsgLower.includes('transferfrom') ||
           errorMsgLower.includes('execution reverted')) {
         errorMessage = "Insufficient allowance. Please click the 'Approve USDC' button first, wait for it to complete, then try depositing again."
        
        // Show approval button hint
        toast.error("Approval Required", {
          description: (
            <div className="space-y-2">
              <p>{errorMessage}</p>
               <p className="text-xs text-muted-foreground">
                 The Vault contract needs permission to transfer your USDC tokens. Click "Approve USDC" above.
               </p>
            </div>
          ),
          duration: 10000,
        })
      } else if (errorMsgLower.includes('balance') || errorMsgLower.includes('insufficient balance')) {
        errorMessage = `Insufficient balance. You have ${tokenBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC available.`
        toast.error("Deposit failed", {
          description: errorMessage,
          duration: 8000,
        })
      } else {
        // Generic error
        toast.error("Deposit failed", {
          description: errorMessage || "Transaction failed. Please try again.",
          duration: 8000,
        })
      }
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Deposit USDC</DialogTitle>
          </DialogHeader>

          <div className="space-y-6 py-4">
          {/* Amount Input Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="depositAmount" className="text-base font-medium">Amount</Label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  {isLoadingBalance ? "..." : `${tokenBalance.toLocaleString(undefined, { maximumFractionDigits: 0 })} USDC`}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDepositAmount(tokenBalance.toFixed(2))}
                  disabled={isLoadingBalance || tokenBalance === 0}
                  className="h-7 px-2 text-xs"
                >
                  MAX
                </Button>
              </div>
            </div>
            <div className="relative">
              <Input
                id="depositAmount"
                type="number"
                placeholder="0.00"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                min="0"
                step="0.01"
                disabled={isDepositing || isDepositConfirming || isApproving || isApprovalConfirming}
                className="text-lg h-14 pl-12 pr-20"
              />
              <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center">
                <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center">
                  <span className="text-primary font-bold text-sm">D</span>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDepositAmount(tokenBalance.toFixed(2))}
                disabled={isLoadingBalance || tokenBalance === 0}
                className="absolute right-2 top-1/2 -translate-y-1/2 h-8 px-3 text-xs"
              >
                MAX
              </Button>
            </div>
          </div>

          {/* You Receive Section */}
          <div className="space-y-2">
            <Label className="text-base font-medium">You Receive</Label>
            <div className="rounded-lg border border-border bg-secondary/30 p-4">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs text-muted-foreground">1:1 ratio</span>
              </div>
              <div className="flex items-center gap-2">
                <ArrowRight className="h-5 w-5 text-muted-foreground rotate-90" />
                <span className="text-2xl font-bold">
                  {depositAmount && parseFloat(depositAmount) > 0 ? parseFloat(depositAmount).toFixed(2) : "0.00"} USMT+
                </span>
              </div>
            </div>
          </div>

          {/* Mint Button */}
          {needsApproval ? (
            <div className="space-y-2">
              <Button
                onClick={handleApprove}
                disabled={!depositAmount || isApproving || isApprovalConfirming || parseFloat(depositAmount || "0") <= 0 || isLoadingBalance}
                className="w-full h-12 text-base font-semibold"
                variant="default"
              >
                {isApproving || isApprovalConfirming ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    {isApproving ? "Waiting for wallet..." : "Approving..."}
                  </>
                ) : (
                  "Approve USDC"
                )}
              </Button>
              {isApprovalSuccess && (
                <p className="text-xs text-center text-muted-foreground">
                  Approval successful! You can now deposit.
                </p>
              )}
            </div>
          ) : (
            <Button
              onClick={handleDeposit}
              disabled={
                !depositAmount || 
                isDepositing || 
                isDepositConfirming || 
                parseFloat(depositAmount || "0") <= 0 || 
                parseFloat(depositAmount || "0") > tokenBalance ||
                needsApproval ||
                isLoadingBalance
              }
              className="w-full h-12 text-base font-semibold bg-[#8B9A5B] hover:bg-[#7A8A4A] text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isDepositing || isDepositConfirming ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  {isDepositing ? "Waiting for wallet..." : "Minting..."}
                </>
              ) : (
                "Mint USMT+"
              )}
            </Button>
          )}

          {/* Current Balance and Redeem */}
          <div className="flex items-center justify-between rounded-lg border border-border bg-secondary/30 p-4">
            <span className="text-base font-semibold">
              {vaultUSMTBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USMT+
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                onOpenChange(false)
                // TODO: Open withdraw/redeem dialog
              }}
              className="gap-1"
            >
              Redeem
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>


          {/* Learn More */}
          <div className="pt-2">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground"
              onClick={() => {
                // TODO: Open learn more modal/page
                toast.info("Learn more about CSFS coming soon")
              }}
            >
              <ArrowRight className="h-4 w-4" />
              Learn About CSFS?
            </Button>
          </div>
        </div>
      </DialogContent>
      </Dialog>

      {/* Success Modal - Centered with big green checkmark */}
      <Dialog open={successModalOpen} onOpenChange={setSuccessModalOpen}>
        <DialogContent className="sm:max-w-md text-center">
          <div className="flex flex-col items-center space-y-6 py-6">
            {/* Big Green Checkmark */}
            <div className="flex items-center justify-center w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/20">
              <CheckCircle2 className="h-16 w-16 text-green-600 dark:text-green-500" />
            </div>

            {/* Success Message */}
            <div className="space-y-2">
              <h3 className="text-2xl font-bold">Deposit Successful!</h3>
              <p className="text-muted-foreground">
                Your deposit of {successAmount || "0"} USDC has been successfully processed.
              </p>
            </div>

            {/* Transaction Hash */}
            {successHash && (
              <div className="w-full space-y-3 pt-4 border-t">
                <div className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Transaction Hash
                  </span>
                  <div className="flex items-center gap-2 bg-muted rounded-md p-3 border border-border">
                    <span className="text-sm font-mono break-all flex-1 text-left">{successHash}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="flex-shrink-0"
                      onClick={() => {
                        navigator.clipboard.writeText(successHash)
                        toast.success("Transaction hash copied!")
                      }}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-col gap-2 pt-2">
                  <Button asChild className="w-full">
                    <a
                      href={getExplorerUrl(chainId, successHash || '')}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink className="h-4 w-4 mr-2" />
                      View on Explorer
                    </a>
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      setSuccessModalOpen(false)
                      setSuccessHash(null)
                    }}
                  >
                    Done
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

function WithdrawDialog({
  open,
  onOpenChange,
  userBalance,
  userShares,
  totalLiquidity,
  totalShares,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  userBalance: number
  userShares: bigint
  totalLiquidity: number
  totalShares: bigint
}) {
  const [withdrawAmount, setWithdrawAmount] = useState("")
  const withdrawSuccessToastShown = useRef<string | null>(null)
  const { withdraw, hash: withdrawHash, isPending: isWithdrawing, isConfirming: isWithdrawConfirming, isSuccess: isWithdrawSuccess } = useWithdrawVault()

  // Handle withdraw success - show toast with green checkmark and transaction hash when confirmed
  useEffect(() => {
    if (withdrawHash && isWithdrawSuccess && withdrawSuccessToastShown.current !== withdrawHash) {
      withdrawSuccessToastShown.current = withdrawHash
      
      const copyToClipboard = () => {
        navigator.clipboard.writeText(withdrawHash)
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
               <p className="font-medium text-sm">Your withdrawal of {withdrawAmount} USDC has been successfully processed.</p>
              
              <div className="space-y-2 pt-2 border-t border-border/50">
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">TRANSACTION HASH</span>
                  <div className="relative">
                    <Input
                      type="text"
                      value={withdrawHash}
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
                    href={getExplorerUrl(chainId, withdrawHash || '')}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    View on Explorer
                  </a>
                </Button>
                <Button variant="outline" className="w-full mt-2" onClick={() => onOpenChange(false)}>
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
      onOpenChange(false)
    }
  }, [withdrawHash, isWithdrawSuccess, isWithdrawConfirming, withdrawAmount, onOpenChange])

  const handleWithdraw = async () => {
    if (!withdrawAmount) {
      toast.error("Enter withdrawal amount")
      return
    }

    const amount = parseFloat(withdrawAmount)
    if (isNaN(amount) || amount <= 0) {
      toast.error("Invalid amount", {
        description: "Amount must be greater than 0",
      })
      return
    }

    if (amount > userBalance) {
       toast.error("Insufficient balance", {
         description: `You have ${userBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USMT+ tokens`,
       })
      return
    }

    try {
      // With 1:1 USMT+ model, withdraw amount directly (no share calculation needed)
      const amountBigInt = parseUnits(withdrawAmount, 6)
      
      if (amountBigInt > userShares) {
        toast.error("Insufficient USMT+", {
          description: "Cannot withdraw more than your USMT+ balance",
        })
        return
      }
      
      await withdraw(amountBigInt)
    } catch (error: any) {
      toast.error("Withdrawal failed", {
        description: error.message || "Please try again",
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
         <DialogHeader>
           <DialogTitle>Withdraw USDC</DialogTitle>
           <DialogDescription>
             Burn your USMT+ tokens to withdraw USDC 1:1. Gas fees are paid in MNT (Mantle).
           </DialogDescription>
         </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Current Balance */}
          <div className="rounded-lg border border-border bg-secondary/50 p-4">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Vault Balance</span>
               <span className="text-lg font-semibold">
                 {userBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USMT+
               </span>
            </div>
          </div>

          {/* Withdraw Amount Input */}
          <div className="space-y-2">
             <Label htmlFor="withdrawAmount">Burn USMT+ to Withdraw USDC</Label>
            <Input
              id="withdrawAmount"
              type="number"
              placeholder="0.00"
              value={withdrawAmount}
              onChange={(e) => setWithdrawAmount(e.target.value)}
              min="0"
              step="0.01"
              disabled={isWithdrawing || isWithdrawConfirming}
            />
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setWithdrawAmount((userBalance * 0.25).toFixed(2))}
                disabled={userBalance === 0}
              >
                25%
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setWithdrawAmount((userBalance * 0.5).toFixed(2))}
                disabled={userBalance === 0}
              >
                50%
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setWithdrawAmount((userBalance * 0.75).toFixed(2))}
                disabled={userBalance === 0}
              >
                75%
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setWithdrawAmount(userBalance.toFixed(2))}
                disabled={userBalance === 0}
              >
                Max
              </Button>
            </div>
          </div>

          {/* Withdraw Button */}
          <Button
            onClick={handleWithdraw}
            disabled={!withdrawAmount || isWithdrawing || isWithdrawConfirming || parseFloat(withdrawAmount) <= 0 || parseFloat(withdrawAmount) > userBalance}
            className="w-full"
            variant="default"
          >
            {isWithdrawing || isWithdrawConfirming ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {isWithdrawing ? "Waiting for wallet..." : "Withdrawing..."}
              </>
            ) : (
               <>
                 Withdraw {withdrawAmount || "0"} USDC
               </>
             )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
