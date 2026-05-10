import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { ThreeDState, ThreeDConfig, ConnectorType, WspornikType } from '@/types'
import { THREE_CONSTANTS } from '@/types'

export const useThreeDStore = defineStore('threeD', () => {
  // State
  const state = ref<ThreeDState>({
    numX7Ladders: 0,
    numX8Ladders: 0,
    finalLadderRungs: 0,
    totalRungs: 0,
    safetyCageCount: 0,
    connectorTypes: [],
    wspornikTypes: [],
    wspornikPositions: []
  })

  const config = ref<ThreeDConfig>({
    showGrid: true,
    showAxes: false,
    autoRotate: false,
    cameraPosition: { ...THREE_CONSTANTS.DEFAULT_CAMERA_POSITION }
  })

  const isSceneReady = ref(false)
  const isLoading = ref(false)

  // Getters
  const totalModules = computed(() => state.value.numX7Ladders + state.value.numX8Ladders)

  const hasCage = computed(() => state.value.safetyCageCount > 0)

  const connectorCount = computed(() => state.value.connectorTypes.length)

  const wspornikCount = computed(() => state.value.wspornikTypes.length)

  // Actions
  function updateState(newState: Partial<ThreeDState>) {
    state.value = { ...state.value, ...newState }
  }

  function setNumX7(count: number) {
    state.value.numX7Ladders = count
  }

  function setNumX8(count: number) {
    state.value.numX8Ladders = count
  }

  function setFinalLadderRungs(count: number) {
    state.value.finalLadderRungs = count
  }

  function setTotalRungs(count: number) {
    state.value.totalRungs = count
  }

  function setCageCount(count: number) {
    state.value.safetyCageCount = count
  }

  function setConnectorTypes(types: ConnectorType[]) {
    state.value.connectorTypes = types
  }

  function updateConnectorType(index: number, type: ConnectorType) {
    if (index >= 0 && index < state.value.connectorTypes.length) {
      state.value.connectorTypes[index] = type
    }
  }

  function setWspornikTypes(types: WspornikType[]) {
    state.value.wspornikTypes = types
  }

  function updateWspornikType(index: number, type: WspornikType) {
    if (index >= 0 && index < state.value.wspornikTypes.length) {
      state.value.wspornikTypes[index] = type
    }
  }

  function setWspornikPositions(positions: number[]) {
    state.value.wspornikPositions = positions
  }

  function setConfig(newConfig: Partial<ThreeDConfig>) {
    config.value = { ...config.value, ...newConfig }
  }

  function toggleGrid() {
    config.value.showGrid = !config.value.showGrid
  }

  function toggleAxes() {
    config.value.showAxes = !config.value.showAxes
  }

  function toggleAutoRotate() {
    config.value.autoRotate = !config.value.autoRotate
  }

  function setCameraPosition(x: number, y: number, z: number) {
    config.value.cameraPosition = { x, y, z }
  }

  function setSceneReady(ready: boolean) {
    isSceneReady.value = ready
  }

  function setLoading(loading: boolean) {
    isLoading.value = loading
  }

  function reset() {
    state.value = {
      numX7Ladders: 0,
      numX8Ladders: 0,
      finalLadderRungs: 0,
      totalRungs: 0,
      safetyCageCount: 0,
      connectorTypes: [],
      wspornikTypes: [],
      wspornikPositions: []
    }
  }

  return {
    // State
    state,
    config,
    isSceneReady,
    isLoading,
    // Getters
    totalModules,
    hasCage,
    connectorCount,
    wspornikCount,
    // Actions
    updateState,
    setNumX7,
    setNumX8,
    setFinalLadderRungs,
    setTotalRungs,
    setCageCount,
    setConnectorTypes,
    updateConnectorType,
    setWspornikTypes,
    updateWspornikType,
    setWspornikPositions,
    setConfig,
    toggleGrid,
    toggleAxes,
    toggleAutoRotate,
    setCameraPosition,
    setSceneReady,
    setLoading,
    reset
  }
})
