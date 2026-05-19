<script setup lang="ts">
/**
 * StepSafetyCage.vue - Step 5
 * Safety cage options
 */

import { useCustomerStore } from '../../../stores/customer.store'

const store = useCustomerStore()
</script>

<template>
  <div class="step-safety-cage">
    <p class="step-description">
      Kosz ochronny (klatka bezpieczenstwa) jest wymagany przy drabinach
      o wysokosci wspinania ponad 3 metry.
    </p>

    <!-- Main toggle -->
    <div class="cage-toggle">
      <button
        class="toggle-option"
        :class="{ selected: !store.config.hasSafetyCage }"
        @click="store.setSafetyCage(false)"
      >
        <span class="option-icon">✗</span>
        <span class="option-label">Bez kosza</span>
        <span class="option-desc">Tylko dla niskich drabin (&lt;3m)</span>
      </button>

      <button
        class="toggle-option"
        :class="{ selected: store.config.hasSafetyCage }"
        @click="store.setSafetyCage(true)"
      >
        <span class="option-icon">✓</span>
        <span class="option-label">Z koszem ochronnym</span>
        <span class="option-desc">Wymagany dla wyzszych drabin</span>
      </button>
    </div>

    <!-- Additional options (when cage is enabled) -->
    <div v-if="store.config.hasSafetyCage" class="cage-options">
      <h4>Dodatkowe opcje</h4>

      <label class="checkbox-option">
        <input
          type="checkbox"
          :checked="store.config.cageClosing"
          @change="store.setCageClosing(($event.target as HTMLInputElement).checked)"
        />
        <span class="checkbox-label">
          <strong>Zamykanie kosza od dolu</strong>
          <span>Blokada wejscia na drabine</span>
        </span>
      </label>

      <label
        class="checkbox-option"
        :class="{ disabled: !store.needsRestingPlatformOption }"
      >
        <input
          type="checkbox"
          :checked="store.config.restingPlatform"
          :disabled="!store.needsRestingPlatformOption"
          @change="store.setRestingPlatform(($event.target as HTMLInputElement).checked)"
        />
        <span class="checkbox-label">
          <strong>Podest spoczynkowy</strong>
          <span v-if="store.needsRestingPlatformOption">
            Wymagany dla drabin &gt;5m
          </span>
          <span v-else class="hint">
            Dostepny dla drabin powyzej 5 metrow
          </span>
        </span>
      </label>
    </div>

    <!-- Info box -->
    <div class="info-box">
      <strong>Informacja:</strong>
      Zgodnie z normami PN-EN ISO 14122-4, kosz ochronny (klatka bezpieczenstwa)
      jest wymagany gdy wysokosc wspinania przekracza 3 metry.
    </div>
  </div>
</template>

<style scoped>
.step-safety-cage {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.step-description {
  color: #666;
  margin: 0;
  line-height: 1.5;
}

.cage-toggle {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.toggle-option {
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

.toggle-option:hover {
  border-color: #3498db;
}

.toggle-option.selected {
  border-color: #3498db;
  background: #ebf5fb;
}

.option-icon {
  font-size: 1.5rem;
  margin-bottom: 0.5rem;
}

.toggle-option.selected .option-icon {
  color: #27ae60;
}

.toggle-option:not(.selected) .option-icon {
  color: #95a5a6;
}

.option-label {
  font-size: 1.1rem;
  font-weight: 600;
  color: #333;
}

.option-desc {
  font-size: 0.85rem;
  color: #666;
  margin-top: 0.25rem;
}

.cage-options {
  background: #f8f9fa;
  border-radius: 8px;
  padding: 1rem;
}

.cage-options h4 {
  margin: 0 0 1rem 0;
  color: #333;
  font-size: 1rem;
}

.checkbox-option {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 0.75rem;
  background: white;
  border-radius: 6px;
  cursor: pointer;
  margin-bottom: 0.5rem;
}

.checkbox-option:hover {
  background: #f0f0f0;
}

.checkbox-option.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.checkbox-option input {
  margin-top: 0.25rem;
  width: 18px;
  height: 18px;
}

.checkbox-label {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.checkbox-label strong {
  color: #333;
}

.checkbox-label span {
  font-size: 0.85rem;
  color: #666;
}

.checkbox-label .hint {
  font-style: italic;
  color: #999;
}

.info-box {
  background: #ebf5fb;
  border-left: 4px solid #3498db;
  padding: 1rem;
  border-radius: 0 8px 8px 0;
  font-size: 0.9rem;
  line-height: 1.5;
  color: #2c3e50;
}

.info-box strong {
  display: block;
  margin-bottom: 0.5rem;
  color: #2980b9;
}
</style>
