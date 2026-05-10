<script setup lang="ts">
import { computed } from 'vue'
import { useConfigStore, useThreeDStore } from '@/stores'

const configStore = useConfigStore()
const threeDStore = useThreeDStore()

const typeLabels: Record<string, string> = {
  facade: 'Fasadowa',
  chimney: 'Kominowa'
}

const schemeLabels: Record<string, string> = {
  'with-platform': 'Z podestem',
  'no-platform': 'Z poręczami asekuracyjnymi'
}

const cageLabels: Record<string, string> = {
  'no-cage': 'Bez kosza',
  'from-3m': 'Od 3m wysokości',
  'from-ground': 'Od podstawy'
}

const components = computed(() => {
  // Użyj specyfikacji ze store jeśli jest dostępna
  if (configStore.specification?.components) {
    return configStore.specification.components
  }

  // Fallback
  const list = []

  if (threeDStore.state.numX7Ladders > 0) {
    list.push({
      id: '1',
      name: 'Moduł drabiny X7 (7 szczebli)',
      quantity: threeDStore.state.numX7Ladders,
      unit: 'szt.'
    })
  }

  if (threeDStore.state.finalLadderRungs > 0) {
    list.push({
      id: '2',
      name: `Moduł końcowy (${threeDStore.state.finalLadderRungs} szczebli)`,
      quantity: 1,
      unit: 'szt.'
    })
  }

  if (configStore.config.scheme === 'with-platform') {
    list.push({
      id: '3',
      name: 'Podest z poręczami',
      quantity: 1,
      unit: 'kpl.'
    })
  } else {
    list.push({
      id: '3',
      name: 'Poręcze asekuracyjne',
      quantity: 2,
      unit: 'szt.'
    })
  }

  if (threeDStore.state.safetyCageCount > 0) {
    list.push({
      id: '4',
      name: 'Obręcz kosza bezpieczeństwa',
      quantity: threeDStore.state.safetyCageCount,
      unit: 'szt.'
    })
  }

  return list
})
</script>

<template>
  <div class="summary-panel">
    <!-- Parametry drabiny -->
    <div class="config-summary">
      <div class="config-summary-title">Parametry drabiny</div>
      <div class="config-summary-row">
        <span class="label">Typ:</span>
        <span class="value">{{ typeLabels[configStore.config.type] }}</span>
      </div>
      <div class="config-summary-row">
        <span class="label">Wysokość ściany:</span>
        <span class="value">{{ configStore.config.wallHeight.toFixed(1) }} m</span>
      </div>
      <div class="config-summary-row">
        <span class="label">Zakończenie:</span>
        <span class="value">{{ schemeLabels[configStore.config.scheme] }}</span>
      </div>
      <div class="config-summary-row">
        <span class="label">Kosz:</span>
        <span class="value">{{ cageLabels[configStore.config.cage] }}</span>
      </div>
    </div>

    <!-- Lista komponentów -->
    <div class="components-section">
      <h3>Lista komponentów</h3>
      <ul class="components-list">
        <li v-for="component in components" :key="component.id" class="component-item">
          <span class="component-name">{{ component.name }}</span>
          <span class="component-qty">{{ component.quantity }} {{ component.unit }}</span>
        </li>
      </ul>
    </div>

    <!-- Cena -->
    <div class="price-section">
      <div class="price-row">
        <span>Cena netto:</span>
        <span class="price">-- zł</span>
      </div>
      <div class="price-row price-row--total">
        <span>Cena brutto:</span>
        <span class="price price--total">-- zł</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.summary-panel {
  display: flex;
  flex-direction: column;
  gap: 25px;
}

.components-section h3 {
  font-size: 0.85rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 15px;
}

.components-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.component-item {
  display: flex;
  justify-content: space-between;
  padding: 10px 0;
  border-bottom: 1px solid var(--border);
  font-size: 0.9rem;
}

.component-item:last-child {
  border-bottom: none;
}

.component-name {
  color: var(--text-secondary);
}

.component-qty {
  font-weight: 600;
  color: var(--text-primary);
}

.price-section {
  background: var(--bg-primary);
  padding: 18px;
  border-radius: var(--radius-md);
}

.price-row {
  display: flex;
  justify-content: space-between;
  font-size: 0.95rem;
  color: var(--text-secondary);
  margin-bottom: 10px;
}

.price-row--total {
  margin-bottom: 0;
  padding-top: 12px;
  border-top: 1px solid var(--border);
}

.price {
  font-weight: 500;
}

.price--total {
  font-size: 1.3rem;
  font-weight: 700;
  color: var(--accent);
}
</style>
