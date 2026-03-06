import jsPDF from 'jspdf'
import { formatUnits } from 'viem'

export interface InvoicePDFData {
  invoiceId: string
  sellerName: string
  buyerName: string
  buyerEmail?: string
  buyerAddress?: string
  sellerAddress?: string
  amount: bigint | string
  amountFormatted: string
  dueDate: Date
  createdAt: Date
  paidAt?: Date
  clearedAt?: Date
  status: string
  statusNumber?: number // 0=Issued, 1=Financed, 2=Paid, 3=Cleared
  statusLabel: string
  invoiceNumber?: string
  description?: string
  tokenId?: string
  nftAddress?: string
  explorerLink?: string
  lineItems?: Array<{
    description: string
    quantity?: number
    price?: string
    total?: string
  }>
}

// Color tokens matching the design specification
const COLORS = {
  text: [16, 24, 32],              // #101820
  mutedText: [107, 114, 128],      // #6B7280
  border: [229, 231, 235],         // #E5E7EB
  lightBlueCard: [247, 250, 254],  // #F7FAFE
  infoStrip: [241, 246, 254],      // #F1F6FE
  tableHeader: [234, 242, 255],    // #EAF2FF
  greenAccent: [124, 181, 24],     // #7CB518 (Monaris dark lime)
  greenIconBg: [245, 255, 220],    // #F5FFDC (light lime tint)
  successBox: [250, 255, 240],     // #FAFFF0 (very light lime)
  redDate: [201, 58, 50],          // #C93A32
  purplePillBg: [240, 236, 253],   // #F0ECFD
  purplePillText: [96, 32, 160],   // #6020A0
  white: [255, 255, 255],
}

