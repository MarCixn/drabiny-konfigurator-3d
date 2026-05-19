<script setup lang="ts">
/**
 * CustomerWizard.vue
 * Main wizard container that shows current step and navigation
 */

import { computed } from 'vue'
import { useCustomerStore } from '../../stores/customer.store'
import StepRoofType from './steps/StepRoofType.vue'
import StepWallDimensions from './steps/StepWallDimensions.vue'
import StepEaveDetails from './steps/StepEaveDetails.vue'
import StepObstacles from './steps/StepObstacles.vue'
import StepSafetyCage from './steps/StepSafetyCage.vue'
import StepSuspended from './steps/StepSuspended.vue'
import StepSummary from './steps/StepSummary.vue'

const store = useCustomerStore()

// Step titles
const stepTitles: Record<number, string> = {
  1: 'Typ dachu',
  2: 'Wymiary sciany',
  3: 'Parametry okapu',
  4: 'Przeszkody',
  5: 'Kosz ochronny',
  6: 'Zawieszenie',
  7: 'Podsumowanie'
}

const currentTitle = computed(() => stepTitles[store.currentStep] || '')

// Current step index in visible steps
const currentStepIndex = computed(() => {
  return store.visibleSteps.indexOf(store.currentStep) + 1
})

const totalVisibleSteps = computed(() => store.visibleSteps.length)

// Can go back?
const canGoBack = computed(() => {
  const idx = store.visibleSteps.indexOf(store.currentStep)
  return idx > 0
})

// Is last step?
const isLastStep = computed(() => store.currentStep === 7)
</script>

<template>
  <div class="customer-wizard">
    <!-- Step header -->
    <div class="wizard-header">
      <div class="step-indicator">
        Krok {{ currentStepIndex }} z {{ totalVisibleSteps }}
      </div>
      <h2 class="step-title">{{ currentTitle }}</h2>
    </div>

    <!-- Step content -->
    <div class="wizard-content">
      <Transition name="fade" mode="out-in">
        <StepRoofType v-if="store.currentStep === 1" key="step1" />
        <StepWallDimensions v-else-if="store.currentStep === 2" key="step2" />
        <StepEaveDetails v-else-if="store.currentStep === 3" key="step3" />
        <StepObstacles v-else-if="store.currentStep === 4" key="step4" />
        <StepSafetyCage v-else-if="store.currentStep === 5" key="step5" />
        <StepSuspended v-else-if="store.currentStep === 6" key="step6" />
        <StepSummary v-else-if="store.currentStep === 7" key="step7" />
      </Transition>
    </div>

    <!-- Navigation -->
    <div class="wizard-navigation">
      <button
        class="btn btn-secondary"
        :disabled="!canGoBack"
        @click="store.prevStep()"
      >
        Wstecz
      </button>

      <button
        v-if="!isLastStep"
        class="btn btn-primary"
        :disabled="!store.canProceed"
        @click="store.nextStep()"
      >
        Dalej
      </button>

      <button
        v-else
        class="btn btn-success"
        @click="$emit('complete')"
      >
        Zapisz oferte
      </button>
    </div>
  </div>
</template>

<style scoped>
.customer-wizard {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 1.5rem;
}

.wizard-header {
  margin-bottom: 1.5rem;
}

.step-indicator {
  font-size: 0.85rem;
  color: #666;
  margin-bottom: 0.5rem;
}

.step-title {
  margin: 0;
  font-size: 1.4rem;
  font-weight: 600;
  color: #2c3e50;
}

.wizard-content {
  flex: 1;
  overflow-y: auto;
  padding-right: 0.5rem;
}

.wizard-navigation {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  padding-top: 1.5rem;
  border-top: 1px solid #eee;
  margin-top: 1rem;
}

.btn {
  padding: 0.75rem 1.5rem;
  border: none;
  border-radius: 6px;
  font-size: 1rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-secondary {
  background: #e0e0e0;
  color: #333;
}

.btn-secondary:hover:not(:disabled) {
  background: #d0d0d0;
}

.btn-primary {
  background: #3498db;
  color: white;
  flex: 1;
}

.btn-primary:hover:not(:disabled) {
  background: #2980b9;
}

.btn-success {
  background: #27ae60;
  color: white;
  flex: 1;
}

.btn-success:hover:not(:disabled) {
  background: #219a52;
}

/* Transition */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
