import { Bell, Mail, ChevronDown, Wallet, Copy, LogOut, ExternalLink, DollarSign, Loader2, Menu, User, Globe } from "lucide-react"
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
  const linkWallet = 'linkWallet' in privy ? (privy as any).linkWallet : undefined
  const createWallet = 'createWallet' in privy ? (privy as any).createWallet : undefined
  const { wallets } = useWallets()
  
  // Determine login method
  const loginMethods = user?.linkedAccounts?.map((acc: any) => acc.type) || []
  const loggedInWithEmail = loginMethods.some((type: string) => 
    ['email', 'sms', 'google_oauth', 'twitter_oauth', 'github_oauth'].includes(type)
  )
  const loggedInWithWallet = loginMethods.includes('wallet')
  
  // Find embedded wallet
  const embeddedWallet = wallets.find(w => {
    const ct = w.connectorType?.toLowerCase() || ''
    const wct = w.walletClientType?.toLowerCase() || ''
    return ct === 'embedded' || wct === 'privy' || ct.includes('privy') || ct.includes('embedded')
  })
  
  // Find external wallet
  const externalWallet = wallets.find(w => {
    const ct = w.connectorType?.toLowerCase() || ''
    const wct = w.walletClientType?.toLowerCase() || ''
    return ct === 'injected' || wct === 'metamask' || ct.includes('injected') || wct.includes('metamask')
  })
  
  // Determine active wallet
  let activeWallet
  if (loggedInWithEmail) {
    if (embeddedWallet) {
      activeWallet = embeddedWallet
    } else if (!loggedInWithWallet && wallets.length === 0) {
      activeWallet = null
    } else if (loggedInWithWallet && !embeddedWallet) {
      activeWallet = null
    } else {
      activeWallet = loggedInWithWallet ? (externalWallet || null) : null
    }
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
  const isExternalWallet = !isEmbeddedWallet && walletType !== 'unknown' && !!externalWallet

  // Get user display name
  const userEmail = user?.email?.address || user?.google?.email
  const userName = userEmail ? userEmail.split('@')[0] : truncatedAddress || 'User'
  const userInitials = userName ? userName.slice(0, 2).toUpperCase() : 'U'

  // Get network name from chainId
  const getNetworkName = (id: number): string => {
    const networks: Record<number, string> = {
      1: 'Ethereum',
      5: 'Goerli',
      11155111: 'Sepolia',
      137: 'Polygon',
      80001: 'Mumbai',
      42161: 'Arbitrum',
      421614: 'Arbitrum Sepolia',
      10: 'Optimism',
      8453: 'Base',
      84532: 'Base Sepolia',
      43114: 'Avalanche',
      56: 'BNB Chain',
    }
    return networks[id] || `Chain ${id}`
  }
  const networkName = getNetworkName(chainId)

  const handleWalletClick = async () => {
    if (!ready) return

    if (!authenticated) {
      try {
        const originError = localStorage.getItem('privy:origin-error')
        if (originError) {
          toast.error("Origin Configuration Required", {
            description: `Add ${originError} to allowed origins in Privy dashboard`,
            duration: 15000,
          })
          return
        }
        await login()
      } catch (error: any) {
        console.error('Login error:', error)
        toast.error("Failed to open login modal", {
          description: error?.message || "Check console for details",
        })
      }
    } else if (authenticated && !isConnected) {
      if (createWallet && typeof createWallet === 'function') {
        try {
          toast.loading("Creating embedded wallet...", { id: 'create-wallet' })
          await createWallet()
          await new Promise(resolve => setTimeout(resolve, 1000))
          toast.success("Embedded wallet created!", { id: 'create-wallet' })
          return
        } catch (createError: any) {
          toast.dismiss('create-wallet')
          toast.error("Failed to Create Wallet", {
            description: `Please logout and login again with email only.`,
            duration: 15000,
          })
        }
      }
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

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-900/80 px-3 sm:px-4 md:px-6 backdrop-blur-xl">
      {/* Left side - Mobile menu & Page context */}
      <div className="flex items-center gap-4">
        {/* Mobile menu button */}
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
          onClick={onMenuClick}
        >
          <Menu className="h-5 w-5" />
        </Button>
        
        {/* Breadcrumb or page title could go here */}
        <div className="hidden md:block">
          <span className="text-sm text-gray-500 dark:text-gray-400">Welcome back</span>
        </div>
      </div>

      {/* Right side actions */}
      <div className="flex items-center gap-2 md:gap-4">
        {/* Notification Icons */}
        <Button variant="ghost" size="icon" className="relative text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white hidden sm:flex">
          <Mail className="h-5 w-5" />
        </Button>

        <Button variant="ghost" size="icon" className="relative text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white hidden sm:flex">
          <Bell className="h-5 w-5" />
          <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-red-500" />
        </Button>

        {/* User Profile Dropdown */}
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
        ) : authenticated && user && !isConnected ? (
          <Button 
            onClick={handleWalletClick}
            disabled={!ready}
            className="gap-2 bg-[#c8ff00] hover:bg-[#b8ef00] text-black font-medium rounded-xl"
          >
            <Wallet className="h-4 w-4" />
            <span className="hidden sm:inline">Create Wallet</span>
          </Button>
        ) : (
          <Button 
            onClick={handleWalletClick}
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
