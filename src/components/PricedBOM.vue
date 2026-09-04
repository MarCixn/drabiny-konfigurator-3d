<template>
  <div class="priced-bom">
    <!-- Header -->
    <div class="bom-header">
      <h3>Lista elementow z wycena</h3>
      <div class="bom-actions">
        <button @click="refreshPrices" :disabled="isLoading" class="btn-refresh">
          {{ isLoading ? 'Ladowanie...' : 'Odswiez ceny' }}
        </button>
      </div>
    </div>

    <!-- Loading state -->
    <div v-if="isLoading && items.length === 0" class="bom-loading">
      Ladowanie cen z bazy danych...
    </div>

    <!-- Error state -->
    <div v-if="error" class="bom-error">
      {{ error }}
    </div>

    <!-- Items list -->
    <div v-if="items.length > 0" class="bom-content">
      <!-- Table header -->
      <div class="bom-table-header">
        <div class="col-img">Zdjecie</div>
        <div class="col-name">Nazwa</div>
        <div class="col-qty">Ilosc</div>
        <div class="col-price">Cena jedn.</div>
        <div class="col-total">Wartosc</div>
      </div>

      <!-- Items -->
      <div
        v-for="item in items"
        :key="item.id"
        class="bom-item"
        :class="{ 'has-painting': item.paintingPrice > 0 }"
      >
        <div class="col-img">
          <img
            v-if="item.image"
            :src="getImageUrl(item.image)"
            :alt="item.namePL"
            class="item-image"
          />
          <div v-else class="no-image">-</div>
        </div>
        <div class="col-name">
          <span class="item-name">{{ item.namePL }}</span>
          <span v-if="item.details" class="item-details">{{ item.details }}</span>
        </div>
        <div class="col-qty">
          {{ item.quantity }} {{ item.unit }}
        </div>
        <div class="col-price">
          <span v-if="item.unitPrice > 0">{{ formatPrice(item.unitPrice) }}</span>
          <span v-else class="no-price">-</span>
        </div>
        <div class="col-total">
          <span v-if="item.totalPrice > 0" class="price-value">{{ formatPrice(item.totalPrice) }}</span>
          <span v-else class="no-price">-</span>
        </div>
      </div>

      <!-- Painting row (if enabled) -->
      <div v-if="totalPaintingPrice > 0" class="bom-item painting-row">
        <div class="col-img">
          <div class="painting-icon">RAL</div>
        </div>
        <div class="col-name">
          <span class="item-name">Malowanie proszkowe RAL {{ ralColor }}</span>
          <span class="item-details">Wszystkie elementy stalowe</span>
        </div>
        <div class="col-qty">1 kpl.</div>
        <div class="col-price">-</div>
        <div class="col-total">
          <span class="price-value">{{ formatPrice(totalPaintingPrice) }}</span>
        </div>
      </div>

      <!-- Separator -->
      <div class="bom-separator"></div>

      <!-- Subtotal -->
      <div class="bom-summary-row">
        <div class="summary-label">Suma netto:</div>
        <div class="summary-value">{{ formatPrice(subtotal) }}</div>
      </div>

      <!-- Discount (if any) -->
      <div v-if="discountAmount > 0" class="bom-summary-row discount">
        <div class="summary-label">Rabat ({{ discountPercent }}%):</div>
        <div class="summary-value">-{{ formatPrice(discountAmount) }}</div>
      </div>

      <!-- Net total -->
      <div class="bom-summary-row total-net">
        <div class="summary-label">Razem netto:</div>
        <div class="summary-value">{{ formatPrice(totalNet) }}</div>
      </div>

      <!-- VAT -->
      <div class="bom-summary-row vat">
        <div class="summary-label">VAT (23%):</div>
        <div class="summary-value">{{ formatPrice(vatAmount) }}</div>
      </div>

      <!-- Gross total -->
      <div class="bom-summary-row total-gross">
        <div class="summary-label">Razem brutto:</div>
        <div class="summary-value total">{{ formatPrice(totalGross) }}</div>
      </div>
    </div>

    <!-- Empty state -->
    <div v-if="!isLoading && items.length === 0" class="bom-empty">
      Brak elementow do wyswietlenia. Skonfiguruj drabine.
    </div>

    <!-- Actions -->
    <div v-if="items.length > 0" class="bom-footer">
      <button @click="$emit('save')" class="btn-save">
        Zapisz oferte
      </button>
      <button @click="$emit('generatePdf')" class="btn-pdf">
        Generuj PDF
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useApi } from '@/composables'

