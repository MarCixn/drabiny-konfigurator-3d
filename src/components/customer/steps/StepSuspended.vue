<script setup lang="ts">
/**
 * StepSuspended.vue - Step 6
 * Suspended ladder option (ladder doesn't reach the ground)
 */

import { useCustomerStore } from '../../../stores/customer.store'

const store = useCustomerStore()

function updateHeight(event: Event) {
  const value = parseFloat((event.target as HTMLInputElement).value)
  if (!isNaN(value)) {
    store.setSuspendedHeight(value)
  }
}
</script>

<template>
  <div class="step-suspended">
    <p class="step-description">
      Czy drabina ma byc zawieszona (nie siega do ziemi)?
      Drabiny zawieszone sa stosowane gdy dostep od dolu jest ograniczony.
    </p>

    <!-- Main toggle -->
    <div class="suspended-toggle">
      <button
        class="toggle-option"
        :class="{ selected: !store.config.isSuspended }"
        @click="store.setSuspended(false)"
      >
        <div class="option-visual">
          <div class="ladder-visual ground">
            <div class="wall"></div>
            <div class="ladder"></div>
            <div class="ground-line"></div>
          </div>
        </div>
        <span class="option-label">Drabina do ziemi</span>
        <span class="option-desc">Standardowy montaz</span>
      </button>

      <button
        class="toggle-option"
        :class="{ selected: store.config.isSuspended }"
        @click="store.setSuspended(true)"
      >
        <div class="option-visual">
          <div class="ladder-visual suspended">
            <div class="wall"></div>
            <div class="ladder"></div>
            <div class="gap"></div>
            <div class="ground-line"></div>
          </div>
        </div>
        <span class="option-label">Drabina zawieszona</span>
        <span class="option-desc">Nie siega do ziemi</span>
      </button>
    </div>

    <!-- Height input (when suspended) -->
    <div v-if="store.config.isSuspended" class="suspended-height">
      <h4>Wysokosc zawieszenia</h4>
      <p class="height-desc">
        Odleglosc od dolnej krawedzi drabiny do poziomu gruntu.
      </p>

      <div class="form-group">
        <div class="input-with-unit">
          <input
            type="number"
            :value="store.config.suspendedHeight"
            @input="updateHeight"
            min="0.5"
            max="5"
            step="0.1"
          />
          <span class="unit">m</span>
        </div>
        <span class="hint">Od 0.5 m do 5 m</span>
      </div>

      <div class="slider-container">
        <input
          type="range"
          :value="store.config.suspendedHeight"
          @input="updateHeight"
          min="0.5"
          max="5"
          step="0.1"
        />
        <div class="slider-labels">
          <span>0.5m</span>
          <span>2.5m</span>
          <span>5m</span>
        </div>
      </div>
    </div>

    <!-- Info -->
    <div class="info-box">
      <strong>Kiedy stosowac drabine zawieszona?</strong>
      <ul>
        <li>Gdy pod drabina znajduje sie przeszkoda (chodnik, budynek)</li>
        <li>Ze wzgledow bezpieczenstwa (ograniczenie dostpu)</li>
        <li>W strefach ruchu pieszego lub pojazdow</li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.step-suspended {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.step-description {
  color: #666;
  margin: 0;
  line-height: 1.5;
}

.suspended-toggle {
  display: flex;
  gap: 1rem;
}

.toggle-option {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 1rem;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  background: white;
  cursor: pointer;
  transition: all 0.2s;
}

.toggle-option:hover {
  border-color: #3498db;
}

.toggle-option.selected {
  border-color: #3498db;
  background: #ebf5fb;
}

.option-visual {
  margin-bottom: 0.75rem;
}

.ladder-visual {
  width: 60px;
  height: 80px;
  position: relative;
}

.ladder-visual .wall {
  position: absolute;
  left: 0;
  top: 0;
  width: 15px;
  height: 70px;
  background: #8b7355;
}

.ladder-visual .ladder {
  position: absolute;
  left: 20px;
  top: 0;
  width: 8px;
  background: #3498db;
}

.ladder-visual.ground .ladder {
  height: 70px;
}

.ladder-visual.suspended .ladder {
  height: 50px;
}

.ladder-visual .gap {
  position: absolute;
  left: 20px;
  top: 50px;
  width: 8px;
  height: 20px;
  border-left: 2px dashed #95a5a6;
  border-right: 2px dashed #95a5a6;
}

.ladder-visual .ground-line {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: #333;
}

.option-label {
  font-weight: 600;
  color: #333;
  margin-bottom: 0.25rem;
}

.option-desc {
  font-size: 0.85rem;
  color: #666;
}

.suspended-height {
  background: #f8f9fa;
  border-radius: 8px;
  padding: 1rem;
}

.suspended-height h4 {
  margin: 0 0 0.5rem 0;
  color: #333;
}

.height-desc {
  font-size: 0.9rem;
  color: #666;
  margin: 0 0 1rem 0;
}

.form-group {
  margin-bottom: 1rem;
}

.input-with-unit {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.input-with-unit input[type="number"] {
  width: 100px;
  padding: 0.5rem;
  border: 2px solid #e0e0e0;
  border-radius: 6px;
  font-size: 1.1rem;
}

.input-with-unit input:focus {
  outline: none;
  border-color: #3498db;
}

.unit {
  color: #666;
}

.hint {
  display: block;
  font-size: 0.85rem;
  color: #888;
  margin-top: 0.25rem;
}

.slider-container {
  margin-top: 0.5rem;
}

.slider-container input[type="range"] {
  width: 100%;
  height: 8px;
  appearance: none;
  background: #e0e0e0;
  border-radius: 4px;
  outline: none;
}

.slider-container input[type="range"]::-webkit-slider-thumb {
  appearance: none;
  width: 20px;
  height: 20px;
  background: #3498db;
  border-radius: 50%;
  cursor: pointer;
}

.slider-labels {
  display: flex;
  justify-content: space-between;
  font-size: 0.8rem;
  color: #888;
  margin-top: 0.25rem;
}

.info-box {
  background: #fff8e1;
  border-left: 4px solid #f39c12;
  padding: 1rem;
  border-radius: 0 8px 8px 0;
  font-size: 0.9rem;
}

.info-box strong {
  display: block;
  margin-bottom: 0.5rem;
  color: #d68910;
}

.info-box ul {
  margin: 0;
  padding-left: 1.25rem;
  color: #666;
}

.info-box li {
  margin-bottom: 0.25rem;
}
</style>
