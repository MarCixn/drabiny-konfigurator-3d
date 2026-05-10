<script setup lang="ts">
import { useUIStore, type ConfiguratorStep } from '@/stores/ui.store'

const uiStore = useUIStore()

const stepLabels: Record<ConfiguratorStep, string> = {
  type: 'Typ drabiny',
  height: 'Wysokość',
  scheme: 'Zakończenie',
  cage: 'Kosz',
  obstacles: 'Przeszkody',
  summary: 'Podsumowanie'
}

function getStepStatus(_step: ConfiguratorStep, index: number): 'completed' | 'current' | 'pending' {
  if (index < uiStore.currentStepIndex) return 'completed'
  if (index === uiStore.currentStepIndex) return 'current'
  return 'pending'
}
</script>

<template>
  <div class="step-indicator">
    <div class="progress-bar">
      <div
        class="progress-bar__fill"
        :style="{ width: `${uiStore.progressPercent}%` }"
      />
    </div>

    <div class="steps">
      <button
        v-for="(step, index) in uiStore.steps"
        :key="step"
        class="step"
        :class="`step--${getStepStatus(step, index)}`"
        @click="uiStore.goToStep(index)"
      >
        <span class="step__number">{{ index + 1 }}</span>
        <span class="step__label">{{ stepLabels[step] }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.step-indicator {
  margin-bottom: 30px;
}

.progress-bar {
  height: 4px;
  background: #e5e7eb;
  border-radius: 2px;
  margin-bottom: 16px;
  overflow: hidden;
}

.progress-bar__fill {
  height: 100%;
  background: linear-gradient(90deg, #4f46e5, #7c3aed);
  border-radius: 2px;
  transition: width 0.3s ease;
}

.steps {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}

.step {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border: none;
  background: transparent;
  cursor: pointer;
  transition: all 0.2s;
  border-radius: 8px;
}

.step:hover {
  background: #f3f4f6;
}

.step__number {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.875rem;
  font-weight: 600;
  transition: all 0.2s;
}

.step__label {
  font-size: 0.75rem;
  color: #6b7280;
  white-space: nowrap;
}

.step--pending .step__number {
  background: #e5e7eb;
  color: #9ca3af;
}

.step--current .step__number {
  background: #4f46e5;
  color: white;
}

.step--current .step__label {
  color: #4f46e5;
  font-weight: 500;
}

.step--completed .step__number {
  background: #22c55e;
  color: white;
}

.step--completed .step__label {
  color: #22c55e;
}

@media (max-width: 600px) {
  .step__label {
    display: none;
  }
}
</style>
