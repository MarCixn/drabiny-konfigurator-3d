<script setup lang="ts">
/**
 * StepRoofType.vue - Step 1
 * Select roof type: flat, with eave, or with parapet
 */

import { useCustomerStore, type RoofType } from '../../../stores/customer.store'

const store = useCustomerStore()

const roofOptions: { value: RoofType; label: string; description: string; icon: string }[] = [
  {
    value: 'flat',
    label: 'Dach plaski',
    description: 'Standardowy dach plaski bez wystajacych elementow',
    icon: '▬'
  },
  {
    value: 'with-eave',
    label: 'Dach z okapem',
    description: 'Dach z wystajacym okapem nad sciana',
    icon: '⌐'
  },
  {
    value: 'with-parapet',
    label: 'Murek attykowy',
    description: 'Sciana zakonczna murkiem attykowym',
    icon: '⊓'
  }
]

function selectRoof(type: RoofType) {
  store.setRoofType(type)
}
</script>

<template>
  <div class="step-roof-type">
    <p class="step-description">
      Wybierz typ zakonczenia dachu w miejscu montazu drabiny.
    </p>

    <div class="roof-options">
      <button
        v-for="option in roofOptions"
        :key="option.value"
        class="roof-option"
        :class="{ selected: store.config.roofType === option.value }"
        @click="selectRoof(option.value)"
      >
        <span class="roof-icon">{{ option.icon }}</span>
        <span class="roof-label">{{ option.label }}</span>
        <span class="roof-description">{{ option.description }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.step-roof-type {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.step-description {
  color: #666;
  margin: 0;
  line-height: 1.5;
}

.roof-options {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.roof-option {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  padding: 1rem;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  background: white;
  cursor: pointer;
  transition: all 0.2s;
  text-align: left;
}

.roof-option:hover {
  border-color: #3498db;
  background: #f8f9fa;
}

.roof-option.selected {
  border-color: #3498db;
  background: #ebf5fb;
}

.roof-icon {
  font-size: 2rem;
  margin-bottom: 0.5rem;
}

.roof-label {
  font-size: 1.1rem;
  font-weight: 600;
  color: #333;
  margin-bottom: 0.25rem;
}

.roof-description {
  font-size: 0.85rem;
  color: #666;
}
</style>