// ============================================================================
// Props & Emits
// ============================================================================

export interface PricedBOMItem {
  id: string
  code: string
  name: string
  namePL: string
  quantity: number
  unit: string
  category: string
  details?: string
  image?: string
  unitPrice: number
  totalPrice: number
  paintingPrice: number
}

const props = defineProps<{
  bomItems: Array<{
    id: string
    name: string
    namePL: string
    quantity: number
    unit: string
    category: string
    details?: string
    image?: string
  }>
  ralPainting?: boolean
  ralColor?: string
  discountPercent?: number
}>()

const emit = defineEmits<{
  (e: 'save'): void
  (e: 'generatePdf'): void
  (e: 'pricesLoaded', items: PricedBOMItem[], totals: { net: number; gross: number }): void
}>()

// ============================================================================
// API Integration
// ============================================================================

const api = useApi()

const isLoading = ref(false)
const error = ref<string | null>(null)
const items = ref<PricedBOMItem[]>([])

// ============================================================================
// Price Mapping (BOM id -> product code)
// ============================================================================

// Mapping BOM item.name (from ThreeCanvas) to database product codes
const codeMapping: Record<string, string> = {
  // Drabiny (moduły)
  'ladder_x7': 'drabina_powielana_7',
  'ladder_x8': 'drabina_powielana_7', // X8 uses same price as X7
  'ladder_x1': 'drabina_koncowa_1',
  'ladder_x2': 'drabina_koncowa_2',
  'ladder_x3': 'drabina_koncowa_3',
  'ladder_x4': 'drabina_koncowa_4',
  'ladder_x5': 'drabina_koncowa_5',
  'ladder_x6': 'drabina_koncowa_6',

  // Łączniki i uchwyty
  'connector_uchwyt': 'uchwyt_montazowo_laczacy',
  'connector_sciskany': 'uchwyt_montazowo_sciskany',
  'module_connector': 'element_laczacy',

  // Wsporniki
  'wspornik_krotki': 'wspornik_16_26',
  'wspornik_sredni': 'wspornik_26_36',
  'wspornik_dlugi': 'wspornik_36_46',
  // Typ C - klucz z ThreeCanvas powstaje jako 'wspornik_' + typ, wiec jest juz
  // identyczny z kodem w cenniku. Wpisujemy go jawnie, zeby nie polegac na tym,
  // czy mapa przepuszcza nieznane klucze bez zmiany.
  'wspornik_typ_c_16_26': 'wspornik_typ_c_16_26',
  'wspornik_typ_c_26_36': 'wspornik_typ_c_26_36',
  'wspornik_typ_c_36_46': 'wspornik_typ_c_36_46',
  'wspornik_typ_c_50_60': 'wspornik_typ_c_50_60',
  'wspornik_typ_c_60_70': 'wspornik_typ_c_60_70',
  'wspornik_typ_c_70_80': 'wspornik_typ_c_70_80',

  // Poręcze
  'handrail': 'porece_asekuracyjne',
  'handrail_connector': 'lacznik_poreczy',

  // Kosz bezpieczeństwa
  'cage_hoop': 'obrecz_kosza',
  'cage_closing': 'blokada_dostepu',
  'angle_bracket_x2': 'katownik_2_otworowy',
  'angle_bracket_x3': 'katownik_3_otworowy',
  'angle_bracket_x4': 'katownik_4_otworowy',

  // Podest
  'platform': 'podest_z_poreczami',
  'resting_platform': 'podest_spoczynkowy',

  // Attyka i montaż
  'attic_passage': 'przejscie_attyka',
  'bigfoot': 'bigfoot',
  'bigfoot_guide': 'prowadnica_bigfoot'
}


