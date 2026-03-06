import { motion } from "framer-motion"
import { useState, useEffect } from "react"
import { useNavigate, useParams, Link } from "react-router-dom"
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
  Save,
  Lock,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "sonner"
import {
  useSupabaseInvoice,
  saveDraftInvoice,
  publishDraftOnChain,
  useCreateInvoice,
  SupabaseInvoice,
} from "@/hooks/useInvoice"
import { usePrivyAccount } from "@/hooks/usePrivyAccount"
import { useChainId } from "wagmi"
import { usePrivy, useWallets } from "@privy-io/react-auth"
import { isAddress, decodeEventLog } from "viem"
import { InvoiceRegistryABI } from "@/lib/abis"
import { supabase, isSupabaseConfigured } from "@/lib/supabase"

interface LineItem {
  id: string
  description: string
  quantity: number
  rate: number
}

export default function EditInvoice() {
  const navigate = useNavigate()
  const { invoiceId } = useParams<{ invoiceId: string }>()
  const { invoice, isLoading: isLoadingInvoice, error: loadError, refetch } = useSupabaseInvoice(invoiceId)
  const { address } = usePrivyAccount()
  const chainId = useChainId()
  const { authenticated, ready, login } = usePrivy()
  const { wallets } = useWallets()
  const { createInvoice, isPending, isConfirming, isSuccess, error: txError, hash, receipt } = useCreateInvoice()

  const [isSaving, setIsSaving] = useState(false)
  const [isPublishing, setIsPublishing] = useState(false)
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { id: "1", description: "", quantity: 1, rate: 0 },
  ])
  const [formData, setFormData] = useState({
    buyerAddress: "",
    buyerName: "",
    buyerEmail: "",
    dueDate: "",
    memo: "",
    sellerName: "",
    invoiceNumber: "",
  })

  const isDraft = invoice?.is_draft ?? true
  const isPublished = !isDraft

  useEffect(() => {
    if (!invoice) return
    setFormData({
      buyerAddress: invoice.buyer_address || "",
      buyerName: invoice.buyer_name || "",
      buyerEmail: invoice.buyer_email || "",
      dueDate: invoice.due_date ? new Date(invoice.due_date).toISOString().split("T")[0] : "",
      memo: invoice.memo || "",
      sellerName: invoice.seller_name || "",
      invoiceNumber: invoice.invoice_number || "",
    })
    if (invoice.line_items && invoice.line_items.length > 0) {
      setLineItems(
        invoice.line_items.map((item, i) => ({
          id: String(i + 1),
          description: item.description || "",
          quantity: item.quantity || 1,
          rate: item.rate || 0,
        }))
      )
    }
  }, [invoice])

  const totalAmount = lineItems.reduce((sum, item) => sum + item.quantity * item.rate, 0)

  const addLineItem = () => {
    setLineItems([...lineItems, { id: Date.now().toString(), description: "", quantity: 1, rate: 0 }])
  }

  const removeLineItem = (id: string) => {
    if (lineItems.length > 1) setLineItems(lineItems.filter((item) => item.id !== id))
  }

  const updateLineItem = (id: string, field: keyof LineItem, value: string | number) => {
    setLineItems(lineItems.map((item) => (item.id === id ? { ...item, [field]: value } : item)))
  }

  const handleSave = async () => {
    if (!invoiceId || !address) return
    setIsSaving(true)
    try {
      await saveDraftInvoice({
        id: invoiceId,
        chain_id: chainId,
        seller_address: address,
        buyer_address: formData.buyerAddress || "0x0000000000000000000000000000000000000000",
        amount: totalAmount,
        due_date: formData.dueDate ? new Date(formData.dueDate).toISOString() : new Date().toISOString(),
        buyer_name: formData.buyerName || undefined,
        buyer_email: formData.buyerEmail || undefined,
        memo: formData.memo || undefined,
        line_items: lineItems.map((item) => ({
          description: item.description,
          quantity: item.quantity,
          rate: item.rate,
        })),
        seller_name: formData.sellerName || undefined,
        invoice_number: formData.invoiceNumber || undefined,
      })
      toast.success("Changes saved!")
      refetch()
    } catch (err: any) {
      toast.error("Failed to save", { description: err?.message })
    } finally {
      setIsSaving(false)
    }
  }

  const handlePublish = async () => {
    if (!invoiceId || !address) return
    if (!formData.buyerAddress || !isAddress(formData.buyerAddress)) {
      toast.error("Invalid buyer address")
      return
    }
    if (!formData.dueDate) {
      toast.error("Due date required")
      return
    }
    if (totalAmount <= 0) {
      toast.error("Amount must be greater than 0")
      return
    }

    setIsPublishing(true)
    try {
      await handleSave()
      const dueDateTimestamp = Math.floor(new Date(formData.dueDate).getTime() / 1000)
      const result = await createInvoice(
        formData.buyerAddress,
        totalAmount.toString(),
        dueDateTimestamp,
      )
      if (result?.hash) {
        toast.info("Transaction submitted, waiting for confirmation...")
      }
    } catch (err: any) {
      toast.error("Failed to publish", { description: err?.message })
      setIsPublishing(false)
    }
  }

  useEffect(() => {
    if (!(hash && isSuccess && receipt && invoiceId)) return
    const finalize = async () => {
      let onChainId: number | null = null
      try {
        for (const log of receipt.logs || []) {
          try {
            const decoded = decodeEventLog({ abi: InvoiceRegistryABI, data: log.data, topics: log.topics })
            if (decoded.eventName === "InvoiceCreated") {
              onChainId = Number((decoded.args as any).invoiceId)
              break
            }
          } catch {}
        }
      } catch {}

      if (onChainId != null) {
        await publishDraftOnChain(invoiceId, onChainId, hash)
        if (isSupabaseConfigured()) {
          await supabase.from("notifications").insert({
            recipient_address: formData.buyerAddress.toLowerCase(),
            type: "invoice_created",
            title: "New Invoice",
            message: `You have a new invoice for $${totalAmount.toFixed(2)} due ${new Date(formData.dueDate).toLocaleDateString()}`,
            invoice_id: invoiceId,
            chain_invoice_id: onChainId,
            chain_id: chainId,
          })
        }
      }
      toast.success("Invoice sent!", { description: "Published on-chain and buyer notified." })
      setIsPublishing(false)
      navigate("/app/invoices")
    }
    finalize().catch(console.error)
  }, [hash, isSuccess, receipt, invoiceId])

  if (isLoadingInvoice) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (loadError || !invoice) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <p className="text-muted-foreground">Invoice not found</p>
        <Button asChild>
          <Link to="/app/invoices">Back to Invoices</Link>
        </Button>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto max-w-3xl space-y-6 px-3 sm:px-4 md:px-0"
    >
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" className="rounded-xl hover:bg-[#c8ff00]/10" asChild>
          <Link to="/app/invoices">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div>
          <h1 className="text-[32px] font-semibold text-[#404040] dark:text-white tracking-tight">
            Edit Invoice
          </h1>
          <p className="text-[#aeaeae] text-base mt-1">
            {isDraft ? "Edit your draft and send when ready" : "Edit metadata (amount locked on-chain)"}
          </p>
          {isDraft && (
            <span className="inline-flex items-center mt-1 px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-xs font-medium text-amber-700 dark:text-amber-300">
              Draft
            </span>
          )}
        </div>
      </div>

      <div className="space-y-5">
        {/* Buyer details */}
        <div className="rounded-[20px] border border-[#f1f1f1] dark:border-gray-700 bg-white dark:bg-gray-800 p-6 shadow-[0px_16px_24px_0px_rgba(0,0,0,0.06),0px_2px_6px_0px_rgba(0,0,0,0.04)]">
          <h2 className="mb-4 text-lg font-semibold text-[#1a1a1a] dark:text-white">Buyer Details</h2>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="buyerAddress">
                <User className="mr-2 inline h-4 w-4" />
                Buyer Wallet Address {isDraft && <span className="text-destructive">*</span>}
                {isPublished && <Lock className="ml-1 inline h-3 w-3 text-muted-foreground" />}
              </Label>
              <Input
                id="buyerAddress"
                placeholder="0x..."
                value={formData.buyerAddress}
                onChange={(e) => setFormData({ ...formData, buyerAddress: e.target.value })}
                disabled={isPublished}
                className={`font-mono ${isPublished ? "opacity-60" : ""}`}
              />
              {isPublished && (
                <p className="text-xs text-muted-foreground">Locked on-chain</p>
              )}
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="buyerName">Buyer Name</Label>
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
                  Email
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
          <div className="space-y-4">
            {lineItems.map((item) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="relative rounded-lg border border-border/50 bg-secondary/30 p-4 md:border-0 md:bg-transparent md:p-0"
              >
                <div className="grid gap-4 md:grid-cols-[1fr_100px_120px_40px] items-end">
                  <div className="space-y-2">
                    <Label className="text-sm">
                      <FileText className="mr-2 inline h-4 w-4" />
                      Description
                    </Label>
                    <Input
                      placeholder="Service or product"
                      value={item.description}
                      onChange={(e) => updateLineItem(item.id, "description", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm">Qty</Label>
                    <Input
                      type="number"
                      min="1"
                      value={item.quantity}
                      onChange={(e) => updateLineItem(item.id, "quantity", parseInt(e.target.value) || 1)}
                      disabled={isPublished}
                      className={isPublished ? "opacity-60" : ""}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm">
                      <DollarSign className="mr-2 inline h-4 w-4" />
                      $ Rate {isPublished && <Lock className="ml-1 inline h-3 w-3 text-muted-foreground" />}
                    </Label>
                    <div className="flex gap-2 items-center">
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        value={item.rate || ""}
                        onChange={(e) => updateLineItem(item.id, "rate", parseFloat(e.target.value) || 0)}
                        disabled={isPublished}
                        className={`flex-1 ${isPublished ? "opacity-60" : ""}`}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeLineItem(item.id)}
                        disabled={lineItems.length === 1 || isPublished}
                        className="flex-shrink-0 md:hidden text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeLineItem(item.id)}
                    disabled={lineItems.length === 1 || isPublished}
                    className="hidden md:flex text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </motion.div>
            ))}
          </div>

          {isDraft && (
            <Button type="button" variant="outline" size="sm" className="mt-4 w-full md:w-auto" onClick={addLineItem}>
              <Plus className="mr-2 h-4 w-4" />
              Add Line Item
            </Button>
          )}

          <div className="mt-6 flex justify-end border-t border-[#f1f1f1] dark:border-gray-700 pt-4">
            <div className="text-right w-full md:w-auto">
              <p className="text-sm text-[#aeaeae]">Total Amount {isPublished && "(locked on-chain)"}</p>
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
          <div className="grid gap-4 md:grid-cols-2 mb-4">
            <div className="space-y-2">
              <Label htmlFor="sellerName">Seller / Business Name</Label>
              <Input
                id="sellerName"
                placeholder="Your business name"
                value={formData.sellerName}
                onChange={(e) => setFormData({ ...formData, sellerName: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invoiceNumber">Invoice Number</Label>
              <Input
                id="invoiceNumber"
                placeholder="INV-0001"
                value={formData.invoiceNumber}
                onChange={(e) => setFormData({ ...formData, invoiceNumber: e.target.value })}
              />
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="dueDate">
                <Calendar className="mr-2 inline h-4 w-4" />
                Due Date {isPublished && <Lock className="ml-1 inline h-3 w-3 text-muted-foreground" />}
              </Label>
              <Input
                id="dueDate"
                type="date"
                value={formData.dueDate}
                onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                disabled={isPublished}
                className={isPublished ? "opacity-60" : ""}
              />
              {isPublished && <p className="text-xs text-muted-foreground">Locked on-chain</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="currency">Currency</Label>
              <Input id="currency" value="USDC" disabled className="bg-secondary/50" />
            </div>
          </div>
          <div className="mt-3 space-y-2">
            <Label htmlFor="memo">Memo</Label>
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
            {isDraft && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isSaving}
                  onClick={handleSave}
                  className="flex-shrink-0 rounded-xl border-[#e8e8e8] hover:border-[#c8ff00] hover:bg-[#c8ff00]/10"
                >
                  {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  {isSaving ? "Saving..." : "Save Draft"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={isPublishing || isPending || isConfirming || totalAmount === 0 || !address}
                  onClick={handlePublish}
                  className="flex-shrink-0 bg-[#c8ff00] hover:bg-[#b8ef00] text-[#1a1a1a] font-semibold rounded-xl"
                >
                  {isPublishing || isPending || isConfirming ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {isPending ? "Waiting..." : isConfirming ? "Confirming..." : "Publishing..."}
                    </>
                  ) : (
                    <>
                      <Check className="mr-2 h-4 w-4" />
                      Send Invoice
                    </>
                  )}
                </Button>
              </>
            )}
            {isPublished && (
              <Button
                type="button"
                size="sm"
                disabled={isSaving}
                onClick={handleSave}
                className="flex-shrink-0 bg-[#c8ff00] hover:bg-[#b8ef00] text-[#1a1a1a] font-semibold rounded-xl"
              >
                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                {isSaving ? "Saving..." : "Save Changes"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  )
}
