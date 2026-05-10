/**
 * API Service for Ladder Calculator
 * Communicates with the existing PHP backend
 */

// Re-export attic calculation
export { generateAtticSpecification, type AtticConfig, type AtticSpecification } from './attic-calculation'

export interface CalculateRequest {
  wallHeight: number  // in meters
  scheme: string  // 'no-platform', 'with-platform', 'attic-passage'
  cage: string  // 'no-cage', 'with-cage', 'full-cage'
  bracketType: string
  bracketSpacing: number
  purpose: string  // 'external', 'internal'
  suspended: boolean
  suspendedHeight: number
  hasObstacles: boolean
  obstacles: Array<{
    id: number
    type: string
    bottomHeightMm: number
    heightMm: number
  }>
  // Optional attic passage fields
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
}

export interface ComponentItem {
  id: string
  name: string
  quantity: number
  unitPrice: number
  totalPrice: number
  sku?: string
  category?: string
}

export interface CalculateResponse {
  success: boolean
  error?: string
  data?: {
    // Ladder structure
    numX7Ladders: number
    numX8Ladders: number
    finalLadderRungs: number
    totalRungs: number
    totalHeightMm: number

    // Safety cage
    safetyCageCount: number
    cageHoops: number

    // Connectors
    connectorCount: number
    wspornikCount: number

    // Components list
    components: ComponentItem[]

    // Pricing
    subtotal: number
    discount: number
    discountPercent: number
    total: number
    totalWithVat: number
    vatRate: number

    // Validation
    warnings: string[]
    errors: string[]

    // Obstacle collision info
    obstacleCollisions?: Array<{
      obstacleId: number
      collidesWithConnector: boolean
      suggestedAction: string
    }>
  }
}

export interface PromoCodeResponse {
  success: boolean
  valid: boolean
  discountPercent?: number
  discountType?: 'percent' | 'fixed'
  discountValue?: number
  message?: string
}

export interface SaveConfigurationRequest {
  configuration: CalculateRequest
  customerEmail?: string
  customerName?: string
  notes?: string
}

export interface SaveConfigurationResponse {
  success: boolean
  referenceNumber?: string
  error?: string
}

const API_BASE = '/api'

/**
 * Call the calculate API endpoint
 */
export async function calculateLadder(request: CalculateRequest): Promise<CalculateResponse> {
  try {
    const response = await fetch(`${API_BASE}/calculate.php`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    })

    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`)
    }

    const data = await response.json()
    return data
  } catch (error) {
    console.error('API calculate error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Validate a promo code
 */
export async function validatePromoCode(code: string): Promise<PromoCodeResponse> {
  try {
    const response = await fetch(`${API_BASE}/promo.php`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ code }),
    })

    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`)
    }

    return await response.json()
  } catch (error) {
    console.error('API promo validation error:', error)

    // Fallback: check hardcoded codes
    if (code.toUpperCase() === 'DRABINA10') {
      return {
        success: true,
        valid: true,
        discountPercent: 10,
        discountType: 'percent',
        discountValue: 10,
        message: 'Kod rabatowy aktywny: -10%',
      }
    }

    return {
      success: false,
      valid: false,
      message: 'Nieprawidłowy kod rabatowy',
    }
  }
}

/**
 * Save configuration to server
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

    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`)
    }

    return await response.json()
  } catch (error) {
    console.error('API save configuration error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Get RAL colors for painting option
 */