function getProductCode(bomId: string): string {
  // Direct mapping
  if (codeMapping[bomId]) {
    return codeMapping[bomId]
  }

  // Try to extract rungs number from id (e.g., 'drabina-koncowa-x3' -> 'drabina_koncowa_3')
  const match = bomId.match(/drabina-koncowa-x(\d+)/)
  if (match) {
    return `drabina_koncowa_${match[1]}`
  }

  // Fallback: convert dashes to underscores
  return bomId.replace(/-/g, '_')
}

// ============================================================================
// Load Prices
// ============================================================================

async function loadPrices() {
  if (!props.bomItems || props.bomItems.length === 0) {
    items.value = []
    return
  }

  isLoading.value = true
  error.value = null

  try {
    // Try to load prices from API
    await api.loadPrices()
  } catch (err) {
    console.warn('[PricedBOM] API not available, using fallback prices')
  }

  // Map BOM items to priced items
  // Use item.name (e.g., 'ladder_x7') to lookup prices, not item.id (e.g., 'item_1')
  const pricedItems: PricedBOMItem[] = props.bomItems.map(item => {
    const itemName = item.name || item.id  // BOM items have 'name' field
    const code = getProductCode(itemName)
    const unitPrice = api.getPrice(code)

    const paintingUnitPrice = props.ralPainting ? api.getPaintingPrice(code) : 0

    return {
      ...item,
      code,
      unitPrice,
      totalPrice: unitPrice * item.quantity,
      paintingPrice: paintingUnitPrice * item.quantity
    }
  })

  items.value = pricedItems

  // Emit event with prices
  emit('pricesLoaded', pricedItems, {
    net: totalNet.value,
    gross: totalGross.value
  })

  isLoading.value = false
}

function refreshPrices() {
  loadPrices()
}

// ============================================================================
// Computed Totals
// ============================================================================

const subtotal = computed(() => {
  return items.value.reduce((sum, item) => sum + item.totalPrice, 0)
})

const totalPaintingPrice = computed(() => {
  if (!props.ralPainting) return 0
  return items.value.reduce((sum, item) => sum + item.paintingPrice, 0)
})

const discountAmount = computed(() => {
  if (!props.discountPercent || props.discountPercent <= 0) return 0
  return (subtotal.value + totalPaintingPrice.value) * (props.discountPercent / 100)
})

const totalNet = computed(() => {
  return subtotal.value + totalPaintingPrice.value - discountAmount.value
})

const vatAmount = computed(() => {
  return totalNet.value * 0.23
})

const totalGross = computed(() => {
  return totalNet.value + vatAmount.value
})

// ============================================================================
// Helpers
// ============================================================================

