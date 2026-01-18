import { useState } from "react"
import { motion } from "framer-motion"
import { 
  ArrowUpRight, 
  ArrowDownRight, 
  FileText, 
  DollarSign,
  Zap,
  CheckCircle2,
  Filter,
  Download,
  Loader2,
  ExternalLink
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { StatusBadge } from "@/components/ui/status-badge"
import { useActivity } from "@/hooks/useActivity"
import { usePrivyAccount } from "@/hooks/usePrivyAccount"
import { formatDistanceToNow } from "date-fns"
import { getAddressExplorerLink } from "@/lib/utils"
import { useChainId } from "wagmi"
import { getExplorerUrl } from "@/lib/chain-utils"

const getActivityIcon = (type: string) => {
  switch (type) {
    case "invoice_cleared":
      return CheckCircle2
    case "invoice_paid":
      return CheckCircle2
    case "advance_received":
      return Zap
    case "advance_repaid":
      return Zap
    case "vault_deposit":
      return DollarSign
    case "vault_withdraw":
      return DollarSign
    case "stake":
      return DollarSign
    case "unstake":
      return DollarSign
    case "invoice_created":
      return FileText
    case "usdc_transfer":
      return ArrowUpRight
    case "mnt_transfer":
      return ArrowUpRight
    default:
      return FileText
  }
}

const getActivityColor = (type: string) => {
  switch (type) {
    case "invoice_cleared":
      return "bg-success/10 text-success"
    case "invoice_paid":
      return "bg-success/10 text-success"
    case "advance_received":
      return "bg-primary/10 text-primary"
    case "advance_repaid":
      return "bg-warning/10 text-warning"
    case "vault_deposit":
      return "bg-info/10 text-info"
    case "vault_withdraw":
      return "bg-info/10 text-info"
    case "stake":
      return "bg-primary/10 text-primary"
    case "unstake":
      return "bg-muted text-muted-foreground"
    case "invoice_created":
      return "bg-muted text-muted-foreground"
    case "usdc_transfer":
      return "bg-warning/10 text-warning"
    case "mnt_transfer":
      return "bg-warning/10 text-warning"
    default:
      return "bg-muted text-muted-foreground"
  }
}

export default function Activity() {
  const { activities, isLoading } = useActivity()
  const { address } = usePrivyAccount()
  const [filter, setFilter] = useState<string | null>(null)

  const filteredActivities = filter
    ? activities.filter((a) => a.type === filter)
    : activities

  if (!address) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-6 px-3 sm:px-4 md:px-0"
      >
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Activity</h1>
          <p className="text-muted-foreground">
            Your unified transaction and activity ledger
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card shadow-md p-8 text-center">
          <p className="text-muted-foreground">Please connect your wallet to view activity</p>
        </div>
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 px-3 sm:px-4 md:px-0"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Activity</h1>
          <p className="text-muted-foreground">
            Your unified transaction and activity ledger
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm">
            <Filter className="mr-2 h-4 w-4" />
            Filter
          </Button>
          <Button variant="outline" size="sm">
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
        </div>
      </div>

      {/* Activity feed */}
      <div className="rounded-xl border border-border bg-card shadow-md">
        {isLoading ? (
          <div className="flex items-center justify-center p-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">Loading activity...</span>
          </div>
        ) : filteredActivities.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-muted-foreground">No activity yet. Your transactions will appear here.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filteredActivities.map((activity, index) => {
              const Icon = getActivityIcon(activity.type)
              const colorClass = getActivityColor(activity.type)
              const timeAgo = formatDistanceToNow(new Date(activity.timestamp), { addSuffix: true })
              const explorerLink = getExplorerUrl(chainId, activity.txHash)
              
              return (
                <motion.div
                  key={activity.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: Math.min(index * 0.05, 0.5) }}
                  className="flex items-center justify-between p-5 transition-colors hover:bg-secondary/30"
                >
                  <div className="flex items-center gap-4">
                    <div className={`rounded-xl p-3 ${colorClass}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-medium">{activity.title}</p>
                      <p className="text-sm text-muted-foreground">{activity.description}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{timeAgo}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    {activity.amount !== null && (
                      <div className="text-right">
                        <div className={`flex items-center gap-1 font-semibold number-display ${
                          activity.direction === "in" 
                            ? "text-success" 
                            : activity.direction === "out" 
                            ? "text-foreground" 
                            : "text-muted-foreground"
                        }`}>
                          {activity.direction === "in" && <ArrowDownRight className="h-4 w-4" />}
                          {activity.direction === "out" && <ArrowUpRight className="h-4 w-4" />}
                          {activity.direction === "in" ? "+" : activity.direction === "out" ? "-" : ""}
                          ${activity.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                        <p className="text-xs text-muted-foreground">USDC</p>
                      </div>
                    )}
                    
                    {explorerLink && (
                      <a
                        href={explorerLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1"
                      >
                        {`${activity.txHash.slice(0, 6)}...${activity.txHash.slice(-4)}`}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </motion.div>
              )
            })}
          </div>
        )}
      </div>
    </motion.div>
  )
}
