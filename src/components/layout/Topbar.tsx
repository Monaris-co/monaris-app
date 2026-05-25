import { Mail, ChevronDown, Copy, LogOut, ExternalLink, DollarSign, Loader2, Menu, User, Globe } from "lucide-react"
import { NotificationBell } from "@/components/NotificationBell"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { usePrivy, useWallets } from "@privy-io/react-auth"
import { toast } from "sonner"
import { useTokenBalance } from "@/hooks/useTokenBalance"
import { useChainId } from "wagmi"
import { useQueryClient } from "@tanstack/react-query"
import { getExplorerAddressUrl } from "@/lib/chain-utils"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"

interface TopbarProps {
  onMenuClick?: () => void
  onCashClick?: () => void
}

export function Topbar({ onMenuClick, onCashClick }: TopbarProps = {}) {
  const privy = usePrivy()
  const { ready, authenticated, user, login, logout } = privy
  const chainId = useChainId()
  const { balance: usdcBalance, isLoading: isLoadingBalance } = useTokenBalance()
  const { wallets } = useWallets()
  const queryClient = useQueryClient()

  const loginMethods = user?.linkedAccounts?.map((acc: { type: string }) => acc.type) || []
  const loggedInWithEmail = loginMethods.some((type: string) =>
    ['email', 'sms', 'google_oauth', 'twitter_oauth', 'github_oauth'].includes(type)
  )
  const loggedInWithWallet = loginMethods.includes('wallet')

  const embeddedWallet = wallets.find(w => {
    const ct = w.connectorType?.toLowerCase() || ''
    const wct = w.walletClientType?.toLowerCase() || ''
    return ct === 'embedded' || wct === 'privy' || ct.includes('privy') || ct.includes('embedded')
  })

  const externalWallet = wallets.find(w => {
    const ct = w.connectorType?.toLowerCase() || ''
    const wct = w.walletClientType?.toLowerCase() || ''
    return ct === 'injected' || wct === 'metamask' || ct.includes('injected') || wct.includes('metamask')
  })

  let activeWallet
  if (loggedInWithEmail) {
    activeWallet = embeddedWallet || (loggedInWithWallet ? externalWallet : null)
  } else if (loggedInWithWallet) {
    activeWallet = externalWallet || embeddedWallet
  } else {
    activeWallet = embeddedWallet || externalWallet
  }

  const isConnected = authenticated && user && activeWallet && activeWallet.address
  const walletAddress = activeWallet?.address
  const truncatedAddress = walletAddress
    ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
    : null

  const walletType = activeWallet?.walletClientType || activeWallet?.connectorType || 'unknown'
  const isEmbeddedWallet = walletType === 'privy' ||
    activeWallet?.connectorType === 'embedded' ||
    (embeddedWallet && !externalWallet)

  const userEmail = user?.email?.address || user?.google?.email
  const userName = userEmail ? userEmail.split('@')[0] : truncatedAddress || 'User'
  const userInitials = userName ? userName.slice(0, 2).toUpperCase() : 'U'

  const networkName = chainId === 42161
    ? 'Arbitrum default'
    : `Wallet on chain ${chainId}`

  const handleLogin = async () => {
    if (!ready) return
    try {
      await login()
    } catch (error) {
      console.error('Login error:', error)
      toast.error("Failed to open login modal", {
        description: error instanceof Error ? error.message : "Check console for details",
      })
    }
  }

  const copyAddress = () => {
    if (walletAddress) {
      navigator.clipboard.writeText(walletAddress)
      toast.success("Address copied to clipboard")
    }
  }

  const handleLogout = async () => {
    const preserveKeys = ['monaris_access_token', 'monaris_invite_verified']
    const saved: Record<string, string> = {}
    preserveKeys.forEach(k => {
      const v = localStorage.getItem(k)
      if (v) saved[k] = v
    })

    // Wipe the entire React Query cache before navigating away
    queryClient.removeQueries()
    queryClient.clear()

    const restoreAndRedirect = (param: string) => {
      localStorage.clear()
      Object.entries(saved).forEach(([k, v]) => localStorage.setItem(k, v))
      sessionStorage.clear()
      window.location.href = `/?${param}=` + Date.now()
    }

    try {
      await logout()
      setTimeout(() => restoreAndRedirect('reset'), 300)
    } catch (error) {
      restoreAndRedirect('logout')
    }
  }

  const viewOnExplorer = () => {
    if (walletAddress) {
      window.open(getExplorerAddressUrl(chainId, walletAddress), '_blank')
    }
  }

  // Authenticated but wallet still loading (Privy creates it during login via createOnLogin)
  const showLoading = authenticated && user && !isConnected

  return (
    <header className="sticky top-0 z-30 flex h-16 w-full items-center border-b border-gray-200 bg-white/85 px-4 backdrop-blur-xl dark:border-gray-800 dark:bg-gray-900/85 sm:px-6 md:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Open navigation"
            className="md:hidden text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
            onClick={onMenuClick}
          >
            <Menu className="h-5 w-5" />
          </Button>

          <div className="hidden md:block">
            <span className="text-sm text-gray-500 dark:text-gray-400">Welcome back</span>
          </div>
        </div>

        <div className="flex min-w-0 items-center gap-2 md:gap-4">
          <Button
            type="button"
            onClick={onCashClick}
            className="hidden h-10 rounded-xl bg-primary px-4 text-primary-foreground shadow-sm transition-all duration-200 hover:bg-primary/90 hover:shadow-md sm:inline-flex"
          >
            <DollarSign className="h-4 w-4" />
            <span>Cash</span>
          </Button>

          <Button
            variant="ghost"
            size="icon"
            aria-label="Inbox"
            className="relative hidden text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white sm:flex"
          >
            <Mail className="h-5 w-5" />
          </Button>

          <div className="hidden sm:flex">
            <NotificationBell />
          </div>

          {isConnected && walletAddress ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-11 gap-2 rounded-xl px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-800 sm:gap-3 sm:px-3">
                  <Avatar className="h-9 w-9 bg-gradient-to-br from-[#c8ff00] to-[#a8df00]">
                    <AvatarFallback className="bg-gradient-to-br from-[#c8ff00] to-[#a8df00] text-white font-medium text-sm">
                      {userInitials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="hidden md:flex flex-col items-start">
                    <span className="text-sm font-medium text-gray-900 dark:text-white">{userName}</span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {isEmbeddedWallet ? 'Embedded Wallet · Arbitrum' : 'Connected'}
                    </span>
                  </div>
                  <ChevronDown className="h-4 w-4 text-gray-400 hidden md:block" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700">
                <DropdownMenuLabel className="py-3">
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10 bg-gradient-to-br from-[#c8ff00] to-[#a8df00]">
                        <AvatarFallback className="bg-gradient-to-br from-[#c8ff00] to-[#a8df00] text-white font-medium">
                          {userInitials}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">{userName}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 font-mono">{truncatedAddress}</p>
                      </div>
                    </div>
                    <div className="pt-3 border-t border-gray-100 dark:border-gray-800">
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">USDC Balance</p>
                      <div className="flex items-center gap-2">
                        {isLoadingBalance ? (
                          <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                        ) : (
                          <DollarSign className="h-4 w-4 text-[#7cb518]" />
                        )}
                        <p className="text-lg font-semibold text-gray-900 dark:text-white">
                          {isLoadingBalance ? "..." : usdcBalance.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2
                          })}
                          <span className="text-sm text-gray-500 dark:text-gray-400 ml-1">USDC</span>
                        </p>
                      </div>
                    </div>
                    <div className="pt-3 border-t border-gray-100 dark:border-gray-800">
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Execution rail</p>
                      <div className="flex items-center gap-2">
                        <Globe className="h-4 w-4 text-blue-500" />
                        <p className="text-sm font-medium text-gray-900 dark:text-white">{networkName}</p>
                      </div>
                      <p className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">
                        Wallet can hold funds on supported EVM chains while core Monaris flows stay on Arbitrum.
                      </p>
                    </div>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-gray-100 dark:bg-gray-800" />
                <DropdownMenuItem onClick={copyAddress} className="py-2.5 cursor-pointer">
                  <Copy className="mr-3 h-4 w-4 text-gray-500" />
                  Copy Address
                </DropdownMenuItem>
                <DropdownMenuItem onClick={viewOnExplorer} className="py-2.5 cursor-pointer">
                  <ExternalLink className="mr-3 h-4 w-4 text-gray-500" />
                  View on Explorer
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-gray-100 dark:bg-gray-800" />
                <DropdownMenuItem onClick={handleLogout} className="py-2.5 cursor-pointer text-red-600 dark:text-red-400">
                  <LogOut className="mr-3 h-4 w-4" />
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : showLoading ? (
            <Button
              disabled
              className="min-w-11 gap-2 rounded-xl bg-[#c8ff00]/60 px-3 text-black/60 font-medium cursor-wait sm:px-4"
            >
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="hidden sm:inline">Loading...</span>
            </Button>
          ) : (
            <Button
              onClick={handleLogin}
              disabled={!ready}
              className="min-w-11 gap-2 rounded-xl bg-[#c8ff00] px-3 text-black font-medium hover:bg-[#b8ef00] sm:px-4"
            >
              <User className="h-4 w-4" />
              <span className="hidden sm:inline">Login</span>
            </Button>
          )}
        </div>
      </div>
    </header>
  )
}
