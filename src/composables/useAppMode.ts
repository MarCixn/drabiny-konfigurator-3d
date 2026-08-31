/**
 * App Mode Detection Composable
 * Detects and manages configurator modes from URL parameters
 */

import { ref, computed, onMounted } from 'vue'

export type AppMode = 'admin' | 'customer' | 'seller' | 'embed'

const mode = ref<AppMode>('admin')
const isInitialized = ref(false)

/**
 * Initialize mode from URL parameters
 * ?mode=admin -> Version A (default)
 * ?mode=customer -> Version B (simplified wizard)
 * ?mode=seller -> Version C (embed for seller panel)
 * ?mode=embed -> Embed mode (3D view only)
 */
function initMode(): void {
  if (isInitialized.value) return

  const params = new URLSearchParams(window.location.search)
  const modeParam = params.get('mode')

  if (modeParam === 'customer') {
    mode.value = 'customer'
  } else if (modeParam === 'seller') {
    mode.value = 'seller'
  } else if (modeParam === 'embed') {
    mode.value = 'embed'
  } else {
    mode.value = 'admin'
  }

  isInitialized.value = true
  console.log('[useAppMode] Initialized mode:', mode.value)
}

export function useAppMode() {
  // Initialize on first use
  onMounted(() => {
    initMode()
  })

  // Also initialize immediately for SSR/hydration scenarios
  if (typeof window !== 'undefined' && !isInitialized.value) {
    initMode()
  }

  const isAdmin = computed(() => mode.value === 'admin')
  const isCustomer = computed(() => mode.value === 'customer')
  const isSeller = computed(() => mode.value === 'seller')
  const isEmbed = computed(() => mode.value === 'embed')

  /**
   * Get URL with mode parameter
   */
  function getModeUrl(targetMode: AppMode): string {
    const url = new URL(window.location.href)
    url.searchParams.set('mode', targetMode)
    return url.toString()
  }

  /**
   * Switch to different mode (changes URL)
   */
  function switchMode(targetMode: AppMode): void {
    if (mode.value !== targetMode) {
      window.location.href = getModeUrl(targetMode)
    }
  }

  return {
    mode,
    isAdmin,
    isCustomer,
    isSeller,
    isEmbed,
    getModeUrl,
    switchMode
  }
}

// Export singleton for direct access
export { mode, isInitialized }
