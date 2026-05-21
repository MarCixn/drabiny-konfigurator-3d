/**
 * API Service for Ladder Calculator
 * Communicates with the drabiny PHP backend at /drabiny/api/
 */

// Re-export attic calculation
export { generateAtticSpecification, type AtticConfig, type AtticSpecification } from './attic-calculation'

// ============================================================================
// API Configuration
// ============================================================================

const API_BASE = '/drabiny/api'

// ============================================================================
// Request Types (matching PHP LadderCalculator expectations)
// ============================================================================

export interface LadderConfig {
  // Required
  wallHeight: number           // in meters
  scheme: 'no-platform' | 'with-platform' | 'attic-passage'
  purpose: 'external' | 'internal'

  // Cage options
  cage: 'no-cage' | 'with-cage' | 'full-cage'

  // Bracket/mounting
  bracketType: 'short' | 'medium' | 'long'  // 16-26, 26-36, 36-46
  bracketSpacing: number       // mm, default 1000
  insulationThickness: number  // cm

  // Suspended ladder
  suspended: boolean
  suspendedHeight: number      // in meters

  // Obstacles
  hasObstacles: boolean
  obstacles: Array<{
    id: number
    type: string
    bottomHeightMm: number
    heightMm: number
  }>

  // RAL painting
  ralPainting?: boolean
  ralColor?: string

  // Quantity & promo
  quantity?: number
  promoCode?: string

  // Attic passage specific
  atticPlatformDistance?: number
  atticEntry?: {
    wallHeight: number
    suspended: boolean
    suspendedHeight: number
  }
  atticDescent?: {
    wallHeight: number
    suspended: boolean
    suspendedHeight: number
  }

  // Connector types from 3D model (uchwyt, sciskany, lacznik)
  connectorTypes?: string[]
  wspornikTypes?: string[]
}

export interface CalculateRequest {
  ladders: LadderConfig[]
  quantity?: number
  promoCode?: string
  ralPainting?: boolean
  ralColor?: string
}

// ============================================================================
// Response Types (matching PHP API response)
// ============================================================================

export interface ComponentItem {
  code: string
  name: string
  quantity: number
  unit: string
  unitPrice: number
  totalPrice: number
  paintingPrice?: number
  category?: string
}

export interface LadderSummary {
  wallHeight: number
  scheme: string
  totalRungs: number
  totalHeightMm: number
  cageHoops: number
  connectorCount: number
}

export interface PricingBreakdown {
  baseProductPrice: number
  quantity: number
  ralPainting: boolean
  ralColor: string
  painting: {
    basePrice: number
    modifiedPrice: number
    modifier: number
    category: string
    reason: string
  } | null
  paintingPrice: number
  subtotal: number
  producerDiscounts: Array<{
    name: string
    percent: number
    amount: number
  }>
  producerDiscountsTotal: number
  priceAfterProducerDiscounts: number
  sellerMarginPercent: number
  sellerMarginAmount: number
  priceWithMargin: number
  sellerDiscounts: Array<{
    name: string
    percent: number
    amount: number
  }>
  sellerDiscountsTotal: number
  finalPrice: number
  finalPriceWithVat: number
  producerGets: number
  sellerGets: number
}

export interface DisplayData {
  discountTiers: Array<{
    name: string
    minQuantity: number
    minAmount: number
    discountPercent: number
  }>
  activePromotions: Array<{
    name: string
    description: string
    discountPercent: number
    endsAt: string
  }>
  popularRalColors: Array<{
    code: string
    name: string
    hex: string
    priceModifier: number
  }>
  showDiscountTiers: boolean
}

export interface CalculateResponse {
  valid: boolean
  error?: string
  isAttic?: boolean
  components: ComponentItem[]
  summary: LadderSummary
  config: LadderConfig
  optionalPrices: Record<string, number>
  pricing: PricingBreakdown
  displayData: DisplayData
  totalPrice: number
  totalPaintingPrice: number
}

export interface SaveConfigurationRequest {
  config: {
    ladders: Array<{
      config: LadderConfig
      quantity?: number
      components?: ComponentItem[]
    }>
  } | LadderConfig
  parentId?: number
  customerName?: string
  customerEmail?: string
  customerPhone?: string
  customerCompany?: string
  customerNotes?: string
}

export interface SaveConfigurationResponse {
  success: boolean
  data?: {
    id: number
    reference_number: string
    access_code: string
    status: string
    version: number
    parent_id: number | null
  }
  message?: string
  error?: string
}

