<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useUIStore, useConfigStore } from '@/stores'
import { useLadderCalculator } from '@/composables'
import LadderTypeSelector from './LadderTypeSelector.vue'
import HeightInput from './HeightInput.vue'
import SchemeSelector from './SchemeSelector.vue'
import CageSelector from './CageSelector.vue'
import SummaryPanel from '../summary/SummaryPanel.vue'
import ThreeCanvas from '../three-d/ThreeCanvas.vue'

const uiStore = useUIStore()
const configStore = useConfigStore()

// Inicjalizuj kalkulator (uruchamia reaktywne obliczenia)
const { recalculate } = useLadderCalculator()

// Początkowe przeliczenie
onMounted(() => {
  recalculate()
})

const currentStepComponent = computed(() => {
  switch (uiStore.currentStep) {
    case 'type':
      return LadderTypeSelector
    case 'height':
      return HeightInput
    case 'scheme':
      return SchemeSelector
    case 'cage':
      return CageSelector
    case 'summary':
      return SummaryPanel
    default:
      return LadderTypeSelector
  }
})

const stepTitle = computed(() => {
  switch (uiStore.currentStep) {
    case 'type': return 'Wybór typu drabiny'
    case 'height': return 'Wysokość ściany'
    case 'scheme': return 'Zakończenie drabiny'
    case 'cage': return 'Kosz bezpieczeństwa'
    case 'summary': return 'Podsumowanie'
    default: return 'Konfiguracja'
  }
})

const stepDescription = computed(() => {
  switch (uiStore.currentStep) {
    case 'type': return 'Wybierz rodzaj drabiny do instalacji'
    case 'height': return 'Podaj wysokość ściany w metrach'
    case 'scheme': return 'Wybierz sposób zakończenia drabiny na górze'
    case 'cage': return 'Skonfiguruj kosz ochronny'
    case 'summary': return 'Sprawdź konfigurację przed zamówieniem'
    default: return ''
  }
})

const stepIndicator = computed(() => {
  const steps = ['type', 'height', 'scheme', 'cage', 'summary']
  const current = steps.indexOf(uiStore.currentStep) + 1
  return `Krok ${current} z ${steps.length}`
})
</script>

<template>
  <div class="app-container">
    <!-- Nagłówek -->
    <header class="app-header">
      <button
        class="back-button"
        :disabled="uiStore.isFirstStep"
        @click="uiStore.prevStep"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M15 18l-6-6 6-6"/>
        </svg>
      </button>
      <div class="header-title">
        <h1>Konfigurator Drabin</h1>
        <span class="step-indicator">{{ stepIndicator }}</span>
      </div>
    </header>

    <!-- Główna zawartość -->
    <main class="app-content">
      <div class="split-layout">
        <!-- Wizualizacja 3D -->
        <div class="visualization-panel">
          <ThreeCanvas />

          <!-- Panel info 3D -->
          <div class="viewer-info-panel">
            <div class="viewer-info-row">
              <span class="label">Wysokość ściany:</span>
              <span class="value">{{ configStore.config.wallHeight.toFixed(1) }} m</span>
            </div>
            <div class="viewer-info-row">
              <span class="label">Moduły X7:</span>
              <span class="value">{{ configStore.specification?.numX7Ladders || 0 }} szt.</span>
            </div>
            <div class="viewer-info-row">
              <span class="label">Szczebli dodatkowych:</span>
              <span class="value">{{ configStore.specification?.finalLadderRungs || 0 }}</span>
            </div>
          </div>
        </div>

        <!-- Panel konfiguracji -->
        <div class="config-panel-wrapper">
          <div class="config-panel">
            <div class="config-panel-header">
              <h2>{{ stepTitle }}</h2>
              <p>{{ stepDescription }}</p>
            </div>

            <div class="config-panel-content">
              <component :is="currentStepComponent" />
            </div>

            <div class="config-panel-footer">
              <button
                v-if="!uiStore.isFirstStep"
                class="btn btn-secondary"
                @click="uiStore.prevStep"
              >
                Wstecz
              </button>
              <button
                v-if="!uiStore.isLastStep"
                class="btn btn-primary"
                @click="uiStore.nextStep"
              >
                Dalej
              </button>
              <button
                v-if="uiStore.isLastStep"
                class="btn btn-primary"
              >
                Dodaj do koszyka
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>

    <!-- Toasty -->
    <div v-if="uiStore.errorMessage" class="toast toast-error">
      {{ uiStore.errorMessage }}
    </div>
    <div v-if="uiStore.successMessage" class="toast toast-success">
      {{ uiStore.successMessage }}
    </div>
  </div>
</template>

<style scoped>
/* Wszystkie style są w main.css */
</style>
