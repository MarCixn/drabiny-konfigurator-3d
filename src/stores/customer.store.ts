/**
 * Customer Configurator Store
 * State management for Version B - simplified customer wizard
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export type RoofType = 'flat' | 'with-eave' | 'with-parapet'

export interface Obstacle {
  id: number
  type: 'window' | 'vent' | 'lamp' | 'other'
  heightFrom: number  // meters from ground
  height: number      // height of obstacle in meters
  description?: string
}

export interface CustomerConfig {
  // Step 1: Roof type
  roofType: RoofType | null

  // Step 2: Wall dimensions
  wallHeight: number       // meters
  insulationThickness: number  // cm

  // Step 3: Eave details (if roofType === 'with-eave')
  eaveWidth: number        // cm
  eaveDepth: number        // cm

  // Step 4: Obstacles
  hasObstacles: boolean
  obstacles: Obstacle[]

  // Step 5: Safety cage
  hasSafetyCage: boolean
  cageClosing: boolean
  restingPlatform: boolean

  // Step 6: Suspended
  isSuspended: boolean
  suspendedHeight: number  // meters
}

const TOTAL_STEPS = 7

export const useCustomerStore = defineStore('customer', () => {
  // Current wizard step (1-7)
  const currentStep = ref(1)

  // Configuration state
  const config = ref<CustomerConfig>({
    roofType: null,
    wallHeight: 5,
    insulationThickness: 10,
    eaveWidth: 30,
    eaveDepth: 20,
    hasObstacles: false,
    obstacles: [],
    hasSafetyCage: false,
    cageClosing: false,
    restingPlatform: false,
    isSuspended: false,
    suspendedHeight: 2.5
  })

  // Next obstacle ID
  let nextObstacleId = 1

  // Computed: step validation
  const canProceed = computed(() => {
    switch (currentStep.value) {
      case 1:
        return config.value.roofType !== null
      case 2:
        return config.value.wallHeight >= 0.6 && config.value.wallHeight <= 30
      case 3:
        // Eave step - only shown for with-eave, always valid if reached
        if (config.value.roofType !== 'with-eave') return true
        return config.value.eaveWidth > 0 && config.value.eaveDepth > 0
      case 4:
        // Obstacles - always can proceed (skip or add)
        return true
      case 5:
        // Cage - always can proceed
        return true
      case 6:
        // Suspended - check height if enabled
        if (config.value.isSuspended) {
          return config.value.suspendedHeight >= 0.5 && config.value.suspendedHeight <= 5
        }
        return true
      case 7:
        // Summary - always valid
        return true
      default:
        return false
    }
  })

  // Computed: is step visible (some steps are conditional)
  const isStepVisible = computed(() => (step: number): boolean => {
    switch (step) {
      case 3: // Eave details - only for with-eave
        return config.value.roofType === 'with-eave'
      case 4: // Obstacles - for flat and with-eave (not parapet for now)
        return config.value.roofType === 'flat' || config.value.roofType === 'with-eave'
      default:
        return true
    }
  })

  // Computed: actual steps (accounting for skipped)
  const visibleSteps = computed(() => {
    const steps: number[] = []
    for (let i = 1; i <= TOTAL_STEPS; i++) {
      if (isStepVisible.value(i)) {
        steps.push(i)
      }
    }
    return steps
  })

  // Computed: progress percentage
  const progressPercent = computed(() => {
    const idx = visibleSteps.value.indexOf(currentStep.value)
    if (idx === -1) return 0
    return Math.round(((idx + 1) / visibleSteps.value.length) * 100)
  })

  // Computed: needs resting platform (wall > 5m)
  const needsRestingPlatformOption = computed(() => config.value.wallHeight > 5)

  // Navigation
  function nextStep(): void {
    if (!canProceed.value) return

    // Find next visible step
    let next = currentStep.value + 1
    while (next <= TOTAL_STEPS && !isStepVisible.value(next)) {
      next++
    }

    if (next <= TOTAL_STEPS) {
      currentStep.value = next
    }
  }

  function prevStep(): void {
    // Find previous visible step
    let prev = currentStep.value - 1
    while (prev >= 1 && !isStepVisible.value(prev)) {
      prev--
    }

    if (prev >= 1) {
      currentStep.value = prev
    }
  }

  function goToStep(step: number): void {
    if (step >= 1 && step <= TOTAL_STEPS && isStepVisible.value(step)) {
      currentStep.value = step
    }
  }

  // Config updates
  function setRoofType(type: RoofType): void {
    config.value.roofType = type
  }

  function setWallHeight(height: number): void {
    config.value.wallHeight = Math.max(0.6, Math.min(30, height))
  }

  function setInsulationThickness(thickness: number): void {
    config.value.insulationThickness = Math.max(0, Math.min(30, thickness))
  }

  function setEaveDetails(width: number, depth: number): void {
    config.value.eaveWidth = Math.max(0, width)
    config.value.eaveDepth = Math.max(0, depth)
  }

  // Obstacles management
  function addObstacle(type: Obstacle['type'], heightFrom: number, height: number, description?: string): void {
    config.value.obstacles.push({
      id: nextObstacleId++,
      type,
      heightFrom,
      height,
      description
    })
    config.value.hasObstacles = true
  }

  function removeObstacle(id: number): void {
    config.value.obstacles = config.value.obstacles.filter(o => o.id !== id)
    if (config.value.obstacles.length === 0) {
      config.value.hasObstacles = false
    }
  }

  function clearObstacles(): void {
    config.value.obstacles = []
    config.value.hasObstacles = false
  }

  // Cage settings
  function setSafetyCage(enabled: boolean): void {
    config.value.hasSafetyCage = enabled
    if (!enabled) {
      config.value.cageClosing = false
      config.value.restingPlatform = false
    }
  }

  function setCageClosing(enabled: boolean): void {
    config.value.cageClosing = enabled
  }

  function setRestingPlatform(enabled: boolean): void {
    config.value.restingPlatform = enabled
  }

  // Suspended settings
  function setSuspended(enabled: boolean): void {
    config.value.isSuspended = enabled
  }

  function setSuspendedHeight(height: number): void {
    config.value.suspendedHeight = Math.max(0.5, Math.min(5, height))
  }

  // Reset
  function reset(): void {
    currentStep.value = 1
    config.value = {
      roofType: null,
      wallHeight: 5,
      insulationThickness: 10,
      eaveWidth: 30,
      eaveDepth: 20,
      hasObstacles: false,
      obstacles: [],
      hasSafetyCage: false,
      cageClosing: false,
      restingPlatform: false,
      isSuspended: false,
      suspendedHeight: 2.5
    }
    nextObstacleId = 1
  }

  // Convert to API format (compatible with existing calculateLadder)
  const apiConfig = computed(() => ({
    wallHeight: config.value.wallHeight,
    scheme: 'no-platform' as const, // Customer version: external only, no platform for now
    purpose: 'external' as const,
    cage: config.value.hasSafetyCage ? 'with-cage' as const : 'no-cage' as const,
    bracketType: 'short' as const, // Default for customer
    bracketSpacing: 1000,
    insulationThickness: config.value.insulationThickness,
    suspended: config.value.isSuspended,
    suspendedHeight: config.value.suspendedHeight,
    hasObstacles: config.value.hasObstacles,
    obstacles: config.value.obstacles.map(o => ({
      id: o.id,
      type: o.type,
      bottomHeightMm: o.heightFrom * 1000,
      heightMm: o.height * 1000
    }))
  }))

  return {
    // State
    currentStep,
    config,

    // Computed
    canProceed,
    isStepVisible,
    visibleSteps,
    progressPercent,
    needsRestingPlatformOption,
    apiConfig,

    // Navigation
    nextStep,
    prevStep,
    goToStep,

    // Config setters
    setRoofType,
    setWallHeight,
    setInsulationThickness,
    setEaveDetails,
    addObstacle,
    removeObstacle,
    clearObstacles,
    setSafetyCage,
    setCageClosing,
    setRestingPlatform,
    setSuspended,
    setSuspendedHeight,
    reset
  }
})