export interface RalColor {
  code: string
  name: string
  hex: string
  category: 'popular' | 'standard' | 'custom'
  priceModifier: number
}

// ============================================================================
// API Functions
// ============================================================================

/**
 * Calculate ladder specification with prices from the backend
 */
export async function calculateLadder(config: LadderConfig): Promise<CalculateResponse> {
  try {
    const response = await fetch(`${API_BASE}/calculate.php`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(config),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`HTTP ${response.status}: ${errorText}`)
    }

    const data = await response.json()

    if (!data.valid) {
      throw new Error(data.error || 'Calculation failed')
    }

    return data
  } catch (error) {
    console.error('[API] Calculate error:', error)
    throw error
  }
}

/**
 * Calculate multiple ladders (e.g., for attic passage with entry + descent)
 */
export async function calculateMultipleLadders(configs: LadderConfig[]): Promise<CalculateResponse[]> {
  const results: CalculateResponse[] = []

  for (const config of configs) {
    const result = await calculateLadder(config)
    results.push(result)
  }

  return results
}

/**
 * Get RAL colors with pricing from database
 */
export async function getRalColors(): Promise<RalColor[]> {
  try {
    const response = await fetch(`${API_BASE}/ral-colors.php`)

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const data = await response.json()
    return data.colors || []
  } catch (error) {
    console.error('[API] RAL colors error:', error)
    return []
  }
}

/**
 * Get product prices from database
 */
export async function getProductPrices(): Promise<Record<string, { price: number; paintingPrice: number }>> {
  try {
    const response = await fetch(`${API_BASE}/products.php`)

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const json = await response.json()

    // API returns { success: true, data: { items: [...] } }
    const products = json.data?.items || json.products || []

    // Convert to price lookup map
    const prices: Record<string, { price: number; paintingPrice: number }> = {}
    for (const product of products) {
      prices[product.code] = {
        price: parseFloat(product.price) || 0,
        paintingPrice: parseFloat(product.painting_price) || 0
      }
    }

    console.log('[API] Loaded prices for', Object.keys(prices).length, 'products')
    return prices
  } catch (error) {
    console.error('[API] Products error:', error)
    return {}
  }
}

/**
 * Save configuration to database and get reference number
 */
