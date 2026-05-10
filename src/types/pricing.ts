/**
 * Typy dla cennika i rabatów
 */

export interface PriceResult {
  basePrice: number
  discount: number
  discountPercent: number
  vatAmount: number
  totalPrice: number
  currency: string
}

export interface Discount {
  id: string
  code: string
  type: 'percent' | 'fixed'
  value: number
  minOrderValue?: number
  maxDiscount?: number
  validFrom?: Date
  validTo?: Date
  isActive: boolean
}

export interface PriceModifier {
  id: string
  name: string
  type: 'multiplier' | 'fixed'
  value: number
  appliesTo: 'all' | 'component' | 'category'
  targetId?: string
}

export interface ComponentPrice {
  componentId: string
  unitPrice: number
  currency: string
  lastUpdated: Date
}

export const PRICING_CONSTANTS = {
  VAT_RATE: 0.23, // 23% VAT
  CURRENCY: 'PLN',
  DEFAULT_SHIPPING_COST: 0, // Darmowa dostawa
  MIN_ORDER_FOR_FREE_SHIPPING: 0
} as const
