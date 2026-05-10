<script setup lang="ts">
import { ref, watch } from 'vue'
import { useConfigStore, useThreeDStore } from '@/stores'
import { LADDER_CONSTANTS } from '@/types'

const configStore = useConfigStore()
const threeDStore = useThreeDStore()

const heightInput = ref(configStore.config.wallHeight.toString())

watch(heightInput, (newValue) => {
  const height = parseFloat(newValue.replace(',', '.'))
  if (!isNaN(height)) {
    configStore.setWallHeight(height)
  }
})

function increment() {
  const current = parseFloat(heightInput.value.replace(',', '.'))
  if (!isNaN(current) && current < LADDER_CONSTANTS.MAX_WALL_HEIGHT_M) {
    heightInput.value = (current + 0.5).toFixed(1)
  }
}

function decrement() {
  const current = parseFloat(heightInput.value.replace(',', '.'))
  if (!isNaN(current) && current > LADDER_CONSTANTS.MIN_WALL_HEIGHT_M) {
    heightInput.value = (current - 0.5).toFixed(1)
  }
}
</script>

<template>
  <div class="height-input">
    <div class="form-group">
      <label>Wysokość ściany</label>
      <div class="input-with-unit">
        <button class="input-btn" @click="decrement">−</button>
        <input
          v-model="heightInput"
          type="text"
          inputmode="decimal"
          class="input-field"
          placeholder="5.0"
        >
        <span class="input-unit">m</span>
        <button class="input-btn" @click="increment">+</button>
      </div>
      <p class="hint">
        Zakres: {{ LADDER_CONSTANTS.MIN_WALL_HEIGHT_M }}m - {{ LADDER_CONSTANTS.MAX_WALL_HEIGHT_M }}m
      </p>
    </div>

    <!-- Podsumowanie konfiguracji -->
    <div class="config-summary">
      <div class="config-summary-title">Podgląd konfiguracji</div>
      <div class="config-summary-row">
        <span class="label">Moduły X7:</span>
        <span class="value">{{ threeDStore.state.numX7Ladders }} szt.</span>
      </div>
      <div class="config-summary-row">
        <span class="label">Moduł końcowy:</span>
        <span class="value">{{ threeDStore.state.finalLadderRungs }} szczebli</span>
      </div>
      <div class="config-summary-row">
        <span class="label">Razem szczebli:</span>
        <span class="value">{{ threeDStore.state.totalRungs }} szt.</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.height-input {
  display: flex;
  flex-direction: column;
  gap: 20px;
}
</style>
