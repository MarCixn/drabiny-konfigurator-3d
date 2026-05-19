<script setup lang="ts">
/**
 * StepSummary.vue - Step 7
 * Summary with 3D preview, BOM and pricing
 */

import { ref, computed, onMounted, watch } from 'vue'
import { useCustomerStore } from '../../../stores/customer.store'
import { calculateLadder, type ComponentItem } from '../../../services/api'

const store = useCustomerStore()

const bom = ref<ComponentItem[]>([])
const isLoading = ref(false)
const error = ref<string | null>(null)

async function calculate() {
  isLoading.value = true
  error.value = null

  try {
    const result = await calculateLadder(store.apiConfig)
    bom.value = result.components
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Blad obliczen'
  } finally {
    isLoading.value = false
  }
}

// Calculate on mount and when config changes
onMounted(calculate)

watch(
  () => store.apiConfig,
  () => calculate(),
  { deep: true }
)

// Total price
const totalPrice = computed(() => {
  return bom.value.reduce((sum, item) => sum + item.totalPrice, 0)
})

// Format config for display
function formatRoofType(type: string | null): string {
  switch (type) {
    case 'flat': return 'Plaski'
    case 'with-eave': return 'Z okapem'
    case 'with-parapet': return 'Murek attykowy'
    default: return '-'
  }
}

function formatPrice(price: number): string {
  return price.toFixed(2).replace('.', ',') + ' zl'
}
</script>

<template>
  <div class="step-summary">
    <p class="step-description">
      Sprawdz konfiguracje i zapisz oferte.
    </p>

    <!-- Configuration summary -->
    <div class="config-summary">
      <h4>Twoja konfiguracja</h4>

      <div class="summary-grid">
        <div class="summary-item">
          <span class="label">Typ dachu:</span>
          <span class="value">{{ formatRoofType(store.config.roofType) }}</span>
        </div>

        <div class="summary-item">
          <span class="label">Wysokosc sciany:</span>
          <span class="value">{{ store.config.wallHeight }} m</span>
        </div>

        <div class="summary-item">
          <span class="label">Izolacja:</span>
          <span class="value">{{ store.config.insulationThickness }} cm</span>
        </div>

        <div v-if="store.config.roofType === 'with-eave'" class="summary-item">
          <span class="label">Okap:</span>
          <span class="value">{{ store.config.eaveWidth }} x {{ store.config.eaveDepth }} cm</span>
        </div>

        <div class="summary-item">
          <span class="label">Przeszkody:</span>
          <span class="value">
            {{ store.config.obstacles.length > 0 ? store.config.obstacles.length + ' szt.' : 'Brak' }}
          </span>
        </div>

        <div class="summary-item">
          <span class="label">Kosz ochronny:</span>
          <span class="value">{{ store.config.hasSafetyCage ? 'Tak' : 'Nie' }}</span>
        </div>

        <div v-if="store.config.hasSafetyCage && store.config.cageClosing" class="summary-item">
          <span class="label">Zamykanie kosza:</span>
          <span class="value">Tak</span>
        </div>

        <div v-if="store.config.hasSafetyCage && store.config.restingPlatform" class="summary-item">
          <span class="label">Podest spoczynkowy:</span>
          <span class="value">Tak</span>
        </div>

        <div class="summary-item">
          <span class="label">Zawieszenie:</span>
          <span class="value">
            {{ store.config.isSuspended ? store.config.suspendedHeight + ' m' : 'Nie' }}
          </span>
        </div>
      </div>
    </div>

    <!-- Loading state -->
    <div v-if="isLoading" class="loading">
      <div class="spinner"></div>
      <span>Obliczanie komponentow...</span>
    </div>

    <!-- Error state -->
    <div v-else-if="error" class="error">
      <span class="error-icon">!</span>
      <span>{{ error }}</span>
      <button @click="calculate" class="retry-btn">Ponow</button>
    </div>

    <!-- BOM -->
    <div v-else-if="bom.length > 0" class="bom-section">
      <h4>Lista elementow</h4>
      <div class="bom-table">
        <div class="bom-row header">
          <span class="col-name">Element</span>
          <span class="col-qty">Ilosc</span>
          <span class="col-price">Cena</span>
        </div>
        <div v-for="item in bom" :key="item.code" class="bom-row">
          <span class="col-name">{{ item.name }}</span>
          <span class="col-qty">{{ item.quantity }} {{ item.unit }}</span>
          <span class="col-price">{{ formatPrice(item.totalPrice) }}</span>
        </div>
        <div class="bom-row total">
          <span class="col-name">Razem</span>
          <span class="col-qty"></span>
          <span class="col-price">{{ formatPrice(totalPrice) }}</span>
        </div>
      </div>
    </div>

    <!-- Note -->
    <div class="note">
      <strong>Uwaga:</strong>
      Podgkad 3D widoczny jest po lewej stronie ekranu.
      Kliknij "Zapisz oferte" aby wygenerowac numer referencyjny.
    </div>
  </div>
</template>

<style scoped>
.step-summary {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.step-description {
  color: #666;
  margin: 0;
  line-height: 1.5;
}

.config-summary {
  background: #f8f9fa;
  border-radius: 8px;
  padding: 1rem;
}

.config-summary h4 {
  margin: 0 0 1rem 0;
  color: #333;
  font-size: 1rem;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.75rem;
}

.summary-item {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.summary-item .label {
  font-size: 0.8rem;
  color: #888;
}

.summary-item .value {
  font-size: 1rem;
  font-weight: 600;
  color: #333;
}

.loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  padding: 2rem;
  color: #666;
}

.spinner {
  width: 24px;
  height: 24px;
  border: 3px solid #e0e0e0;
  border-top-color: #3498db;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.error {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem;
  background: #fdecea;
  border-radius: 8px;
  color: #c0392b;
}

.error-icon {
  width: 24px;
  height: 24px;
  background: #e74c3c;
  color: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
}

.retry-btn {
  margin-left: auto;
  padding: 0.5rem 1rem;
  background: #e74c3c;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.bom-section {
  background: white;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  overflow: hidden;
}

.bom-section h4 {
  margin: 0;
  padding: 1rem;
  background: #f8f9fa;
  border-bottom: 1px solid #e0e0e0;
  font-size: 1rem;
  color: #333;
}

.bom-table {
  font-size: 0.9rem;
}

.bom-row {
  display: flex;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid #f0f0f0;
}

.bom-row.header {
  font-weight: 600;
  background: #fafafa;
  color: #666;
}

.bom-row.total {
  font-weight: 600;
  background: #f0f8ff;
  border-top: 2px solid #3498db;
}

.col-name {
  flex: 1;
}

.col-qty {
  width: 80px;
  text-align: center;
}

.col-price {
  width: 100px;
  text-align: right;
}

.note {
  background: #e8f8f5;
  border-left: 4px solid #27ae60;
  padding: 1rem;
  border-radius: 0 8px 8px 0;
  font-size: 0.9rem;
  color: #1e8449;
}

.note strong {
  display: block;
  margin-bottom: 0.25rem;
}
</style>