export function generateInvoicePDF(data: InvoicePDFData) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'letter',
  })
  
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 40
  const contentWidth = pageWidth - (margin * 2)
  const maxContentWidth = 1100 // Max width ~1100-1200px as per spec
  
  let yPos = margin
  
  // Title: BILL DETAILS
  doc.setFontSize(32)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(COLORS.text[0], COLORS.text[1], COLORS.text[2])
  doc.text('BILL DETAILS', margin, yPos)
  yPos += 40
  
  // Top section: 2 columns
  const leftStart = margin
  const rightStart = margin + 600
  
  // LEFT COLUMN: Bill information
  doc.setFontSize(11)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(COLORS.mutedText[0], COLORS.mutedText[1], COLORS.mutedText[2])
  doc.text('Bill No:', leftStart, yPos)
  doc.text('Bill Date:', leftStart, yPos + 18)
  doc.text('Clear Bill Before:', leftStart, yPos + 36)
  
  // Extract invoice number
  const invoiceNum = data.invoiceNumber 
    ? (data.invoiceNumber.includes('INV-') ? data.invoiceNumber : `INV-${data.invoiceNumber}`)
    : `INV-${data.invoiceId.padStart(10, '0')}`
  
  // Bill No value (bold)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(COLORS.text[0], COLORS.text[1], COLORS.text[2])
  doc.text(invoiceNum, leftStart + 80, yPos)
  
  // Bill Date value
  doc.setFont('helvetica', 'normal')
  const billDateStr = data.createdAt.toLocaleString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  })
  doc.text(billDateStr, leftStart + 80, yPos + 18)
  
  // Clear Bill Before (red)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(COLORS.redDate[0], COLORS.redDate[1], COLORS.redDate[2])
  const clearBillDate = data.dueDate.toLocaleDateString('en-CA') // YYYY-MM-DD
  doc.text(clearBillDate, leftStart + 110, yPos + 36)
  
  // RIGHT COLUMN: Monaris Protocol
  const iconSize = 24
  const iconX = rightStart
  const iconY = yPos - 8
  
  // Green circular icon background
  doc.setFillColor(COLORS.greenIconBg[0], COLORS.greenIconBg[1], COLORS.greenIconBg[2])
  doc.circle(iconX + iconSize / 2, iconY, iconSize / 2, 'F')
  
  // Document icon (simplified as small rectangle)
  doc.setFillColor(COLORS.greenAccent[0], COLORS.greenAccent[1], COLORS.greenAccent[2])
  doc.roundedRect(iconX + 6, iconY - 6, 12, 16, 1, 1, 'F')
  
  // Monaris Protocol text
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(COLORS.text[0], COLORS.text[1], COLORS.text[2])
  doc.text('Monaris Protocol', iconX, yPos + 20)
  
  // Short address
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(COLORS.mutedText[0], COLORS.mutedText[1], COLORS.mutedText[2])
  if (data.sellerAddress) {
    const truncated = `${data.sellerAddress.slice(0, 6)}...${data.sellerAddress.slice(-4)}`
    doc.text(truncated, iconX, yPos + 35)
    // Full address
    doc.setFontSize(8)
    doc.setFont('courier', 'normal')
    doc.text(data.sellerAddress, iconX, yPos + 50, { maxWidth: 180 })
  }
  
  yPos += 80
  
  // Bill To section
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(COLORS.text[0], COLORS.text[1], COLORS.text[2])
  doc.text('Bill To:', leftStart, yPos)
  yPos += 25
  
  // Light blue card with green accent bar
  const cardHeight = 70
  doc.setFillColor(COLORS.lightBlueCard[0], COLORS.lightBlueCard[1], COLORS.lightBlueCard[2])
  doc.roundedRect(leftStart, yPos - cardHeight + 20, contentWidth, cardHeight, 4, 4, 'F')
  
  // Green accent bar on left
  doc.setFillColor(COLORS.greenAccent[0], COLORS.greenAccent[1], COLORS.greenAccent[2])
  doc.rect(leftStart, yPos - cardHeight + 20, 4, cardHeight, 'F')
  
  // Bill To content
  const cardContentY = yPos - cardHeight + 35
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(COLORS.text[0], COLORS.text[1], COLORS.text[2])
  doc.text(data.buyerName, leftStart + 15, cardContentY)
  
  if (data.buyerEmail) {
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(COLORS.mutedText[0], COLORS.mutedText[1], COLORS.mutedText[2])
    doc.text(data.buyerEmail, leftStart + 15, cardContentY + 18)
  }
  
  if (data.buyerAddress) {
    doc.setFontSize(9)
    doc.setFont('courier', 'normal')
    doc.setTextColor(COLORS.mutedText[0], COLORS.mutedText[1], COLORS.mutedText[2])
    doc.text(data.buyerAddress, leftStart + 15, cardContentY + 35, { maxWidth: contentWidth - 30 })
  }
  
  yPos += 20
  
  // Tokenized strip
  if (data.tokenId && data.nftAddress) {
    const stripHeight = 50
    doc.setFillColor(COLORS.infoStrip[0], COLORS.infoStrip[1], COLORS.infoStrip[2])
    doc.roundedRect(leftStart, yPos, contentWidth, stripHeight, 4, 4, 'F')
    
    // Green left border
    doc.setFillColor(COLORS.greenAccent[0], COLORS.greenAccent[1], COLORS.greenAccent[2])
    doc.rect(leftStart, yPos, 4, stripHeight, 'F')
    
    // Tokenized Bill Powered by Monaris
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(COLORS.greenAccent[0], COLORS.greenAccent[1], COLORS.greenAccent[2])
    doc.text('Tokenized Bill Powered by Monaris', leftStart + 15, yPos + 18)
    
    // RWA Badge (pill)
    const badgeX = leftStart + 220
    const badgeY = yPos + 8
    doc.setFillColor(COLORS.greenAccent[0] - 30, COLORS.greenAccent[1] + 30, COLORS.greenAccent[2] - 10)
    doc.roundedRect(badgeX, badgeY, 25, 14, 7, 7, 'F')
    doc.setFontSize(8)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(COLORS.greenAccent[0], COLORS.greenAccent[1], COLORS.greenAccent[2])
    doc.text('RWA', badgeX + 8, badgeY + 10)
    
    // Description
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(COLORS.mutedText[0], COLORS.mutedText[1], COLORS.mutedText[2])
    doc.text(
      'This invoice has been tokenized as an ERC721 NFT by Monaris, making it a tradeable Real-World Asset (RWA).',
      leftStart + 15,
      yPos + 35,
      { maxWidth: 350 }
    )
    
    // Right side buttons (as text links in PDF)
    const buttonX = leftStart + contentWidth - 160
    if (data.explorerLink) {
      // View Explorer link
      doc.setFontSize(9)
      doc.setTextColor(COLORS.greenAccent[0], COLORS.greenAccent[1], COLORS.greenAccent[2])
      doc.text('View Explorer', buttonX, yPos + 18, {
        link: data.explorerLink,
        underlined: true
      })
      
      // Copy ID (show token ID)
      doc.setFontSize(8)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(COLORS.mutedText[0], COLORS.mutedText[1], COLORS.mutedText[2])
      doc.text(`Token ID: ${data.tokenId}`, buttonX, yPos + 35)
    }
    
    yPos += stripHeight + 20
  }
  
  // Items table
  yPos += 10
  
  // Table header
  doc.setFillColor(COLORS.tableHeader[0], COLORS.tableHeader[1], COLORS.tableHeader[2])
  doc.rect(leftStart, yPos - 5, contentWidth, 25, 'F')
  
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(COLORS.text[0], COLORS.text[1], COLORS.text[2])
  doc.text('Item / Service', leftStart + 5, yPos + 8)
  doc.text('Description', leftStart + 150, yPos + 8)
  doc.text('Quantity', leftStart + 400, yPos + 8)
  doc.text('Price', leftStart + 480, yPos + 8)
  doc.text('Total', leftStart + 560, yPos + 8)
  
  yPos += 15
  
  // Table rows
  const items = data.lineItems && data.lineItems.length > 0 
    ? data.lineItems 
    : [{
        description: data.description || `Payment for ${invoiceNum.replace('INV-', 'INV-')}`,
        quantity: 1,
        price: data.amountFormatted,
        total: data.amountFormatted
      }]
  
  items.forEach((item) => {
    yPos += 20
    if (yPos > pageHeight - 150) {
      doc.addPage()
      yPos = margin + 20
    }
    
    // Row border
    doc.setDrawColor(COLORS.border[0], COLORS.border[1], COLORS.border[2])
    doc.line(leftStart, yPos - 5, leftStart + contentWidth, yPos - 5)
    
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(COLORS.text[0], COLORS.text[1], COLORS.text[2])
    
    doc.text('Invoice Amount', leftStart + 5, yPos + 8)
    const paymentDesc = item.description || `Payment for ${invoiceNum.replace('INV-', 'INV-')}`
    doc.text(paymentDesc, leftStart + 150, yPos + 8, { maxWidth: 240 })
    doc.text(String(item.quantity || 1), leftStart + 400, yPos + 8)
    doc.text(`$${item.price || data.amountFormatted}`, leftStart + 480, yPos + 8)
    doc.setFont('helvetica', 'bold')
    doc.text(`$${item.total || data.amountFormatted}`, leftStart + 560, yPos + 8)
  })
  
  yPos += 25
  
  // Totals (right-aligned)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(COLORS.text[0], COLORS.text[1], COLORS.text[2])
  
  if (items.length > 1) {
    doc.text('Subtotal:', leftStart + contentWidth - 120, yPos)
    doc.text(`$${data.amountFormatted}`, leftStart + contentWidth - 20, yPos)
    yPos += 20
  }
  
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.text('Total Amount:', leftStart + contentWidth - 130, yPos)
  doc.text(`$${data.amountFormatted}`, leftStart + contentWidth - 20, yPos)
  
  yPos += 40
  
  // Payment Info section
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(COLORS.text[0], COLORS.text[1], COLORS.text[2])
  doc.text('Payment Info:', leftStart, yPos)
  yPos += 30
  
  // Payment Info strip (light bluish with green accent)
  const paymentStripHeight = 60
  doc.setFillColor(COLORS.infoStrip[0], COLORS.infoStrip[1], COLORS.infoStrip[2])
  doc.roundedRect(leftStart, yPos, contentWidth, paymentStripHeight, 4, 4, 'F')
  
  // Green accent bar
  doc.setFillColor(COLORS.greenAccent[0], COLORS.greenAccent[1], COLORS.greenAccent[2])
  doc.rect(leftStart, yPos, 4, paymentStripHeight, 'F')
  
  // Brand authorized digital signature (small italic text)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'italic')
  doc.setTextColor(COLORS.mutedText[0], COLORS.mutedText[1], COLORS.mutedText[2])
  doc.text('Brand authorized digital signature', leftStart + 15, yPos + 15)
  
  // Monaris Network
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(COLORS.text[0], COLORS.text[1], COLORS.text[2])
  doc.text('Monaris Network', leftStart + 15, yPos + 30)
  
  // Payment Status badge (purple pill)
  const statusBadgeX = leftStart + 200
  const statusBadgeY = yPos + 18
  const isCleared = data.statusNumber === 3 || data.statusLabel.toLowerCase() === 'cleared'
  if (isCleared) {
    doc.setFillColor(COLORS.purplePillBg[0], COLORS.purplePillBg[1], COLORS.purplePillBg[2])
    doc.roundedRect(statusBadgeX, statusBadgeY, 45, 18, 9, 9, 'F')
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(COLORS.purplePillText[0], COLORS.purplePillText[1], COLORS.purplePillText[2])
    doc.text('Cleared', statusBadgeX + 12, statusBadgeY + 12)
  }
  
  // Due On
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(COLORS.text[0], COLORS.text[1], COLORS.text[2])
  doc.text('Payment Status:', leftStart + 15, yPos + 50)
  if (!isCleared) {
    doc.text(data.statusLabel, statusBadgeX, yPos + 50)
  }
  doc.text('Due On:', leftStart + 350, yPos + 30)
  doc.text(clearBillDate, leftStart + 410, yPos + 30)
  
  yPos += paymentStripHeight + 20
  
  // Payment Information box (light green)
  if (data.paidAt || data.clearedAt) {
    const paymentBoxHeight = 60
    doc.setFillColor(COLORS.successBox[0], COLORS.successBox[1], COLORS.successBox[2])
    doc.setDrawColor(COLORS.greenAccent[0], COLORS.greenAccent[1], COLORS.greenAccent[2])
    doc.roundedRect(leftStart, yPos, contentWidth, paymentBoxHeight, 4, 4, 'FD')
    
    // Check circle icon (simplified as circle)
    doc.setFillColor(COLORS.greenAccent[0], COLORS.greenAccent[1], COLORS.greenAccent[2])
    doc.circle(leftStart + 20, yPos + 20, 8, 'F')
    doc.setFillColor(COLORS.white[0], COLORS.white[1], COLORS.white[2])
    doc.circle(leftStart + 20, yPos + 20, 5, 'F')
    
    // Payment Information title
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(COLORS.greenAccent[0], COLORS.greenAccent[1], COLORS.greenAccent[2])
    doc.text('✓ Payment Information', leftStart + 35, yPos + 25)
    
    // Paid At / Cleared At
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(COLORS.text[0], COLORS.text[1], COLORS.text[2])
    
    if (data.paidAt) {
      const paidAtStr = data.paidAt.toLocaleString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      })
      doc.text(`Paid At: ${paidAtStr}`, leftStart + 35, yPos + 45)
    }
    
    if (data.clearedAt) {
      const clearedAtStr = data.clearedAt.toLocaleString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      })
      doc.text(`Cleared At: ${clearedAtStr}`, leftStart + 250, yPos + 45)
    }
  }
  
  // Footer
  const footerY = pageHeight - margin
  doc.setFontSize(7)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(COLORS.mutedText[0], COLORS.mutedText[1], COLORS.mutedText[2])
  doc.text('Generated by Monaris - Powered by blockchain | Tokenized as ERC721 NFT on Arbitrum', margin, footerY - 10)
  doc.text(`Invoice ID: ${data.invoiceId}`, margin, footerY)
  
  // Generate filename
  const filename = `Invoice-${invoiceNum}-${data.createdAt.toISOString().split('T')[0]}.pdf`
  
  return { doc, filename }
}

export function downloadInvoicePDF(data: InvoicePDFData) {
  const { doc, filename } = generateInvoicePDF(data)
  doc.save(filename)
}