export async function getRalColors(): Promise<Array<{ code: string; name: string; hex: string; priceModifier: number }>> {
  try {
    const response = await fetch(`${API_BASE}/ral-colors.php`)
    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`)
    }
    const data = await response.json()
    return data.colors || []
  } catch (error) {
    console.error('API RAL colors error:', error)
    return []
  }
}

/**
 * Local calculation fallback (when API is unavailable)
 * Uses the same logic as the server but without pricing
 */
export function calculateLocal(request: CalculateRequest): CalculateResponse {
  const wallHeightMm = request.wallHeight * 1000

  // Constants (matched with server)
  const RUNG_SPACING = 275
  const RAIL_HEIGHT_X7 = 1922
  const RAIL_HEIGHT_X8 = 2197
  const PLATFORM_OFFSET = 50
  const CAGE_START_OFFSET = 1114  // Fixed to match server
  const CAGE_HOOP_SPACING = 641.7
  const MAX_GROUND_DISTANCE = 300  // Fixed to match server
  const HANDRAIL_HEIGHT = 1011

  // Calculate total climb height
  let totalClimbHeight = wallHeightMm

  if (request.scheme === 'with-platform') {
    totalClimbHeight += PLATFORM_OFFSET
  }

  // Add handrail height for non-attic schemes
  if (request.scheme !== 'attic-passage') {
    totalClimbHeight += HANDRAIL_HEIGHT
  }

  // Subtract suspended height
  if (request.suspended && request.suspendedHeight > 0) {
    totalClimbHeight -= request.suspendedHeight * 1000
  }

  // Calculate number of modules
  let numX7 = 0
  let numX8 = 0
  let finalRungs = 0
  let remainingHeight = totalClimbHeight

  // Use X7 modules first
  while (remainingHeight >= RAIL_HEIGHT_X7 + MAX_GROUND_DISTANCE) {
    numX7++
    remainingHeight -= RAIL_HEIGHT_X7
  }

  // Check if we need X8 or final module
  if (remainingHeight > MAX_GROUND_DISTANCE) {
    // Calculate final rungs needed
    const rungsNeeded = Math.ceil((remainingHeight - MAX_GROUND_DISTANCE) / RUNG_SPACING)

    if (rungsNeeded <= 7) {
      finalRungs = rungsNeeded
    } else if (rungsNeeded === 8) {
      // Use X8 instead
      numX8 = 1
      finalRungs = 0
    } else {
      // Need another X7 plus final
      numX7++
      remainingHeight -= RAIL_HEIGHT_X7
      finalRungs = Math.ceil((remainingHeight - MAX_GROUND_DISTANCE) / RUNG_SPACING)
      if (finalRungs < 0) finalRungs = 0
      if (finalRungs > 7) finalRungs = 7
    }
  }

  // Calculate total height
  let totalHeightMm = numX7 * RAIL_HEIGHT_X7 + numX8 * RAIL_HEIGHT_X8
  if (finalRungs > 0) {
    const finalHeights: Record<number, number> = {
      1: 175, 2: 450, 3: 725, 4: 1000, 5: 1275, 6: 1550, 7: 1922
    }
    totalHeightMm += finalHeights[finalRungs] || 0
  }

  // Calculate total rungs
  const totalRungs = numX7 * 7 + numX8 * 8 + finalRungs

  // Calculate safety cage
  let cageHoops = 0
  if (request.cage === 'with-cage' || request.cage === 'full-cage') {
    const cageStartHeight = request.cage === 'full-cage' ? 0 : 2500  // 2.5m for with-cage
    const cageableHeight = totalHeightMm + HANDRAIL_HEIGHT - cageStartHeight - CAGE_START_OFFSET

    if (cageableHeight > 0) {
      cageHoops = Math.ceil(cageableHeight / CAGE_HOOP_SPACING) + 1
    }
  }

  // Calculate connectors
  const sectionCount = numX7 + numX8 + (finalRungs > 0 ? 1 : 0)
  const connectorCount = Math.max(0, sectionCount - 1) + (request.scheme !== 'attic-passage' ? 1 : 0)  // +1 for top connector

  // Generate components list (without prices)
  const components: ComponentItem[] = []

  if (numX7 > 0) {
    components.push({
      id: 'ladder-x7',
      name: 'Moduł drabiny X7 (7 szczebli)',
      quantity: numX7,
      unitPrice: 0,
      totalPrice: 0,
      category: 'ladder'
    })
  }

  if (numX8 > 0) {
    components.push({
      id: 'ladder-x8',
      name: 'Moduł drabiny X8 (8 szczebli)',
      quantity: numX8,
      unitPrice: 0,
      totalPrice: 0,
      category: 'ladder'
    })
  }

  if (finalRungs > 0) {
    components.push({
      id: `ladder-x${finalRungs}`,
      name: `Moduł końcowy X${finalRungs} (${finalRungs} szczebli)`,
      quantity: 1,
      unitPrice: 0,
      totalPrice: 0,
      category: 'ladder'
    })
  }

  if (connectorCount > 0) {
    components.push({
      id: 'connector-uchwyt',
      name: 'Uchwyt mocujący (para)',
      quantity: connectorCount,
      unitPrice: 0,
      totalPrice: 0,
      category: 'connector'
    })

    components.push({
      id: 'wspornik',
      name: `Wspornik ${request.bracketType} (para)`,
      quantity: connectorCount,
      unitPrice: 0,
      totalPrice: 0,
      category: 'wspornik'
    })
  }

  if (request.scheme !== 'attic-passage') {
    components.push({
      id: 'handrail',
      name: 'Poręcz bezpieczeństwa (para)',
      quantity: 1,
      unitPrice: 0,
      totalPrice: 0,
      category: 'handrail'
    })
  }

  if (cageHoops > 0) {
    components.push({
      id: 'cage-hoop',
      name: 'Obręcz kosza bezpieczeństwa',
      quantity: cageHoops,
      unitPrice: 0,
      totalPrice: 0,
      category: 'cage'
    })
  }

  return {
    success: true,
    data: {
      numX7Ladders: numX7,
      numX8Ladders: numX8,
      finalLadderRungs: finalRungs,
      totalRungs,
      totalHeightMm,
      safetyCageCount: cageHoops,
      cageHoops,
      connectorCount,
      wspornikCount: connectorCount,
      components,
      subtotal: 0,
      discount: 0,
      discountPercent: 0,
      total: 0,
      totalWithVat: 0,
      vatRate: 23,
      warnings: [],
      errors: [],
    }
  }
}