function formatPrice(price: number): string {
  return price.toLocaleString('pl-PL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }) + ' zl'
}

function getImageUrl(imageName: string): string {
  // Map image names to actual file names
  const imageMap: Record<string, string> = {
    'drabina-x7': 'Drabina_powielana.png',
    'drabina-x8': 'Drabina_powielana.png',
    'drabina-koncowa-x1': 'x1.png',
    'drabina-koncowa-x2': 'x2.png',
    'drabina-koncowa-x3': 'x3.png',
    'drabina-koncowa-x4': 'x4.png',
    'drabina-koncowa-x5': 'x5.png',
    'drabina-koncowa-x6': 'x6.png',
    'lacznik-drabin': 'lacznikdrabin.png',
    'wspornik-sciskany': 'wspornik_sciskany.png',
    'wspornik-krotki': 'krótkie.png',
    'wspornik-sredni': 'średnie.png',
    'wspornik-dlugi': 'długie.png',
    'obrecz': 'obrecz.png',
    'l-ki': 'lka.png',
    'lacznik-poreczy': 'lacznik.png',
    'katownik-x4': 'x44.png'
  }

  const fileName = imageMap[imageName] || `${imageName}.png`
  return `/bom-images/${fileName}`
}

// ============================================================================
// Watchers & Lifecycle
// ============================================================================

// Load prices when bomItems change (immediate: true to run on mount)
watch(() => props.bomItems, () => {
  loadPrices()
}, { deep: true, immediate: true })

watch(() => props.ralPainting, () => {
  loadPrices()
})

// ============================================================================
// Expose for parent
// ============================================================================

defineExpose({
  items,
  totalNet,
  totalGross,
  refreshPrices
})
</script>

<style scoped>
.priced-bom {
  background: #1a1a2e;
  border-radius: 12px;
  padding: 20px;
  color: #fff;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.bom-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding-bottom: 15px;
  border-bottom: 1px solid #333;
}

.bom-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.btn-refresh {
  padding: 8px 16px;
  background: #333;
  color: #fff;
  border: 1px solid #444;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  transition: background 0.2s;
}

.btn-refresh:hover:not(:disabled) {
  background: #444;
}

.btn-refresh:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.bom-loading,
.bom-error,
.bom-empty {
  text-align: center;
  padding: 40px;
  color: #888;
}

.bom-error {
  color: #f87171;
}

/* Table layout */
.bom-table-header,
.bom-item {
  display: grid;
  grid-template-columns: 50px 1fr 80px 100px 100px;
  gap: 10px;
  align-items: center;
  padding: 10px 0;
}

.bom-table-header {
  font-size: 12px;
  color: #888;
  text-transform: uppercase;
  border-bottom: 1px solid #333;
  padding-bottom: 10px;
  margin-bottom: 5px;
}

.bom-item {
  border-bottom: 1px solid #2a2a3e;
}

.bom-item:last-of-type {
  border-bottom: none;
}

.col-img {
  display: flex;
  justify-content: center;
}

.item-image {
  width: 40px;
  height: 40px;
  object-fit: contain;
  border-radius: 4px;
  background: #2a2a3e;
}

.no-image {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #2a2a3e;
  border-radius: 4px;
  color: #555;
}

.col-name {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.item-name {
  font-size: 14px;
  font-weight: 500;
}

.item-details {
  font-size: 12px;
  color: #888;
}

.col-qty,
.col-price,
.col-total {
  text-align: right;
  font-size: 14px;
}

.price-value {
  font-weight: 600;
  color: #4ade80;
}

.no-price {
  color: #555;
}

/* Painting row */
.painting-row {
  background: rgba(59, 130, 246, 0.1);
  border-radius: 6px;
  margin: 10px 0;
  padding: 10px !important;
}

.painting-icon {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #3b82f6, #8b5cf6);
  border-radius: 4px;
  font-size: 10px;
  font-weight: 700;
}

/* Summary */
.bom-separator {
  height: 2px;
  background: linear-gradient(90deg, transparent, #444, transparent);
  margin: 20px 0;
}

.bom-summary-row {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  font-size: 14px;
}

.summary-label {
  color: #888;
}

.summary-value {
  font-weight: 500;
}

.bom-summary-row.discount .summary-value {
  color: #f87171;
}

.bom-summary-row.total-net {
  font-size: 16px;
  padding-top: 15px;
  border-top: 1px solid #333;
}

.bom-summary-row.vat {
  color: #888;
}

.bom-summary-row.total-gross {
  font-size: 20px;
  padding-top: 15px;
  border-top: 2px solid #4ade80;
  margin-top: 10px;
}

.bom-summary-row.total-gross .summary-label {
  color: #fff;
  font-weight: 600;
}

.bom-summary-row.total-gross .summary-value.total {
  color: #4ade80;
  font-weight: 700;
}

/* Footer */
.bom-footer {
  display: flex;
  gap: 10px;
  margin-top: 20px;
  padding-top: 20px;
  border-top: 1px solid #333;
}

.btn-save,
.btn-pdf {
  flex: 1;
  padding: 12px 20px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-save {
  background: linear-gradient(135deg, #3b82f6, #2563eb);
  color: #fff;
}

.btn-save:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
}

.btn-pdf {
  background: linear-gradient(135deg, #10b981, #059669);
  color: #fff;
}

.btn-pdf:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
}

/* Responsive */
@media (max-width: 600px) {
  .bom-table-header,
  .bom-item {
    grid-template-columns: 40px 1fr 60px 80px;
  }

  .col-price {
    display: none;
  }

  .bom-footer {
    flex-direction: column;
  }
}
</style>
