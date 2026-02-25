import { motion } from "framer-motion"
import { useState, useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { 
  ArrowLeft, 
  Calendar, 
  DollarSign, 
  User, 
  Mail, 
  FileText,
  Plus,
  Trash2,
  Check,
  Loader2,
  CheckCircle2,
  ExternalLink,
  Copy
} from "lucide-react"
import { Link } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog"
import { toast } from "sonner"
import { useCreateInvoice } from "@/hooks/useInvoice"
import { usePrivyAccount } from "@/hooks/usePrivyAccount"
import { useChainId } from "wagmi"
import { usePrivy, useWallets } from "@privy-io/react-auth"
import { getExplorerUrl } from "@/lib/chain-utils"
import { isAddress, decodeEventLog } from "viem"
import { InvoiceRegistryABI } from "@/lib/abis"
import { supabase, isSupabaseConfigured } from "@/lib/supabase"
import { useContacts } from "@/hooks/useContacts"

interface LineItem {
  id: string
  description: string
  quantity: number
  rate: number
}

export default function CreateInvoice() {
  const navigate = useNavigate()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { id: "1", description: "", quantity: 1, rate: 0 }
  ])
  
  const [formData, setFormData] = useState({
    buyerAddress: "", // Ethereum address
    buyerName: "",
    buyerEmail: "",
    dueDate: "",
    memo: ""
  })
  
  const { address } = usePrivyAccount()
  const chainId = useChainId()
  const { authenticated, ready, login } = usePrivy()
  const { wallets } = useWallets()
  const { createInvoice, isPending, isConfirming, isSuccess, error, hash, receipt } = useCreateInvoice()
  const { contacts, findContact, addContact } = useContacts()
  const [contactSuggestions, setContactSuggestions] = useState<typeof contacts>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  
  // Find embedded wallet
  const embeddedWallet = wallets.find(w => {
    const ct = w.connectorType?.toLowerCase() || '';
    const wct = w.walletClientType?.toLowerCase() || '';
    return ct === 'embedded' || wct === 'privy' || ct.includes('privy') || ct.includes('embedded');
  })
  const successToastShown = useRef<string | null>(null)
  const submittedToastShown = useRef<string | null>(null)
  const [successModalOpen, setSuccessModalOpen] = useState(false)
  const [successHash, setSuccessHash] = useState<string | null>(null)
  
  // Show toast when transaction is submitted
  useEffect(() => {
    if (hash && !submittedToastShown.current) {
      submittedToastShown.current = hash
      toast.info("Transaction submitted", {
        description: "Please confirm the transaction in your wallet, then wait for on-chain confirmation...",
        duration: 5000,
      })
    }
  }, [hash])

  // Show toast when transaction is confirming
  useEffect(() => {
    if (hash && isConfirming && !isSuccess && submittedToastShown.current === hash) {
      toast.info("Transaction confirming", {
        description: "Waiting for on-chain confirmation...",
        duration: 3000,
      })
    }
  }, [hash, isConfirming, isSuccess])
  
  // Debug logging
  useEffect(() => {
    if (hash) {
      console.log('🔍 CreateInvoice component state:', {
        hash,
        isPending,
        isConfirming,
        isSuccess,
        receiptStatus: receipt?.status,
        error: error?.message,
      });
    }
  }, [hash, isPending, isConfirming, isSuccess, receipt, error])

  const totalAmount = lineItems.reduce((sum, item) => sum + item.quantity * item.rate, 0)

  const addLineItem = () => {
    setLineItems([
      ...lineItems,
      { id: Date.now().toString(), description: "", quantity: 1, rate: 0 }
    ])
  }

  const removeLineItem = (id: string) => {
    if (lineItems.length > 1) {
      setLineItems(lineItems.filter((item) => item.id !== id))
    }
  }

  const updateLineItem = (id: string, field: keyof LineItem, value: string | number) => {
    setLineItems(
      lineItems.map((item) =>
        item.id === id ? { ...item, [field]: value } : item
      )
    )
  }

  // Show success toast and modal when transaction is confirmed and store buyer metadata
  useEffect(() => {
    if (!(hash && isSuccess && receipt && successToastShown.current !== hash)) return
    const persist = async () => {
      successToastShown.current = hash
      setIsSubmitting(false)
      setSuccessHash(hash)
      
      // Show success toast
      toast.success("Invoice created successfully!", {
        description: "Your invoice has been created on-chain.",
        duration: 5000,
      })
      
      // Open success modal
      setSuccessModalOpen(true)
      
      // Extract invoice ID from transaction receipt logs
      let invoiceId: bigint | null = null
      try {
        if (receipt.logs) {
          for (const log of receipt.logs) {
            try {
              const decoded = decodeEventLog({
                abi: InvoiceRegistryABI,
                data: log.data,
                topics: log.topics,
              })
              if (decoded.eventName === 'InvoiceCreated') {
                invoiceId = (decoded.args as any).invoiceId as bigint
                break
              }
            } catch (e) {
              // Not an InvoiceCreated event, continue
            }
          }
        }
      } catch (e) {
        console.error('Error decoding invoice ID from receipt:', e)
      }
      
      // Store invoice metadata in localStorage as fallback
      const invoiceMetadata = {
        buyerName: formData.buyerName || '',
        buyerEmail: formData.buyerEmail || '',
        memo: formData.memo || '',
        lineItems: lineItems.map(item => ({
          description: item.description,
          quantity: item.quantity,
          rate: item.rate,
        })),
      }
      const storageKey = invoiceId
        ? `invoice_metadata_${invoiceId.toString()}`
        : `invoice_metadata_hash_${hash}`
      localStorage.setItem(storageKey, JSON.stringify(invoiceMetadata))

      // Persist to Supabase and create buyer notification
      if (isSupabaseConfigured()) {
        const dueDateTs = formData.dueDate ? new Date(formData.dueDate).toISOString() : new Date().toISOString()
        const { data: inv, error: invErr } = await supabase
          .from('invoices')
          .insert({
            chain_invoice_id: invoiceId ? Number(invoiceId) : 0,
            chain_id: chainId,
            seller_address: address?.toLowerCase() || '',
            buyer_address: formData.buyerAddress.toLowerCase(),
            amount: totalAmount,
            due_date: dueDateTs,
            status: 'issued',
            tx_hash: hash,
            buyer_name: formData.buyerName || null,
            buyer_email: formData.buyerEmail || null,
            memo: formData.memo || null,
            line_items: invoiceMetadata.lineItems,
          })
          .select('id')
          .single()

        if (invErr) {
          console.error('Supabase invoice insert error:', invErr)
        } else if (inv) {
          await supabase.from('notifications').insert({
            recipient_address: formData.buyerAddress.toLowerCase(),
            type: 'invoice_created',
            title: 'New Invoice',
            message: `You have a new invoice for $${totalAmount.toFixed(2)} due ${new Date(dueDateTs).toLocaleDateString()}`,
            invoice_id: inv.id,
            chain_invoice_id: invoiceId ? Number(invoiceId) : null,
            chain_id: chainId,
          })
        }
      }
    }
    persist().catch(console.error)
  }, [hash, isSuccess, receipt, formData.buyerName, formData.buyerEmail, formData.buyerAddress, formData.dueDate, formData.memo, address, chainId, lineItems, totalAmount])


  // Watch for errors - only show if transaction actually failed (not if it succeeded)
  useEffect(() => {
    if (error && !isSuccess && !receipt) {
      // Don't show error if transaction succeeded (isSuccess or receipt exists)
      // Check if it's an "already known" type error (transaction might have succeeded)
      const isAlreadyKnown = error.message?.includes('already known') || 
                            error.message?.includes('already be submitted') ||
                            error.message?.includes('nonce too low')
      
      // Check if it's a temporary RPC error that suggests retry
      const isTemporaryRpcError = error.message?.includes('Network temporarily unavailable') ||
                                  error.message?.includes('temporary') ||
                                  error.message?.includes('Please retry')
      
      // Check for insufficient funds error
      const errorMessage = error.message || String(error || '');
      const errorMsgLower = errorMessage.toLowerCase();
      const isInsufficientFunds = errorMsgLower.includes('insufficient funds') ||
                                  errorMsgLower.includes('insufficient balance') ||
                                  errorMessage.includes('overshot') ||
                                  errorMsgLower.includes('insufficient funds for gas') ||
                                  ((error as any).cause && String((error as any).cause).includes('insufficient funds')) ||
                                  ((error as any).cause && String((error as any).cause).includes('overshot'));
      
      if (isAlreadyKnown && hash) {
        // If we have a hash, transaction was likely submitted successfully
        // Don't show error, just log it
        console.log('Transaction may have been submitted despite error:', error.message)
        return
      } else if (isAlreadyKnown && !hash) {
        toast.warning("Transaction may already be submitted", {
          description: "Please check your wallet transactions. The invoice might have been created successfully.",
          duration: 8000,
        })
      } else if (isInsufficientFunds) {
        // Show user-friendly message for insufficient funds
        const nativeToken = chainId === 5003 || chainId === 5000 ? "MNT" : "ETH";
        toast.error("💸 Insufficient Funds", {
          description: (
            <div className="space-y-1">
              <p>{error.message || `You don't have enough ${nativeToken} to pay for gas fees.`}</p>
              <p className="text-sm text-muted-foreground">Please add more ${nativeToken} to your wallet.</p>
            </div>
          ),
          duration: 12000, // Show longer for important message
        })
      } else if (isTemporaryRpcError) {
        // Show user-friendly message for temporary RPC errors
        toast.error("⚠️ Network Error - Please Retry", {
          description: (
            <div className="space-y-1">
              <p>{error.message || "The network is temporarily unavailable. Please wait a moment and try again."}</p>
              <p className="text-sm text-muted-foreground">This is usually a temporary issue with the RPC endpoint.</p>
            </div>
          ),
          duration: 10000, // Show longer for retry instructions
        })
      } else {
        // Only show error if transaction definitely failed (no hash, no success)
        toast.error("❌ Failed to create invoice", {
          description: (
            <div className="space-y-1">
              <p>{error.message || "Please check your wallet and try again"}</p>
              {hash && (
                <a
                  href={getExplorerUrl(chainId, hash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-destructive underline hover:text-destructive/80 text-sm"
                >
                  Check transaction: {hash.substring(0, 10)}...
                </a>
              )}
            </div>
          ),
          duration: 10000,
        })
      }
      setIsSubmitting(false)
    }
  }, [error, hash, isSuccess, receipt, chainId])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Validate buyer address
    if (!formData.buyerAddress || !isAddress(formData.buyerAddress)) {
      toast.error("Invalid buyer address", {
        description: "Please enter a valid Ethereum address (0x...)",
      })
      return
    }

    // Check authentication and wallet availability FIRST
    if (!ready) {
      toast.error("Loading...", {
        description: "Please wait while we connect to your wallet",
      })
      return
    }
    
    if (!authenticated) {
      toast.error("Not logged in", {
        description: "Please log in to create an invoice",
      })
      login()
      return
    }
    
    if (!embeddedWallet) {
      toast.error("Wallet not ready", {
        description: "Your wallet is still being created. Please wait a moment and try again, or try logging out and back in.",
      })
      return
    }

    // Validate due date
    if (!formData.dueDate) {
      toast.error("Due date required", {
        description: "Please select a due date",
      })
      return
    }

    const dueDateTimestamp = Math.floor(new Date(formData.dueDate).getTime() / 1000)
    
    if (dueDateTimestamp <= Math.floor(Date.now() / 1000)) {
      toast.error("Invalid due date", {
        description: "Due date must be in the future",
      })
      return
    }

    if (totalAmount <= 0) {
      toast.error("Invalid amount", {
        description: "Total amount must be greater than 0",
      })
      return
    }

    setIsSubmitting(true)

    try {
      // Create metadata hash from line items (optional - can be empty for now)
      const metadata = {
        lineItems: lineItems,
        memo: formData.memo,
        buyerName: formData.buyerName,
        buyerEmail: formData.buyerEmail,
      }
      const metadataHash = "0x0000000000000000000000000000000000000000000000000000000000000000" // TODO: Hash metadata if needed

      // Call on-chain createInvoice
      // Toast messages for transaction status are handled by useEffect hooks above
      const result = await createInvoice(
        formData.buyerAddress,
        totalAmount.toString(),
        dueDateTimestamp,
        metadataHash
      )
      
      // Store buyer metadata in localStorage (keyed by invoice ID after creation)
      // We'll store it once we get the invoice ID from the transaction receipt
      
      // If we got a result (even without hash), transaction was submitted
      // Success detection will work via useEffect hooks
      if (result) {
        console.log('Transaction submitted, waiting for confirmation...', result)
      }
    } catch (err: any) {
      console.error("Error creating invoice:", err)
      
      // Only show error if it's not an "already known" type error
      // (those mean transaction was actually submitted)
      const errorMessage = err?.message || String(err || '');
      const errorMsgLower = errorMessage.toLowerCase();
      const errorString = String(err || '');
      const errorStringLower = errorString.toLowerCase();
      
      const isAlreadyKnown = errorMessage.includes('already known') || 
                            errorMessage.includes('Transaction appears to have been submitted');
      const isTemporaryRpcError = errorMessage.includes('Network temporarily unavailable') ||
                                  errorMessage.includes('temporary') ||
                                  errorMessage.includes('Please retry') ||
                                  errorMessage.includes('Status: 500') ||
                                  errorMessage.includes('Temporary internal error');
      const isInsufficientFunds = errorMsgLower.includes('insufficient funds') ||
                                  errorMsgLower.includes('insufficient balance') ||
                                  errorMessage.includes('overshot') ||
                                  errorMsgLower.includes('insufficient funds for gas');
      
      // Check for contract configuration errors (MINTER_ROLE, InvoiceRegistry not set, etc.)
      const isContractConfigError = errorMsgLower.includes('accesscontrol') ||
                                    errorMsgLower.includes('not authorized') ||
                                    errorMsgLower.includes('minter_role') ||
                                    errorMsgLower.includes('invoiceregistry not set') ||
                                    errorMsgLower.includes('invoiceregistry already set') ||
                                    errorString.includes('0xe2517d3f') || // Custom error selector
                                    errorMessage.includes('UserOperation reverted during simulation');
      
      if (!isAlreadyKnown) {
        if (isContractConfigError) {
          toast.error("⚠️ Contract Configuration Error", {
            description: "InvoiceNFT contract is not properly configured. The InvoiceRegistry contract needs MINTER_ROLE on InvoiceNFT. Please run the contract setup script or contact support.",
            duration: 15000,
          })
        } else if (isInsufficientFunds) {
          const nativeToken = chainId === 5003 || chainId === 5000 ? "MNT" : "ETH";
          toast.error("💸 Insufficient Funds", {
            description: errorMessage || `You don't have enough ${nativeToken} to pay for gas fees. Please add more ${nativeToken} to your wallet.`,
            duration: 12000,
          })
        } else if (isTemporaryRpcError) {
          toast.error("⚠️ Network Error - Please Retry", {
            description: errorMessage || "The network is temporarily unavailable. Please wait a moment and try again.",
            duration: 10000,
          })
        } else {
          toast.error("Failed to create invoice", {
            description: errorMessage || "Please try again",
          })
        }
      }
      setIsSubmitting(false)
    }
  }

  return (
    <div>
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto max-w-3xl space-y-6 px-3 sm:px-4 md:px-0"
    >
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" className="rounded-xl hover:bg-[#c8ff00]/10" asChild>
          <Link to="/app/invoices">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div>
          <h1 className="text-[32px] font-semibold text-[#404040] dark:text-white tracking-tight">Create Invoice</h1>
          <p className="text-[#aeaeae] text-base mt-1">
            Create a new invoice payment link
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Buyer details */}
        <div className="rounded-[20px] border border-[#f1f1f1] dark:border-gray-700 bg-white dark:bg-gray-800 p-6 shadow-[0px_16px_24px_0px_rgba(0,0,0,0.06),0px_2px_6px_0px_rgba(0,0,0,0.04)]">
          <h2 className="mb-4 text-lg font-semibold text-[#1a1a1a] dark:text-white">Buyer Details</h2>
          <div className="space-y-4">
            <div className="space-y-2 relative">
              <Label htmlFor="buyerAddress">
                <User className="mr-2 inline h-4 w-4" />
                Buyer Wallet Address <span className="text-destructive">*</span>
              </Label>
              <Input
                id="buyerAddress"
                placeholder="0x... or search contacts"
                value={formData.buyerAddress}
                onChange={(e) => {
                  const val = e.target.value
                  setFormData({ ...formData, buyerAddress: val })
                  if (val.length >= 2 && contacts.length > 0) {
                    const matches = findContact(val)
                    setContactSuggestions(matches)
                    setShowSuggestions(matches.length > 0)
                  } else {
                    setShowSuggestions(false)
                  }
                }}
                onFocus={() => {
                  if (formData.buyerAddress.length >= 2) {
                    const matches = findContact(formData.buyerAddress)
                    setContactSuggestions(matches)
                    setShowSuggestions(matches.length > 0)
                  } else if (formData.buyerAddress.length === 0 && contacts.length > 0) {
                    setContactSuggestions(contacts.slice(0, 5))
                    setShowSuggestions(true)
                  }
                }}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                required
                className="font-mono"
                autoComplete="off"
              />
              {showSuggestions && contactSuggestions.length > 0 && (
                <div className="absolute z-50 left-0 right-0 top-full mt-1 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg overflow-hidden">
                  {contactSuggestions.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      className="w-full text-left px-4 py-2.5 hover:bg-[#c8ff00]/10 transition-colors border-b border-gray-50 dark:border-gray-800 last:border-0"
                      onMouseDown={(e) => {
                        e.preventDefault()
                        setFormData({
                          ...formData,
                          buyerAddress: c.contact_address,
                          buyerName: c.contact_name,
                          buyerEmail: c.contact_email || formData.buyerEmail,
                        })
                        setShowSuggestions(false)
                      }}
                    >
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{c.contact_name}</p>
                      <p className="text-xs font-mono text-gray-500 dark:text-gray-400">{c.contact_address}</p>
                    </button>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                The Ethereum address that will receive and pay the invoice
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="buyerName">
                  Buyer Name (optional)
                </Label>
                <Input
                  id="buyerName"
                  placeholder="Company or person name"
                  value={formData.buyerName}
                  onChange={(e) => setFormData({ ...formData, buyerName: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="buyerEmail">
                  <Mail className="mr-2 inline h-4 w-4" />
                  Email (optional)
                </Label>
                <Input
                  id="buyerEmail"
                  type="email"
                  placeholder="billing@company.com"
                  value={formData.buyerEmail}
                  onChange={(e) => setFormData({ ...formData, buyerEmail: e.target.value })}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Line items */}
        <div className="rounded-[20px] border border-[#f1f1f1] dark:border-gray-700 bg-white dark:bg-gray-800 p-4 md:p-6 shadow-[0px_16px_24px_0px_rgba(0,0,0,0.06),0px_2px_6px_0px_rgba(0,0,0,0.04)]">
          <h2 className="mb-4 text-lg font-semibold text-[#1a1a1a] dark:text-white">Line Items</h2>
          <div className="space-y-4 md:space-y-4">
            {lineItems.map((item, index) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="relative rounded-lg border border-border/50 bg-secondary/30 p-4 md:border-0 md:bg-transparent md:p-0"
              >
                {/* Grid layout */}
                <div className="grid gap-4 md:grid-cols-[1fr_100px_120px_40px] items-end">
                  <div className="space-y-2">
                    <Label htmlFor={`desc-${item.id}`} className="text-sm">
                      <FileText className="mr-2 inline h-4 w-4" />
                      Description
                    </Label>
                    <Input
                      id={`desc-${item.id}`}
                      placeholder="Service or product"
                      value={item.description}
                      onChange={(e) => updateLineItem(item.id, "description", e.target.value)}
                      className="w-full"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`qty-${item.id}`} className="text-sm">
                      Qty
                    </Label>
                    <Input
                      id={`qty-${item.id}`}
                      type="number"
                      min="1"
                      value={item.quantity}
                      onChange={(e) => updateLineItem(item.id, "quantity", parseInt(e.target.value) || 1)}
                      className="w-full"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`rate-${item.id}`} className="text-sm">
                      <DollarSign className="mr-2 inline h-4 w-4" />
                      $ Rate
                    </Label>
                    <div className="flex gap-2 items-center">
                      <Input
                        id={`rate-${item.id}`}
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        value={item.rate || ""}
                        onChange={(e) => updateLineItem(item.id, "rate", parseFloat(e.target.value) || 0)}
                        className="flex-1"
                        required
                      />
                      {/* Delete button - mobile: same line as rate, desktop: grid item */}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeLineItem(item.id)}
                        disabled={lineItems.length === 1}
                        className="flex-shrink-0 md:hidden text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  {/* Delete button - desktop: grid item */}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeLineItem(item.id)}
                    disabled={lineItems.length === 1}
                    className="hidden md:flex text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </motion.div>
            ))}
          </div>
          
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-4 w-full md:w-auto"
            onClick={addLineItem}
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Line Item
          </Button>

          {/* Total */}
          <div className="mt-6 flex justify-end border-t border-[#f1f1f1] dark:border-gray-700 pt-4">
            <div className="text-right w-full md:w-auto">
              <p className="text-sm text-[#aeaeae]">Total Amount</p>
              <p className="text-2xl md:text-3xl font-bold text-[#1a1a1a] dark:text-white">
                ${totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                <span className="ml-2 text-base md:text-lg font-normal text-[#aeaeae]">USDC</span>
              </p>
            </div>
          </div>
        </div>

        {/* Payment details */}
        <div className="rounded-[20px] border border-[#f1f1f1] dark:border-gray-700 bg-white dark:bg-gray-800 p-4 md:p-6 shadow-[0px_16px_24px_0px_rgba(0,0,0,0.06),0px_2px_6px_0px_rgba(0,0,0,0.04)]">
          <h2 className="mb-3 text-lg font-semibold text-[#1a1a1a] dark:text-white">Payment Details</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="dueDate">
                <Calendar className="mr-2 inline h-4 w-4" />
                Due Date
              </Label>
              <Input
                id="dueDate"
                type="date"
                value={formData.dueDate}
                onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="currency">Currency</Label>
              <Input
                id="currency"
                value="USDC"
                disabled
                className="bg-secondary/50"
              />
            </div>
          </div>
          <div className="mt-3 space-y-2">
            <Label htmlFor="memo">Memo (optional)</Label>
            <Textarea
              id="memo"
              placeholder="Additional notes for the buyer..."
              value={formData.memo}
              onChange={(e) => setFormData({ ...formData, memo: e.target.value })}
              rows={2}
              className="resize-none"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="pt-2 border-t border-[#f1f1f1] dark:border-gray-700">
          <div className="flex flex-row justify-end gap-3">
            <Button variant="outline" type="button" asChild size="sm" className="flex-shrink-0 rounded-xl border-[#e8e8e8] hover:border-[#c8ff00] hover:bg-[#c8ff00]/10">
              <Link to="/app/invoices">Cancel</Link>
            </Button>
            <Button 
              type="submit" 
              size="sm"
              disabled={isPending || isConfirming || isSubmitting || totalAmount === 0 || !address}
              className="flex-shrink-0 bg-[#c8ff00] hover:bg-[#b8ef00] text-[#1a1a1a] font-semibold rounded-xl"
            >
              {isPending || isConfirming ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {isPending ? "Waiting..." : "Confirming..."}
                </>
              ) : (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  Create Invoice On-Chain
                </>
              )}
            </Button>
          </div>
          {!address && (
            <p className="text-xs text-muted-foreground text-right mt-2">
              Please connect your wallet to create an invoice
            </p>
          )}
        </div>
      </form>
    </motion.div>

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
            <h3 className="text-2xl font-bold">Invoice Created Successfully!</h3>
            <p className="text-muted-foreground">
              Your invoice transaction has been successfully processed.
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
                    navigate("/app/invoices")
                  }}
                >
                  View Invoices
                </Button>
                {formData.buyerAddress && formData.buyerName && isSupabaseConfigured() && (
                  <Button
                    variant="ghost"
                    className="w-full text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-900/20"
                    onClick={async () => {
                      const result = await addContact(
                        formData.buyerAddress,
                        formData.buyerName,
                        formData.buyerEmail || undefined
                      )
                      if (result) toast.success(`Saved ${formData.buyerName} to contacts`)
                      else toast.error('Failed to save contact')
                    }}
                  >
                    Save Buyer as Contact
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
    </div>
  )
}
