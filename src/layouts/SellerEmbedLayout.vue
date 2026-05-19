<script setup lang="ts">
/**
 * SellerEmbedLayout.vue - Version C
 * Embed for seller panel with PostMessage communication
 */

import { ref, onMounted, onUnmounted } from 'vue'
import { calculateLadder, type ComponentItem, type LadderConfig } from '../services/api'

// Configuration received from parent via PostMessage
const config = ref<LadderConfig>({
  wallHeight: 5,
  scheme: 'no-platform',
  purpose: 'external',
  cage: 'no-cage',
  bracketType: 'short',
  bracketSpacing: 1000,
  insulationThickness: 10,
  suspended: false,
  suspendedHeight: 2.5,
  hasObstacles: false,
  obstacles: []
})

const bom = ref<ComponentItem[]>([])
const isLoading = ref(false)
const error = ref<string | null>(null)
const totalPrice = ref(0)

// Handle messages from parent window
function handleMessage(event: MessageEvent) {
  if (event.data?.type === 'LOAD_CONFIG') {
    console.log('[SellerEmbed] Received config:', event.data.payload)
    Object.assign(config.value, event.data.payload)
    calculateConfiguration()
  }
}

// Calculate and send result back to parent
async function calculateConfiguration() {
  isLoading.value = true
  error.value = null

  try {
    const result = await calculateLadder(config.value)
    bom.value = result.components
    totalPrice.value = result.components.reduce((sum, item) => sum + item.totalPrice, 0)

    // Send result back to parent
    window.parent.postMessage({
      type: 'CONFIG_RESULT',
      payload: {
        components: result.components,
        config: config.value,
        totalPrice: totalPrice.value,
        success: true
      }
    }, '*')
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Calculation error'
    window.parent.postMessage({
      type: 'CONFIG_ERROR',
      payload: { error: error.value }
    }, '*')
  } finally {
    isLoading.value = false
  }
}

onMounted(() => {
  window.addEventListener('message', handleMessage)

  // Notify parent that embed is ready
  window.parent.postMessage({ type: 'EMBED_READY' }, '*')
})

onUnmounted(() => {
  window.removeEventListener('message', handleMessage)
})

function formatPrice(price: number): string {
  return price.toFixed(2).replace('.', ',') + ' zl'
}
</script>

<template>
  <div class="seller-embed">
    <!-- Main content -->
    <div class="embed-content">
      <!-- Config summary -->
      <div class="config-info">
        <h3>Konfiguracja drabiny</h3>
        <div class="config-grid">
          <div class="config-item">
            <span class="label">Wysokosc:</span>
            <span class="value">{{ config.wallHeight }} m</span>
          </div>
          <div class="config-item">
            <span class="label">Kosz:</span>
            <span class="value">{{ config.cage === 'with-cage' ? 'Tak' : 'Nie' }}</span>
          </div>
          <div class="config-item">
            <span class="label">Zawieszenie:</span>
            <span class="value">{{ config.suspended ? config.suspendedHeight + ' m' : 'Nie' }}</span>
          </div>
        </div>
      </div>

      <!-- BOM Summary -->
      <div v-if="bom.length > 0" class="bom-summary">
        <h4>Elementy: {{ bom.length }}</h4>
        <div class="total-price">
          {{ formatPrice(totalPrice) }}
        </div>
      </div>

      <!-- Loading -->
      <div v-if="isLoading" class="loading">
        <div class="spinner"></div>
        <span>Obliczanie...</span>
      </div>

      <!-- Error -->
      <div v-if="error" class="error">
        {{ error }}
      </div>

      <!-- Instructions -->
      <div class="instructions">
        Uzyj PostMessage aby zaladowac konfiguracje:
        <code>{ type: 'LOAD_CONFIG', payload: {...} }</code>
      </div>
    </div>
  </div>
</template>

<style scoped>
.seller-embed {
  width: 100%;
  min-height: 100vh;
  background: #1a1a1a;
  color: white;
  padding: 1rem;
  box-sizing: border-box;
}

.embed-content {
  max-width: 400px;
  margin: 0 auto;
}

.config-info {
  background: #2a2a2a;
  border-radius: 8px;
  padding: 1rem;
  margin-bottom: 1rem;
}

.config-info h3 {
  margin: 0 0 1rem 0;
  font-size: 1rem;
  color: #3498db;
}

.config-grid {
  display: grid;
  gap: 0.5rem;
}

.config-item {
  display: flex;
  justify-content: space-between;
}

.config-item .label {
  color: #888;
}

.config-item .value {
  font-weight: 500;
}

.bom-summary {
  background: #27ae60;
  border-radius: 8px;
  padding: 1rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.bom-summary h4 {
  margin: 0;
  font-size: 1rem;
}

.total-price {
  font-size: 1.25rem;
  font-weight: 600;
}

.loading {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  background: #2a2a2a;
  border-radius: 8px;
  margin-bottom: 1rem;
}

.spinner {
  width: 24px;
  height: 24px;
  border: 3px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.error {
  background: #e74c3c;
  padding: 1rem;
  border-radius: 8px;
  margin-bottom: 1rem;
}

.instructions {
  font-size: 0.85rem;
  color: #666;
  padding: 1rem;
  background: #2a2a2a;
  border-radius: 8px;
}

.instructions code {
  display: block;
  margin-top: 0.5rem;
  font-size: 0.8rem;
  color: #3498db;
}
</style>
