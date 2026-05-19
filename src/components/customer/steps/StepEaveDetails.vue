<script setup lang="ts">
/**
 * StepEaveDetails.vue - Step 3
 * Eave width and depth (only shown for with-eave roof type)
 */

import { useCustomerStore } from '../../../stores/customer.store'

const store = useCustomerStore()

function updateEaveWidth(event: Event) {
  const value = parseFloat((event.target as HTMLInputElement).value)
  if (!isNaN(value)) {
    store.setEaveDetails(value, store.config.eaveDepth)
  }
}

function updateEaveDepth(event: Event) {
  const value = parseFloat((event.target as HTMLInputElement).value)
  if (!isNaN(value)) {
    store.setEaveDetails(store.config.eaveWidth, value)
  }
}
</script>

<template>
  <div class="step-eave-details">
    <p class="step-description">
      Podaj wymiary okapu wystajacego nad sciana.
    </p>

    <div class="eave-diagram">
      <svg viewBox="0 0 200 150" class="eave-svg">
        <!-- Wall -->
        <rect x="20" y="50" width="20" height="100" fill="#8b7355" />
        <!-- Eave -->
        <rect x="20" y="30" width="20" height="20" fill="#555" />
        <rect x="40" y="40" :width="Math.min(100, store.config.eaveDepth)" height="10" fill="#555" />
        <!-- Dimension arrows -->
        <line x1="10" y1="30" x2="10" y2="50" stroke="#3498db" stroke-width="1" marker-start="url(#arrow)" marker-end="url(#arrow)" />
        <text x="5" y="42" font-size="10" fill="#3498db">W</text>
        <line x1="40" y1="55" :x2="40 + Math.min(100, store.config.eaveDepth)" y2="55" stroke="#e74c3c" stroke-width="1" marker-start="url(#arrow2)" marker-end="url(#arrow2)" />
        <text :x="40 + Math.min(50, store.config.eaveDepth / 2)" y="65" font-size="10" fill="#e74c3c">G</text>
        <defs>
          <marker id="arrow" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6" fill="none" stroke="#3498db" />
          </marker>
          <marker id="arrow2" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6" fill="none" stroke="#e74c3c" />
          </marker>
        </defs>
      </svg>
    </div>

    <div class="form-group">
      <label for="eaveWidth">
        <span class="color-indicator blue"></span>
        Wysokosc okapu (W)
      </label>
      <div class="input-with-unit">
        <input
          id="eaveWidth"
          type="number"
          :value="store.config.eaveWidth"
          @input="updateEaveWidth"
          min="5"
          max="100"
          step="5"
        />
        <span class="unit">cm</span>
      </div>
    </div>

    <div class="form-group">
      <label for="eaveDepth">
        <span class="color-indicator red"></span>
        Glebokosc okapu (G)
      </label>
      <div class="input-with-unit">
        <input
          id="eaveDepth"
          type="number"
          :value="store.config.eaveDepth"
          @input="updateEaveDepth"
          min="5"
          max="100"
          step="5"
        />
        <span class="unit">cm</span>
      </div>
      <span class="hint">Odleglosc od sciany do konca okapu</span>
    </div>
  </div>
</template>

<style scoped>
.step-eave-details {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.step-description {
  color: #666;
  margin: 0;
  line-height: 1.5;
}

.eave-diagram {
  background: #f5f5f5;
  border-radius: 8px;
  padding: 1rem;
  display: flex;
  justify-content: center;
}

.eave-svg {
  width: 200px;
  height: 150px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.form-group label {
  font-weight: 600;
  color: #333;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.color-indicator {
  width: 12px;
  height: 12px;
  border-radius: 50%;
}

.color-indicator.blue {
  background: #3498db;
}

.color-indicator.red {
  background: #e74c3c;
}

.input-with-unit {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.input-with-unit input {
  flex: 1;
  padding: 0.75rem;
  border: 2px solid #e0e0e0;
  border-radius: 6px;
  font-size: 1.1rem;
  max-width: 150px;
}

.input-with-unit input:focus {
  outline: none;
  border-color: #3498db;
}

.unit {
  font-size: 1rem;
  color: #666;
  min-width: 30px;
}

.hint {
  font-size: 0.85rem;
  color: #888;
}
</style>
