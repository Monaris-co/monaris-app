import { motion } from "framer-motion"
import { useState, useMemo, useEffect } from "react"
import { 
  Plus, 
  Search, 
  Filter, 
  MoreHorizontal, 
  Copy, 
  ExternalLink,
  Zap,
  Eye,
  Loader2,
  RotateCcw,
  ImageIcon
} from "lucide-react"
import { Link } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { StatusBadge } from "@/components/ui/status-badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { toast as shadcnToast } from "@/hooks/use-toast"
import { toast } from "sonner"
import { useSellerInvoicesWithData, Invoice, InvoiceStatus } from "@/hooks/useInvoice"
import { useInvoiceNFT } from "@/hooks/useInvoiceNFT"
import { formatUnits } from "viem"
import { useChainAddresses } from "@/hooks/useChainAddresses"
import { useChainId } from "wagmi"
import { getPaymentLink } from "@/lib/chain-utils"
import { Trash2, Download } from "lucide-react"
import { downloadInvoicePDF } from "@/lib/generateInvoicePDF"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"

// Map invoice status enum to display strings
const STATUS_MAP: Record<InvoiceStatus, string> = {
  0: "issued",
  1: "financed",
  2: "paid",
  3: "cleared",
}

// Store hidden invoice IDs in localStorage
const HIDDEN_INVOICES_KEY = "monaris-hidden-invoices"

function getHiddenInvoices(): Set<string> {
  if (typeof window === "undefined") return new Set()
  const hidden = localStorage.getItem(HIDDEN_INVOICES_KEY)
  return hidden ? new Set(JSON.parse(hidden)) : new Set()
}

function setHiddenInvoices(hidden: Set<string>) {
  if (typeof window === "undefined") return
  localStorage.setItem(HIDDEN_INVOICES_KEY, JSON.stringify(Array.from(hidden)))
}

