import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Obstacle, ObstacleCollision, ObstacleType } from '@/types'
import { OBSTACLE_PRESETS } from '@/types'

export const useObstaclesStore = defineStore('obstacles', () => {
  // State
  const obstacles = ref<Obstacle[]>([])
  const collisions = ref<ObstacleCollision[]>([])
  const selectedObstacleId = ref<string | null>(null)

  // Getters
  const obstacleCount = computed(() => obstacles.value.length)

  const hasCollisions = computed(() => collisions.value.length > 0)

  const errorCollisions = computed(() =>
    collisions.value.filter(c => c.severity === 'error')
  )

  const warningCollisions = computed(() =>
    collisions.value.filter(c => c.severity === 'warning')
  )

  const selectedObstacle = computed(() => {
    if (selectedObstacleId.value) {
      return obstacles.value.find(o => o.id === selectedObstacleId.value) || null
    }
    return null
  })

  const sortedObstacles = computed(() => {
    return [...obstacles.value].sort((a, b) => a.positionY - b.positionY)
  })

  // Actions
  function generateId(): string {
    return `obstacle_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  function addObstacle(type: ObstacleType, positionY: number): Obstacle {
    const preset = OBSTACLE_PRESETS[type]
    const obstacle: Obstacle = {
      id: generateId(),
      type,
      name: preset.name || 'Przeszkoda',
      positionY,
      height: preset.height || 500,
      width: preset.width || 500,
      depth: preset.depth || 200,
      offsetX: 0
    }
    obstacles.value.push(obstacle)
    return obstacle
  }

  function updateObstacle(id: string, updates: Partial<Obstacle>) {
    const index = obstacles.value.findIndex(o => o.id === id)
    if (index !== -1) {
      obstacles.value[index] = { ...obstacles.value[index], ...updates }
    }
  }

  function removeObstacle(id: string) {
    const index = obstacles.value.findIndex(o => o.id === id)
    if (index !== -1) {
      obstacles.value.splice(index, 1)
      // Usuń kolizje związane z tą przeszkodą
      collisions.value = collisions.value.filter(c => c.obstacleId !== id)
      // Odznacz jeśli była zaznaczona
      if (selectedObstacleId.value === id) {
        selectedObstacleId.value = null
      }
    }
  }

  function selectObstacle(id: string | null) {
    selectedObstacleId.value = id
  }

  function clearSelection() {
    selectedObstacleId.value = null
  }

  function setCollisions(newCollisions: ObstacleCollision[]) {
    collisions.value = newCollisions
  }

  function addCollision(collision: ObstacleCollision) {
    collisions.value.push(collision)
  }

  function clearCollisions() {
    collisions.value = []
  }

  function clearAll() {
    obstacles.value = []
    collisions.value = []
    selectedObstacleId.value = null
  }

  function duplicateObstacle(id: string): Obstacle | null {
    const source = obstacles.value.find(o => o.id === id)
    if (!source) return null

    const duplicate: Obstacle = {
      ...source,
      id: generateId(),
      name: `${source.name} (kopia)`,
      positionY: source.positionY + source.height + 100 // Przesuń o wysokość + 100mm
    }
    obstacles.value.push(duplicate)
    return duplicate
  }

  function moveObstacle(id: string, deltaY: number) {
    const obstacle = obstacles.value.find(o => o.id === id)
    if (obstacle) {
      obstacle.positionY = Math.max(0, obstacle.positionY + deltaY)
    }
  }

  return {
    // State
    obstacles,
    collisions,
    selectedObstacleId,
    // Getters
    obstacleCount,
    hasCollisions,
    errorCollisions,
    warningCollisions,
    selectedObstacle,
    sortedObstacles,
    // Actions
    addObstacle,
    updateObstacle,
    removeObstacle,
    selectObstacle,
    clearSelection,
    setCollisions,
    addCollision,
    clearCollisions,
    clearAll,
    duplicateObstacle,
    moveObstacle
  }
})
