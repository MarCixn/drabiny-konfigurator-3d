/**
 * PDF Generator Service for Ladder Calculator
 * Generates Bill of Materials (BOM) PDF documents
 * Style based on organizer_v2/zlecenie.php
 */

import { jsPDF } from 'jspdf'

export interface BOMItem {
  id: string
  name: string
  namePL: string
  quantity: number
  unit: string
  category: string
  details?: string
  image?: string  // Image filename for PDF
}

export interface LadderConfig {
  wallHeight: number
  scheme?: string
  cage?: string
  insulationThickness: number
  wspornikType: string
  wspornikDistance: number
  mountType?: string
  minDistance?: number
  lastRungToGround?: number  // Ostatni szczebel → ziemia (mm)
  lastCageToGround?: number  // Ostatnia obręcz → ziemia (mm)
}

export interface BOMData {
  ladder1: {
    items: BOMItem[]
    config: LadderConfig
  }
  ladder2?: {
    items: BOMItem[]
    config: LadderConfig
  }
  generatedAt: Date
}

export interface PDFGeneratorOptions {
  companyName?: string
  customerName?: string
  projectName?: string
  notes?: string
  orderNumber?: string
}

// Image mapping for BOM items
const imageMap: Record<string, string> = {
  'drabina-x7': 'Drabina_powielana.png',
  'drabina-x8': 'Drabina_powielana.png',
  'drabina-poczatkowa': 'Drabina_poczatkowa.png',
  'drabina-koncowa-x1': 'x1.png',
  'drabina-koncowa-x2': 'x2.png',
  'drabina-koncowa-x3': 'x3.png',
  'drabina-koncowa-x4': 'x4.png',
  'drabina-koncowa-x5': 'x5.png',
  'drabina-koncowa-x6': 'x6.png',
  'drabina-koncowa-x7': 'x7.png',
  'obrecz': 'obrecz.png',
  'lacznik-drabin': 'lacznikdrabin.png',
  'wspornik-sciskany': 'wspornik_sciskany.png',
  'wspornik-krotki': 'krótkie.png',
  'wspornik-sredni': 'średnie.png',
  'wspornik-dlugi': 'długie.png',
  'lacznik-poreczy': 'lacznik.png',
  'katownik-x4': 'x44.png',
  'l-ki': 'lka.png'
}

// Convert Polish characters to ASCII equivalents for PDF (jsPDF doesn't support Polish chars by default)
function polishToAscii(text: string): string {
  const map: Record<string, string> = {
    'ą': 'a', 'Ą': 'A',
    'ć': 'c', 'Ć': 'C',
    'ę': 'e', 'Ę': 'E',
    'ł': 'l', 'Ł': 'L',
    'ń': 'n', 'Ń': 'N',
    'ó': 'o', 'Ó': 'O',
    'ś': 's', 'Ś': 'S',
    'ź': 'z', 'Ź': 'Z',
    'ż': 'z', 'Ż': 'Z'
  }
  return text.replace(/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/g, char => map[char] || char)
}