export default function Invoices() {
  const chainId = useChainId()
  const [searchQuery, setSearchQuery] = useState("")
  const [hiddenInvoiceIds, setHiddenInvoiceIds] = useState<Set<string>>(() => getHiddenInvoices())
  const { invoices, isLoading, error } = useSellerInvoicesWithData()
  const addresses = useChainAddresses()

  // Sync hidden invoices with localStorage (only write, don't read to avoid loops)
  useEffect(() => {
    if (hiddenInvoiceIds.size === 0) {
      // If empty, clear localStorage
      if (typeof window !== 'undefined') {
        localStorage.removeItem(HIDDEN_INVOICES_KEY)
      }
    } else {
      setHiddenInvoices(hiddenInvoiceIds)
    }
  }, [hiddenInvoiceIds])

  const handleHideInvoice = (invoiceId: bigint) => {
    setHiddenInvoiceIds(prev => new Set([...prev, invoiceId.toString()]))
    toast.success("Invoice hidden", {
      description: "The invoice has been hidden from your list. It still exists on-chain.",
    })
  }

  const handleRestoreAllHidden = () => {
    const count = hiddenInvoiceIds.size
    console.log('🔄 Restoring hidden invoices:', { count, hiddenIds: Array.from(hiddenInvoiceIds) })
    
    // Clear localStorage first
    if (typeof window !== 'undefined') {
      localStorage.removeItem(HIDDEN_INVOICES_KEY)
      console.log('✅ Cleared localStorage')
    }
    
    // Update state with empty Set - React will detect this change
    setHiddenInvoiceIds(new Set())
    console.log('✅ Set hiddenInvoiceIds to empty Set')
    
    toast.success(`Restored ${count} hidden invoice${count !== 1 ? 's' : ''}`, {
      description: "All previously hidden invoices are now visible.",
    })
  }

  // Format invoices for display
  const formattedInvoices = useMemo(() => {
    if (!invoices) return []
    
    return invoices.map((invoice) => ({
      id: `INV-${invoice.invoiceId.toString().padStart(10, '0')}`, // 10 digits to match PDF format
      invoiceId: invoice.invoiceId,
      buyer: invoice.buyer,
      seller: invoice.seller,
      amount: parseFloat(formatUnits(invoice.amount, 6)), // USDC has 6 decimals
      amountRaw: invoice.amount, // Keep raw bigint for PDF
      status: STATUS_MAP[invoice.status] as "issued" | "financed" | "paid" | "cleared",
      dueDate: new Date(Number(invoice.dueDate) * 1000),
      createdDate: new Date(Number(invoice.createdAt) * 1000),
      paidAt: invoice.paidAt,
      clearedAt: invoice.clearedAt,
      link: getPaymentLink(chainId, invoice.invoiceId),
    }))
  }, [invoices, chainId])

  const filteredInvoices = useMemo(() => {
    if (!formattedInvoices) return []
    
    // Debug: log invoice counts
    if (process.env.NODE_ENV === 'development') {
      console.log('📊 Invoice filtering:', {
        totalInvoices: formattedInvoices.length,
        hiddenCount: hiddenInvoiceIds.size,
        hiddenIds: Array.from(hiddenInvoiceIds),
        searchQuery,
      })
    }
    
    const visibleInvoices = formattedInvoices
      .filter(inv => {
        const invoiceIdStr = inv.invoiceId.toString()
        const isHidden = hiddenInvoiceIds.has(invoiceIdStr)
        return !isHidden
      })
      .filter(
        (inv) =>
          inv.buyer.toLowerCase().includes(searchQuery.toLowerCase()) ||
          inv.id.toLowerCase().includes(searchQuery.toLowerCase())
      )
    
    // Debug: log filtered results
    if (process.env.NODE_ENV === 'development') {
      console.log('✅ Filtered invoices result:', {
        visibleCount: visibleInvoices.length,
        totalCount: formattedInvoices.length,
        hiddenCount: hiddenInvoiceIds.size,
      })
    }
    
    return visibleInvoices
  }, [formattedInvoices, searchQuery, hiddenInvoiceIds])

  const copyLink = (link: string) => {
    navigator.clipboard.writeText(link)
    shadcnToast({
      title: "Link copied",
      description: "Payment link copied to clipboard",
    })
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 px-3 sm:px-4 md:px-0"
    >
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-[32px] font-semibold text-[#404040] dark:text-white tracking-tight">Invoices</h1>
          <p className="text-[#aeaeae] text-base mt-1">
            Create and manage your invoice payment links
            {invoices && invoices.length > 0 && (
              <span className="ml-2 text-xs">
                (Showing {filteredInvoices.length} of {invoices.length}{hiddenInvoiceIds.size > 0 ? `, ${hiddenInvoiceIds.size} hidden` : ''})
              </span>
            )}
          </p>
        </div>
        <Button className="bg-[#c8ff00] hover:bg-[#b8ef00] text-[#1a1a1a] font-semibold rounded-xl shadow-md" asChild>
          <Link to="/app/invoices/new">
            <Plus className="h-4 w-4 mr-2" />
            Create Invoice
          </Link>
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
        <div className="relative flex-1 sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#aeaeae]" />
          <Input
            placeholder="Search invoices..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 rounded-xl border-[#e8e8e8] dark:border-gray-700 focus:border-[#c8ff00] focus:ring-[#c8ff00]/20"
          />
        </div>
        <div className="flex items-center gap-2 sm:gap-4">
          {hiddenInvoiceIds.size > 0 && (
            <Button 
              variant="outline" 
              size="sm"
              onClick={handleRestoreAllHidden}
              className="gap-2 rounded-xl border-[#e8e8e8] hover:border-[#c8ff00] hover:bg-[#c8ff00]/10 flex-1 sm:flex-none"
            >
              <RotateCcw className="h-4 w-4" />
              <span className="hidden xs:inline">Show All</span> ({hiddenInvoiceIds.size})
            </Button>
          )}
          <Button variant="outline" size="sm" className="rounded-xl border-[#e8e8e8] hover:border-[#c8ff00] hover:bg-[#c8ff00]/10 flex-1 sm:flex-none">
            <Filter className="mr-2 h-4 w-4" />
            Filters
          </Button>
        </div>
      </div>

      {/* Invoice table */}
      <div className="rounded-[20px] border border-[#f1f1f1] dark:border-gray-700 bg-white dark:bg-gray-800 shadow-[0px_16px_24px_0px_rgba(0,0,0,0.06),0px_2px_6px_0px_rgba(0,0,0,0.04)] overflow-x-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-3 text-muted-foreground">Loading invoices...</span>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-12">
            <p className="text-destructive mb-2">Error loading invoices</p>
            <p className="text-sm text-muted-foreground">{error.message || "Please try again"}</p>
          </div>
        ) : filteredInvoices.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <p className="text-muted-foreground mb-4">
              {searchQuery ? "No invoices match your search" : 
               formattedInvoices.length > 0 && hiddenInvoiceIds.size > 0
                ? `${hiddenInvoiceIds.size} invoice${hiddenInvoiceIds.size !== 1 ? 's' : ''} ${hiddenInvoiceIds.size === 1 ? 'is' : 'are'} hidden. Click "Show All" above to restore ${hiddenInvoiceIds.size === 1 ? 'it' : 'them'}.`
                : "No invoices yet"}
            </p>
            {!searchQuery && formattedInvoices.length === 0 && (
              <Button asChild>
                <Link to="/app/invoices/new">
                  <Plus className="mr-2 h-4 w-4" />
                  Create Your First Invoice
                </Link>
              </Button>
            )}
            {!searchQuery && formattedInvoices.length > 0 && hiddenInvoiceIds.size > 0 && (
              <Button onClick={handleRestoreAllHidden} variant="outline">
                <RotateCcw className="mr-2 h-4 w-4" />
                Show All Hidden Invoices
              </Button>
            )}
          </div>
        ) : (
          <>
            {/* Mobile Card View */}
            <div className="md:hidden divide-y divide-[#f1f1f1] dark:divide-gray-700">
              {filteredInvoices.map((invoice) => (
                <motion.div
                  key={invoice.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="p-4"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <Link 
                        to={`/app/invoices/${invoice.invoiceId}`}
                        className="font-semibold text-primary hover:underline"
                      >
                        {invoice.id}
                      </Link>
                      {addresses.InvoiceNFT && (
                        <div className="mt-1">
                          <InvoiceNFTBadge invoiceId={invoice.invoiceId} />
                        </div>
                      )}
                    </div>
                    <StatusBadge status={invoice.status}>
                      {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
                    </StatusBadge>
                  </div>
                  
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-[#aeaeae]">Buyer</span>
                      <span className="font-mono text-[#404040] dark:text-white">
                        {invoice.buyer.slice(0, 6)}...{invoice.buyer.slice(-4)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#aeaeae]">Amount</span>
                      <span className="font-semibold text-[#1a1a1a] dark:text-white">
                        ${invoice.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#aeaeae]">Due Date</span>
                      <span className="text-[#696969] dark:text-gray-400">
                        {invoice.dueDate.toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 mt-4 pt-3 border-t border-[#f1f1f1] dark:border-gray-700">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyLink(invoice.link)}
                      className="flex-1 rounded-lg"
                    >
                      <Copy className="h-4 w-4 mr-2" />
                      Copy Link
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      asChild
                      className="flex-1 rounded-lg"
                    >
                      <Link to={`/app/invoices/${invoice.invoiceId}`}>
                        <Eye className="h-4 w-4 mr-2" />
                        View
                      </Link>
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="rounded-lg">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <a href={invoice.link} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="mr-2 h-4 w-4" />
                            Open Payment Page
                          </a>
                        </DropdownMenuItem>
                        {invoice.status === "issued" && (
                          <DropdownMenuItem className="text-primary" asChild>
                            <Link to={`/app/financing`}>
                              <Zap className="mr-2 h-4 w-4" />
                              Request Advance
                            </Link>
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem 
                          onClick={() => handleHideInvoice(invoice.invoiceId)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Hide Invoice
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Desktop Table View */}
            <table className="w-full hidden md:table">
              <thead>
                <tr className="border-b border-[#f1f1f1] dark:border-gray-700 bg-[#fafafa] dark:bg-gray-800/50">
                  <th className="px-6 py-4 text-left text-sm font-medium text-[#696969] dark:text-gray-400">
                    <div className="flex items-center gap-2">
                      Invoice
                      {addresses.InvoiceNFT && (
                        <span className="text-xs text-purple-600 dark:text-purple-400" title="Invoices are tokenized">
                          🎨 Tokenized
                        </span>
                      )}
                    </div>
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-medium text-[#696969] dark:text-gray-400">Buyer</th>
                  <th className="px-6 py-4 text-left text-sm font-medium text-[#696969] dark:text-gray-400">Amount</th>
                  <th className="px-6 py-4 text-left text-sm font-medium text-[#696969] dark:text-gray-400">Due Date</th>
                  <th className="px-6 py-4 text-left text-sm font-medium text-[#696969] dark:text-gray-400">Status</th>
                  <th className="px-6 py-4 text-right text-sm font-medium text-[#696969] dark:text-gray-400">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredInvoices.map((invoice) => (
                  <motion.tr
                    key={invoice.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="group transition-colors hover:bg-secondary/30"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Link 
                          to={`/app/invoices/${invoice.invoiceId}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {invoice.id}
                        </Link>
                        {addresses.InvoiceNFT && (
                          <InvoiceNFTBadge invoiceId={invoice.invoiceId} />
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div>
                        <p className="font-medium font-mono text-sm">
                          {invoice.buyer.slice(0, 6)}...{invoice.buyer.slice(-4)}
                        </p>
                        <p className="text-xs text-muted-foreground">{invoice.buyer}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-semibold number-display">
                        ${invoice.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">
                      {invoice.dueDate.toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={invoice.status}>
                        {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
                      </StatusBadge>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyLink(invoice.link)}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        {invoice.status === "issued" && (
                          <Button variant="ghost" size="sm" className="text-primary">
                            <Zap className="h-4 w-4" />
                          </Button>
                        )}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                              <Link to={`/app/invoices/${invoice.invoiceId}`}>
                                <Eye className="mr-2 h-4 w-4" />
                                View Details
                              </Link>
                            </DropdownMenuItem>
                            {/* PDF download button hidden for now */}
                            {false && <InvoicePDFDownloadButton invoice={invoice} />}
                            <DropdownMenuItem onClick={() => copyLink(invoice.link)}>
                              <Copy className="mr-2 h-4 w-4" />
                              Copy Link
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <a href={invoice.link} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="mr-2 h-4 w-4" />
                              Open Payment Page
                              </a>
                            </DropdownMenuItem>
                            {invoice.status === "issued" && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem className="text-primary" asChild>
                                  <Link to={`/app/financing`}>
                                    <Zap className="mr-2 h-4 w-4" />
                                    Request Advance
                                  </Link>
                                </DropdownMenuItem>
                              </>
                            )}
                            <DropdownMenuSeparator />
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <DropdownMenuItem 
                                  onSelect={(e) => e.preventDefault()}
                                  className="text-destructive focus:text-destructive"
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Hide Invoice
                                </DropdownMenuItem>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Hide Invoice?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This will hide the invoice from your list. The invoice still exists on-chain and cannot be permanently deleted. 
                                    You can view it again by clearing your browser's local storage.
                                    <br /><br />
                                    Invoice: <strong>{invoice.id}</strong>
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => handleHideInvoice(invoice.invoiceId)}
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  >
                                    Hide Invoice
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </motion.div>
  )
}

// Component to show NFT badge if invoice is tokenized
function InvoiceNFTBadge({ invoiceId }: { invoiceId: bigint }) {
  const { tokenId, isLoading } = useInvoiceNFT(invoiceId)
  
  if (isLoading || !tokenId || BigInt(tokenId) === 0n) {
    return null
  }
  
  return (
    <span 
      className="inline-flex items-center gap-1 rounded-full bg-purple-100 dark:bg-purple-900/30 px-2 py-0.5 text-xs font-medium text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-700"
      title="This invoice is tokenized"
    >
      <ImageIcon className="h-3 w-3" />
      Tokenized
    </span>
  )
}

// Component to handle PDF download with NFT token fetching
function InvoicePDFDownloadButton({ invoice }: { invoice: { invoiceId: bigint; buyer: string; amount: number; amountRaw?: bigint; seller?: string; dueDate: Date; createdDate: Date; paidAt?: bigint; clearedAt?: bigint; status: string; id: string } }) {
  const { tokenId, nftAddress } = useInvoiceNFT(invoice.invoiceId)
  
  return (
    <DropdownMenuItem 
      onClick={() => {
        try {
          // Get metadata from localStorage
          let metadata = { buyerName: '', buyerEmail: '', sellerName: '' }
          try {
            const stored = localStorage.getItem(`invoice_metadata_${invoice.invoiceId}`)
            if (stored) {
              metadata = JSON.parse(stored)
            }
          } catch (e) {
            console.log('No metadata found for invoice', invoice.invoiceId)
          }
          
          const statusNumber = invoice.status === 'issued' ? 0 
            : invoice.status === 'financed' ? 1
            : invoice.status === 'paid' ? 2
            : 3
          
          const paidAt = invoice.paidAt && invoice.paidAt > 0n
            ? new Date(Number(invoice.paidAt) * 1000)
            : undefined
          const clearedAt = invoice.clearedAt && invoice.clearedAt > 0n
            ? new Date(Number(invoice.clearedAt) * 1000)
            : undefined
          
          // Get chain-aware explorer URL (use chain-utils if needed)
          const explorerLink = tokenId && nftAddress && BigInt(tokenId) > 0n
            ? getPaymentLink(chainId, invoice.invoiceId)
            : undefined
          
          // Prepare line items for PDF if available
          const pdfLineItems = metadata.lineItems?.map((item: { description: string; quantity: number; rate: number }) => ({
            description: item.description || 'Item',
            quantity: item.quantity || 1,
            price: `$${item.rate?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}`,
            total: `$${((item.quantity || 1) * (item.rate || 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          })) || undefined

          // Get first line item description as main description, or use default
          const mainDescription = metadata.lineItems?.[0]?.description || metadata.memo || `Payment for ${invoice.id}`

          downloadInvoicePDF({
            invoiceId: invoice.invoiceId.toString(),
            sellerName: metadata.sellerName || 'Monaris Business',
            buyerName: metadata.buyerName || `${invoice.buyer.slice(0, 6)}...${invoice.buyer.slice(-4)}`,
            buyerEmail: metadata.buyerEmail || undefined,
            buyerAddress: invoice.buyer,
            sellerAddress: invoice.seller || '',
            amount: invoice.amountRaw || BigInt(Math.round(invoice.amount * 1e6)),
            amountFormatted: invoice.amount.toFixed(2),
            dueDate: invoice.dueDate,
            createdAt: invoice.createdDate,
            paidAt,
            clearedAt,
            status: invoice.status,
            statusNumber,
            statusLabel: invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1),
            invoiceNumber: invoice.id, // Already formatted as INV-000000
            description: mainDescription,
            lineItems: pdfLineItems,
            tokenId: tokenId && BigInt(tokenId) > 0n ? tokenId.toString() : undefined,
            nftAddress,
            explorerLink,
          })
          toast.success("Invoice PDF downloaded")
        } catch (error: any) {
          console.error("Error generating PDF:", error)
          toast.error("Failed to generate PDF", {
            description: error?.message || "Please try again"
          })
        }
      }}
    >
      <Download className="mr-2 h-4 w-4" />
      Download PDF
    </DropdownMenuItem>
  )
}
