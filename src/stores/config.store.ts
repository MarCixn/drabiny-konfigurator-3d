import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { LadderConfig, Ladder, Specification, LadderType, Scheme, CageOption, SurfaceType } from '@/types'
import { LADDER_CONSTANTS } from '@/types'

export const useConfigStore = defineStore('config', () => {
  // State
  const config = ref<LadderConfig>({
    type: 'facade',
    wallHeight: 5,
    scheme: 'no-platform',
    cage: 'no-cage',
    surfaceType: 'smooth',
    bracketSpacing: LADDER_CONSTANTS.DEFAULT_BRACKET_SPACING_MM
  })

  const ladders = ref<Ladder[]>([])
  const editingLadderIndex = ref<number | null>(null)
  const currentSpecification = ref<Specification | null>(null)

  // Getters
  const isEditing = computed(() => editingLadderIndex.value !== null)

  const currentLadder = computed(() => {
    if (editingLadderIndex.value !== null) {
      return ladders.value[editingLadderIndex.value]
    }
    return null
  })

  const totalLaddersPrice = computed(() => {
    return ladders.value.reduce((sum, ladder) => sum + ladder.price, 0)
  })

  const wallHeightMm = computed(() => config.value.wallHeight * 1000)

  // Actions
  function setConfig(newConfig: Partial<LadderConfig>) {
    config.value = { ...config.value, ...newConfig }
  }

  function setType(type: LadderType) {
    config.value.type = type
  }

  function setWallHeight(height: number) {
    const clampedHeight = Math.max(
      LADDER_CONSTANTS.MIN_WALL_HEIGHT_M,
      Math.min(LADDER_CONSTANTS.MAX_WALL_HEIGHT_M, height)
    )
    config.value.wallHeight = clampedHeight
  }

  function setScheme(scheme: Scheme) {
    config.value.scheme = scheme
  }

  function setCage(cage: CageOption) {
    config.value.cage = cage
  }

  function setSurfaceType(surfaceType: SurfaceType) {
    config.value.surfaceType = surfaceType
  }

  function setBracketSpacing(spacing: number) {
    config.value.bracketSpacing = spacing
  }

  function setSpecification(spec: Specification) {
    currentSpecification.value = spec
  }

  function addLadder(ladder: Ladder) {
    ladders.value.push(ladder)
  }

  function updateLadder(index: number, ladder: Partial<Ladder>) {
    if (index >= 0 && index < ladders.value.length) {
      ladders.value[index] = { ...ladders.value[index], ...ladder }
    }
  }

  function removeLadder(index: number) {
    if (index >= 0 && index < ladders.value.length) {
      ladders.value.splice(index, 1)
    }
  }

  function startEditing(index: number) {
    if (index >= 0 && index < ladders.value.length) {
      editingLadderIndex.value = index
      // Załaduj konfigurację edytowanej drabiny
      const ladder = ladders.value[index]
      config.value = { ...ladder.config }
    }
  }

  function stopEditing() {
    editingLadderIndex.value = null
  }

  function resetConfig() {
    config.value = {
      type: 'facade',
      wallHeight: 5,
      scheme: 'no-platform',
      cage: 'no-cage',
      surfaceType: 'smooth',
      bracketSpacing: LADDER_CONSTANTS.DEFAULT_BRACKET_SPACING_MM
    }
    currentSpecification.value = null
    editingLadderIndex.value = null
  }

  function clearAllLadders() {
    ladders.value = []
    editingLadderIndex.value = null
  }

  // Alias dla specyfikacji
  const specification = computed(() => currentSpecification.value)

  return {
    // State
    config,
    ladders,
    editingLadderIndex,
    currentSpecification,
    specification,
    // Getters
    isEditing,
    currentLadder,
    totalLaddersPrice,
    wallHeightMm,
    // Actions
    setConfig,
    setType,
    setWallHeight,
    setScheme,
    setCage,
    setSurfaceType,
    setBracketSpacing,
    setSpecification,
    addLadder,
    updateLadder,
    removeLadder,
    startEditing,
    stopEditing,
    resetConfig,
    clearAllLadders
  }
})
