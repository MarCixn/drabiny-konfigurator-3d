<script setup lang="ts">
/**
 * CustomerLayout.vue - Version B
 * Simplified wizard for customers with 2D technical drawing
 */

import { useCustomerStore } from '../stores/customer.store'
import CustomerWizard from '../components/customer/CustomerWizard.vue'
import TechnicalDrawing2D from '../components/customer/TechnicalDrawing2D.vue'

const store = useCustomerStore()
</script>

<template>
  <div class="customer-layout">
    <!-- Header -->
    <header class="customer-header">
      <h1>Konfigurator Drabiny</h1>
      <div class="progress-bar">
        <div
          class="progress-fill"
          :style="{ width: store.progressPercent + '%' }"
        ></div>
      </div>
      <span class="progress-text">{{ store.progressPercent }}%</span>
    </header>

    <!-- Main content -->
    <main class="customer-main">
      <!-- Left side: 2D Technical Drawing -->
      <div class="drawing-panel">
        <TechnicalDrawing2D />
      </div>

      <!-- Right side: Wizard -->
      <div class="wizard-panel">
        <CustomerWizard />
      </div>
    </main>
  </div>
</template>

<style scoped>
.customer-layout {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: #f5f5f5;
}

.customer-header {
  background: #2c3e50;
  color: white;
  padding: 1rem 2rem;
  display: flex;
  align-items: center;
  gap: 2rem;
}

.customer-header h1 {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 500;
}

.progress-bar {
  flex: 1;
  max-width: 400px;
  height: 8px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: #3498db;
  transition: width 0.3s ease;
}

.progress-text {
  font-size: 0.9rem;
  opacity: 0.8;
}

.customer-main {
  flex: 1;
  display: flex;
  gap: 0;
  overflow: hidden;
}

.drawing-panel {
  flex: 1;
  background: white;
  display: flex;
  align-items: center;
  justify-content: center;
  border-right: 1px solid #ddd;
  min-height: 0;
}

.wizard-panel {
  width: 400px;
  background: white;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

/* Responsive */
@media (max-width: 900px) {
  .customer-main {
    flex-direction: column;
  }

  .drawing-panel {
    height: 300px;
    border-right: none;
    border-bottom: 1px solid #ddd;
  }

  .wizard-panel {
    width: 100%;
    flex: 1;
  }
}
</style>
