import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export type ConfiguratorStep = 'type' | 'height' | 'scheme' | 'cage' | 'obstacles' | 'summary'

export interface ModalState {
  isOpen: boolean
  type: string | null
  data: unknown
}

export const useUIStore = defineStore('ui', () => {
  // State
  const currentStep = ref<ConfiguratorStep>('type')
  const isLoading = ref(false)
  const loadingMessage = ref('')
  const errorMessage = ref<string | null>(null)
  const successMessage = ref<string | null>(null)

  const modal = ref<ModalState>({
    isOpen: false,
    type: null,
    data: null
  })

  const sidebarCollapsed = ref(false)
  const show3DView = ref(true)

  // Lista kroków w kolejności
  const steps: ConfiguratorStep[] = ['type', 'height', 'scheme', 'cage', 'obstacles', 'summary']

  // Getters
  const currentStepIndex = computed(() => steps.indexOf(currentStep.value))

  const isFirstStep = computed(() => currentStepIndex.value === 0)

  const isLastStep = computed(() => currentStepIndex.value === steps.length - 1)

  const canGoNext = computed(() => !isLastStep.value)

  const canGoPrev = computed(() => !isFirstStep.value)

  const progressPercent = computed(() => {
    return ((currentStepIndex.value + 1) / steps.length) * 100
  })

  // Actions
  function setStep(step: ConfiguratorStep) {
    currentStep.value = step
  }

  function nextStep() {
    if (canGoNext.value) {
      const nextIndex = currentStepIndex.value + 1
      currentStep.value = steps[nextIndex]
    }
  }

  function prevStep() {
    if (canGoPrev.value) {
      const prevIndex = currentStepIndex.value - 1
      currentStep.value = steps[prevIndex]
    }
  }

  function goToStep(index: number) {
    if (index >= 0 && index < steps.length) {
      currentStep.value = steps[index]
    }
  }

  function setLoading(loading: boolean, message = '') {
    isLoading.value = loading
    loadingMessage.value = message
  }

  function setError(message: string | null) {
    errorMessage.value = message
    if (message) {
      // Auto-clear after 5 seconds
      setTimeout(() => {
        if (errorMessage.value === message) {
          errorMessage.value = null
        }
      }, 5000)
    }
  }

  function setSuccess(message: string | null) {
    successMessage.value = message
    if (message) {
      // Auto-clear after 3 seconds
      setTimeout(() => {
        if (successMessage.value === message) {
          successMessage.value = null
        }
      }, 3000)
    }
  }

  function clearMessages() {
    errorMessage.value = null
    successMessage.value = null
  }

  function openModal(type: string, data: unknown = null) {
    modal.value = {
      isOpen: true,
      type,
      data
    }
  }

  function closeModal() {
    modal.value = {
      isOpen: false,
      type: null,
      data: null
    }
  }

  function toggleSidebar() {
    sidebarCollapsed.value = !sidebarCollapsed.value
  }

  function toggle3DView() {
    show3DView.value = !show3DView.value
  }

  function reset() {
    currentStep.value = 'type'
    isLoading.value = false
    loadingMessage.value = ''
    errorMessage.value = null
    successMessage.value = null
    modal.value = { isOpen: false, type: null, data: null }
  }

  return {
    // State
    currentStep,
    isLoading,
    loadingMessage,
    errorMessage,
    successMessage,
    modal,
    sidebarCollapsed,
    show3DView,
    steps,
    // Getters
    currentStepIndex,
    isFirstStep,
    isLastStep,
    canGoNext,
    canGoPrev,
    progressPercent,
    // Actions
    setStep,
    nextStep,
    prevStep,
    goToStep,
    setLoading,
    setError,
    setSuccess,
    clearMessages,
    openModal,
    closeModal,
    toggleSidebar,
    toggle3DView,
    reset
  }
})
