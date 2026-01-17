import { motion } from "framer-motion"
import { 
  User, 
  Wallet, 
  Bell, 
  Shield, 
  Eye,
  EyeOff,
  ExternalLink,
  Copy,
  Coins,
  AlertTriangle,
  Loader2
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { toast } from "sonner"
import { useState, useEffect } from "react"
import { useChainId, useReadContract, useWaitForTransactionReceipt } from "wagmi"
import { useSendTransaction, useWallets } from "@privy-io/react-auth"
import { usePrivyAccount } from "@/hooks/usePrivyAccount"
import { useChainAddresses } from "@/hooks/useChainAddresses"
import { DemoUSDCABI } from "@/lib/abis"
import { parseUnits, formatUnits, encodeFunctionData } from "viem"
import { isAddress } from "viem"
import { getExplorerAddressUrl } from "@/lib/chain-utils"

export default function Settings() {
  const [showWallet, setShowWallet] = useState(false)
  const { address } = usePrivyAccount()
  const chainId = useChainId()
  
  // Get deployer address from contracts.json
  const deployerAddress = "0x9C7dCfd1E28B467C6AfBcc60b4E9a16ba6f3E0D6" // From deployment
  const isOwner = address?.toLowerCase() === deployerAddress.toLowerCase()
  const isTestnet = chainId === 5003 || chainId === 421614 || chainId === 11155111

  const copyAddress = () => {
    if (address) {
      navigator.clipboard.writeText(address)
      toast.success("Address copied to clipboard")
    } else {
      toast.error("No wallet connected")
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto max-w-3xl space-y-6"
    >
      {/* Header */}
      <div>
        <h1 className="text-[32px] font-semibold text-[#404040] dark:text-white tracking-tight">Settings</h1>
        <p className="text-[#aeaeae] mt-1">
          Manage your account and preferences
        </p>
      </div>

      {/* Profile */}
      <div className="rounded-[20px] border border-[#f1f1f1] dark:border-gray-700 bg-white dark:bg-gray-900 p-6 shadow-[0px_4px_16px_0px_rgba(0,0,0,0.06)]">
        <div className="mb-6 flex items-center gap-3">
          <div className="rounded-xl bg-[#c8ff00]/10 p-2.5">
            <User className="h-5 w-5 text-[#7cb518]" />
          </div>
          <h2 className="text-lg font-semibold text-[#1a1a1a] dark:text-white">Profile</h2>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="displayName" className="text-[#696969] dark:text-gray-400">Display Name</Label>
            <Input id="displayName" placeholder="Your name or business" defaultValue="Acme Corp" className="rounded-xl border-[#e8e8e8] dark:border-gray-600 focus:border-[#c8ff00] focus:ring-[#c8ff00]/20" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email" className="text-[#696969] dark:text-gray-400">Email</Label>
            <Input id="email" type="email" placeholder="you@example.com" defaultValue="billing@acme.com" className="rounded-xl border-[#e8e8e8] dark:border-gray-600 focus:border-[#c8ff00] focus:ring-[#c8ff00]/20" />
          </div>
        </div>

        <Button className="mt-4 bg-[#c8ff00] hover:bg-[#b8ef00] text-[#1a1a1a] font-semibold rounded-xl shadow-md">Save Changes</Button>
      </div>

      {/* Wallet */}
      <div className="rounded-[20px] border border-[#f1f1f1] dark:border-gray-700 bg-white dark:bg-gray-900 p-6 shadow-[0px_4px_16px_0px_rgba(0,0,0,0.06)]">
        <div className="mb-6 flex items-center gap-3">
          <div className="rounded-xl bg-[#c8ff00]/10 p-2.5">
            <Wallet className="h-5 w-5 text-[#7cb518]" />
          </div>
          <h2 className="text-lg font-semibold text-[#1a1a1a] dark:text-white">Wallet</h2>
        </div>

        <div className="space-y-4">
          {address ? (
            <div className="flex items-center justify-between rounded-xl bg-[#f8f8f8] dark:bg-gray-800 p-4">
              <div>
                <p className="text-sm text-[#aeaeae]">Connected Wallet</p>
                <div className="flex items-center gap-2 mt-1">
                  <p className="font-mono text-sm text-[#1a1a1a] dark:text-white">
                    {showWallet 
                      ? address 
                      : `${address.slice(0, 6)}...${address.slice(-4)}`
                    }
                  </p>
                  <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-[#c8ff00]/10" onClick={() => setShowWallet(!showWallet)}>
                    {showWallet ? <EyeOff className="h-4 w-4 text-[#696969]" /> : <Eye className="h-4 w-4 text-[#696969]" />}
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-[#c8ff00]/10" onClick={copyAddress}>
                    <Copy className="h-4 w-4 text-[#696969]" />
                  </Button>
                </div>
              </div>
              <Button 
                variant="outline" 
                size="sm"
                className="rounded-xl border-[#e8e8e8] dark:border-gray-600 hover:border-[#c8ff00] hover:bg-[#c8ff00]/10"
                onClick={() => window.open(getExplorerAddressUrl(chainId, address || ''), '_blank')}
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                View on Explorer
              </Button>
            </div>
          ) : (
            <div className="rounded-xl bg-[#f8f8f8] dark:bg-gray-800 p-4 text-center">
              <p className="text-sm text-[#aeaeae]">No wallet connected</p>
              <p className="text-xs text-[#aeaeae] mt-1">
                Connect your wallet using the button in the top bar
              </p>
            </div>
          )}

          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-[#1a1a1a] dark:text-white">Add External Wallet</p>
              <p className="text-sm text-[#aeaeae]">Connect an additional wallet for advanced features</p>
            </div>
            <Button variant="outline" className="rounded-xl border-[#e8e8e8] dark:border-gray-600 hover:border-[#c8ff00] hover:bg-[#c8ff00]/10">Connect Wallet</Button>
          </div>
        </div>
      </div>

      {/* Notifications */}
      <div className="rounded-[20px] border border-[#f1f1f1] dark:border-gray-700 bg-white dark:bg-gray-900 p-6 shadow-[0px_4px_16px_0px_rgba(0,0,0,0.06)]">
        <div className="mb-6 flex items-center gap-3">
          <div className="rounded-xl bg-[#c8ff00]/10 p-2.5">
            <Bell className="h-5 w-5 text-[#7cb518]" />
          </div>
          <h2 className="text-lg font-semibold text-[#1a1a1a] dark:text-white">Notifications</h2>
        </div>

        <div className="space-y-4">
          <NotificationToggle
            title="Invoice Payments"
            description="Get notified when invoices are paid"
            defaultChecked
          />
          <NotificationToggle
            title="Financing Updates"
            description="Updates on advance requests and repayments"
            defaultChecked
          />
          <NotificationToggle
            title="Reputation Changes"
            description="Score updates and tier unlocks"
            defaultChecked
          />
          <NotificationToggle
            title="Vault Activity"
            description="Deposits, withdrawals, and earnings"
            defaultChecked={false}
          />
        </div>
      </div>

      {/* Privacy */}
      <div className="rounded-[20px] border border-[#f1f1f1] dark:border-gray-700 bg-white dark:bg-gray-900 p-6 shadow-[0px_4px_16px_0px_rgba(0,0,0,0.06)]">
        <div className="mb-6 flex items-center gap-3">
          <div className="rounded-xl bg-[#c8ff00]/10 p-2.5">
            <Shield className="h-5 w-5 text-[#7cb518]" />
          </div>
          <h2 className="text-lg font-semibold text-[#1a1a1a] dark:text-white">Privacy</h2>
        </div>

        <div className="space-y-4">
          <NotificationToggle
            title="Hide Wallet Balance"
            description="Mask your balance on the dashboard"
            defaultChecked={false}
          />
          <NotificationToggle
            title="Anonymous Mode"
            description="Hide your identity from public invoice links"
            defaultChecked={false}
          />
          <NotificationToggle
            title="Activity Tracking"
            description="Allow analytics to improve your experience"
            defaultChecked
          />
        </div>
      </div>

      {/* Demo Setup */}
      {isTestnet && (
        <DemoSetupPanel 
          isOwner={isOwner} 
          isTestnet={isTestnet}
          chainId={chainId}
          currentAddress={address}
          deployerAddress={deployerAddress}
        />
      )}

      {/* Danger zone */}
      <div className="rounded-[20px] border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/20 p-6">
        <h2 className="mb-2 text-lg font-semibold text-red-600 dark:text-red-400">Danger Zone</h2>
        <p className="mb-4 text-sm text-[#696969] dark:text-gray-400">
          These actions are irreversible. Please proceed with caution.
        </p>
        <div className="flex gap-4">
          <Button variant="outline" className="rounded-xl border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-600 hover:text-white hover:border-red-600">
            Delete All Data
          </Button>
          <Button variant="outline" className="rounded-xl border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-600 hover:text-white hover:border-red-600">
            Disconnect Account
          </Button>
        </div>
      </div>
    </motion.div>
  )
}

function DemoSetupPanel({
  isOwner,
  isTestnet,
  chainId,
  currentAddress,
  deployerAddress,
}: {
  isOwner: boolean
  isTestnet: boolean
  chainId: number
  currentAddress?: string
  deployerAddress: string
}) {
  const [mintAmount, setMintAmount] = useState("1000")
  const [mintToAddress, setMintToAddress] = useState(currentAddress || "")
  const { sendTransaction } = useSendTransaction()
  const { wallets } = useWallets()
  const addresses = useChainAddresses()

  const embeddedWallet = wallets.find(w => {
    const ct = w.connectorType?.toLowerCase() || '';
    const wct = w.walletClientType?.toLowerCase() || '';
    return ct === 'embedded' || wct === 'privy' || ct.includes('privy') || ct.includes('embedded');
  }) || wallets[0]

  const [mintHash, setMintHash] = useState<`0x${string}` | null>(null)
  const [isMinting, setIsMinting] = useState(false)

  const { isLoading: isMintConfirming } = useWaitForTransactionReceipt({
    hash: mintHash,
    chainId,
  })

  useEffect(() => {
    if (currentAddress) {
      setMintToAddress(currentAddress)
    }
  }, [currentAddress])

  useEffect(() => {
    if (mintHash && !isMintConfirming) {
      toast.success("USDC minted successfully!")
      setMintAmount("1000") // Reset
    }
  }, [mintHash, isMintConfirming])

  // Check if current chain is any testnet (not just Mantle Sepolia)
  const isAnyTestnet = chainId === 5003 || chainId === 421614 || chainId === 11155111;

  const handleMint = async () => {
    if (!isAnyTestnet) {
      toast.error("Testnet only", {
        description: "USDC minting is restricted to testnets (Mantle Sepolia, Arbitrum Sepolia, Ethereum Sepolia)",
      })
      return
    }

    if (!mintToAddress || !isAddress(mintToAddress)) {
      toast.error("Invalid address", {
        description: "Please enter a valid Ethereum address",
      })
      return
    }

    const amount = parseFloat(mintAmount)
    if (isNaN(amount) || amount <= 0) {
      toast.error("Invalid amount", {
        description: "Amount must be greater than 0",
      })
      return
    }

    if (!embeddedWallet) {
      toast.error("No wallet available", {
        description: "Please connect your Privy embedded wallet",
      })
      return
    }

    if (!addresses.DemoUSDC) {
      toast.error("USDC contract not configured", {
        description: `DemoUSDC address not configured for chain ${chainId}`,
      })
      return
    }

    setIsMinting(true)
    try {
      const data = encodeFunctionData({
        abi: DemoUSDCABI,
        functionName: "mint",
        args: [mintToAddress as `0x${string}`, parseUnits(mintAmount, 6)], // 6 decimals
      })

      // For gas-sponsored testnets, set manual gas limit to bypass balance check during estimation
      // Privy will still sponsor the actual gas fees, but this prevents estimation from failing
      const isGasSponsored = isAnyTestnet; // Arbitrum Sepolia, Ethereum Sepolia, Mantle Sepolia
      const gasLimit = isGasSponsored ? 300000n : undefined; // 300k gas should be enough for mint

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
          sponsor: isGasSponsored, // Enable gas sponsorship only for testnets (not mainnet)
          uiOptions: {
            showWalletUIs: false,
          },
        }
      )

      setMintHash(result.hash)
      toast.success("Mint transaction submitted!")
    } catch (error: any) {
      toast.error("Mint failed", {
        description: error.message || "Please try again",
      })
    } finally {
      setIsMinting(false)
    }
  }

  return (
    <div className="rounded-[20px] border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/20 p-6">
      <div className="mb-6 flex items-center gap-3">
        <div className="rounded-xl bg-amber-100 dark:bg-amber-900/30 p-2.5">
          <Coins className="h-5 w-5 text-amber-600 dark:text-amber-400" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-[#1a1a1a] dark:text-white">Demo Setup</h2>
          <p className="text-xs text-[#aeaeae]">TESTNET ONLY - Works on all testnets</p>
        </div>
      </div>

      <div className="space-y-4">
        {/* Network Status */}
        <div className="flex items-center justify-between rounded-xl bg-white dark:bg-gray-800/50 p-4">
          <div>
            <p className="text-sm font-medium text-[#1a1a1a] dark:text-white">Network</p>
            <p className="text-xs text-[#aeaeae]">
              Chain ID: {chainId} {isAnyTestnet ? "(Testnet)" : "(Mainnet - Minting Disabled)"}
            </p>
          </div>
          {!isTestnet && (
            <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-4 w-4" />
              <span className="text-xs font-medium">Switch to Mantle Sepolia</span>
            </div>
          )}
          {isTestnet && (
            <div className="flex items-center gap-2 text-[#7cb518]">
              <Shield className="h-4 w-4" />
              <span className="text-xs font-medium">Testnet Active</span>
            </div>
          )}
        </div>

        {/* Connected Wallet */}
        {currentAddress && (
          <div className="rounded-xl bg-white dark:bg-gray-800/50 p-4">
            <p className="text-sm font-medium mb-2 text-[#1a1a1a] dark:text-white">Connected Wallet</p>
            <p className="font-mono text-xs text-[#aeaeae] break-all">
              {currentAddress}
            </p>
          </div>
        )}

        {/* Public Mint Panel */}
        <div className="space-y-4 rounded-xl bg-white dark:bg-gray-800/50 p-4">
          <div>
            <p className="text-sm font-medium mb-1 text-[#1a1a1a] dark:text-white">Mint USDC</p>
            <p className="text-xs text-[#aeaeae]">
              Mint testnet USDC tokens to any address for demo purposes (testnet only)
            </p>
          </div>
            
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="mintToAddress" className="text-[#696969] dark:text-gray-400">Recipient Address</Label>
                <Input
                  id="mintToAddress"
                  placeholder="0x..."
                  value={mintToAddress}
                  onChange={(e) => setMintToAddress(e.target.value)}
                  className="font-mono text-sm rounded-xl border-[#e8e8e8] dark:border-gray-600 focus:border-[#c8ff00] focus:ring-[#c8ff00]/20"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="mintAmount" className="text-[#696969] dark:text-gray-400">Amount (USDC)</Label>
                <Input
                  id="mintAmount"
                  type="number"
                  placeholder="1000"
                  value={mintAmount}
                  onChange={(e) => setMintAmount(e.target.value)}
                  min="0"
                  step="0.01"
                  className="rounded-xl border-[#e8e8e8] dark:border-gray-600 focus:border-[#c8ff00] focus:ring-[#c8ff00]/20"
                />
              </div>

              <Button
                onClick={handleMint}
                disabled={isMinting || isMintConfirming || !isAnyTestnet}
                className="w-full bg-[#c8ff00] hover:bg-[#b8ef00] text-[#1a1a1a] font-semibold rounded-xl shadow-md disabled:opacity-50"
              >
                {isMinting || isMintConfirming ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {isMinting ? "Waiting for wallet..." : "Minting..."}
                  </>
                ) : (
                  <>
                    <Coins className="mr-2 h-4 w-4" />
                    Mint {mintAmount} USDC
                  </>
                )}
              </Button>
              
              {!isAnyTestnet && (
                <p className="text-xs text-amber-600 dark:text-amber-400 text-center">
                  ⚠️ Switch to a testnet (Mantle Sepolia, Arbitrum Sepolia, or Ethereum Sepolia) to enable minting
                </p>
              )}
          </div>
        </div>
      </div>
    </div>
  )
}

function NotificationToggle({
  title,
  description,
  defaultChecked,
}: {
  title: string
  description: string
  defaultChecked?: boolean
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <div>
        <p className="font-medium text-[#1a1a1a] dark:text-white">{title}</p>
        <p className="text-sm text-[#aeaeae]">{description}</p>
      </div>
      <Switch defaultChecked={defaultChecked} className="data-[state=checked]:bg-[#c8ff00]" />
    </div>
  )
}
