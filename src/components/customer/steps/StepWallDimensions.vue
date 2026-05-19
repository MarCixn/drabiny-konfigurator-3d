<script setup lang="ts">
/**
 * StepWallDimensions.vue - Step 2
 * Wall height and insulation thickness
 */

import { useCustomerStore } from '../../../stores/customer.store'

const store = useCustomerStore()

function updateWallHeight(event: Event) {
  const value = parseFloat((event.target as HTMLInputElement).value)
  if (!isNaN(value)) {
    store.setWallHeight(value)
  }
}

function updateInsulation(event: Event) {
  const value = parseFloat((event.target as HTMLInputElement).value)
  if (!isNaN(value)) {
    store.setInsulationThickness(value)
  }
}
</script>

<template>
  <div class="step-wall-dimensions">
    <p class="step-description">
      Podaj wysokosc sciany oraz grubosc warstwy izolacji termicznej.
    </p>

    <div class="form-group">
      <label for="wallHeight">Wysokosc sciany</label>
      <div class="input-with-unit">
        <input
          id="wallHeight"
          type="number"
          :value="store.config.wallHeight"
          @input="updateWallHeight"
          min="0.6"
          max="30"
          step="0.1"
        />
        <span class="unit">m</span>
      </div>
      <span class="hint">Od 0.6 m do 30 m</span>
    </div>

    <div class="form-group">
      <label for="insulation">Grubosc izolacji</label>
      <div class="input-with-unit">
        <input
          id="insulation"
          type="number"
          :value="store.config.insulationThickness"
          @input="updateInsulation"
          min="0"
          max="30"
          step="1"
        />
        <span class="unit">cm</span>
      </div>
      <span class="hint">Styropian, welna lub inne ocieplenie (0-30 cm)</span>
    </div>

    <div class="visual-hint">
      <div class="wall-diagram">
        <div class="wall-block">
          <span>Sciana</span>
        </div>
        <div
          class="insulation-block"
          :style="{ width: Math.max(5, store.config.insulationThickness) + 'px' }"
        >
          <span v-if="store.config.insulationThickness > 5">Izol.</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.step-wall-dimensions {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.step-description {
  color: #666;
  margin: 0;
  line-height: 1.5;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.form-group label {
  font-weight: 600;
  color: #333;
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

.visual-hint {
  padding: 1rem;
  background: #f5f5f5;
  border-radius: 8px;
}

.wall-diagram {
  display: flex;
  height: 60px;
  align-items: stretch;
}

.wall-block {
  width: 40px;
  background: #8b7355;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 0.75rem;
  writing-mode: vertical-rl;
  text-orientation: mixed;
}

.insulation-block {
  background: #ffeb99;
  border: 1px dashed #d4a500;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.7rem;
  color: #996600;
  min-width: 5px;
  transition: width 0.3s;
}
</style>
