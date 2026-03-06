import { motion } from "framer-motion"
import { useMemo, useState } from "react"
import {
  Shield,
  Lock,
  Eye,
  EyeOff,
  ArrowDownToLine,
  ArrowUpFromLine,
  RefreshCw,
  CheckCircle2,
  Info,
  ShieldCheck,
  Wallet,
  ArrowRight,
  AlertTriangle,
} from "lucide-react"
import { Link } from "react-router-dom"
import { usePrivateBalance } from "@/hooks/usePrivateBalance"
import { usePrivateWallet } from "@/hooks/usePrivateWallet"
import { useTokenBalance } from "@/hooks/useTokenBalance"
import { PRIVATE_PAYMENTS_ENABLED } from "@/lib/privacy/config"
import { fullPrivacyReset } from "@/lib/privacy"
import { ShieldDialog } from "@/components/privacy/ShieldDialog"
import { UnshieldDialog } from "@/components/privacy/UnshieldDialog"
import { useChainId } from "wagmi"

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

export default function PrivatePayments() {
  const chainId = useChainId()
  const { wallet, engineStatus, isCreatingWallet } = usePrivateWallet()
  const { privateUsdcBalance, privateUsdtBalance, totalPrivateBalance, totalSpendableBalance, hasPendingFunds, poiStatus, isSyncing, lastSyncAt, refreshBalances } = usePrivateBalance()
  const { balance: publicUsdcBalance, isLoading: isLoadingPublic } = useTokenBalance()

  const [shieldDialogOpen, setShieldDialogOpen] = useState(false)
  const [unshieldDialogOpen, setUnshieldDialogOpen] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)

  const lastSyncFormatted = useMemo(() => {
    if (!lastSyncAt) return "Never"
    const diff = Date.now() - lastSyncAt
    if (diff < 60_000) return "Just now"
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
    return `${Math.floor(diff / 3_600_000)}h ago`
  }, [lastSyncAt])

  const engineStatusLabel = useMemo(() => {
    switch (engineStatus) {
      case "ready": return "Online"
      case "initializing":
      case "loading-artifacts":
      case "syncing": return "Starting..."
      case "error": return "Error"
      default: return "Offline"
    }
  }, [engineStatus])

  if (!PRIVATE_PAYMENTS_ENABLED) {
    return (
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="space-y-6"
      >
        <motion.div
          variants={item}
          className="bg-white dark:bg-[#1a1a2e] rounded-[20px] sm:rounded-[32px] shadow-[0px_24px_32px_0px_rgba(0,0,0,0.04),0px_16px_24px_0px_rgba(0,0,0,0.04),0px_4px_8px_0px_rgba(0,0,0,0.04),0px_0px_1px_0px_rgba(0,0,0,0.04)] p-3 sm:p-8 mx-1 sm:mx-0"
        >
          <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-6">
            <div className="w-20 h-20 rounded-2xl bg-[#c8ff00]/10 flex items-center justify-center">
              <Shield className="h-10 w-10 text-[#7cb518]" />
            </div>
            <div className="text-center space-y-3">
              <h1 className="text-[32px] font-semibold text-[#404040] dark:text-white tracking-tight">Private Payments</h1>
              <p className="text-lg text-[#aeaeae]">Coming Soon (Stay Tuned)</p>
              <p className="text-sm text-[#aeaeae] max-w-md">
                Private payments are currently being integrated. Once enabled,
                your transfers will hide sender, receiver, and amount on-chain.
              </p>
            </div>
          </div>
        </motion.div>
      </motion.div>
    )
  }

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="space-y-6"
    >
      {/* Main Container */}
      <motion.div
        variants={item}
        className="bg-white dark:bg-[#1a1a2e] rounded-[20px] sm:rounded-[32px] shadow-[0px_24px_32px_0px_rgba(0,0,0,0.04),0px_16px_24px_0px_rgba(0,0,0,0.04),0px_4px_8px_0px_rgba(0,0,0,0.04),0px_0px_1px_0px_rgba(0,0,0,0.04)] p-3 sm:p-8 mx-1 sm:mx-0"
      >
        {/* Page Header */}
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6 mb-8">
          <div>
            <h1 className="text-[32px] font-semibold text-[#404040] dark:text-white tracking-tight">Private Pay</h1>
            <p className="text-[#aeaeae] text-base mt-1">
              Shield funds, pay invoices privately, and manage your shielded balance
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShieldDialogOpen(true)}
              disabled={!wallet}
              className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-[#c8ff00] hover:bg-[#b8ef00] text-[#1a1a1a] font-semibold text-sm shadow-[0px_2px_6px_0px_rgba(0,0,0,0.04)] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ArrowDownToLine className="h-4 w-4" />
              Shield Funds
            </button>
            <button
              onClick={() => setUnshieldDialogOpen(true)}
              disabled={!wallet || totalPrivateBalance === 0}
              className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 text-[#404040] dark:text-white font-medium text-sm shadow-[0px_2px_6px_0px_rgba(0,0,0,0.04)] hover:shadow-md transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ArrowUpFromLine className="h-4 w-4" />
              Unshield
            </button>
            <button
              onClick={refreshBalances}
              disabled={isSyncing || !wallet}
              className="p-2.5 rounded-xl bg-[#f0f7ff] dark:bg-blue-900/30 hover:bg-[#e0efff] transition-colors disabled:opacity-40"
              title="Refresh balances"
            >
              <RefreshCw className={`h-4 w-4 text-[#197bbd] ${isSyncing ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

       

        {/* Top Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-4 mb-6">
          {/* Private Balance Card */}
          <div className="bg-white dark:bg-gray-800 rounded-[16px] sm:rounded-[28px] shadow-[0px_16px_24px_0px_rgba(0,0,0,0.06),0px_2px_6px_0px_rgba(0,0,0,0.04),0px_0px_1px_0px_rgba(0,0,0,0.04)] p-2.5 sm:p-5">
            <p className="text-2xl font-semibold text-[#1a1a1a] dark:text-white">
              ${isSyncing ? "..." : totalPrivateBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <p className="text-sm text-[#aeaeae] mt-1">
              {hasPendingFunds ? (
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-2 h-2 rounded-full bg-[#f59e0b] animate-pulse" />
                  <span className="text-[#f59e0b]">${totalSpendableBalance.toFixed(2)} spendable</span>
                </span>
              ) : 'Shielded'}
            </p>
            <div className="mt-4 w-10 h-10 rounded-lg bg-[#c8ff00]/15 flex items-center justify-center">
              <Lock className="h-5 w-5 text-[#7cb518]" />
            </div>
            <p className="text-base font-medium text-[#404040] dark:text-white mt-3">Private Balance</p>
          </div>

          {/* Public USDC Card */}
          <div className="bg-white dark:bg-gray-800 rounded-[16px] sm:rounded-[28px] shadow-[0px_16px_24px_0px_rgba(0,0,0,0.06),0px_2px_6px_0px_rgba(0,0,0,0.04),0px_0px_1px_0px_rgba(0,0,0,0.04)] p-2.5 sm:p-5">
            <p className="text-2xl font-semibold text-[#1a1a1a] dark:text-white">
              ${isLoadingPublic ? "..." : publicUsdcBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <p className="text-sm text-[#aeaeae] mt-1">Available to Shield</p>
            <div className="mt-4 w-10 h-10 rounded-lg bg-[#e4f0ff] flex items-center justify-center">
              <Wallet className="h-5 w-5 text-[#197bbd]" />
            </div>
            <p className="text-base font-medium text-[#404040] dark:text-white mt-3">Public USDC</p>
          </div>

          {/* Engine Status Card */}
          <div className="bg-white dark:bg-gray-800 rounded-[16px] sm:rounded-[28px] shadow-[0px_16px_24px_0px_rgba(0,0,0,0.06),0px_2px_6px_0px_rgba(0,0,0,0.04),0px_0px_1px_0px_rgba(0,0,0,0.04)] p-2.5 sm:p-5">
            <div className="flex items-center gap-2">
              <p className="text-2xl font-semibold text-[#1a1a1a] dark:text-white">{engineStatusLabel}</p>
              <div className={`h-2.5 w-2.5 rounded-full ${
                engineStatus === "ready" ? "bg-[#c8ff00] animate-pulse" :
                (engineStatus === "initializing" || engineStatus === "loading-artifacts" || engineStatus === "syncing") ? "bg-[#f59e0b] animate-pulse" :
                "bg-[#aeaeae]"
              }`} />
            </div>
            <p className="text-sm text-[#aeaeae] mt-1">
              {chainId === 42161 ? "Arbitrum" : `Chain ${chainId}`}
            </p>
            <div className="mt-4 w-10 h-10 rounded-lg bg-[#ddf9e4] flex items-center justify-center">
              <ShieldCheck className="h-5 w-5 text-[#7cb518]" />
            </div>
            <p className="text-base font-medium text-[#404040] dark:text-white mt-3">Privacy Engine</p>
          </div>
        </div>

        {/* Stuck Funds Banner */}
        {poiStatus === 'stuck' && hasPendingFunds && (
          <div className="mb-4 flex items-start gap-3 rounded-2xl border border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-900/20 p-4">
            <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                Shielded funds awaiting POI validation
              </p>
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                The POI aggregator hasn't confirmed your shield transaction yet. This can take 5-30 minutes for new shields.
                If this persists, try resetting your privacy data below.
              </p>
              <button
                onClick={async () => {
                  if (!confirm('This will clear the local privacy cache and re-sync from scratch. Your shielded funds are safe on-chain. Continue?')) return;
                  try {
                    await fullPrivacyReset();
                    window.location.reload();
                  } catch (err) {
                    console.error('Reset failed:', err);
                  }
                }}
                className="mt-2 px-3 py-1.5 rounded-lg bg-amber-100 dark:bg-amber-800/40 text-xs font-medium text-amber-700 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-800/60 transition-colors"
              >
                Reset & Re-sync Now
              </button>
            </div>
          </div>
        )}

        {/* Retrying Banner */}
        {poiStatus === 'retrying' && hasPendingFunds && (
          <div className="mb-4 flex items-center gap-3 rounded-2xl border border-blue-200 dark:border-blue-800/60 bg-blue-50 dark:bg-blue-900/20 p-4">
            <RefreshCw className="h-4 w-4 text-blue-500 animate-spin flex-shrink-0" />
            <p className="text-sm text-blue-700 dark:text-blue-300">
              Validating shielded funds with POI aggregator...
            </p>
          </div>
        )}

        {/* Main Content Grid */}
        <div className="grid lg:grid-cols-12 gap-2 sm:gap-6">
          {/* Left: Shielded Balances & Wallet */}
          <div className="lg:col-span-5">
            <div className="bg-white dark:bg-gray-800 rounded-[16px] sm:rounded-[28px] shadow-[0px_16px_24px_0px_rgba(0,0,0,0.06),0px_2px_6px_0px_rgba(0,0,0,0.04),0px_0px_1px_0px_rgba(0,0,0,0.04)] p-2.5 sm:p-6 h-full">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-[#1a1a1a] dark:text-white">Shielded Balances</h2>
                <div className="flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${isSyncing ? "bg-[#f59e0b] animate-pulse" : "bg-[#c8ff00]"}`} />
                  <span className="text-[10px] text-[#aeaeae]">{isSyncing ? "Syncing" : "Live"}</span>
                </div>
              </div>

              {!wallet ? (
                <div className="flex flex-col items-center justify-center py-10 space-y-5">
                  {/* Animated shield orbit */}
                  <div className="relative w-24 h-24">
                    {/* Outer spinning ring */}
                    <motion.div
                      className="absolute inset-0 rounded-full border-2 border-dashed border-[#c8ff00]/40"
                      animate={{ rotate: 360 }}
                      transition={{ duration: 8, ease: "linear", repeat: Infinity }}
                    />
                    {/* Middle pulsing ring */}
                    <motion.div
                      className="absolute inset-2 rounded-full border-2 border-[#c8ff00]/20"
                      animate={{ scale: [1, 1.08, 1], opacity: [0.4, 0.8, 0.4] }}
                      transition={{ duration: 2, ease: "easeInOut", repeat: Infinity }}
                    />
                    {/* Inner glow */}
                    <motion.div
                      className="absolute inset-4 rounded-full bg-[#c8ff00]/10"
                      animate={{ scale: [1, 1.15, 1], opacity: [0.3, 0.7, 0.3] }}
                      transition={{ duration: 2.5, ease: "easeInOut", repeat: Infinity }}
                    />
                    {/* Center shield icon */}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <motion.div
                        animate={{ y: [0, -3, 0] }}
                        transition={{ duration: 2, ease: "easeInOut", repeat: Infinity }}
                      >
                        <Shield className="h-8 w-8 text-[#7cb518]" />
                      </motion.div>
                    </div>
                    {/* Orbiting dots */}
                    <motion.div
                      className="absolute w-2.5 h-2.5 rounded-full bg-[#c8ff00] shadow-[0_0_8px_rgba(200,255,0,0.6)]"
                      style={{ top: 0, left: '50%', marginLeft: -5 }}
                      animate={{ rotate: 360 }}
                      transition={{ duration: 3, ease: "linear", repeat: Infinity }}
                      //@ts-ignore
                      transformOrigin="5px 48px"
                    />
                    <motion.div
                      className="absolute w-2 h-2 rounded-full bg-[#c8ff00]/60 shadow-[0_0_6px_rgba(200,255,0,0.4)]"
                      style={{ bottom: 0, left: '50%', marginLeft: -4 }}
                      animate={{ rotate: -360 }}
                      transition={{ duration: 4.5, ease: "linear", repeat: Infinity }}
                      //@ts-ignore
                      transformOrigin="4px -40px"
                    />
                  </div>

                  {/* Status text */}
                  <div className="text-center space-y-1.5">
                    <motion.p
                      className="text-sm font-semibold text-[#1a1a1a] dark:text-white"
                      animate={{ opacity: [0.6, 1, 0.6] }}
                      transition={{ duration: 2, repeat: Infinity }}
                    >
                      {engineStatus === 'initializing' ? 'Starting privacy engine...' :
                       engineStatus === 'loading-artifacts' ? 'Loading zero-knowledge proofs...' :
                       engineStatus === 'syncing' ? 'Syncing with Monaris privacy...' :
                       isCreatingWallet ? 'Creating your private wallet...' :
                       'Initializing privacy layer...'}
                    </motion.p>
                    <p className="text-xs text-[#aeaeae]">This only takes a few seconds</p>
                  </div>

                  {/* Progress bar */}
                  <div className="w-48 h-1.5 rounded-full bg-[#f0f0f0] dark:bg-[#2a2a2a] overflow-hidden">
                    <motion.div
                      className="h-full rounded-full bg-gradient-to-r from-[#c8ff00] to-[#a8df00]"
                      initial={{ width: '5%' }}
                      animate={{
                        width: engineStatus === 'initializing' ? '25%' :
                               engineStatus === 'loading-artifacts' ? '50%' :
                               engineStatus === 'syncing' ? '75%' :
                               engineStatus === 'ready' ? '100%' : '15%'
                      }}
                      transition={{ duration: 1.5, ease: "easeOut" }}
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* USDC Row */}
                  <div className="flex items-center justify-between rounded-xl bg-[#f8f8f8] dark:bg-gray-700/50 p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-[#e4f0ff] flex items-center justify-center">
                      <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 2000 2000" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="1000" cy="1000" r="1000" fill="#2775CA"/><path d="M1275 1158.33c0-145.83-87.5-195.83-262.5-216.66-125-16.67-150-50-150-108.34 0-58.33 41.67-95.83 125-95.83 75 0 116.67 25 137.5 87.5 4.17 12.5 16.67 20.83 29.17 20.83h66.66c16.67 0 29.17-12.5 29.17-29.16v-4.17c-20.83-91.67-95.83-162.5-191.67-175V533.33c0-16.66-12.5-29.16-33.33-33.33h-62.5c-16.67 0-29.17 12.5-33.33 33.33v100c-129.17 16.67-212.5 100-212.5 204.17 0 137.5 83.33 191.66 258.33 212.5 116.67 20.83 154.17 45.83 154.17 112.5 0 66.66-58.34 112.5-137.5 112.5-108.34 0-145.84-45.84-158.34-108.34-4.16-16.66-16.66-25-29.16-25h-70.84c-16.66 0-29.16 12.5-29.16 29.17v4.17c25 100 87.5 158.33 229.16 179.16V1462.5c0 16.67 12.5 29.17 33.34 33.33h62.5c16.66 0 29.16-12.5 33.33-33.33v-104.17c129.17-20.83 216.67-108.33 216.67-216.66z" fill="white"/><path d="M787.5 1595.83c-325-116.66-491.67-479.16-379.17-800 66.67-195.83 220.84-345.83 379.17-408.33 16.67-8.34 25-20.84 25-41.67v-58.33c0-16.67-8.33-29.17-25-33.34-4.17 0-12.5 0-16.67 4.17-395.83 125-612.5 545.83-487.5 941.67 75 237.5 262.5 420.83 487.5 495.83 16.67 8.33 33.34 0 37.5-16.67 4.17-4.16 4.17-12.5 4.17-16.66v-58.34c0-12.5-12.5-25-25-8.33zM1229.17 258.33c-16.67-8.33-33.34 0-37.5 16.67-4.17 4.17-4.17 12.5-4.17 16.67v58.33c0 16.67 12.5 29.17 25 41.67 325 116.67 491.67 479.17 379.17 800-66.67 195.83-220.84 345.83-379.17 408.33-16.67 8.34-25 20.84-25 41.67v58.33c0 16.67 8.33 29.17 25 33.34 4.17 0 12.5 0 16.67-4.17 395.83-125 612.5-545.83 487.5-941.67-75-241.66-266.67-425-487.5-529.17z" fill="white"/></svg>
                      </div>
                      <div>
                        <p className="font-medium text-[#1a1a1a] dark:text-white">USDC</p>
                        <p className="text-xs text-[#aeaeae]">Private</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-[#1a1a1a] dark:text-white">
                        {isSyncing ? "..." : privateUsdcBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                      <p className="text-xs text-[#aeaeae]">
                        ≈ ${privateUsdcBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                    </div>
                  </div>

                  {/* Total */}
                  <div className="flex items-center justify-between rounded-xl border-2 border-[#c8ff00]/30 bg-[#c8ff00]/5 p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-[#c8ff00]/15 flex items-center justify-center">
                        <Lock className="h-5 w-5 text-[#7cb518]" />
                      </div>
                      <div>
                        <p className="font-semibold text-[#1a1a1a] dark:text-white">Total Shielded</p>
                        <p className="text-xs text-[#aeaeae]">Fully private</p>
                      </div>
                    </div>
                    <p className="text-2xl font-bold text-[#7cb518]">
                      ${totalPrivateBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                  </div>

                  {/* Quick Shield / Unshield */}
                  <div className="pt-4 border-t border-[#f1f1f1] dark:border-gray-700">
                    <div className="flex gap-3">
                      <button
                        onClick={() => setShieldDialogOpen(true)}
                        className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-[#c8ff00] hover:bg-[#b8ef00] text-[#1a1a1a] font-semibold text-sm transition-colors"
                      >
                        <ArrowDownToLine className="h-4 w-4" />
                        Shield
                      </button>
                      <button
                        onClick={() => setUnshieldDialogOpen(true)}
                        disabled={totalPrivateBalance === 0}
                        className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-[#e8e8e8] dark:border-gray-600 hover:border-[#c8ff00] text-[#404040] dark:text-white font-semibold text-sm transition-colors disabled:opacity-40"
                      >
                        <ArrowUpFromLine className="h-4 w-4" />
                        Unshield
                      </button>
                    </div>
                  </div>

                  {/* Advanced */}
                  <div className="pt-3">
                    <button
                      onClick={() => setShowAdvanced(!showAdvanced)}
                      className="flex items-center gap-1.5 text-xs text-[#197bbd] hover:underline"
                    >
                      {showAdvanced ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                      {showAdvanced ? "Hide" : "Show"} Advanced
                    </button>
                    {showAdvanced && wallet && (
                      <div className="mt-2 space-y-3 rounded-xl bg-[#f8f8f8] dark:bg-gray-700/50 p-3">
                        <div>
                          <p className="text-[10px] text-[#aeaeae] uppercase tracking-wide">Wallet ID</p>
                          <p className="text-xs font-mono text-[#404040] dark:text-gray-300 break-all">{wallet.id}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-[#aeaeae] uppercase tracking-wide">RAILGUN Address (0zk)</p>
                          <p className="text-xs font-mono text-[#404040] dark:text-gray-300 break-all">{wallet.railgunAddress}</p>
                        </div>
                        <button
                          onClick={async () => {
                            if (!confirm('This will clear the local privacy cache and re-sync from scratch. Your shielded funds are safe on-chain. Continue?')) return;
                            try {
                              await fullPrivacyReset();
                              window.location.reload();
                            } catch (err) {
                              console.error('Reset failed:', err);
                            }
                          }}
                          className="w-full py-2 rounded-lg border border-red-200 dark:border-red-800 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                        >
                          Reset & Re-sync Privacy Data
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right: How It Works + Status + CTA */}
          <div className="lg:col-span-7 space-y-2 sm:space-y-4">
            {/* How Private Payments Work */}
            <div className="bg-white dark:bg-gray-800 rounded-[16px] sm:rounded-[19px] shadow-[0px_16px_24px_0px_rgba(0,0,0,0.06),0px_2px_6px_0px_rgba(0,0,0,0.04),0px_0px_1px_0px_rgba(0,0,0,0.04)] p-2.5 sm:p-5">
              <h2 className="text-xl font-bold text-[#1a1a1a] dark:text-white mb-4">How It Works</h2>

              {/* Step 1 */}
              <div className="flex items-center gap-4 mb-4">
                <div className="w-10 h-10 rounded-lg bg-[#c8ff00]/15 flex items-center justify-center flex-shrink-0">
                  <ArrowDownToLine className="h-5 w-5 text-[#7cb518]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="flex-1 h-2 rounded-full bg-[#f1f1f1] dark:bg-gray-700 overflow-hidden">
                      <div className="h-full rounded-full bg-gradient-to-r from-[#c8ff00] to-[#a8df00] w-full" />
                    </div>
                    <span className="text-xs font-semibold text-[#7cb518] w-6 text-right">1</span>
                  </div>
                  <p className="text-sm text-[#aeaeae]">Shield – deposit USDC/USDT into the private pool</p>
                </div>
              </div>

              {/* Step 2 */}
              <div className="flex items-center gap-4 mb-4">
                <div className="w-10 h-10 rounded-lg bg-[#e4f0ff] flex items-center justify-center flex-shrink-0">
                  <Shield className="h-5 w-5 text-[#197bbd]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="flex-1 h-2 rounded-full bg-[#f1f1f1] dark:bg-gray-700 overflow-hidden">
                      <div className="h-full rounded-full bg-gradient-to-r from-[#197bbd] to-[#3b82f6] w-full" />
                    </div>
                    <span className="text-xs font-semibold text-[#197bbd] w-6 text-right">2</span>
                  </div>
                  <p className="text-sm text-[#aeaeae]">Pay – invoices paid from your private balance</p>
                </div>
              </div>

              {/* Step 3 */}
              <div className="flex items-center gap-4 mb-4">
                <div className="w-10 h-10 rounded-lg bg-[#ddf9e4] flex items-center justify-center flex-shrink-0">
                  <EyeOff className="h-5 w-5 text-[#7cb518]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="flex-1 h-2 rounded-full bg-[#f1f1f1] dark:bg-gray-700 overflow-hidden">
                      <div className="h-full rounded-full bg-gradient-to-r from-[#c8ff00] to-[#a8df00] w-full" />
                    </div>
                    <span className="text-xs font-semibold text-[#7cb518] w-6 text-right">3</span>
                  </div>
                  <p className="text-sm text-[#aeaeae]">Hidden – sender, receiver & amount fully concealed on-chain</p>
                </div>
              </div>

              {/* Step 4 */}
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-[#ffeada] flex items-center justify-center flex-shrink-0">
                  <ArrowUpFromLine className="h-5 w-5 text-[#f59e0b]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="flex-1 h-2 rounded-full bg-[#f1f1f1] dark:bg-gray-700 overflow-hidden">
                      <div className="h-full rounded-full bg-gradient-to-r from-[#f59e0b] to-[#fbbf24] w-full" />
                    </div>
                    <span className="text-xs font-semibold text-[#f59e0b] w-6 text-right">4</span>
                  </div>
                  <p className="text-sm text-[#aeaeae]">Unshield – withdraw back to your public wallet anytime</p>
                </div>
              </div>
            </div>

            {/* Privacy Guarantees + CTA */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4">
              {/* Privacy Info */}
              <div className="bg-white dark:bg-gray-800 rounded-[16px] sm:rounded-[19px] shadow-[0px_16px_24px_0px_rgba(0,0,0,0.06),0px_2px_6px_0px_rgba(0,0,0,0.04),0px_0px_1px_0px_rgba(0,0,0,0.04)] p-2.5 sm:p-5">
                <h3 className="text-base font-semibold text-[#1a1a1a] dark:text-white mb-3">Privacy Guarantees</h3>
                <div className="space-y-3">
                  <div className="flex items-start gap-2.5">
                    <CheckCircle2 className="h-4 w-4 text-[#7cb518] mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-[#696969] dark:text-gray-400">Zero-knowledge proofs verify every transfer</p>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <CheckCircle2 className="h-4 w-4 text-[#7cb518] mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-[#696969] dark:text-gray-400">Keys encrypted client-side, never leave your browser</p>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <CheckCircle2 className="h-4 w-4 text-[#7cb518] mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-[#696969] dark:text-gray-400">Non-custodial – you always control your funds</p>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <Info className="h-4 w-4 text-[#f59e0b] mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-[#696969] dark:text-gray-400">Shield/unshield are visible on-chain; transfers within the pool are fully private</p>
                  </div>
                </div>
              </div>

              {/* CTA Card */}
              <div className="bg-gradient-to-b from-[#d4f542] to-[#c8ff00] rounded-[16px] sm:rounded-[19px] shadow-[0px_16px_24px_0px_rgba(0,0,0,0.06)] p-2.5 sm:p-5 text-[#1a1a1a] relative overflow-hidden">
                <div className="absolute top-0 left-0 w-16 h-16 bg-black/5 rounded-full -translate-x-1/2 -translate-y-1/2" />
                <div className="absolute bottom-0 right-0 w-20 h-20 bg-black/5 rounded-full translate-x-1/3 translate-y-1/3" />

                <div className="relative">
                  <h3 className="text-xl font-semibold mb-1">Start paying</h3>
                  <h3 className="text-xl font-semibold mb-4">privately!</h3>

                  <div className="bg-black/10 rounded-xl p-4 mb-4">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-black/60">Private Balance</span>
                      <span className="text-lg font-bold">
                        ${totalPrivateBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="flex justify-between items-center mt-2 text-sm">
                      <span className="text-black/40">Engine</span>
                      <span className="font-medium">{engineStatusLabel}</span>
                    </div>
                  </div>

                  <button
                    onClick={() => setShieldDialogOpen(true)}
                    disabled={!wallet || isCreatingWallet}
                    className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-[#1a1a1a] hover:bg-[#2a2a2a] text-white text-sm font-semibold transition-colors disabled:opacity-50"
                  >
                    Shield Funds
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Wallet Status Row */}
            {wallet && (
              <div className="bg-white dark:bg-gray-800 rounded-[16px] sm:rounded-[19px] shadow-[0px_16px_24px_0px_rgba(0,0,0,0.06),0px_2px_6px_0px_rgba(0,0,0,0.04),0px_0px_1px_0px_rgba(0,0,0,0.04)] p-2.5 sm:p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-[#ddf9e4] flex items-center justify-center">
                      <ShieldCheck className="h-4 w-4 text-[#7cb518]" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-[#1a1a1a] dark:text-white">Wallet Active</p>
                      <p className="text-xs text-[#aeaeae]">Last sync: {lastSyncFormatted}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-[#aeaeae]">
                    <span>{chainId === 42161 ? "Arbitrum" : `Chain ${chainId}`}</span>
                    <span className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#c8ff00]" />
                      RAILGUN
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </motion.div>

      {/* Dialogs */}
      <ShieldDialog open={shieldDialogOpen} onOpenChange={setShieldDialogOpen} />
      <UnshieldDialog open={unshieldDialogOpen} onOpenChange={setUnshieldDialogOpen} />
    </motion.div>
  )
}
