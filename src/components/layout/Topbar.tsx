import { useEffect, useRef } from "react"
import { Mail, ChevronDown, Wallet, Copy, LogOut, ExternalLink, DollarSign, Loader2, Menu, User, Globe } from "lucide-react"
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
import { getExplorerAddressUrl } from "@/lib/chain-utils"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"

interface TopbarProps {
  onMenuClick?: () => void
}

export function Topbar({ onMenuClick }: TopbarProps = {}) {
  const privy = usePrivy()
  const { ready, authenticated, user, login, logout } = privy
  const chainId = useChainId()
  const { balance: usdcBalance, isLoading: isLoadingBalance } = useTokenBalance()
  const { wallets } = useWallets()

  const loginMethods = user?.linkedAccounts?.map((acc: any) => acc.type) || []
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

  const networkName = chainId === 42161 ? 'Arbitrum' : `Chain ${chainId}`

  const handleLogin = async () => {
    if (!ready) return
    try {
      await login()
    } catch (error: any) {
      console.error('Login error:', error)
      toast.error("Failed to open login modal", {
        description: error?.message || "Check console for details",
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
    try {
      await logout()
      setTimeout(() => {
        localStorage.clear()
        sessionStorage.clear()
        window.location.href = '/?reset=' + Date.now()
      }, 300)
    } catch (error) {
      localStorage.clear()
      sessionStorage.clear()
      window.location.href = '/?logout=' + Date.now()
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
    <header className="absolute md:sticky top-0 z-30 flex w-full h-16 items-center justify-between md:border-b border-transparent md:border-gray-200 md:dark:border-gray-800 bg-transparent md:bg-white/80 md:dark:bg-gray-900/80 pl-2 pr-3 sm:px-3 md:px-4 lg:px-6 md:backdrop-blur-xl pointer-events-none md:pointer-events-auto">
      <div className="flex items-center gap-4 pointer-events-auto">
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
          onClick={onMenuClick}
        >
          <Menu className="h-5 w-5" />
        </Button>

        <div className="hidden md:block">
          <span className="text-sm text-gray-500 dark:text-gray-400">Welcome back</span>
        </div>
      </div>

      <div className="flex items-center gap-2 md:gap-4 pointer-events-auto">
        <Button variant="ghost" size="icon" className="relative text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white hidden sm:flex">
          <Mail className="h-5 w-5" />
        </Button>

        <div className="hidden sm:flex">
          <NotificationBell />
        </div>

        {isConnected && walletAddress ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="gap-3 h-auto py-2 px-3 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl">
                <Avatar className="h-9 w-9 bg-gradient-to-br from-emerald-400 to-cyan-400">
                  <AvatarFallback className="bg-gradient-to-br from-emerald-400 to-cyan-400 text-white font-medium text-sm">
                    {userInitials}
                  </AvatarFallback>
                </Avatar>
                <div className="hidden md:flex flex-col items-start">
                  <span className="text-sm font-medium text-gray-900 dark:text-white">{userName}</span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {isEmbeddedWallet ? 'Embedded Wallet' : 'Connected'}
                  </span>
                </div>
                <ChevronDown className="h-4 w-4 text-gray-400 hidden md:block" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700">
              <DropdownMenuLabel className="py-3">
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10 bg-gradient-to-br from-emerald-400 to-cyan-400">
                      <AvatarFallback className="bg-gradient-to-br from-emerald-400 to-cyan-400 text-white font-medium">
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
                        <DollarSign className="h-4 w-4 text-emerald-500" />
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
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Network</p>
                    <div className="flex items-center gap-2">
                      <Globe className="h-4 w-4 text-blue-500" />
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{networkName}</p>
                    </div>
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
            className="gap-2 bg-[#c8ff00]/60 text-black/60 font-medium rounded-xl cursor-wait"
          >
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="hidden sm:inline">Loading...</span>
          </Button>
        ) : (
          <Button
            onClick={handleLogin}
            disabled={!ready}
            className="gap-2 bg-[#c8ff00] hover:bg-[#b8ef00] text-black font-medium rounded-xl"
          >
            <User className="h-4 w-4" />
            <span>Login</span>
          </Button>
        )}
      </div>
    </header>
  )
}
