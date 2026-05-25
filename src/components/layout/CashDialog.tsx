import { useMemo, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { ArrowUpRight, Building2, ChevronRight, CreditCard, Shield, Sparkles, Wallet } from "lucide-react"
import { useFundWallet } from "@privy-io/react-auth"
import { useNavigate } from "react-router-dom"
import { useBalance } from "wagmi"
import { formatUnits } from "viem"
import { arbitrum } from "viem/chains"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { useEthUsdPrice } from "@/hooks/useEthUsdPrice"
import { useTokenBalance } from "@/hooks/useTokenBalance"
import { useUSMTBalance } from "@/hooks/useUSMTBalance"
import { usePrivyAccount } from "@/hooks/usePrivyAccount"
import { toast } from "sonner"

interface CashDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type CashTab = "deposit" | "withdraw"

const tabs: Array<{ id: CashTab; label: string }> = [
  { id: "deposit", label: "Deposit" },
  { id: "withdraw", label: "Withdraw" },
]

export function CashDialog({ open, onOpenChange }: CashDialogProps) {
  const [activeTab, setActiveTab] = useState<CashTab>("deposit")
  const [isPrivyFunding, setIsPrivyFunding] = useState(false)
  const navigate = useNavigate()
  const { address } = usePrivyAccount()
  const { fundWallet } = useFundWallet()
  const { price: ethUsdPrice } = useEthUsdPrice()
  const { balance: usdcBalance } = useTokenBalance()
  const { balance: usmtBalance } = useUSMTBalance()
  const { data: nativeBalance } = useBalance({
    address: address as `0x${string}` | undefined,
    query: { enabled: !!address },
  })

  const nativeFormatted = nativeBalance ? parseFloat(formatUnits(nativeBalance.value, 18)) : 0
  const currentBalance = useMemo(() => {
    return usdcBalance + usmtBalance + nativeFormatted * ethUsdPrice
  }, [ethUsdPrice, nativeFormatted, usdcBalance, usmtBalance])

  const openFlow = (pathname: string, cashAction: string) => {
    onOpenChange(false)
    navigate({
      pathname,
      search: `?cash=${cashAction}`,
    })
  }

  const handlePrivyOnramp = async () => {
    if (!address) {
      toast.error("Connect a wallet first", {
        description: "Privy needs a destination wallet before it can open fiat funding.",
      })
      return
    }

    setIsPrivyFunding(true)
    onOpenChange(false)

    try {
      const result = await fundWallet({
        address,
        options: {
          chain: arbitrum,
          asset: "USDC",
          amount: "50",
          card: {
            preferredProvider: "moonpay",
          },
          uiConfig: {
            landing: {
              title: "Fund Monaris with USDC",
            },
            receiveFundsTitle: "Add USDC to Monaris",
            receiveFundsSubtitle: "Use card, Apple Pay, or Google Pay where available.",
          },
        },
      })

      if (result.status === "completed") {
        toast.success("USDC funding started", {
          description: "Privy accepted the fiat funding flow. Funds may take a few minutes to arrive.",
        })
      }

      if (result.status === "cancelled") {
        toast.message("Funding cancelled", {
          description: "No purchase was submitted.",
        })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to open Privy funding."
      toast.error("Unable to start Privy onramp", {
        description: message,
      })
    } finally {
      setIsPrivyFunding(false)
    }
  }

  const handlePrivyOfframp = () => {
    toast.message("Privy offramp is provider-based", {
      description: "Use MoonPay off-ramp with Privy wallet signing for KYC, bank payout, and crypto transfer.",
    })
  }

  const meta =
    activeTab === "deposit"
      ? {
          eyebrow: "Privy Onramp · Apple Pay ready",
          note: "Buy Arbitrum USDC with card, Apple Pay, or Google Pay where available.",
          rows: [
            {
              icon: CreditCard,
              accent: "lime" as const,
              title: "Privy Onramp",
              description: "Fund this wallet with Arbitrum USDC. Privy can surface Apple Pay, Google Pay, or card checkout with MoonPay preferred where available.",
              badge: "Live",
              cta: isPrivyFunding ? "Opening" : "Buy USDC",
              onClick: handlePrivyOnramp,
              disabled: isPrivyFunding,
            },
            {
              icon: Shield,
              accent: "blue" as const,
              title: "Shield private balance",
              description: "Move public stablecoins into private balance for protected transfers.",
              badge: "Live",
              cta: "Shield",
              onClick: () => openFlow("/app/private-payments", "shield"),
              disabled: false,
            },
          ],
        }
      : {
          eyebrow: "Privy Offramp · MoonPay ready",
          note: "Cash out through MoonPay with Privy wallet signing and provider KYC.",
          rows: [
            {
              icon: Building2,
              accent: "lime" as const,
              title: "Privy Offramp",
              description: "Convert crypto to fiat with MoonPay. Privy keeps wallet signing in-app while MoonPay handles KYC and bank payout.",
              badge: "Ready",
              cta: "Details",
              onClick: handlePrivyOfframp,
              disabled: false,
            },
            {
              icon: ArrowUpRight,
              accent: "blue" as const,
              title: "Send from wallet",
              description: "Move funds out now using the same balance visible in your wallet.",
              badge: "Live",
              cta: "Send",
              onClick: () => openFlow("/app", "withdraw"),
              disabled: false,
            },
          ],
        }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          setActiveTab("deposit")
        }
        onOpenChange(nextOpen)
      }}
    >
      <DialogContent className="w-[calc(100vw-20px)] max-w-[580px] gap-0 overflow-hidden rounded-[24px] border border-[#e4e9de] bg-[#fcfdfb] p-0 text-[#1b1f17] shadow-[0_20px_64px_rgba(27,39,17,0.14)] sm:w-[calc(100vw-64px)]">
        <div className="relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(200,255,0,0.08),transparent_24%),linear-gradient(180deg,#ffffff_0%,#f8fbf5_100%)]" />

          <div className="relative px-4 pb-4 pt-4 sm:px-6 sm:pb-6 sm:pt-6">
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_240px] sm:items-end">
              <div>
                <div className="mb-2.5 inline-flex items-center rounded-full border border-[#dce9b2] bg-[#f4fbd9] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#6d9117] sm:px-3.5 sm:text-[11px]">
                  Monaris Cash
                </div>
                <DialogTitle className="max-w-[11ch] text-[2.1rem] font-semibold tracking-[-0.05em] text-[#171c15] sm:text-[2.7rem]">
                  Move funds in and out
                </DialogTitle>
                <DialogDescription className="mt-1.5 max-w-[380px] text-[14px] leading-6 text-[#7d857a] sm:text-[15px]">
                  Choose the Monaris rail you want to use.
                </DialogDescription>
              </div>

              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.22, ease: "easeOut" }}
                className="w-full rounded-[20px] border border-[#e7ece6] bg-white px-4 py-4 shadow-[0_14px_30px_rgba(40,63,23,0.08)] sm:justify-self-end sm:px-5"
              >
                <div className="text-[12px] text-[#acb0a8]">Current balance</div>
                <div className="mt-2 flex items-end gap-1.5 text-[#197bbd]">
                  <span className="text-[20px] font-medium leading-none">$</span>
                  <span className="text-[40px] font-semibold leading-none tracking-[-0.06em] sm:text-[44px]">
                    {currentBalance.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </div>
              </motion.div>
            </div>

            <div className="mt-3 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
              <div className="inline-flex w-fit items-center gap-2 rounded-full border border-[#e5ebe0] bg-white px-3.5 py-2 text-[12px] text-[#697164] shadow-[0_8px_20px_rgba(54,71,34,0.04)] sm:text-[13px]">
                <Sparkles className="h-4 w-4 text-[#2cd6a1]" />
                <span>{meta.eyebrow}</span>
              </div>
              <div className="text-[14px] font-medium text-[#2cd6a1] sm:text-[15px]">
                {meta.note}
              </div>
            </div>

            <div className="my-4 flex w-full rounded-[20px] border border-[#e1e6db] bg-[#f1f4ed] p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] sm:inline-flex sm:w-auto">
              {tabs.map((tab) => {
                const isActive = activeTab === tab.id
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className="relative min-h-10 flex-1 rounded-[16px] px-4 py-2.5 text-left text-[18px] font-semibold tracking-[-0.04em] transition-colors sm:min-w-[130px] sm:flex-none sm:text-[19px]"
                  >
                    {isActive && (
                      <motion.div
                        layoutId="cash-tab-shell"
                        transition={{ type: "spring", stiffness: 320, damping: 28 }}
                        className="absolute inset-0 rounded-[16px] border border-[#d9dfd2] bg-white shadow-[0_8px_20px_rgba(35,45,22,0.08)]"
                      />
                    )}
                    <span className={`relative ${isActive ? "text-[#1b1f17]" : "text-[#969d93]"}`}>
                      {tab.label}
                    </span>
                  </button>
                )
              })}
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.22, ease: "easeOut" }}
                className="space-y-2.5"
              >
                {meta.rows.map((row, index) => (
                  <motion.div
                    key={`${activeTab}-${row.title}`}
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.22, delay: index * 0.04, ease: "easeOut" }}
                  >
                    <CashActionRow {...row} />
                  </motion.div>
                ))}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function CashActionRow({
  icon: Icon,
  accent,
  title,
  description,
  badge,
  cta,
  onClick,
  disabled = false,
}: {
  icon: typeof Wallet
  accent: "lime" | "blue"
  title: string
  description: string
  badge: string
  cta: string
  onClick?: () => void
  disabled?: boolean
}) {
  const accentStyles =
    accent === "lime"
      ? {
          icon: "bg-[#d8ff00] text-[#181d14]",
          badge: "bg-[#f0f8d8] text-[#6a9112]",
        }
      : {
          icon: "bg-[#e8f3ff] text-[#197bbd]",
          badge: "bg-[#edf6ff] text-[#197bbd]",
        }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`group flex w-full items-center gap-3 rounded-[20px] border border-[#e4e9e2] bg-white px-3.5 py-3.5 text-left transition-all sm:px-4 ${
        disabled
          ? "cursor-not-allowed opacity-70"
          : "hover:-translate-y-0.5 hover:shadow-[0_14px_28px_rgba(42,54,25,0.06)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c8ff00] focus-visible:ring-offset-2 focus-visible:ring-offset-[#fcfdfb]"
      }`}
    >
      <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-[16px] ${accentStyles.icon} sm:h-14 sm:w-14 sm:rounded-[18px]`}>
        <Icon className="h-5 w-5 sm:h-6 sm:w-6" strokeWidth={2.1} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="text-[19px] font-semibold tracking-[-0.04em] text-[#171c15] sm:text-[21px]">{title}</h3>
          <span className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${accentStyles.badge}`}>
            {badge}
          </span>
        </div>
        <p className="mt-1 max-w-[390px] text-[13px] leading-5.5 text-[#7a8278] sm:text-[14px] sm:leading-6">{description}</p>
      </div>

      <div className="flex shrink-0 items-center gap-1.5 pl-1 text-[15px] font-semibold text-[#171c15] sm:text-[16px]">
        <span className={disabled ? "text-[#9aa09a]" : ""}>{cta}</span>
        <ChevronRight className={`h-5 w-5 transition-transform ${disabled ? "text-[#9aa09a]" : "group-hover:translate-x-0.5"}`} />
      </div>
    </button>
  )
}
