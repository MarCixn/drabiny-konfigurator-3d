<script setup lang="ts">
/**
 * StepObstacles.vue - Step 4
 * Manage obstacles on the wall (windows, vents, lamps, etc.)
 */

import { ref } from 'vue'
import { useCustomerStore, type Obstacle } from '../../../stores/customer.store'

const store = useCustomerStore()

// New obstacle form
const showForm = ref(false)
const newObstacle = ref({
  type: 'window' as Obstacle['type'],
  heightFrom: 1,
  height: 1,
  description: ''
})

const obstacleTypes: { value: Obstacle['type']; label: string; icon: string }[] = [
  { value: 'window', label: 'Okno', icon: '⬜' },
  { value: 'vent', label: 'Kratka wentylacyjna', icon: '▦' },
  { value: 'lamp', label: 'Lampa', icon: '💡' },
  { value: 'other', label: 'Inne', icon: '◻' }
]

function addObstacle() {
  store.addObstacle(
    newObstacle.value.type,
    newObstacle.value.heightFrom,
    newObstacle.value.height,
    newObstacle.value.description || undefined
  )
  // Reset form
  newObstacle.value = {
    type: 'window',
    heightFrom: 1,
    height: 1,
    description: ''
  }
  showForm.value = false
}

function getTypeLabel(type: Obstacle['type']): string {
  return obstacleTypes.find(t => t.value === type)?.label || type
}

function getTypeIcon(type: Obstacle['type']): string {
  return obstacleTypes.find(t => t.value === type)?.icon || '◻'
}
</script>

<template>
  <div class="step-obstacles">
    <p class="step-description">
      Czy na scianie znajduja sie przeszkody (okna, kratki, lampy),
      ktore moga wymagac obejscia?
    </p>

    <!-- Toggle -->
    <div class="toggle-section">
      <button
        class="toggle-btn"
        :class="{ active: !store.config.hasObstacles }"
        @click="store.clearObstacles()"
      >
        Brak przeszkod
      </button>
      <button
        class="toggle-btn"
        :class="{ active: store.config.hasObstacles || showForm }"
        @click="showForm = true"
      >
        Dodaj przeszkode
      </button>
    </div>

    <!-- Obstacles list -->
    <div v-if="store.config.obstacles.length > 0" class="obstacles-list">
      <div
        v-for="obs in store.config.obstacles"
        :key="obs.id"
        class="obstacle-item"
      >
        <span class="obstacle-icon">{{ getTypeIcon(obs.type) }}</span>
        <div class="obstacle-info">
          <strong>{{ getTypeLabel(obs.type) }}</strong>
          <span>{{ obs.heightFrom }}m - {{ obs.heightFrom + obs.height }}m</span>
          <span v-if="obs.description" class="obstacle-desc">{{ obs.description }}</span>
        </div>
        <button class="remove-btn" @click="store.removeObstacle(obs.id)">
          ✕
        </button>
      </div>
    </div>

    <!-- Add obstacle form -->
    <div v-if="showForm" class="obstacle-form">
      <h4>Dodaj przeszkode</h4>

      <div class="form-group">
        <label>Typ</label>
        <div class="type-buttons">
          <button
            v-for="t in obstacleTypes"
            :key="t.value"
            class="type-btn"
            :class="{ selected: newObstacle.type === t.value }"
            @click="newObstacle.type = t.value"
          >
            <span>{{ t.icon }}</span>
            <span>{{ t.label }}</span>
          </button>
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label>Wysokosc od ziemi</label>
          <div class="input-with-unit">
            <input
              type="number"
              v-model.number="newObstacle.heightFrom"
              min="0"
              :max="store.config.wallHeight - 0.5"
              step="0.1"
            />
            <span class="unit">m</span>
          </div>
        </div>

        <div class="form-group">
          <label>Wysokosc przeszkody</label>
          <div class="input-with-unit">
            <input
              type="number"
              v-model.number="newObstacle.height"
              min="0.1"
              max="3"
              step="0.1"
            />
            <span class="unit">m</span>
          </div>
        </div>
      </div>

      <div class="form-group">
        <label>Opis (opcjonalnie)</label>
        <input
          type="text"
          v-model="newObstacle.description"
          placeholder="np. okno lazienki"
        />
      </div>

      <div class="form-actions">
        <button class="btn btn-secondary" @click="showForm = false">
          Anuluj
        </button>
        <button class="btn btn-primary" @click="addObstacle">
          Dodaj
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.step-obstacles {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.step-description {
  color: #666;
  margin: 0;
  line-height: 1.5;
}

.toggle-section {
  display: flex;
  gap: 0.5rem;
}

.toggle-btn {
  flex: 1;
  padding: 0.75rem;
  border: 2px solid #e0e0e0;
  border-radius: 6px;
  background: white;
  cursor: pointer;
  font-weight: 500;
  transition: all 0.2s;
}

.toggle-btn:hover {
  border-color: #3498db;
}

.toggle-btn.active {
  border-color: #3498db;
  background: #ebf5fb;
  color: #2980b9;
}

.obstacles-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.obstacle-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem;
  background: #f8f9fa;
  border-radius: 6px;
}

.obstacle-icon {
  font-size: 1.5rem;
}

.obstacle-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.9rem;
}

.obstacle-info strong {
  color: #333;
}

.obstacle-info span {
  color: #666;
}

.obstacle-desc {
  font-style: italic;
}

.remove-btn {
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 50%;
  background: #e74c3c;
  color: white;
  cursor: pointer;
  font-size: 0.9rem;
}

.remove-btn:hover {
  background: #c0392b;
}

.obstacle-form {
  background: #f5f5f5;
  border-radius: 8px;
  padding: 1rem;
}

.obstacle-form h4 {
  margin: 0 0 1rem 0;
  color: #333;
}

.form-group {
  margin-bottom: 1rem;
}

.form-group label {
  display: block;
  font-weight: 500;
  color: #333;
  margin-bottom: 0.5rem;
}

.type-buttons {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.5rem;
}

.type-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  padding: 0.75rem;
  border: 2px solid #e0e0e0;
  border-radius: 6px;
  background: white;
  cursor: pointer;
  font-size: 0.85rem;
}

.type-btn:hover {
  border-color: #3498db;
}

.type-btn.selected {
  border-color: #3498db;
  background: #ebf5fb;
}

.form-row {
  display: flex;
  gap: 1rem;
}

.form-row .form-group {
  flex: 1;
}

.input-with-unit {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.input-with-unit input,
.form-group > input {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 1rem;
}

.input-with-unit input {
  max-width: 100px;
}

.unit {
  color: #666;
}

.form-actions {
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
  margin-top: 1rem;
}

.btn {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 500;
}

.btn-secondary {
  background: #e0e0e0;
  color: #333;
}

.btn-primary {
  background: #3498db;
  color: white;
}
</style>
