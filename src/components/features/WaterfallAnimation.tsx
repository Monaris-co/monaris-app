import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import { Coins, Wallet, TrendingUp, ArrowRight } from "lucide-react"

interface WaterfallAnimationProps {
  totalAmount?: number
  feeAmount?: number
  repayAmount?: number
  sellerAmount?: number
  showLabels?: boolean
  className?: string
  isFinanced?: boolean
  advanceAmount?: number
  principalAmount?: number
  interestAmount?: number
  feePercentage?: number
}

export function WaterfallAnimation({
  totalAmount = 10000,
  feeAmount = 50,
  repayAmount = 2450,
  sellerAmount = 7500,
  showLabels = true,
  className,
  isFinanced = true,
  advanceAmount,
  principalAmount,
  interestAmount,
  feePercentage = 0.5,
}: WaterfallAnimationProps) {
  const principal = principalAmount ?? (isFinanced && repayAmount > 0 ? repayAmount - (interestAmount ?? 50) : 0)
  const interest = interestAmount ?? (isFinanced && repayAmount > 0 ? repayAmount - principal : 0)
  const advancePaid = advanceAmount ?? (isFinanced && principal > 0 ? principal : undefined)
  const actualSellerAmount = isFinanced ? sellerAmount : (totalAmount - feeAmount)
  
  const total = feeAmount + (isFinanced ? repayAmount : 0) + actualSellerAmount
  const feePercent = total > 0 ? (feeAmount / total) * 100 : 0
  const repayPercent = total > 0 && isFinanced ? (repayAmount / total) * 100 : 0
  const sellerPercent = total > 0 ? (actualSellerAmount / total) * 100 : (feePercent < 100 ? 100 - feePercent : 100)

  return (
    <div className={cn("mx-auto max-w-2xl", className)}>
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        {/* Compact Header */}
        <div className="mb-6">
          <h3 className="mb-1 text-sm font-semibold text-muted-foreground">Settlement Waterfall</h3>
          <p className="text-2xl font-bold number-display">
            ${totalAmount.toLocaleString()} <span className="text-base text-muted-foreground">USDC</span>
          </p>
        </div>

        {/* Compact Progress Bar */}
        <div className="mb-6">
          <div className="relative h-6 w-full overflow-hidden rounded-lg bg-secondary">
            <div className="flex h-full">
              {/* Protocol Fee */}
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${feePercent}%` }}
                transition={{ duration: 0.6, delay: 0.2 }}
                className="h-full bg-slate-500"
              />
              {/* Pool Repayment */}
              {isFinanced && (
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${repayPercent}%` }}
                  transition={{ duration: 0.6, delay: 0.4 }}
                  className="h-full bg-blue-500"
                />
              )}
              {/* Seller Receives */}
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${sellerPercent}%` }}
                transition={{ duration: 0.6, delay: isFinanced ? 0.6 : 0.4 }}
                className="h-full bg-emerald-500"
              />
            </div>
          </div>
        </div>

        {/* Compact Cards Grid */}
        {showLabels && (
          <div className={cn("grid gap-3", isFinanced ? "grid-cols-3" : "grid-cols-2")}>
            {/* Protocol Fee Card */}
            <CompactSegment
              icon={<Coins className="h-4 w-4" />}
              label="Protocol Fee"
              amount={feeAmount}
              percent={feePercent}
              color="text-slate-600"
              bgColor="bg-slate-50 dark:bg-slate-950/50"
              delay={0.2}
              description={`${feePercentage}% fee`}
            />
            
            {/* Pool Repayment Card */}
            {isFinanced && (
              <CompactSegment
                icon={<Wallet className="h-4 w-4" />}
                label="Pool Repayment"
                amount={repayAmount}
                percent={repayPercent}
                color="text-blue-600"
                bgColor="bg-blue-50 dark:bg-blue-950/50"
                delay={0.4}
                description="LPs"
                breakdown={
                  <div className="mt-1.5 space-y-0.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Principal:</span>
                      <span className="font-medium">${principal.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Interest:</span>
                      <span className="font-medium">${interest.toLocaleString()}</span>
                    </div>
                  </div>
                }
              />
            )}
            
            {/* Seller Receives Card */}
            <CompactSegment
              icon={<TrendingUp className="h-4 w-4" />}
              label="Seller Receives"
              amount={actualSellerAmount}
              percent={sellerPercent}
              color="text-emerald-600"
              bgColor="bg-emerald-50 dark:bg-emerald-950/50"
              delay={isFinanced ? 0.6 : 0.4}
              description="Net proceeds"
              highlight
              breakdown={
                advancePaid !== undefined && (
                  <div className="mt-1.5 rounded bg-emerald-100 dark:bg-emerald-900/30 px-2 py-1 text-xs">
                    <span className="text-muted-foreground">Advance paid: </span>
                    <span className="font-semibold text-emerald-700 dark:text-emerald-300">
                      ${advancePaid.toLocaleString()}
                    </span>
                  </div>
                )
              }
            />
          </div>
        )}
      </div>
    </div>
  )
}

function CompactSegment({
  icon,
  label,
  amount,
  percent,
  color,
  bgColor,
  delay,
  description,
  highlight = false,
  breakdown,
}: {
  icon: React.ReactNode
  label: string
  amount: number
  percent: number
  color: string
  bgColor: string
  delay: number
  description: string
  highlight?: boolean
  breakdown?: React.ReactNode
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay }}
      className={cn(
        "rounded-lg border p-3 transition-colors",
        highlight 
          ? "border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/50" 
          : `border-border ${bgColor}`
      )}
    >
      {/* Header with Icon and Label */}
      <div className="mb-2 flex items-center gap-2">
        <div className={cn("flex h-6 w-6 items-center justify-center rounded-md", color, bgColor)}>
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <p className={cn("text-xs font-medium truncate", highlight ? "text-emerald-700 dark:text-emerald-300" : "text-muted-foreground")}>
            {label}
          </p>
        </div>
      </div>

      {/* Amount */}
      <p className={cn(
        "text-lg font-bold number-display mb-0.5",
        highlight ? "text-emerald-600 dark:text-emerald-400" : "text-foreground"
      )}>
        ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </p>

      {/* Description and Percent */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{description}</p>
        <span className={cn("text-xs font-semibold", highlight ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground")}>
          {percent.toFixed(1)}%
        </span>
      </div>

      {/* Breakdown */}
      {breakdown}
    </motion.div>
  )
}
