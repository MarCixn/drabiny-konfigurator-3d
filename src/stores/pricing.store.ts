import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { PriceResult, Discount, ComponentPrice } from '@/types'
import { PRICING_CONSTANTS } from '@/types'

export const usePricingStore = defineStore('pricing', () => {
  // State
  const currentPrice = ref<PriceResult | null>(null)
  const appliedDiscount = ref<Discount | null>(null)
  const promoCode = ref('')
  const promoCodeError = ref<string | null>(null)
  const componentPrices = ref<Map<string, ComponentPrice>>(new Map())
  const isCalculating = ref(false)

  // Getters
  const hasDiscount = computed(() => appliedDiscount.value !== null)

  const discountAmount = computed(() => {
    if (!currentPrice.value || !appliedDiscount.value) return 0
    return currentPrice.value.discount
  })

  const netPrice = computed(() => {
    if (!currentPrice.value) return 0
    return currentPrice.value.basePrice - currentPrice.value.discount
  })

  const grossPrice = computed(() => {
    if (!currentPrice.value) return 0
    return currentPrice.value.totalPrice
  })

  const formattedPrice = computed(() => {
    if (!currentPrice.value) return '0,00 zł'
    return formatCurrency(currentPrice.value.totalPrice)
  })

  const formattedNetPrice = computed(() => {
    return formatCurrency(netPrice.value)
  })

  // Actions
  function formatCurrency(value: number): string {
    return new Intl.NumberFormat('pl-PL', {
      style: 'currency',
      currency: PRICING_CONSTANTS.CURRENCY
    }).format(value)
  }

  function setPrice(price: PriceResult) {
    currentPrice.value = price
  }

  function calculatePrice(basePrice: number): PriceResult {
    let discount = 0
    let discountPercent = 0

    if (appliedDiscount.value) {
      if (appliedDiscount.value.type === 'percent') {
        discountPercent = appliedDiscount.value.value
        discount = basePrice * (discountPercent / 100)
        if (appliedDiscount.value.maxDiscount) {
          discount = Math.min(discount, appliedDiscount.value.maxDiscount)
        }
      } else {
        discount = appliedDiscount.value.value
        discountPercent = (discount / basePrice) * 100
      }
    }

    const priceAfterDiscount = basePrice - discount
    const vatAmount = priceAfterDiscount * PRICING_CONSTANTS.VAT_RATE
    const totalPrice = priceAfterDiscount + vatAmount

    const result: PriceResult = {
      basePrice,
      discount,
      discountPercent,
      vatAmount,
      totalPrice,
      currency: PRICING_CONSTANTS.CURRENCY
    }

    currentPrice.value = result
    return result
  }

  function setPromoCode(code: string) {
    promoCode.value = code
    promoCodeError.value = null
  }

  function applyDiscount(discount: Discount) {
    appliedDiscount.value = discount
    promoCodeError.value = null
  }

  function removeDiscount() {
    appliedDiscount.value = null
    promoCode.value = ''
  }

  function setPromoCodeError(error: string) {
    promoCodeError.value = error
  }

  function clearPromoCodeError() {
    promoCodeError.value = null
  }

  function setComponentPrice(componentId: string, price: ComponentPrice) {
    componentPrices.value.set(componentId, price)
  }

  function getComponentPrice(componentId: string): number {
    const price = componentPrices.value.get(componentId)
    return price?.unitPrice || 0
  }

  function setCalculating(calculating: boolean) {
    isCalculating.value = calculating
  }

  function reset() {
    currentPrice.value = null
    appliedDiscount.value = null
    promoCode.value = ''
    promoCodeError.value = null
    isCalculating.value = false
  }

  return {
    // State
    currentPrice,
    appliedDiscount,
    promoCode,
    promoCodeError,
    componentPrices,
    isCalculating,
    // Getters
    hasDiscount,
    discountAmount,
    netPrice,
    grossPrice,
    formattedPrice,
    formattedNetPrice,
    // Actions
    formatCurrency,
    setPrice,
    calculatePrice,
    setPromoCode,
    applyDiscount,
    removeDiscount,
    setPromoCodeError,
    clearPromoCodeError,
    setComponentPrice,
    getComponentPrice,
    setCalculating,
    reset
  }
})
