import { ref, watch, onMounted, onUnmounted, type Ref } from 'vue'
import { ThreeScene } from './ThreeScene'
import { useConfigStore, useThreeDStore } from '@/stores'

/**
 * Composable do zarządzania sceną Three.js w Vue
 */
export function useThreeScene(containerRef: Ref<HTMLElement | null>) {
  const configStore = useConfigStore()
  const threeDStore = useThreeDStore()

  const scene = ref<ThreeScene | null>(null)
  const isReady = ref(false)

  /**
   * Inicjalizuj scenę
   */
  function initScene() {
    console.log('[useThreeScene] initScene called, container:', containerRef.value ? 'ready' : 'not ready')
    if (!containerRef.value) {
      console.warn('[useThreeScene] Container not ready')
      return
    }

    if (scene.value) {
      scene.value.dispose()
    }

    scene.value = new ThreeScene(containerRef.value)
    isReady.value = true
    threeDStore.setSceneReady(true)

    console.log('[useThreeScene] Scene created, calling initial updateScene')
    console.log('[useThreeScene] threeDStore.state:', JSON.stringify(threeDStore.state))

    // Początkowy render
    updateScene()
  }

  /**
   * Aktualizuj scenę na podstawie aktualnego stanu
   */
  function updateScene() {
    if (!scene.value) {
      console.log('[useThreeScene] updateScene: no scene')
      return
    }

    console.log('[useThreeScene] updateScene:', {
      numX7: threeDStore.state.numX7Ladders,
      finalRungs: threeDStore.state.finalLadderRungs,
      wallHeight: configStore.config.wallHeight
    })

    scene.value.renderLadder(configStore.config, threeDStore.state)
  }

  /**
   * Resetuj widok kamery
   */
  function resetCamera() {
    scene.value?.resetCamera()
  }

  // Montowanie
  onMounted(() => {
    // Daj czas na renderowanie DOM
    setTimeout(initScene, 100)
  })

  // Odmontowanie
  onUnmounted(() => {
    if (scene.value) {
      scene.value.dispose()
      scene.value = null
    }
    isReady.value = false
    threeDStore.setSceneReady(false)
  })

  // Reaktywne aktualizacje - konfiguracja
  watch(
    () => configStore.config,
    () => {
      if (isReady.value) {
        updateScene()
      }
    },
    { deep: true }
  )

  // Reaktywne aktualizacje - stan 3D
  watch(
    () => threeDStore.state,
    () => {
      if (isReady.value) {
        updateScene()
      }
    },
    { deep: true }
  )

  // Aktualizacja kosza
  watch(
    () => threeDStore.state.safetyCageCount,
    (count) => {
      if (scene.value) {
        scene.value.updateCage(count)
      }
    }
  )

  return {
    scene,
    isReady,
    initScene,
    updateScene,
    resetCamera
  }
}
