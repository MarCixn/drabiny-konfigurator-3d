/**
 * Vue Composable for API Integration
 * Provides reactive state and methods for interacting with the drabiny backend
 */

import { ref, computed, onMounted } from 'vue'
import {
  calculateLadder,
  saveConfiguration,
  getRalColors,
  getProductPrices,
  getActivePromotions,
  validatePromoCode,
  getPdfUrl,
  calculateLocal,
  type LadderConfig,
  type CalculateResponse,
  type RalColor,
  type SaveConfigurationResponse
} from '@/services/api'

// ============================================================================
// Shared State (singleton across components)
// ============================================================================

const productPrices = ref<Record<string, { price: number; paintingPrice: number }>>({})
const ralColors = ref<RalColor[]>([])
const activePromotions = ref<Array<{ id: number; name: string; description: string; discountPercent: number }>>([])
const isLoadingPrices = ref(false)
const pricesLoaded = ref(false)
const apiError = ref<string | null>(null)

// ============================================================================
// Composable
// ============================================================================

export function useApi() {
  // Local state
  const isCalculating = ref(false)
  const isSaving = ref(false)
  const lastCalculation = ref<CalculateResponse | null>(null)
  const lastSaveResult = ref<SaveConfigurationResponse | null>(null)

  /**
   * Load product prices from API (only once)
   */
  async function loadPrices(): Promise<void> {
    if (pricesLoaded.value || isLoadingPrices.value) return

    isLoadingPrices.value = true
    apiError.value = null

    try {
      const [prices, colors, promotions] = await Promise.all([
        getProductPrices(),
        getRalColors(),
        getActivePromotions()
      ])

      productPrices.value = prices
      ralColors.value = colors
      activePromotions.value = promotions
      pricesLoaded.value = true

      console.log('[useApi] Loaded prices:', Object.keys(prices).length, 'products')
      console.log('[useApi] Loaded RAL colors:', colors.length)
      console.log('[useApi] Active promotions:', promotions.length)
    } catch (error) {
      console.error('[useApi] Failed to load prices:', error)
      apiError.value = error instanceof Error ? error.message : 'Failed to load prices'
    } finally {
      isLoadingPrices.value = false
    }
  }

  /**
   * Get price for a product code
   */
  function getPrice(code: string): number {
    return productPrices.value[code]?.price || 0
  }

  /**
   * Get painting price for a product code
   */
  function getPaintingPrice(code: string): number {
    return productPrices.value[code]?.paintingPrice || 0
  }

  /**
   * Calculate ladder specification with API prices
   * Falls back to local calculation if API fails
   */
  async function calculate(config: LadderConfig): Promise<CalculateResponse> {
    isCalculating.value = true
    apiError.value = null

    try {
      const result = await calculateLadder(config)
      lastCalculation.value = result
      return result
    } catch (error) {
      console.warn('[useApi] API calculation failed, using local fallback:', error)

      // Use local calculation as fallback
      const localResult = calculateLocal(config) as CalculateResponse

      // Enrich with loaded prices if available
      if (pricesLoaded.value && localResult.components) {
        let totalPrice = 0
        let totalPaintingPrice = 0

        for (const component of localResult.components) {
          const priceData = productPrices.value[component.code]
          if (priceData) {
            component.unitPrice = priceData.price
            component.totalPrice = priceData.price * component.quantity
            component.paintingPrice = priceData.paintingPrice * component.quantity
            totalPrice += component.totalPrice
            totalPaintingPrice += component.paintingPrice || 0
          }
        }

        localResult.totalPrice = totalPrice
        localResult.totalPaintingPrice = totalPaintingPrice
        if (localResult.pricing) {
          localResult.pricing.baseProductPrice = totalPrice
          localResult.pricing.finalPrice = totalPrice
          localResult.pricing.finalPriceWithVat = totalPrice * 1.23
        }
      }

      lastCalculation.value = localResult
      return localResult
    } finally {
      isCalculating.value = false
    }
  }

  /**
   * Save configuration to database
   */
  async function save(
    config: LadderConfig,
    customerData?: {
      name?: string
      email?: string
      phone?: string
      company?: string
      notes?: string
    }
  ): Promise<SaveConfigurationResponse> {
    isSaving.value = true
    apiError.value = null

    try {
      const response = await saveConfiguration({
        config,
        customerName: customerData?.name,
        customerEmail: customerData?.email,
        customerPhone: customerData?.phone,
        customerCompany: customerData?.company,
        customerNotes: customerData?.notes
      })

      lastSaveResult.value = response
      return response
    } catch (error) {
      console.error('[useApi] Save failed:', error)
      const errorResponse: SaveConfigurationResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Save failed'
      }
      lastSaveResult.value = errorResponse
      return errorResponse
    } finally {
      isSaving.value = false
    }
  }

  /**
   * Validate a promo code
   */
  async function checkPromoCode(code: string, amount: number) {
    return validatePromoCode(code, amount)
  }

  /**
   * Get PDF URL for saved configuration
   */
  function getOfferPdfUrl(configId: number, accessCode?: string): string {
    return getPdfUrl(configId, accessCode)
  }

  /**
   * Get popular RAL colors (with discount)
   */
  const popularRalColors = computed(() => {
    return ralColors.value.filter(c => c.category === 'popular')
  })

  /**
   * Get standard RAL colors
   */
  const standardRalColors = computed(() => {
    return ralColors.value.filter(c => c.category === 'standard')
  })

  /**
   * Format price with currency
   */
  function formatPrice(price: number, withVat = false): string {
    const value = withVat ? price * 1.23 : price
    return value.toLocaleString('pl-PL', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }) + ' zl'
  }

  /**
   * Convert BOM items to API format
   */
  function bomToApiConfig(bomData: {
    items: Array<{ id: string; name: string; namePL: string; quantity: number; unit: string }>
    config: {
      wallHeight: number
      scheme: string
      hasCage: boolean
      wspornikType: string
      insulationThickness: number
      wspornikDistance: number
    }
  }): LadderConfig {
    const config = bomData.config

    // Map scheme
    let scheme: 'no-platform' | 'with-platform' | 'attic-passage' = 'no-platform'
    if (config.scheme === 'with-platform' || config.scheme === 'platform') {
      scheme = 'with-platform'
    } else if (config.scheme === 'attic' || config.scheme === 'attic-passage') {
      scheme = 'attic-passage'
    }

    // Map cage
    let cage: 'no-cage' | 'with-cage' | 'full-cage' = 'no-cage'
    if (config.hasCage) {
      cage = 'with-cage'
    }

    // Map bracket type
    let bracketType: 'short' | 'medium' | 'long' = 'short'
    if (config.wspornikType === 'medium' || config.wspornikType === '26-36') {
      bracketType = 'medium'
    } else if (config.wspornikType === 'long' || config.wspornikType === '36-46') {
      bracketType = 'long'
    }

    return {
      wallHeight: config.wallHeight,
      scheme,
      purpose: 'external',
      cage,
      bracketType,
      bracketSpacing: config.wspornikDistance || 1000,
      insulationThickness: config.insulationThickness || 0,
      suspended: false,
      suspendedHeight: 0,
      hasObstacles: false,
      obstacles: []
    }
  }

  // Auto-load prices on first use
  onMounted(() => {
    if (!pricesLoaded.value && !isLoadingPrices.value) {
      loadPrices()
    }
  })

  return {
    // State
    productPrices,
    ralColors,
    activePromotions,
    isLoadingPrices,
    pricesLoaded,
    apiError,
    isCalculating,
    isSaving,
    lastCalculation,
    lastSaveResult,

    // Computed
    popularRalColors,
    standardRalColors,

    // Methods
    loadPrices,
    getPrice,
    getPaintingPrice,
    calculate,
    save,
    checkPromoCode,
    getOfferPdfUrl,
    formatPrice,
    bomToApiConfig
  }
}

// ============================================================================
// Export singleton for direct access
// ============================================================================

export {
  productPrices,
  ralColors,
  activePromotions,
  pricesLoaded
}
