<script setup lang="ts">
import { ref } from 'vue'
import { useThreeScene } from '@/three/useThreeScene'
import { useThreeDStore } from '@/stores'

const threeDStore = useThreeDStore()
const canvasContainer = ref<HTMLElement | null>(null)

const { isReady, resetCamera } = useThreeScene(canvasContainer)
</script>

<template>
  <div class="three-canvas">
    <div ref="canvasContainer" class="three-canvas__container">
      <div v-if="!isReady" class="three-canvas__loading">
        <div class="loading-spinner"></div>
        <p>Ładowanie wizualizacji 3D...</p>
      </div>
    </div>

    <div class="three-canvas__controls">
      <button class="control-btn" @click="resetCamera" title="Resetuj widok">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
          <path d="M3 3v5h5"/>
        </svg>
      </button>

      <button
        class="control-btn"
        :class="{ active: threeDStore.config.showGrid }"
        @click="threeDStore.toggleGrid"
        title="Pokaż/ukryj siatkę"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
          <line x1="3" y1="9" x2="21" y2="9"/>
          <line x1="3" y1="15" x2="21" y2="15"/>
          <line x1="9" y1="3" x2="9" y2="21"/>
          <line x1="15" y1="3" x2="15" y2="21"/>
        </svg>
      </button>
    </div>

    <div class="three-canvas__info">
      <div class="info-row">
        <span class="info-label">Moduły X7:</span>
        <span class="info-value">{{ threeDStore.state.numX7Ladders }}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Szczebli końcowych:</span>
        <span class="info-value">{{ threeDStore.state.finalLadderRungs }}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Razem szczebli:</span>
        <span class="info-value">{{ threeDStore.state.totalRungs }}</span>
      </div>
      <div v-if="threeDStore.hasCage" class="info-row">
        <span class="info-label">Segmenty kosza:</span>
        <span class="info-value">{{ threeDStore.state.safetyCageCount }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.three-canvas {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 400px;
}

.three-canvas__container {
  width: 100%;
  height: 100%;
  background: linear-gradient(180deg, #87ceeb 0%, #e0f4ff 100%);
}

.three-canvas__loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #666;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 3px solid #e5e7eb;
  border-top-color: #4f46e5;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 12px;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.three-canvas__controls {
  position: absolute;
  top: 12px;
  right: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.control-btn {
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 8px;
  background: white;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.control-btn:hover {
  background: #f3f4f6;
  transform: scale(1.05);
}

.control-btn.active {
  background: #4f46e5;
  color: white;
}

.control-btn svg {
  width: 20px;
  height: 20px;
}

.three-canvas__info {
  position: absolute;
  bottom: 12px;
  left: 12px;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 8px;
  padding: 12px 16px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  font-size: 0.875rem;
}

.info-row {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 4px 0;
}

.info-row:not(:last-child) {
  border-bottom: 1px solid #e5e7eb;
}

.info-label {
  color: #6b7280;
}

.info-value {
  font-weight: 600;
  color: #1f2937;
}
</style>
