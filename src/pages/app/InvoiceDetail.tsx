import { useState, useEffect, useRef, useCallback } from "react"
import { motion } from "framer-motion"
import { useParams, Link } from "react-router-dom"
import { 
  ArrowLeft, 
  CheckCircle2, 
  Clock, 
  ExternalLink,
  Copy,
  AlertCircle,
  Loader2,
  User,
  Calendar,
  FileText,
  Zap,
  Building2
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { StatusBadge } from "@/components/ui/status-badge"
import { useInvoice } from "@/hooks/useInvoice"
import { useAdvance } from "@/hooks/useAdvance"
import { usePrivyAccount } from "@/hooks/usePrivyAccount"
import { useInvoiceNFT } from "@/hooks/useInvoiceNFT"
import { useReputation } from "@/hooks/useReputation"
import { formatUnits } from "viem"
import { toast } from "sonner"
import { Image as ImageIcon, Sparkles, Shield, TrendingUp, Download } from "lucide-react"
import { useChainId } from "wagmi"
import { getPaymentLink, getExplorerAddressUrl } from "@/lib/chain-utils"
import { useChainAddresses } from "@/hooks/useChainAddresses"
import { supabase, isSupabaseConfigured } from "@/lib/supabase"
import { Edit } from "lucide-react"

const STATUS_LABELS: Record<number, string> = {
  0: "Issued",
  1: "Financed",
  2: "Paid",
  3: "Cleared",
}

const STATUS_COLORS: Record<number, string> = {
  0: "bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-400",
  1: "bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400",
  2: "bg-[#c8ff00]/15 text-[#5a8c1a] dark:bg-[#c8ff00]/10 dark:text-[#c8ff00]",
  3: "bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400",
}

export default function InvoiceDetail() {
  const { invoiceId } = useParams<{ invoiceId: string }>()
  const { invoice, isLoading: isLoadingInvoice, error } = useInvoice(invoiceId)
  const { advance, isLoading: isLoadingAdvance } = useAdvance(invoiceId ? BigInt(invoiceId) : undefined)
  const { address } = usePrivyAccount()
  const { tokenId, nftAddress, isLoading: isLoadingNFT } = useInvoiceNFT(invoiceId ? BigInt(invoiceId) : undefined)
  const { tierLabel } = useReputation()
  const chainId = useChainId()
  const addresses = useChainAddresses()

  const [supaMetadata, setSupaMetadata] = useState<{
    id?: string; buyer_name?: string; buyer_email?: string; memo?: string;
    line_items?: { description: string; quantity: number; rate: number }[];
    seller_name?: string; invoice_number?: string; is_draft?: boolean; status?: string;
  } | null>(null)

  useEffect(() => {
    if (!invoiceId || !isSupabaseConfigured()) return
    supabase
      .from('invoices')
      .select('id, buyer_name, buyer_email, memo, line_items, seller_name, invoice_number, is_draft, status')
      .eq('chain_invoice_id', Number(invoiceId))
      .eq('chain_id', chainId)
      .maybeSingle()
      .then(({ data }) => { if (data) setSupaMetadata(data) })
  }, [invoiceId, chainId])
  
  const invoiceRef = useRef<HTMLDivElement>(null)
  const [isDownloading, setIsDownloading] = useState(false)

  // APR map - Tier C uses fixed 18% APR
  const aprMap: Record<string, { min: number; max: number; fixed?: number }> = {
    A: { min: 6, max: 8 },
    B: { min: 8, max: 12 },
    C: { min: 15.25, max: 18, fixed: 18 },
  }
  const aprRange = aprMap[tierLabel] || { min: 8, max: 12 }
  const fixedApr = aprRange.fixed

  if (isLoadingInvoice) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (error || !invoice) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center space-y-4">
        <AlertCircle className="h-12 w-12 text-muted-foreground" />
        <h1 className="text-2xl font-bold">Invoice Not Found</h1>
        <p className="text-muted-foreground">This invoice does not exist or has been removed.</p>
        <Button asChild>
          <Link to="/app/invoices">Back to Invoices</Link>
        </Button>
      </div>
    )
  }

  const amount = parseFloat(formatUnits(invoice.amount, 6))
  const dueDate = new Date(Number(invoice.dueDate) * 1000)
  const createdAt = new Date(Number(invoice.createdAt) * 1000)
  const isPastDue = dueDate.getTime() < Date.now()
  const statusLabel = STATUS_LABELS[invoice.status] || "Unknown"
  const statusColor = STATUS_COLORS[invoice.status] || "bg-gray-100 text-gray-800"
  
  // Format dates
  const billDate = createdAt.toLocaleString('en-US', { 
    month: '2-digit', 
    day: '2-digit', 
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true 
  })
  const clearBillBefore = dueDate.toLocaleDateString('en-CA') // YYYY-MM-DD format
  
  // Calculate summary (simplified - using invoice amount as base)
  const subtotal = amount
  const tax = 0 // No tax stored on-chain
  const discount = 0 // No discount stored on-chain
  const totalAmount = subtotal + tax - discount

  const copyPaymentLink = () => {
    if (!invoice?.invoiceId) return
    const link = getPaymentLink(chainId, invoice.invoiceId)
    navigator.clipboard.writeText(link)
    toast.success("Payment link copied to clipboard!")
  }

  // Get seller address (from invoice)
  const sellerAddress = invoice.seller
  const buyerAddress = invoice.buyer
  
  // Get invoice metadata from localStorage (stored when invoice was created)
  // Includes: buyerName, buyerEmail, memo, lineItems
  const getInvoiceMetadata = () => {
    if (supaMetadata) {
      return {
        buyerName: supaMetadata.buyer_name || '',
        buyerEmail: supaMetadata.buyer_email || '',
        memo: supaMetadata.memo || '',
        lineItems: supaMetadata.line_items || [],
        sellerName: supaMetadata.seller_name || '',
        invoiceNumber: supaMetadata.invoice_number || '',
      }
    }
    try {
      const stored = localStorage.getItem(`invoice_metadata_${invoice.invoiceId}`)
      if (stored) return JSON.parse(stored)
    } catch (e) {
      console.error('Error reading invoice metadata:', e)
    }
    return { buyerName: '', buyerEmail: '', memo: '', lineItems: [], sellerName: '', invoiceNumber: '' }
  }
  
  const invoiceMetadata = getInvoiceMetadata()
  const buyerName = invoiceMetadata.buyerName || ''
  const buyerEmail = invoiceMetadata.buyerEmail || ''
  const memo = invoiceMetadata.memo || ''
  const lineItems = invoiceMetadata.lineItems || []
  const sellerDisplayName = invoiceMetadata.sellerName || 'Monaris Protocol'

  const handleDownloadPDF = useCallback(async () => {
    if (!invoiceRef.current) return
    setIsDownloading(true)
    try {
      const html2canvas = (await import('html2canvas')).default
      const jsPDF = (await import('jspdf')).default

      const el = invoiceRef.current
      const canvas = await html2canvas(el, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
      })

      const imgData = canvas.toDataURL('image/png')
      const imgWidth = canvas.width
      const imgHeight = canvas.height

      const pdfWidth = 595.28 // A4 width in pt
      const pdfHeight = 841.89 // A4 height in pt
      const ratio = pdfWidth / imgWidth
      const scaledHeight = imgHeight * ratio

      const doc = new jsPDF({
        orientation: scaledHeight > pdfHeight ? 'portrait' : 'portrait',
        unit: 'pt',
        format: scaledHeight > pdfHeight ? [pdfWidth, scaledHeight + 40] : 'a4',
      })

      doc.addImage(imgData, 'PNG', 0, 20, pdfWidth, scaledHeight)

      const invNum = invoiceMetadata.invoiceNumber || `INV-${invoice.invoiceId.toString().padStart(6, '0')}`
      doc.save(`${invNum}-${dueDate.toLocaleDateString('en-CA')}.pdf`)
      toast.success('Invoice PDF downloaded')
    } catch (err: any) {
      console.error('PDF generation failed:', err)
      toast.error('Failed to generate PDF')
    } finally {
      setIsDownloading(false)
    }
  }, [invoiceMetadata.invoiceNumber, invoice.invoiceId, dueDate])

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-3 sm:px-4 py-6 sm:py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          {/* Header with back button */}
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="icon" asChild>
              <Link to="/app/invoices">
                <ArrowLeft className="h-5 w-5" />
              </Link>
            </Button>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={copyPaymentLink}>
                <Copy className="mr-2 h-4 w-4" />
                Copy Link
              </Button>
              {supaMetadata?.id && (
                <Button variant="outline" size="sm" asChild>
                  <Link to={`/app/invoices/${supaMetadata.id}/edit`}>
                    <Edit className="mr-2 h-4 w-4" />
                    Edit
                  </Link>
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={handleDownloadPDF} disabled={isDownloading}>
                {isDownloading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                Download PDF
              </Button>
              <Button variant="outline" size="sm" asChild>
                <a
                  href={getExplorerAddressUrl(chainId, addresses.InvoiceRegistry || '')}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  View on Explorer
                </a>
              </Button>
            </div>
          </div>

          {/* Invoice Document */}
          <div ref={invoiceRef} className="rounded-xl border border-border bg-white dark:bg-card shadow-lg p-8 md:p-12">
            {/* Title */}
            <h1 className="text-3xl font-bold text-gray-900 dark:text-foreground mb-8">BILL DETAILS</h1>

            {/* Top Section: Bill Info + Seller Info */}
            <div className="grid md:grid-cols-2 gap-8 mb-8">
              {/* Left: Bill Information */}
              <div className="space-y-2">
                <div>
                  <p className="text-sm text-gray-600 dark:text-muted-foreground">Bill No:</p>
                  <p className="font-semibold text-gray-900 dark:text-foreground">
                    {invoiceMetadata.invoiceNumber || `INV-${invoice.invoiceId.toString().padStart(10, '0')}`}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 dark:text-muted-foreground">Bill Date:</p>
                  <p className="font-semibold text-gray-900 dark:text-foreground">{billDate}</p>
                </div>
                <div>
                  <p className="text-sm text-red-600 dark:text-red-400 font-medium">Clear Bill Before:</p>
                  <p className="font-semibold text-red-600 dark:text-red-400">{clearBillBefore}</p>
                </div>
              </div>

              {/* Right: Seller/Issuer Information */}
              <div className="text-right">
                <div className="flex items-center justify-end gap-3 mb-3">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <Building2 className="h-6 w-6 text-primary" />
                  </div>
                </div>
                <div className="space-y-1 text-sm text-gray-600 dark:text-muted-foreground">
                  <p className="font-medium text-gray-900 dark:text-foreground">{sellerDisplayName}</p>
                  <p className="font-mono text-xs break-all">{sellerAddress.slice(0, 6)}...{sellerAddress.slice(-4)}</p>
                  <p className="font-mono text-xs break-all">{sellerAddress}</p>
                </div>
              </div>
            </div>

            {/* Bill To Section */}
            <div className="mb-8">
              <h2 className="text-lg font-bold text-gray-900 dark:text-foreground mb-3">Bill To:</h2>
              <div className="border-l-4 border-primary bg-blue-50 dark:bg-blue-950/20 p-4 rounded-r-lg">
                {buyerName ? (
                  <>
                    <p className="font-bold text-lg text-gray-900 dark:text-foreground mb-1">
                      {buyerName}
                    </p>
                    {buyerEmail && (
                      <p className="text-sm text-gray-600 dark:text-muted-foreground mb-2">
                        {buyerEmail}
                      </p>
                    )}
                    <p className="text-sm text-gray-600 dark:text-muted-foreground font-mono break-all">
                      {buyerAddress}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="font-bold text-lg text-gray-900 dark:text-foreground mb-1">
                      {buyerAddress.slice(0, 6)}...{buyerAddress.slice(-4)}
                    </p>
                    <p className="text-sm text-gray-600 dark:text-muted-foreground font-mono break-all">
                      {buyerAddress}
                    </p>
                  </>
                )}
              </div>

              {/* Tokenized Bill Info */}
              {nftAddress && (
                <div className="mt-4 border-l-4 border-[#c8ff00] bg-[#c8ff00]/8 dark:bg-[#c8ff00]/5 p-5 rounded-r-lg">
                  <div className="flex items-start gap-5">
                    <div className="flex-1 space-y-2.5">
                      <div className="flex items-center gap-3 flex-wrap">
                        <p className="text-base font-semibold text-[#5a8c1a] dark:text-[#c8ff00]">
                          Tokenized Bill Powered by Monaris
                        </p>
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#c8ff00]/15 dark:bg-[#c8ff00]/15 px-2.5 py-1 text-xs font-semibold text-[#7cb518] dark:text-[#c8ff00] border border-[#c8ff00]/30 dark:border-[#c8ff00]/30">
                          <Shield className="h-3 w-3" />
                          RWA
                        </span>
                      </div>
                      <p className="text-sm text-[#5a8c1a] dark:text-[#c8ff00]/90 leading-relaxed">
                        This invoice has been tokenized as an ERC721 NFT by Monaris, making it a tradeable Real-World Asset (RWA).
                      </p>
                    </div>
                    {tokenId && BigInt(tokenId) > 0n && (
                      <div className="flex-shrink-0">
                        <Button
                          variant="outline"
                          size="icon"
                          asChild
                          className="h-10 w-10 rounded-lg border-[#c8ff00]/40 dark:border-[#c8ff00]/30 bg-white dark:bg-[#c8ff00]/10 hover:bg-[#c8ff00]/15 dark:hover:bg-[#c8ff00]/15 hover:border-[#c8ff00]/50 dark:hover:border-[#c8ff00]/40 transition-all"
                          title="View on Explorer"
                          onClick={(e) => {
                            // On right-click or ctrl+click, copy ID instead
                            if (e.ctrlKey || e.metaKey) {
                              e.preventDefault()
                              navigator.clipboard.writeText(`${nftAddress}/${tokenId.toString()}`)
                              toast.success("NFT ID copied!")
                            }
                          }}
                        >
                          <a
                            href={`${getExplorerAddressUrl(chainId, nftAddress || '')}?a=${tokenId.toString()}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <ExternalLink className="h-4 w-4 text-[#7cb518] dark:text-[#c8ff00]" />
                          </a>
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Items Table */}
            <div className="mb-8 overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-blue-100 dark:bg-blue-900/30">
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 dark:text-foreground">Item / Service</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 dark:text-foreground">Description</th>
                    <th className="px-4 py-3 text-center text-sm font-semibold text-gray-900 dark:text-foreground">Quantity</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-gray-900 dark:text-foreground">Price</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-gray-900 dark:text-foreground">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {lineItems.length > 0 ? (
                    // Display actual line items from stored metadata
                    lineItems.map((item: { description: string; quantity: number; rate: number }, index: number) => (
                      <tr key={index}>
                        <td className="px-4 py-4 text-sm text-gray-900 dark:text-foreground font-medium">
                          {item.description || `Item ${index + 1}`}
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-600 dark:text-muted-foreground">
                          Payment for INV-{invoice.invoiceId.toString().padStart(6, '0')}
                        </td>
                        <td className="px-4 py-4 text-sm text-center text-gray-900 dark:text-foreground">
                          {item.quantity}
                        </td>
                        <td className="px-4 py-4 text-sm text-right text-gray-900 dark:text-foreground">
                          ${item.rate.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-4 text-sm text-right font-semibold text-gray-900 dark:text-foreground">
                          ${(item.quantity * item.rate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))
                  ) : (
                    // Fallback if no line items stored (legacy invoices)
                    <tr>
                      <td className="px-4 py-4 text-sm text-gray-900 dark:text-foreground font-medium">
                        Invoice Amount
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-600 dark:text-muted-foreground">
                        Payment for INV-{invoice.invoiceId.toString().padStart(6, '0')}
                      </td>
                      <td className="px-4 py-4 text-sm text-center text-gray-900 dark:text-foreground">1</td>
                      <td className="px-4 py-4 text-sm text-right text-gray-900 dark:text-foreground">
                        ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-4 text-sm text-right font-semibold text-gray-900 dark:text-foreground">
                        ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Memo Section */}
            {memo && (
              <div className="mb-6 p-4 bg-muted/50 rounded-lg border border-border">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-foreground mb-1">Memo / Notes</h3>
                <p className="text-sm text-gray-600 dark:text-muted-foreground">{memo}</p>
              </div>
            )}

            {/* Summary Section */}
            <div className="mb-8 flex justify-end">
              <div className="w-full md:w-80 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-muted-foreground">Subtotal:</span>
                  <span className="text-gray-900 dark:text-foreground font-medium">
                    ${subtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
                {tax > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600 dark:text-muted-foreground">Tax (18%):</span>
                    <span className="text-gray-900 dark:text-foreground font-medium">
                      ${tax.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                )}
                {discount > 0 && (
                  <div className="flex justify-between text-sm text-[#7cb518] dark:text-[#c8ff00]">
                    <span>Discount (5%):</span>
                    <span className="font-medium">
                      -${discount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                )}
                <div className="border-t border-border pt-2 mt-2">
                  <div className="flex justify-between">
                    <span className="text-lg font-bold text-gray-900 dark:text-foreground">Total Amount:</span>
                    <span className="text-lg font-bold text-gray-900 dark:text-foreground">
                      ${totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Payment Info Section */}
            <div className="border-t border-border pt-4">
              <h2 className="text-lg font-bold text-gray-900 dark:text-foreground mb-2">Payment Info:</h2>
              <div className="border-l-4 border-primary bg-blue-50 dark:bg-blue-950/20 p-3 rounded-r-lg">
                <p className="text-xs text-gray-400 dark:text-muted-foreground italic mb-1">Brand authorized digital signature</p>
                <div className="flex items-center gap-6 flex-wrap">
                  <div className="text-base font-bold text-gray-900 dark:text-foreground">Monaris Network</div>
                  <div className="flex items-center gap-2">
                    <p className="text-xs text-gray-600 dark:text-muted-foreground">Payment Status:</p>
                    {supaMetadata?.status === 'rejected' ? (
                      <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400">
                        Rejected
                      </span>
                    ) : (
                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColor}`}>
                        {statusLabel}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="text-xs text-gray-600 dark:text-muted-foreground">Due On:</p>
                    <p className="text-sm font-semibold text-gray-900 dark:text-foreground">{clearBillBefore}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Advance Information (if financed) */}
            {invoice.status === 1 && advance && (
              <div className="mt-6 p-4 bg-primary/5 border border-primary/20 rounded-lg">
                <div className="flex items-center gap-2 mb-3">
                  <Zap className="h-5 w-5 text-primary" />
                  <h3 className="font-semibold text-primary">Advance Information</h3>
                </div>
                {isLoadingAdvance ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm text-muted-foreground">Loading advance details...</span>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-3 gap-4 text-sm mb-4">
                      <div>
                        <p className="text-muted-foreground">Advance Amount</p>
                        <p className="font-semibold">
                          ${parseFloat(formatUnits(advance.advanceAmount, 6)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">Received upfront</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Total Repayment</p>
                        <p className="font-semibold text-orange-600 dark:text-orange-400">
                          {(() => {
                            const advanceAmount = parseFloat(formatUnits(advance.advanceAmount, 6))
                            let totalRepayment = parseFloat(formatUnits(advance.totalRepayment, 6))
                            
                            // Recalculate using fixed APR (18% for Tier C) if applicable
                            // Use the same formula as the contract: interest = principal * APR * (daysUntilDue / 365)
                            if (fixedApr) {
                              const requestedAtTimestamp = Number(advance.requestedAt)
                              const dueDateTimestamp = Number(invoice.dueDate)
                              const daysUntilDue = Math.max(0, Math.floor((dueDateTimestamp - requestedAtTimestamp) / 86400))
                              const principal = advanceAmount
                              const interest = (principal * fixedApr * daysUntilDue) / (100 * 365)
                              totalRepayment = principal + interest
                            }
                            
                            return `$${totalRepayment.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                          })()}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">Repaid on settlement</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Interest</p>
                        <p className="font-semibold">
                          {(() => {
                            const advanceAmount = parseFloat(formatUnits(advance.advanceAmount, 6))
                            let interest = parseFloat(formatUnits(advance.interest, 6))
                            
                            // Recalculate using fixed APR (18% for Tier C) if applicable
                            // Use the same formula as the contract: interest = principal * APR * (daysUntilDue / 365)
                            if (fixedApr) {
                              const requestedAtTimestamp = Number(advance.requestedAt)
                              const dueDateTimestamp = Number(invoice.dueDate)
                              const daysUntilDue = Math.max(0, Math.floor((dueDateTimestamp - requestedAtTimestamp) / 86400))
                              const principal = advanceAmount
                              interest = (principal * fixedApr * daysUntilDue) / (100 * 365)
                            }
                            
                            return `$${interest.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                          })()}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">Cost of financing</p>
                      </div>
                    </div>
                    {/* Settlement Explanation */}
                    <div className="mt-4 p-3 bg-blue-50/50 dark:bg-blue-950/10 border border-blue-200 dark:border-blue-800 rounded-lg">
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        <strong>How settlement works:</strong> When the buyer pays ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}, the system automatically:
                        <br />• Deducts protocol fee (~0.5%)
                        <br />• Repays the advance + interest to the vault (${(() => {
                          const advanceAmount = parseFloat(formatUnits(advance.advanceAmount, 6))
                          let totalRepayment = parseFloat(formatUnits(advance.totalRepayment, 6))
                          if (fixedApr) {
                            const requestedAtTimestamp = Number(advance.requestedAt)
                            const dueDateTimestamp = Number(invoice.dueDate)
                            const daysUntilDue = Math.max(0, Math.floor((dueDateTimestamp - requestedAtTimestamp) / 86400))
                            const principal = advanceAmount
                            const interest = (principal * fixedApr * daysUntilDue) / (100 * 365)
                            totalRepayment = principal + interest
                          }
                          return totalRepayment.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                        })()})
                        <br />• Sends the remainder to you
                      </p>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Payment Information (if paid/cleared) */}
            {invoice.status >= 2 && (
              <div className="mt-6 p-4 bg-[#c8ff00]/10 dark:bg-[#c8ff00]/10 border border-[#c8ff00]/30 dark:border-[#c8ff00]/20 rounded-lg">
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle2 className="h-5 w-5 text-[#7cb518] dark:text-[#c8ff00]" />
                  <h3 className="font-semibold text-[#5a8c1a] dark:text-[#c8ff00]">Payment Information</h3>
                </div>
                <div className="space-y-2 text-sm">
                  {invoice.paidAt > 0n && (
                    <div>
                      <p className="text-muted-foreground">Paid At:</p>
                      <p className="font-semibold">
                        {new Date(Number(invoice.paidAt) * 1000).toLocaleString()}
                      </p>
                    </div>
                  )}
                  {invoice.clearedAt > 0n && (
                    <div>
                      <p className="text-muted-foreground">Cleared At:</p>
                      <p className="font-semibold">
                        {new Date(Number(invoice.clearedAt) * 1000).toLocaleString()}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}


            {/* Payment Link Section - Prominent for sharing with buyer */}
            {invoice.status < 2 && (
              <div className="mt-6 rounded-xl border-2 border-primary/30 bg-primary/5 p-4">
                <h3 className="text-lg font-semibold text-primary mb-3">Share Payment Link with Buyer</h3>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-0 rounded-md bg-background px-3 py-2 border border-border overflow-x-auto">
                      <p className="text-sm font-mono text-foreground whitespace-nowrap">
                        {getPaymentLink(chainId, invoice.invoiceId)}
                      </p>
                    </div>
                    <Button
                      variant="default"
                      size="icon"
                      onClick={copyPaymentLink}
                      className="flex-shrink-0 h-10 w-10"
                      title="Copy Payment Link"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    asChild
                    className="w-full"
                  >
                    <a
                      href={getPaymentLink(chainId, invoice.invoiceId)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Open Link
                    </a>
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-4">
            {invoice.status === 0 && (
              <Button variant="default" className="gap-2" asChild>
                <Link to="/app/financing">
                  <Zap className="h-4 w-4" />
                  Request Advance
                </Link>
              </Button>
            )}
            <Button variant="outline" className="gap-2" asChild>
              <a
                href={getPaymentLink(chainId, invoice.invoiceId)}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="h-4 w-4" />
                View Payment Page
              </a>
            </Button>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