// Load image as base64
async function loadImage(filename: string): Promise<string | null> {
  try {
    const response = await fetch(`/bom-images/${filename}`)
    if (!response.ok) return null
    const blob = await response.blob()
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result as string)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

// Preload all images
async function preloadImages(): Promise<Record<string, string>> {
  const loaded: Record<string, string> = {}
  const uniqueFiles = [...new Set(Object.values(imageMap))]
  // Also load logo
  uniqueFiles.push('Organizer_Logo.png')

  await Promise.all(uniqueFiles.map(async (filename) => {
    const data = await loadImage(filename)
    if (data) {
      loaded[filename] = data
    }
  }))

  return loaded
}

/**
 * Generate PDF with Bill of Materials (zlecenie.php style)
 */
export async function generateBOMPdf(bomData: BOMData, options: PDFGeneratorOptions = {}): Promise<void> {
  // Preload images
  const images = await preloadImages()

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  })

  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 15
  const imgSize = 12  // Image size in mm (bigger for better visibility)
  const rowHeight = 14  // Row height to fit images
  let y = margin

  // Generate order number if not provided
  const orderNumber = options.orderNumber || generateOrderNumber()

  // Helper function to check page break
  function checkPageBreak(neededHeight: number): boolean {
    if (y + neededHeight > pageHeight - margin) {
      doc.addPage()
      y = margin
      return true
    }
    return false
  }

  // Draw horizontal line
  function drawLine(x1: number = margin, x2: number = pageWidth - margin): void {
    doc.setDrawColor(180, 180, 180)
    doc.setLineWidth(0.3)
    doc.line(x1, y, x2, y)
    y += 2
  }

  // Draw box with content (like .okienko) - stroke only, no fill (to not cover content)
  function drawBox(startY: number, endY: number, boxMargin: number = 20): void {
    doc.setDrawColor(150, 150, 150)
    doc.setLineWidth(0.5)
    doc.roundedRect(boxMargin, startY - 5, pageWidth - 2 * boxMargin, endY - startY + 10, 3, 3, 'S')
  }

  // Add page header with logo
  function addPageHeader(): void {
    // Logo on the right
    if (images['Organizer_Logo.png']) {
      try {
        doc.addImage(images['Organizer_Logo.png'], 'PNG', pageWidth - margin - 15, 5, 15, 15)
      } catch {
        // Logo failed to load
      }
    }
  }

  // Add page footer
  function addPageFooter(pageNum: number, totalPages: number): void {
    const footerY = pageHeight - 8
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(150, 150, 150)
    doc.text(`Strona ${pageNum} z ${totalPages}`, pageWidth / 2, footerY, { align: 'center' })
    doc.setTextColor(0, 0, 0)
  }

  // Add image to PDF - draws image at specified position
  function addItemImage(item: BOMItem, x: number, rowY: number): void {
    const imageFile = item.image ? imageMap[item.image] : null
    if (imageFile && images[imageFile]) {
      try {
        // Image positioned at top of row
        doc.addImage(images[imageFile], 'PNG', x, rowY, imgSize, imgSize)
      } catch {
        // Image failed to add, continue without it
      }
    }
  }

  // Column positions (adjusted for 12mm image, centered)
  const colImg = margin + 8   // Image column (centered with padding)
  const col2 = margin + 24    // Nazwa (after image)
  const col3 = pageWidth - margin - 35  // Ilosc
  const col4 = pageWidth - margin - 12  // Checkbox

  // ============================================
  // PAGE 1: STRONA WEJSCIA
  // ============================================

  // Add logo
  addPageHeader()

  // Order number (centered, like .numer-zlecenia)
  doc.setFontSize(12)
  doc.setFont('helvetica', 'normal')
  doc.text('Zlecenie nr:', pageWidth / 2, y, { align: 'center' })
  y += 6

  doc.setFontSize(20)
  doc.setFont('helvetica', 'bold')
  doc.text(orderNumber, pageWidth / 2, y, { align: 'center' })
  y += 14

  // Title and dimensions (like .nazwa)
  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.text('ZLECENIE', pageWidth / 2, y, { align: 'center' })
  y += 8

  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  const config1 = bomData.ladder1.config
  const dimText = `Wys. sciany: ${config1.wallHeight.toFixed(2)} m  |  Schemat: ${translateScheme(config1.scheme || '')}  |  Kosz: ${translateCage(config1.cage || '')}`
  doc.text(dimText, pageWidth / 2, y, { align: 'center' })
  y += 10

  // Elements box
  const boxStartY1 = y

  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text('Elementy:', margin + 10, y)
  y += 8

  // Table header
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.text('Zdj.', colImg, y)
  doc.text('Nazwa elementu', col2, y)
  doc.text('Ilosc', col3, y)
  doc.text('OK', col4, y)
  y += 3
  drawLine(margin + 5, pageWidth - margin - 5)
  y += 2

  // Elements list
  doc.setFont('helvetica', 'normal')

  if (bomData.ladder1.items.length > 0) {
    for (const item of bomData.ladder1.items) {
      checkPageBreak(rowHeight + 2)

      const rowStartY = y

      // Add image at start of row (centered)
      addItemImage(item, colImg, y)

      // Text vertically centered in row (offset by half of image size)
      const textY = y + imgSize / 2 + 1

      doc.setFontSize(9)
      doc.text(polishToAscii(item.namePL), col2, textY)
      doc.text(`${item.quantity} ${polishToAscii(item.unit)}`, col3, textY)

      // Checkbox centered vertically
      doc.setDrawColor(100, 100, 100)
      doc.rect(col4, textY - 2, 4, 4)

      // Move y to after the row
      y = rowStartY + rowHeight
      drawLine(margin + 5, pageWidth - margin - 5)
      y += 2
    }
  } else {
    doc.setFontSize(9)
    doc.setFont('helvetica', 'italic')
    doc.text('Brak elementow', col2, y)
    y += 8
  }

  // Configuration details
  y += 5
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(100, 100, 100)
  doc.text(polishToAscii(`Grubosc ocieplenia: ${config1.insulationThickness} cm  |  Wspornik: ${translateWspornikType(config1.wspornikType)}  |  Odleglosc wspornikow: ${config1.wspornikDistance} mm`), margin + 10, y)
  y += 5

  // Distance info for ladder1
  if (config1.lastRungToGround !== undefined || config1.lastCageToGround !== undefined) {
    let distanceText = ''
    if (config1.lastRungToGround !== undefined) {
      distanceText += `Ostatni szczebel -> ziemia: ${config1.lastRungToGround} mm`
    }
    if (config1.lastCageToGround !== undefined) {
      if (distanceText) distanceText += '  |  '
      distanceText += `Ostatnia obrecz -> ziemia: ${config1.lastCageToGround} mm`
    }
    doc.text(polishToAscii(distanceText), margin + 10, y)
    y += 5
  }

  doc.setTextColor(0, 0, 0)
  y += 3

  const boxEndY1 = y
  drawBox(boxStartY1 - 3, boxEndY1)

  // ============================================
  // PAGE 2: STRONA ZEJSCIA (if exists)
  // ============================================
  if (bomData.ladder2 && bomData.ladder2.items.length > 0) {
    doc.addPage()
    y = margin
    addPageHeader()

    // Order number
    doc.setFontSize(12)
    doc.setFont('helvetica', 'normal')
    doc.text('Zlecenie nr:', pageWidth / 2, y, { align: 'center' })
    y += 6

    doc.setFontSize(20)
    doc.setFont('helvetica', 'bold')
    doc.text(orderNumber, pageWidth / 2, y, { align: 'center' })
    y += 14

    // Title
    doc.setFontSize(18)
    doc.setFont('helvetica', 'bold')
    doc.text('STRONA ZEJSCIA', pageWidth / 2, y, { align: 'center' })
    y += 8

    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    const config2 = bomData.ladder2.config
    const dimText2 = `Wys. sciany: ${config2.wallHeight.toFixed(2)} m  |  Montaz: ${translateMountType(config2.mountType || '')}  |  Min. dystans: ${config2.minDistance} cm`
    doc.text(dimText2, pageWidth / 2, y, { align: 'center' })
    y += 10

    // Elements box
    const boxStartY2 = y

    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.text('Elementy:', margin + 10, y)
    y += 8

    // Table header
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.text('Zdj.', colImg, y)
    doc.text('Nazwa elementu', col2, y)
    doc.text('Ilosc', col3, y)
    doc.text('OK', col4, y)
    y += 3
    drawLine(margin + 5, pageWidth - margin - 5)
    y += 2

    // Elements list
    doc.setFont('helvetica', 'normal')

    for (const item of bomData.ladder2.items) {
      checkPageBreak(rowHeight + 2)

      const rowStartY = y

      // Add image at start of row (centered)
      addItemImage(item, colImg, y)

      // Text vertically centered in row
      const textY = y + imgSize / 2 + 1

      doc.setFontSize(9)
      doc.text(polishToAscii(item.namePL), col2, textY)
      doc.text(`${item.quantity} ${polishToAscii(item.unit)}`, col3, textY)

      // Checkbox centered vertically
      doc.setDrawColor(100, 100, 100)
      doc.rect(col4, textY - 2, 4, 4)

      // Move y to after the row
      y = rowStartY + rowHeight
      drawLine(margin + 5, pageWidth - margin - 5)
      y += 2
    }

    // Configuration details
    y += 5
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(100, 100, 100)
    doc.text(polishToAscii(`Grubosc ocieplenia: ${config2.insulationThickness} cm  |  Wspornik: ${translateWspornikType(config2.wspornikType)}  |  Odleglosc: ${config2.wspornikDistance} mm`), margin + 10, y)
    y += 5

    // Distance info
    if (config2.lastRungToGround !== undefined || config2.lastCageToGround !== undefined) {
      let distanceText = ''
      if (config2.lastRungToGround !== undefined) {
        distanceText += `Ostatni szczebel -> ziemia: ${config2.lastRungToGround} mm`
      }
      if (config2.lastCageToGround !== undefined) {
        if (distanceText) distanceText += '  |  '
        distanceText += `Ostatnia obrecz -> ziemia: ${config2.lastCageToGround} mm`
      }
      doc.text(polishToAscii(distanceText), margin + 10, y)
      y += 5
    }

    doc.setTextColor(0, 0, 0)
    y += 3

    const boxEndY2 = y
    drawBox(boxStartY2 - 3, boxEndY2)
  }

  // Add page numbers to all pages
  const totalPages = doc.getNumberOfPages()
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    addPageFooter(i, totalPages)
  }

  // Open PDF in new tab
  const pdfBlob = doc.output('blob')
  const pdfUrl = URL.createObjectURL(pdfBlob)
  window.open(pdfUrl, '_blank')
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function generateOrderNumber(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const hours = String(now.getHours()).padStart(2, '0')
  const minutes = String(now.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day}/${hours}${minutes}`
}

function translateScheme(scheme: string): string {
  const translations: Record<string, string> = {
    'safety': 'Z poreczami',
    'no-platform': 'Z poreczami',
    'platform': 'Z podestem',
    'with-platform': 'Z podestem',
    'attic': 'Przejscie przez attyke',
    'attic-passage': 'Przejscie przez attyke',
    'none': 'Bez zakonczen'
  }
  return translations[scheme] || scheme
}

function translateCage(cage: string): string {
  const translations: Record<string, string> = {
    'no-cage': 'Brak',
    'from-3m': 'Od 3m',
    'from-ground': 'Od ziemi'
  }
  return translations[cage] || cage
}

function translateWspornikType(type: string): string {
  const translations: Record<string, string> = {
    'krotki': 'Krotki',
    'short': 'Krotki',
    'sredni': 'Sredni',
    'medium': 'Sredni',
    'dlugi': 'Dlugi',
    'long': 'Dlugi',
    'none': 'Brak'
  }
  return translations[type] || type
}

function translateMountType(type: string): string {
  const translations: Record<string, string> = {
    'bigfoot': 'BIGFOOT',
    'custom-base': 'Wlasne podloze',
    'brackets': 'Na wspornikach',
    'self': 'Samodzielny'
  }
  return translations[type] || type
}