export async function saveConfiguration(request: SaveConfigurationRequest): Promise<SaveConfigurationResponse> {
  try {
    const response = await fetch(`${API_BASE}/configurations.php`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    })

    const data = await response.json()

    if (!response.ok) {
      return {
        success: false,
        error: data.message || data.error || `HTTP ${response.status}`
      }
    }

    // API returns { success: true, data: { id, reference_number, access_code, status } }
    return {
      success: data.success ?? true,
      data: data.data ?? data,
      message: data.message
    }
  } catch (error) {
    console.error('[API] Save configuration error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Loaded configuration response
 */
export interface LoadedConfiguration {
  id: number
  reference_number: string
  access_code: string
  parent_id?: number | null
  config_json: {
    ladders?: Array<{
      wallHeight?: number
      height?: number
      quantity?: number
      hasCage?: boolean
      cage?: string
      scheme?: string
      bracketType?: string
      insulationThickness?: number
      hasPainting?: boolean
      ralColor?: string
      price?: number
      components?: ComponentItem[]
    }>
  } | null
  result_json: unknown
  customer_name?: string
  customer_email?: string
  customer_phone?: string
  customer_company?: string
  total_price: number
  status: string
  version?: number
  versions?: Array<{
    id: number
    reference_number: string
    version: number
    total_price: number
    status: string
    created_at: string
  }>
  created_at: string
  updated_at: string
}

/**
 * Get configuration by reference number and access code
 */
export async function getConfigurationByRef(
  referenceNumber: string,
  accessCode: string
): Promise<{ success: boolean; data?: LoadedConfiguration; error?: string }> {
  try {
    const response = await fetch(
      `${API_BASE}/configurations.php?reference=${encodeURIComponent(referenceNumber)}&access_code=${encodeURIComponent(accessCode)}`
    )

    const json = await response.json()

    if (!response.ok || !json.success) {
      return {
        success: false,
        error: json.message || json.error || `HTTP ${response.status}`
      }
    }

    return {
      success: true,
      data: json.data
    }
  } catch (error) {
    console.error('[API] Get configuration error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Validate promo code
 */
export async function validatePromoCode(code: string, amount: number): Promise<{
  valid: boolean
  discountPercent?: number
  discountAmount?: number
  message?: string
}> {
  try {
    const response = await fetch(`${API_BASE}/kupon-validate.php`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ code, amount }),
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    return await response.json()
  } catch (error) {
    console.error('[API] Promo validation error:', error)
    return {
      valid: false,
      message: 'Nie udalo sie zweryfikowac kodu'
    }
  }
}

/**
 * Get PDF URL for a configuration
 */
export function getPdfUrl(configId: number, accessCode?: string): string {
  let url = `${API_BASE}/pdf.php?id=${configId}`
  if (accessCode) {
    url += `&code=${accessCode}`
  }
  return url
}

/**
 * Get active promotions
 */
export async function getActivePromotions(): Promise<Array<{
  id: number
  name: string
  description: string
  discountPercent: number
  endsAt: string
  code?: string
}>> {
  try {
    const response = await fetch(`${API_BASE}/promotions.php`)

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const data = await response.json()
    return data.promotions || []
  } catch (error) {
    console.error('[API] Promotions error:', error)
    return []
  }
}

// ============================================================================
// Local Calculation Fallback (when API is unavailable)
// ============================================================================

/**
 * Local calculation fallback - uses same logic as server but without database prices
 */
export function calculateLocal(config: LadderConfig): Partial<CalculateResponse> {
  const wallHeightMm = config.wallHeight * 1000

  // Constants (matched with PHP LadderCalculator)
  const RUNG_SPACING = 275
  const RAIL_HEIGHT_X7 = 1925
  const RAIL_HEIGHT_X8 = 2200
  const PLATFORM_OFFSET = 50
  const MAX_GROUND_DISTANCE = 300
  const HANDRAIL_HEIGHT = 1100

  // Calculate total climb height
  let totalClimbHeight = wallHeightMm

  if (config.scheme === 'with-platform') {
    totalClimbHeight += PLATFORM_OFFSET
  }

  // Add handrail height for non-attic schemes
  if (config.scheme !== 'attic-passage') {
    totalClimbHeight += HANDRAIL_HEIGHT
  }

  // Subtract suspended height
  if (config.suspended && config.suspendedHeight > 0) {
    totalClimbHeight -= config.suspendedHeight * 1000
  }

  // Calculate modules
  let numX7 = 0
  let numX8 = 0
  let finalRungs = 0
  let remainingHeight = totalClimbHeight

  // Use X7 modules
  while (remainingHeight >= RAIL_HEIGHT_X7 + MAX_GROUND_DISTANCE) {
    numX7++
    remainingHeight -= RAIL_HEIGHT_X7
  }

  // Final module
  if (remainingHeight > MAX_GROUND_DISTANCE) {
    const rungsNeeded = Math.ceil((remainingHeight - MAX_GROUND_DISTANCE) / RUNG_SPACING)

    if (rungsNeeded <= 7) {
      finalRungs = rungsNeeded
    } else if (rungsNeeded === 8) {
      numX8 = 1
    } else {
      numX7++
      remainingHeight -= RAIL_HEIGHT_X7
      finalRungs = Math.max(0, Math.min(7, Math.ceil((remainingHeight - MAX_GROUND_DISTANCE) / RUNG_SPACING)))
    }
  }

  // Calculate totals
  const finalHeights: Record<number, number> = {
    1: 175, 2: 450, 3: 725, 4: 1000, 5: 1275, 6: 1550, 7: 1925
  }

  const totalHeightMm = numX7 * RAIL_HEIGHT_X7 + numX8 * RAIL_HEIGHT_X8 + (finalHeights[finalRungs] || 0)
  const totalRungs = numX7 * 7 + numX8 * 8 + finalRungs

  // Cage hoops
  let cageHoops = 0
  if (config.cage !== 'no-cage') {
    const cageStartHeight = config.cage === 'full-cage' ? 0 : 2500
    const cageableHeight = totalHeightMm + HANDRAIL_HEIGHT - cageStartHeight - 1114
    if (cageableHeight > 0) {
      cageHoops = Math.ceil(cageableHeight / 641.7) + 1
    }
  }

  // Connectors
  const sectionCount = numX7 + numX8 + (finalRungs > 0 ? 1 : 0)
  const connectorCount = Math.max(0, sectionCount - 1) + 1

  // Build components list
  const components: ComponentItem[] = []

  if (numX7 > 0) {
    components.push({
      code: 'drabina_powielana_7',
      name: 'Drabina powielana 7-szczeblowa',
      quantity: numX7,
      unit: 'szt.',
      unitPrice: 0,
      totalPrice: 0,
      category: 'ladder'
    })
  }

  if (numX8 > 0) {
    components.push({
      code: 'drabina_powielana_8',
      name: 'Drabina powielana 8-szczeblowa',
      quantity: numX8,
      unit: 'szt.',
      unitPrice: 0,
      totalPrice: 0,
      category: 'ladder'
    })
  }

  if (finalRungs > 0) {
    components.push({
      code: `drabina_koncowa_${finalRungs}`,
      name: `Drabina koncowa ${finalRungs}-szczeblowa`,
      quantity: 1,
      unit: 'szt.',
      unitPrice: 0,
      totalPrice: 0,
      category: 'ladder'
    })
  }

  // Count connector types from 3D model if available
  const connTypes = config.connectorTypes || []
  const uchwytCount = connTypes.filter(t => t === 'uchwyt').length || connectorCount
  const sciskanyCount = connTypes.filter(t => t === 'sciskany').length
  const lacznikCount = connTypes.filter(t => t === 'lacznik').length

  // If no connectorTypes provided, use fallback (all as uchwyt)
  const totalConnectors = uchwytCount + sciskanyCount + lacznikCount

  if (uchwytCount > 0) {
    components.push({
      code: 'uchwyt_montazowo_laczacy',
      name: 'Uchwyt montazowo-laczacy (para L+P)',
      quantity: uchwytCount,
      unit: 'par',
      unitPrice: 0,
      totalPrice: 0,
      category: 'mounting'
    })
  }

  if (sciskanyCount > 0) {
    components.push({
      code: 'uchwyt_sciskany',
      name: 'Uchwyt sciskany (para L+P)',
      quantity: sciskanyCount,
      unit: 'par',
      unitPrice: 0,
      totalPrice: 0,
      category: 'mounting'
    })
  }

  if (lacznikCount > 0) {
    components.push({
      code: 'lacznik_drabin',
      name: 'Lacznik drabin (para L+P)',
      quantity: lacznikCount,
      unit: 'par',
      unitPrice: 0,
      totalPrice: 0,
      category: 'mounting'
    })
  }

  // Add wsporniki for all connectors
  if (totalConnectors > 0 || connectorCount > 0) {
    const wspornikCode = config.bracketType === 'short' ? 'wspornik_16_26' :
                         config.bracketType === 'medium' ? 'wspornik_26_36' : 'wspornik_36_46'
    const wspornikName = config.bracketType === 'short' ? 'Wspornik 16-26cm' :
                         config.bracketType === 'medium' ? 'Wspornik 26-36cm' : 'Wspornik 36-46cm'

    components.push({
      code: wspornikCode,
      name: `${wspornikName} (para L+P)`,
      quantity: totalConnectors > 0 ? totalConnectors : connectorCount,
      unit: 'par',
      unitPrice: 0,
      totalPrice: 0,
      category: 'mounting'
    })
  }

  if (config.scheme !== 'attic-passage') {
    components.push({
      code: 'porece_asekuracyjne',
      name: 'Porecze asekuracyjne (para L+P)',
      quantity: 1,
      unit: 'par',
      unitPrice: 0,
      totalPrice: 0,
      category: 'handrails'
    })
  }

  if (cageHoops > 0) {
    components.push({
      code: 'obrecz_kosza',
      name: 'Obrecz kosza ochronnego',
      quantity: cageHoops,
      unit: 'szt.',
      unitPrice: 0,
      totalPrice: 0,
      category: 'cage'
    })
  }

  return {
    valid: true,
    components,
    summary: {
      wallHeight: config.wallHeight,
      scheme: config.scheme,
      totalRungs,
      totalHeightMm,
      cageHoops,
      connectorCount
    },
    config,
    pricing: {
      baseProductPrice: 0,
      quantity: config.quantity || 1,
      ralPainting: config.ralPainting || false,
      ralColor: config.ralColor || '',
      painting: null,
      paintingPrice: 0,
      subtotal: 0,
      producerDiscounts: [],
      producerDiscountsTotal: 0,
      priceAfterProducerDiscounts: 0,
      sellerMarginPercent: 0,
      sellerMarginAmount: 0,
      priceWithMargin: 0,
      sellerDiscounts: [],
      sellerDiscountsTotal: 0,
      finalPrice: 0,
      finalPriceWithVat: 0,
      producerGets: 0,
      sellerGets: 0
    },
    totalPrice: 0,
    totalPaintingPrice: 0
  }
}
