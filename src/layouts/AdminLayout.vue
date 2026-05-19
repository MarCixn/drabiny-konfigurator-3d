<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import ThreeCanvas from '../components/ThreeCanvas.vue'
import PricedBOM from '../components/PricedBOM.vue'
import { calculateLadder, calculateLocal, saveConfiguration, getConfigurationByRef, type ComponentItem, type LoadedConfiguration } from '../services/api'
import { generateBOMPdf, type BOMData } from '../services/pdf-generator'
import type { AppMode } from '../composables/useAppMode'

// ============================================
// PROPS - tryb aplikacji
// ============================================
const props = withDefaults(defineProps<{
  mode?: AppMode
}>(), {
  mode: 'admin'
})

// Computed helpers dla trybu
const isCustomerMode = computed(() => props.mode === 'customer')

// ============================================
// STAN APLIKACJI (1:1 z oryginału)
// ============================================
const currentScreen = ref<'purpose' | 'params' | 'summary'>('purpose')

const state = ref({
  purpose: '' as '' | 'internal' | 'external',
  scheme: '' as '' | 'none' | 'no-platform' | 'with-platform' | 'attic-passage',
  cage: '' as '' | 'no-cage' | 'with-cage',
  wallHeight: 5,
  bracketType: 'short' as 'short' | 'medium' | 'long' | 'none' | 'custom',
  bracketSpacing: 215,
  surfaceType: 'smooth' as 'smooth' | 'rough',
  // Opcje montażu
  accessLock: false,       // Blokada dostępu (dla kosza)
  restingPlatform: false,  // Podest spoczynkowy
  cageClosing: false,      // Zamykanie kosza od dołu
  suspended: false,        // Drabina zawieszona
  suspendedHeight: 0,      // Wysokość zawieszenia (m)
  portableLadder: false,   // Dostawiana drabina (gdy zawieszenie <= 2m)
  hasObstacles: false,     // Przeszkody w miejscu montażu
  obstacles: [] as Array<{ id: number; heightFrom: number; height: number; type: string; description: string }>,
  // Okap (tylko jeden, na górze ściany)
  hasEave: false,
  eaveHeight: 20,          // Wysokość okapu (cm)
  eaveDepth: 15,           // Głębokość okapu - w stronę drabiny (cm)

  // ============================================
  // PRZEJŚCIE PRZEZ ATTYKĘ (z oryginalnego konfiguratora)
  // ============================================
  // Strona zejścia
  atticWallHeight: 0.2,              // Wysokość ściany zejścia (m) - domyślnie 20cm
  atticMinDistance: 5,               // Dystans podest-attyka (cm) - domyślnie 5cm
  descentMountType: 'bigfoot' as 'bigfoot' | 'custom-base' | 'brackets' | 'self',
  descentBracketType: 'short' as 'short' | 'medium' | 'long',
  descentBracketSpacing: 215,          // Odległość wsporników strony zejścia (mm)
  descentCageType: 'no-cage' as 'no-cage' | 'with-cage',
  descentAccessLock: false,
  bigfootAllowLowDistance: false,    // Checkbox: pozwól na mniejszy dystans dla bigfoot
  customBaseAllowLowDistance: false,  // Checkbox: pozwól na mniejszy dystans dla custom-base
  customBaseHeight: 0,               // Wysokość własnego podłoża (cm) - domyślnie 0cm
  selfBracketType: 'ready' as 'ready' | 'connecting',  // Typ uchwytu dla montażu na własną rękę
  atticWallThickness: 25,            // Grubość ściany attyki (cm) - domyślnie 25cm
  atticHasInsulation: false,         // Czy jest ocieplenie na attyce (strona wejścia)
  atticInsulationThickness: 0,       // Grubość ocieplenia attyki (cm) - domyślnie 0cm
  atticBackHasInsulation: false,     // Czy jest ocieplenie strona zejścia
  atticBackInsulationThickness: 0,   // Grubość ocieplenia strona zejścia (cm) - domyślnie 0cm
  // Ocieplenie dla klasycznej i z podestem (przednia ściana)
  hasInsulation: false,              // Czy jest ocieplenie (klasyczna/z podestem)
  insulationThickness: 0             // Grubość ocieplenia (cm)
})

// Zmienne formularza
const wallHeightTouched = ref(false)
const wallHeightWarning = ref('')

// Flaga: użytkownik ręcznie wybrał 'none' lub 'custom' - okap nie nadpisuje
const bracketTypeManualOverride = ref(false)
const showBracketInfo = ref(false)

// ============================================
// WIZARD DLA TRYBU CUSTOMER
// ============================================
const customerWizardStep = ref(1)
const summaryExpandedItem = ref<string | null>(null)
const showResetConfirm = ref(false)

// Reset wizard to start
function resetWizard() {
  customerWizardStep.value = 1
  customerRoofType.value = null
  customerLadderEnding.value = null
  summaryExpandedItem.value = null
  showResetConfirm.value = false
}

// Typy dachu dla customer
type CustomerRoofType = 'flat' | 'with-eave' | 'with-parapet'
const customerRoofType = ref<CustomerRoofType | null>(null)

// Typ zakończenia drabiny (dla murka attykowego)
type CustomerLadderEnding = 'classic' | 'platform' | 'attic-passage'
const customerLadderEnding = ref<CustomerLadderEnding | null>(null)

// Kroki wizarda customer
const customerWizardSteps = [
  { id: 1, title: 'Wybierz typ dachu', desc: 'Jak wygląda górna część Twojego budynku?' },
  { id: 2, title: 'Wybierz zakończenie drabiny', desc: 'Jak chcesz wyjść na dach?' },
  { id: 3, title: 'Czy potrzebujesz kosza ochronnego?', desc: 'Bezpieczeństwo podczas wspinaczki' },
  { id: 4, title: 'Podaj wymiary ściany', desc: 'Jak wysoka jest ściana?' },
  { id: 5, title: 'Podaj grubość izolacji', desc: 'Czy ściana ma ocieplenie?', condition: () => customerLadderEnding.value === 'attic-passage' || customerRoofType.value === 'with-parapet' },
  { id: 6, title: 'Podaj parametry okapu', desc: 'Jak duży jest okap nad ścianą?', condition: () => customerRoofType.value === 'with-eave' },
  { id: 7, title: 'Czy są przeszkody na ścianie?', desc: 'Okna, kratki wentylacyjne, lampy' },
  { id: 8, title: 'Skąd będzie się wchodzić na drabinę?', desc: 'Czy drabina ma sięgać do poziomu gruntu?' },
  { id: 9, title: 'Podsumowanie konfiguracji', desc: 'Sprawdź i zatwierdź swój wybór' }
]

// Widoczne kroki (z uwzględnieniem warunków)
const visibleCustomerSteps = computed(() => {
  return customerWizardSteps.filter(step => !step.condition || step.condition())
})

// Aktualny krok (z widocznych)
const currentCustomerStepIndex = computed(() => {
  const idx = visibleCustomerSteps.value.findIndex(s => s.id === customerWizardStep.value)
  return idx >= 0 ? idx + 1 : 1
})

// Progress wizarda
const customerWizardProgress = computed(() => {
  return Math.round((currentCustomerStepIndex.value / visibleCustomerSteps.value.length) * 100)
})

// Nawigacja wizarda
function customerNextStep() {
  const currentIdx = visibleCustomerSteps.value.findIndex(s => s.id === customerWizardStep.value)
  if (currentIdx < visibleCustomerSteps.value.length - 1) {
    const nextStepId = visibleCustomerSteps.value[currentIdx + 1].id
    customerWizardStep.value = nextStepId

    // Na kroku 9 (podsumowanie) wyłącz rysunek techniczny i pokaż widok 3D
    if (nextStepId === 9 && threeCanvasRef.value) {
      threeCanvasRef.value.exitTechDrawingMode()
      techDrawingActive.value = false
    }
  }
}

function customerPrevStep() {
  const currentIdx = visibleCustomerSteps.value.findIndex(s => s.id === customerWizardStep.value)
  if (currentIdx > 0) {
    const currentStepId = customerWizardStep.value
    customerWizardStep.value = visibleCustomerSteps.value[currentIdx - 1].id

    // Wracając z kroku 9 włącz z powrotem rysunek techniczny
    if (currentStepId === 9 && threeCanvasRef.value) {
      threeCanvasRef.value.enterTechDrawingMode('side')
      techDrawingActive.value = true
    }
  }
}

// Formularz przeszkody dla customer
const newObstacleHeight = ref(1)
const newObstacleSize = ref(1)

function addCustomerObstacle() {
  state.value.obstacles.push({
    id: Date.now(),
    heightFrom: newObstacleHeight.value,
    height: newObstacleSize.value,
    type: 'window',
    description: ''
  })
  state.value.hasObstacles = true
  // Reset formularza
  newObstacleHeight.value = Math.min(newObstacleHeight.value + newObstacleSize.value + 0.5, state.value.wallHeight - 1)
  newObstacleSize.value = 1
}

function addFirstObstacle() {
  if (state.value.obstacles.length === 0) {
    addCustomerObstacle()
  }
}

// Ustawienie typu dachu przez klienta
function setCustomerRoofType(type: CustomerRoofType) {
  customerRoofType.value = type
  // Mapowanie na state
  if (type === 'flat') {
    state.value.hasEave = false
    state.value.eaveHeight = 0
    state.value.eaveDepth = 0
    state.value.atticWallHeight = 0  // Płaski dach - brak różnicy wysokości
  } else if (type === 'with-eave') {
    state.value.hasEave = true
    // Ustaw domyślne wartości okapu (cm)
    state.value.eaveHeight = 20
    state.value.eaveDepth = 15
    state.value.atticWallHeight = 0  // Z okapem - brak różnicy wysokości
  } else if (type === 'with-parapet') {
    state.value.hasEave = false
    state.value.eaveHeight = 0
    state.value.eaveDepth = 0
    state.value.atticWallHeight = 0.3  // Domyślna wysokość murka attykowego 30cm
  }
  // Reset wyboru zakończenia przy zmianie typu dachu
  customerLadderEnding.value = null
  // Reset wsporników do domyślnych (krótki 215mm)
  state.value.bracketType = 'short'
  state.value.bracketSpacing = 215
  globalWspornikDistance.value = 215
  threeCanvasRef.value?.setGlobalWspornikDistance(215, 1)
  // Przelicz strukturę drabiny
  updateThreeState()
  // Przelicz odległość wsporników (okap/ocieplenie)
  nextTick(() => {
    updateWspornikDistanceForObstacles()
  })
}

// Ustawienie typu zakończenia drabiny
function setCustomerLadderEnding(ending: CustomerLadderEnding) {
  customerLadderEnding.value = ending
  // Mapowanie na state.scheme
  if (ending === 'classic') {
    state.value.scheme = 'no-platform'
  } else if (ending === 'platform') {
    state.value.scheme = 'with-platform'
  } else if (ending === 'attic-passage') {
    state.value.scheme = 'attic-passage'
  }
  // Przelicz strukturę drabiny
  updateThreeState()
  // Przelicz odległość wsporników (po updateThreeState żeby nadpisać ewentualne resety)
  nextTick(() => {
    updateWspornikDistanceForObstacles()
  })
}

// Computed dla progress bar
const formProgress = computed(() => {
  let progress = 0

  // Wysokość ściany (obowiązkowe)
  if (state.value.wallHeight >= 0.6 && state.value.wallHeight <= 30) progress += 30

  // Schemat zakończenia (dla zewnętrznej)
  if (state.value.purpose === 'external') {
    if (state.value.scheme) progress += 25
    // Kosz (jeśli nie attyka)
    if (state.value.scheme === 'attic-passage' || state.value.cage) progress += 25
  } else {
    // Wewnętrzna - schemat i kosz automatyczne
    progress += 50
  }

  // Wsporniki (dla zewnętrznej)
  if (state.value.purpose === 'external') {
    if (state.value.bracketType) progress += 20
  } else {
    progress += 20
  }

  return Math.min(100, progress)
})

// Stan 3D (bezpośrednia integracja Three.js)
const threeState = ref({
  numX7Ladders: 0,
  finalLadderRungs: 0,
  totalRungs: 0,
  safetyCageCount: 0,
  maxCageHoops: 0,
  totalHeightMm: 0,
  // Watchdog - ciągłe pomiary
  lastRungToGround: 0,
  lastHoopToGround: 0
})

const threeReady = ref(false)

// Stan API i komponentów
const apiLoading = ref(false)
const apiError = ref('')
const componentsList = ref<ComponentItem[]>([])
const pricing = ref({
  subtotal: 0,
  discount: 0,
  discountPercent: 0,
  total: 0,
  totalWithVat: 0,
  vatRate: 23
})

// Cage correction state (moved here to be available in threeCanvasProps)
const cageCorrection = ref(0)

// Computed props dla ThreeCanvas
const threeCanvasProps = computed(() => {
  const ladderConfig = calculateLadderStructure()

  return {
    numX7Ladders: ladderConfig.numX7,
    finalLadderRungs: ladderConfig.finalRungs,
    safetyCageCount: state.value.cage === 'with-cage' ? Math.max(0, ladderConfig.cageHoops + cageCorrection.value) : 0,
    wallHeight: state.value.wallHeight,
    scheme: state.value.scheme || 'no-platform',
    wspornikDistance: state.value.bracketSpacing || 215,
    showWall: show3DWall.value,
    showGround: show3DGround.value,
    showInsulation: show3DInsulation.value,
    suspended: state.value.suspended,
    suspendedHeight: state.value.suspendedHeight,
    obstacles: state.value.obstacles.length > 0
      ? state.value.obstacles.map(obs => ({
          id: obs.id,
          bottomHeightMm: obs.heightFrom * 1000,
          heightMm: obs.height * 1000,
          topHeightMm: (obs.heightFrom + obs.height) * 1000,
          type: obs.type  // 'window' | 'wall-point'
        }))
      : [],
    // Dodatkowe propsy
    cageClosing: state.value.accessLock || state.value.cageClosing,
    restingPlatform: state.value.restingPlatform,
    showWsporniki: state.value.bracketType !== 'none' && state.value.bracketType !== 'custom',
    distanceFromGround: ladderConfig.distanceFromGround || 160,
    // Okap
    eave: state.value.hasEave ? {
      height: state.value.eaveHeight * 10,  // cm to mm
      depth: state.value.eaveDepth * 10     // cm to mm
    } : null,
    // Przejście przez attykę - dystans podest-attyka w mm
    atticPlatformDistance: state.value.scheme === 'attic-passage'
      ? actualPlatformDistance.value * 10  // cm -> mm
      : 0,
    // Wysokość ściany strona zejścia (attyka) w mm
    // Dla attic-passage: używa wartości z formularza
    // Dla murka attykowego w customer mode: używa wartości z formularza
    // Dla płaskiego dachu/okapu: 0 (ściana ta sama wysokość)
    atticWallHeight: state.value.scheme === 'attic-passage'
      ? state.value.atticWallHeight * 1000  // m -> mm
      : (isCustomerMode.value && customerRoofType.value === 'with-parapet')
        ? state.value.atticWallHeight * 1000  // m -> mm
        : 0,
    // Pokaż ścianę zejścia w trybie customer (zawsze - dla wszystkich typów dachu)
    showDescentWall: isCustomerMode.value,
    // Typ montażu strona zejścia (dla attyki)
    descentMountType: state.value.scheme === 'attic-passage'
      ? state.value.descentMountType
      : '',
    // Wysokość własnego podłoża w mm
    customBaseHeight: state.value.scheme === 'attic-passage' && state.value.descentMountType === 'custom-base'
      ? (state.value.customBaseHeight || 0) * 10  // cm -> mm
      : 0,
    // Dane drabiny zejścia (dla attyki)
    descentLadder: descentLadderData.value,
    // Ukryty dystans (gdy checkbox odznaczony)
    hiddenDistanceMm: hiddenDistanceMm.value,
    // Grubość ściany attyki w mm
    atticWallThickness: state.value.scheme === 'attic-passage'
      ? (state.value.atticWallThickness || 25) * 10  // cm -> mm
      : 250,
    // Ocieplenie attyki - strona wejścia
    atticHasInsulation: state.value.scheme === 'attic-passage' && state.value.atticHasInsulation,
    atticInsulationThickness: state.value.scheme === 'attic-passage' && state.value.atticHasInsulation
      ? (state.value.atticInsulationThickness || 10) * 10  // cm -> mm
      : 0,
    // Ocieplenie attyki - strona zejścia
    atticBackHasInsulation: state.value.scheme === 'attic-passage' && state.value.atticBackHasInsulation,
    atticBackInsulationThickness: state.value.scheme === 'attic-passage' && state.value.atticBackHasInsulation
      ? (state.value.atticBackInsulationThickness || 10) * 10  // cm -> mm
      : 0,
    // Ocieplenie przedniej ściany (klasyczna/z podestem)
    hasInsulation: state.value.scheme !== 'attic-passage' && (state.value.hasInsulation || state.value.insulationThickness > 0),
    insulationThickness: state.value.scheme !== 'attic-passage'
      ? state.value.insulationThickness * 10  // cm -> mm
      : 0
  }
})

// Handler dla aktualizacji z ThreeCanvas
function onThreeReady() {
  threeReady.value = true
  updateThreeState()

  // Dla trybu customer - wymuś widok side (rysunek techniczny)
  if (isCustomerMode.value && threeCanvasRef.value) {
    threeCanvasRef.value.enterTechDrawingMode('side')
  }
}

function onThreeUpdate(data: {
  totalRungs: number;
  totalHeightMm: number;
  lastRungToGround?: number;
  lastHoopToGround?: number;
}) {
  threeState.value.totalRungs = data.totalRungs
  threeState.value.totalHeightMm = data.totalHeightMm
  if (data.lastRungToGround !== undefined) {
    threeState.value.lastRungToGround = data.lastRungToGround
  }
  if (data.lastHoopToGround !== undefined) {
    threeState.value.lastHoopToGround = data.lastHoopToGround
  }
}

function updateThreeState() {
  const ladderConfig = calculateLadderStructure()
  threeState.value.numX7Ladders = ladderConfig.numX7
  threeState.value.finalLadderRungs = ladderConfig.finalRungs
  threeState.value.totalRungs = ladderConfig.totalRungs
  threeState.value.safetyCageCount = state.value.cage === 'with-cage' ? ladderConfig.cageHoops : 0
  threeState.value.maxCageHoops = ladderConfig.maxCageHoops
  threeState.value.totalHeightMm = ladderConfig.ladderLength
}

// ============================================
// COMPUTED
// ============================================
const screenTitle = computed(() => {
  if (isCustomerMode.value) {
    switch (currentScreen.value) {
      case 'purpose': return 'Konfigurator Drabin'
      case 'params': return 'Konfigurator drabin zewnętrznych'
      case 'summary': return 'Podsumowanie'
      default: return 'Konfigurator Drabin'
    }
  }
  switch (currentScreen.value) {
    case 'purpose': return 'Konfigurator Drabin'
    case 'params': return 'Parametry drabiny'
    case 'summary': return 'Podsumowanie'
    default: return 'Konfigurator Drabin'
  }
})

const stepIndicator = computed(() => {
  if (isCustomerMode.value) {
    // Dla customer mode - bez "Krok X z Y"
    return ''
  }
  switch (currentScreen.value) {
    case 'purpose': return 'Wybierz przeznaczenie'
    case 'params': return 'Krok 2 z 3'
    case 'summary': return 'Podsumowanie'
    default: return ''
  }
})

// ============================================
// COMPUTED DLA ATTYKI (strona zejścia)
// Stałe z oryginalnego konfiguratora
// ============================================
const ATTIC_CONSTANTS = {
  RUNG_SPACING: 275,           // mm
  BIGFOOT_HEIGHT: 90,          // mm (9cm)
  BIGFOOT_CONNECTION_OVERLAP: 105,  // mm
  BIGFOOT_MAX_ADDITIONAL_RUNGS: 4
}

// Max wysokość ściany zejścia (zależy od typu montażu i dystansu)
const atticWallHeightMax = computed(() => {
  const mountType = state.value.descentMountType
  const minDistanceCm = state.value.atticMinDistance || 0
  
  if (mountType === 'bigfoot') {
    // Max = 1.465m - dystans/100
    return Math.max(0, 1.465 - (minDistanceCm / 100))
  } else if (mountType === 'custom-base') {
    // Max = 1.555m - wysokość_podłoża/100 - dystans/100
    const baseHeightCm = (state.value.customBaseHeight || 0)  // wysokość w cm
    return Math.max(0, 1.555 - (baseHeightCm / 100) - (minDistanceCm / 100))
  } else {
    // Dla brackets i self - max 30m
    return 30
  }
})

// Próg minimalnego dystansu (zależy od typu montażu)
// Bigfoot: 275 + 90 + 5 = 370mm
// Custom-base: 275 + customBaseHeight + 5
const minDistanceThresholdMm = computed(() => {
  const mountType = state.value.descentMountType
  if (mountType === 'bigfoot') {
    return 275 + 90 + 5  // 370mm
  } else if (mountType === 'custom-base') {
    const customHeightMm = (state.value.customBaseHeight || 0) * 10  // cm -> mm
    return 275 + customHeightMm + 5
  }
  return 0
})

// Warunek pokazania checkboxa: minDistance + wallHeight < próg
const showLowDistanceCheckbox = computed(() => {
  const mountType = state.value.descentMountType
  if (mountType !== 'bigfoot' && mountType !== 'custom-base') return false
  const wallHeightMm = (state.value.atticWallHeight || 0) * 1000
  const minDistanceMm = (state.value.atticMinDistance || 0) * 10
  return (minDistanceMm + wallHeightMm) < minDistanceThresholdMm.value
})

// Ukryty dystans gdy checkbox NIE jest zaznaczony
const hiddenDistanceMm = computed(() => {
  const mountType = state.value.descentMountType
  if (mountType !== 'bigfoot' && mountType !== 'custom-base') return 0

  // Sprawdź odpowiedni checkbox
  if (mountType === 'bigfoot' && state.value.bigfootAllowLowDistance) return 0
  if (mountType === 'custom-base' && state.value.customBaseAllowLowDistance) return 0

  const wallHeightMm = (state.value.atticWallHeight || 0) * 1000
  const minDistanceMm = (state.value.atticMinDistance || 0) * 10
  const total = minDistanceMm + wallHeightMm
  const threshold = minDistanceThresholdMm.value

  if (total >= threshold) return 0
  return threshold - total  // ukryty dystans do dodania
})

// Efektywny minimalny dystans (z inputa + ukryty)
const effectiveAtticMinDistanceMm = computed(() => {
  const rawMinDistanceMm = (state.value.atticMinDistance || 0) * 10
  return rawMinDistanceMm + hiddenDistanceMm.value
})

// Maksymalna grubość murka dla bigfoot/custom-base
// Limit: bracketSpacing + descentInsulation + parapetThickness ≤ 870mm
const atticWallThicknessMax = computed(() => {
  const mountType = state.value.descentMountType
  if (mountType !== 'bigfoot' && mountType !== 'custom-base') return 60

  const MAX_BIGFOOT_DEPTH = 870
  const bracketDistanceMm = state.value.bracketSpacing || 215
  const descentInsulationMm = state.value.atticBackHasInsulation
    ? (state.value.atticBackInsulationThickness || 0) * 10
    : 0

  // Max murek = (870 - wsporniki - ocieplenie_zejścia) / 10 w cm
  const maxMm = MAX_BIGFOOT_DEPTH - bracketDistanceMm - descentInsulationMm
  return Math.max(10, Math.floor(maxMm / 10))
})

// Maksymalna grubość ocieplenia strona wejścia - nie wpływa na bigfoot limit
const atticInsulationMax = computed(() => {
  return 30  // Brak ograniczenia od bigfoot, tylko ogólny max
})

// Maksymalna grubość ocieplenia strona zejścia dla bigfoot/custom-base
// Limit: bracketSpacing + descentInsulation + parapetThickness ≤ 870mm
const atticBackInsulationMax = computed(() => {
  const mountType = state.value.descentMountType
  if (mountType !== 'bigfoot' && mountType !== 'custom-base') return 30

  const MAX_BIGFOOT_DEPTH = 870
  const bracketDistanceMm = state.value.bracketSpacing || 215
  const parapetThicknessMm = (state.value.atticWallThickness || 25) * 10

  // Max ocieplenie = (870 - wsporniki - murek) / 10 w cm
  const maxMm = MAX_BIGFOOT_DEPTH - bracketDistanceMm - parapetThicknessMm
  return Math.max(1, Math.floor(maxMm / 10))
})

// Ostrzeżenie dla bigfoot: wsporniki + ocieplenie zejścia + murek > 870mm
const atticThicknessWarning = computed(() => {
  const mountType = state.value.descentMountType
  if (mountType !== 'bigfoot' && mountType !== 'custom-base') return null

  // Odległość wsporników w mm
  const bracketDistanceMm = state.value.bracketSpacing || 215
  // Ocieplenie strona zejścia w mm
  const descentInsulationMm = state.value.atticBackHasInsulation
    ? (state.value.atticBackInsulationThickness || 0) * 10
    : 0
  // Grubość murka w mm
  const parapetThicknessMm = (state.value.atticWallThickness || 25) * 10

  const totalMm = bracketDistanceMm + descentInsulationMm + parapetThicknessMm
  const MAX_BIGFOOT_DEPTH = 870

  if (totalMm > MAX_BIGFOOT_DEPTH) {
    return `Niestety, przy obecnej konfiguracji (odl. wsporników: ${bracketDistanceMm}mm + ocieplenie zejścia: ${descentInsulationMm}mm + grubość murka: ${parapetThicknessMm}mm = ${totalMm}mm) przekraczamy maksymalną głębokość ${MAX_BIGFOOT_DEPTH}mm dla montażu ${mountType === 'bigfoot' ? 'Bigfoot' : 'Własne podłoże'}. Prosimy o kontakt z działem sprzedaży.`
  }
  return null
})

// ============================================
// LOGIKA WSPORNIKÓW DLA PRZEJŚCIA PRZEZ ATTYKĘ
// ============================================
// Odległość między uchwytami strony wejścia i zejścia = 1012mm (stała konstrukcyjna)
const CONNECTOR_DISTANCE_MM = 1012

// Oblicz wymaganą odległość wsporników strony zejścia
// Walidacja: 1012 - (wejście + ściana + ocieplenie_zejścia) >= 160mm
// Finalny wynik: 1012 - (wejście + ściana) - mierzony od ściany
const calculatedDescentBracketDistance = computed(() => {
  if (state.value.scheme !== 'attic-passage') return null
  if (state.value.descentMountType !== 'brackets') return null

  const entryDistanceMm = state.value.bracketSpacing || 215
  const wallThicknessMm = (state.value.atticWallThickness || 25) * 10
  const descentInsulationMm = state.value.atticBackHasInsulation
    ? (state.value.atticBackInsulationThickness || 0) * 10
    : 0

  // Odległość od powierzchni ocieplenia (do walidacji >= 160mm)
  const clearanceFromInsulation = CONNECTOR_DISTANCE_MM - (entryDistanceMm + wallThicknessMm + descentInsulationMm)

  // Finalny wynik = odległość od ściany (bez ocieplenia)
  const finalDistanceMm = CONNECTOR_DISTANCE_MM - (entryDistanceMm + wallThicknessMm)

  // Zwracamy clearance do walidacji (czy >= 160)
  return { clearanceFromInsulation, finalDistanceMm }
})

// Ostrzeżenie gdy prześwit od ocieplenia < 160mm lub finalny wynik poza zakresem 160-460mm
const atticBracketWarning = computed(() => {
  if (state.value.scheme !== 'attic-passage') return null
  if (state.value.descentMountType !== 'brackets') return null

  const result = calculatedDescentBracketDistance.value
  if (result === null) return null

  const { clearanceFromInsulation, finalDistanceMm } = result
  const entryInsulation = state.value.atticHasInsulation ? state.value.atticInsulationThickness : 0
  const descentInsulation = state.value.atticBackHasInsulation ? state.value.atticBackInsulationThickness : 0

  // Stałe zakresu
  const MIN_BRACKET = 160
  const MAX_BRACKET = 460

  // Walidacja 1: prześwit od ocieplenia musi być >= 160mm
  if (clearanceFromInsulation < MIN_BRACKET) {
    return `Niestety, przy obecnej konfiguracji (ocieplenie wejścia: ${entryInsulation}cm, grubość murka: ${state.value.atticWallThickness}cm, ocieplenie zejścia: ${descentInsulation}cm) prześwit od ocieplenia wynosi ${clearanceFromInsulation}mm, co jest poniżej minimum ${MIN_BRACKET}mm (16cm). Nie możemy zaoferować takiej drabiny.`
  }

  // Walidacja 2: finalDistance musi być >= 160mm
  if (finalDistanceMm < MIN_BRACKET) {
    return `Niestety, przy obecnej konfiguracji obliczona odległość wsporników strony zejścia wynosi ${finalDistanceMm}mm, co jest poniżej minimum ${MIN_BRACKET}mm (16cm). Nie możemy zaoferować takiej drabiny.`
  }

  // Walidacja 3: Sprawdź czy finalDistance > 460 i czy nie można skorygować wejścia
  const entryInsulationCm = state.value.atticHasInsulation ? (state.value.atticInsulationThickness || 0) : 0
  const minEntryFromInsulation = (entryInsulationCm + 15) * 10
  const minEntryDistanceMm = Math.max(MIN_BRACKET, minEntryFromInsulation)
  const wallThicknessMm = (state.value.atticWallThickness || 25) * 10

  // Wymagane wejście żeby zejście = 460mm
  const requiredEntryFor460 = CONNECTOR_DISTANCE_MM - MAX_BRACKET - wallThicknessMm

  // Jeśli finalDistance > 460 i nie możemy skorygować wejścia
  if (finalDistanceMm > MAX_BRACKET) {
    if (requiredEntryFor460 < minEntryDistanceMm || requiredEntryFor460 > MAX_BRACKET) {
      return `Przy obecnej konfiguracji (ocieplenie wejścia: ${entryInsulation}cm, grubość murka: ${state.value.atticWallThickness}cm) wymagana odległość wsporników strony zejścia wynosi ${finalDistanceMm}mm, co przekracza standardowy zakres ${MAX_BRACKET}mm (46cm). Nie możemy skonfigurować takiej drabiny online, ale prosimy o kontakt w sprawie dłuższych uchwytów.`
    }
  }

  return null
})

// Funkcja pomocnicza: typ wspornika na podstawie odległości (mm)
function getBracketTypeFromDistance(distanceMm: number): 'short' | 'medium' | 'long' | 'custom' {
  if (distanceMm < 160) return 'custom' // Za mała
  if (distanceMm <= 260) return 'short'
  if (distanceMm <= 360) return 'medium'
  if (distanceMm <= 460) return 'long'
  return 'custom' // Za duża
}

// Aktualny dystans podest-attyka (obliczony dla BIGFOOT/custom-base)
// Logika 1:1 z oryginalnego konfiguratora
const actualPlatformDistance = computed(() => {
  const mountType = state.value.descentMountType
  if (mountType !== 'bigfoot' && mountType !== 'custom-base') {
    return state.value.atticMinDistance || 0
  }
  
  const wallHeightMm = (state.value.atticWallHeight || 0) * 1000
  const minDistanceMm = effectiveAtticMinDistanceMm.value  // używa efektywnego dystansu (z ukrytym)
  const footHeight = mountType === 'custom-base'
    ? (state.value.customBaseHeight || 0) * 10  // cm -> mm
    : ATTIC_CONSTANTS.BIGFOOT_HEIGHT
  
  // Oba typy używają tej samej formuły: 275mm + wysokość podłoża
  const baseHeight = ATTIC_CONSTANTS.RUNG_SPACING + footHeight
  const extendedHeight = baseHeight + ATTIC_CONSTANTS.BIGFOOT_CONNECTION_OVERLAP  // baseHeight + 105
  const targetHeight = wallHeightMm + minDistanceMm
  
  let platformDistance = 0
  
  if (targetHeight <= baseHeight) {
    // Krótsze nóżki
    platformDistance = baseHeight - wallHeightMm
  } else if (targetHeight <= extendedHeight) {
    // Pełne podłużnice
    platformDistance = extendedHeight - wallHeightMm
  } else {
    // Drabina końcowa
    for (let i = 1; i <= ATTIC_CONSTANTS.BIGFOOT_MAX_ADDITIONAL_RUNGS; i++) {
      const totalHeight = baseHeight + (i * ATTIC_CONSTANTS.RUNG_SPACING)
      if (totalHeight >= targetHeight) {
        platformDistance = totalHeight - wallHeightMm
        break
      }
    }
  }
  
  // Korekta dla custom-base: -5mm (wizualnie jest 5mm mniej)
  const correction = mountType === 'custom-base' ? 5 : 0
  return (platformDistance - correction) / 10  // mm to cm
})

// Min wysokość bloczków dla custom-base
// Warunek: (wysokość_ściany + dystans_podest) - wysokość_bloczków <= 138cm
// Więc: wysokość_bloczków >= (wysokość_ściany + dystans_podest) - 138
const customBaseHeightMin = computed(() => {
  if (state.value.descentMountType !== 'custom-base') return 0
  const wallHeightCm = (state.value.atticWallHeight || 0) * 100  // m -> cm
  const platformDistCm = actualPlatformDistance.value  // już w cm
  const minHeight = (wallHeightCm + platformDistCm) - 138
  return Math.max(0, minHeight)
})

// Dopuszczalna szerokość murka (dla brackets)
// Wzór: 102cm - odległość_wejścia - odległość_zejścia
const wallThicknessMin = computed(() => {
  const bracketRanges: Record<string, [number, number]> = {
    'short': [16, 26],
    'medium': [26, 36],
    'long': [36, 46]
  }
  const entryRange = bracketRanges[state.value.bracketType] || [16, 26]
  const descentRange = bracketRanges[state.value.descentBracketType] || [16, 26]
  // Min szerokość = 102 - max_entry - max_descent
  return Math.max(0, 102 - entryRange[1] - descentRange[1])
})

const wallThicknessMax = computed(() => {
  const bracketRanges: Record<string, [number, number]> = {
    'short': [16, 26],
    'medium': [26, 36],
    'long': [36, 46]
  }
  const entryRange = bracketRanges[state.value.bracketType] || [16, 26]
  const descentRange = bracketRanges[state.value.descentBracketType] || [16, 26]
  // Max szerokość = 102 - min_entry - min_descent
  return Math.max(0, 102 - entryRange[0] - descentRange[0])
})

// Obliczenia drabiny zejścia (dla attyki)
const descentLadderData = computed(() => {
  if (state.value.scheme !== 'attic-passage') {
    return null
  }

  const mountType = state.value.descentMountType
  const descentWallHeightMm = (state.value.atticWallHeight || 0) * 1000
  const minDistanceMm = (state.value.atticMinDistance || 0) * 10
  const platformDistanceMm = actualPlatformDistance.value * 10

  // Stałe
  const RUNG_SPACING = 275
  const BIGFOOT_HEIGHT = 90
  const BIGFOOT_CONNECTION_OVERLAP = 105
  const BIGFOOT_MAX_ADDITIONAL_RUNGS = 4
  const MIN_LAST_RUNG = 40
  const MAX_LAST_RUNG = 330

  if (mountType === 'bigfoot' || mountType === 'custom-base') {
    // Dla BIGFOOT/custom-base: oblicz ile dodatkowych szczebli potrzeba
    const footHeight = mountType === 'custom-base'
      ? (state.value.customBaseHeight || 0) * 10  // cm -> mm
      : BIGFOOT_HEIGHT

    // Oba typy używają tej samej formuły: 275mm + wysokość podłoża
    const baseHeight = RUNG_SPACING + footHeight
    const extendedHeight = baseHeight + BIGFOOT_CONNECTION_OVERLAP  // +105mm
    const targetHeight = descentWallHeightMm + minDistanceMm

    let descentRungs = 0
    let calculatedPlatformDistance = 0

    if (targetHeight <= baseHeight) {
      // Krótsze nóżki
      calculatedPlatformDistance = baseHeight - descentWallHeightMm
      descentRungs = 0
    } else if (targetHeight <= extendedHeight) {
      // Pełne podłużnice
      calculatedPlatformDistance = extendedHeight - descentWallHeightMm
      descentRungs = 0
    } else {
      // Drabina końcowa (1-4 szczeble)
      for (let i = 1; i <= BIGFOOT_MAX_ADDITIONAL_RUNGS; i++) {
        const totalHeight = baseHeight + (i * RUNG_SPACING)
        if (totalHeight >= targetHeight) {
          descentRungs = i
          calculatedPlatformDistance = totalHeight - descentWallHeightMm
          break
        }
      }
    }

    return {
      type: mountType,  // 'bigfoot' lub 'custom-base'
      rungs: descentRungs,
      repeatLadder7: 0,
      endLadderRungs: descentRungs,
      platformDistanceMm: calculatedPlatformDistance
    }

  } else if (mountType === 'brackets' || mountType === 'self') {
    // Wysokość drabiny = (ściana zejścia + dystans podestu) - 375mm
    const ladderHeight = descentWallHeightMm + platformDistanceMm - 515
    
    // Oblicz liczbę szczebli (co 275mm)
    let rungCount = Math.max(1, Math.round(ladderHeight / RUNG_SPACING))
    
    // Sprawdź pozycję ostatniego szczebla względem dachu
    const actualLadderSpan = (rungCount - 1) * RUNG_SPACING
    const lastRungOffset = ladderHeight - actualLadderSpan
    
    // Dopasuj jeśli ostatni szczebel poza zakresem 40-330mm
    if (lastRungOffset > MAX_LAST_RUNG) {
      rungCount++
    } else if (lastRungOffset < MIN_LAST_RUNG && rungCount > 1) {
      rungCount--
    }
    
    rungCount = Math.max(1, rungCount)
    
    // Oblicz finalną odległość ostatni szczebel -> dach
    const finalLadderSpan = (rungCount - 1) * RUNG_SPACING
    const lastRungToRoof = ladderHeight - finalLadderSpan
    
    // Podział na moduły (jak strona wejścia)
    let numX7 = 0
    let endLadderRungs = rungCount
    
    if (rungCount <= 7) {
      endLadderRungs = rungCount
    } else {
      numX7 = 1  // startLadder7
      const remaining = rungCount - 7
      const repeatCount = Math.floor(remaining / 7)
      let endRungs = remaining % 7
      
      if (endRungs === 0) {
        endRungs = 7
        numX7 += Math.max(0, repeatCount - 1)
      } else {
        numX7 += repeatCount
      }
      endLadderRungs = endRungs
    }

    return {
      type: mountType,
      rungs: rungCount,
      totalRungs: rungCount,
      repeatLadder7: numX7,
      endLadderRungs: endLadderRungs,
      ladderHeight: ladderHeight,
      lastRungToRoof: lastRungToRoof
    }
  }

  return null
})

const canGoBack = computed(() => currentScreen.value !== 'purpose')

// ============================================
// NAWIGACJA
// ============================================
function goBack() {
  switch (currentScreen.value) {
    case 'params':
      currentScreen.value = 'purpose'
      break
    case 'summary':
      currentScreen.value = 'params'
      break
  }
}

function selectPurpose(purpose: 'internal' | 'external') {
  state.value.purpose = purpose
  if (purpose === 'internal') {
    // Wewnętrzna - bez poręczy i kosza
    state.value.scheme = 'none'
    state.value.cage = 'no-cage'
  } else {
    // Zewnętrzna - domyślne ustawienia (użytkownik może zmienić w params)
    if (!state.value.scheme) {
      state.value.scheme = 'no-platform'
    }
    if (!state.value.cage) {
      state.value.cage = 'no-cage'
    }
  }
  currentScreen.value = 'params'
}

function selectScheme(scheme: 'no-platform' | 'with-platform' | 'attic-passage') {
  state.value.scheme = scheme
  // Jeśli attyka - brak kosza
  if (scheme === 'attic-passage') {
    state.value.cage = 'no-cage'
  }
  updateThreeState()
}

function selectCage(cage: 'no-cage' | 'with-cage') {
  state.value.cage = cage
  updateThreeState()
}

// Obsługa checkboxa "pozwól na mniejszy dystans"
function handleLowDistanceCheckbox(checked: boolean) {
  if (state.value.descentMountType === 'bigfoot') {
    state.value.bigfootAllowLowDistance = checked
  } else if (state.value.descentMountType === 'custom-base') {
    state.value.customBaseAllowLowDistance = checked
  }
  updateThreeState()
}

// ============================================
// STAŁE DRABINY (z oryginału LadderCalculator)
// ============================================
const LADDER_CONSTANTS = {
  RUNG_SPACING: 275,        // mm - odstęp między szczeblami
  MAX_GROUND_DISTANCE: 300, // mm - max odległość ostatniego szczebla od ziemi (FIXED: was 330)
  MIN_GROUND_DISTANCE: 40,  // mm - min odległość ostatniego szczebla od ziemi
  PLATFORM_OFFSET: 50,      // mm - przesunięcie pierwszego szczebla dla podestu
  MIN_HEIGHT: 600,          // mm - minimalna wysokość ściany
  MAX_HEIGHT: 30000,        // mm - maksymalna wysokość ściany

  // Stałe dla kosza ochronnego
  CAGE_START_OFFSET: 1114,  // mm - odległość środka pierwszej obręczy od górnego szczebla (FIXED: was 1122)
  CAGE_HOOP_SPACING: 641.7, // mm - rozstaw między obręczami
  CAGE_MIN_HEIGHT: 2200,    // mm - minimalna wysokość ostatniej obręczy od ziemi (2.2m)
  CAGE_MAX_HEIGHT: 3000,    // mm - maksymalna wysokość ostatniej obręczy od ziemi (3m)

  // Ilość otworów na obręcze w modułach
  CAGE_HOLES: {
    handrails: 2,
    startLadder: 3,
    repeatLadder: 3,
    endLadder: { 7: 3, 6: 3, 5: 2, 4: 2, 3: 1, 2: 1, 1: 0 } as Record<number, number>
  }
}

/**
 * Oblicz szczeble drabiny (logika 1:1 z oryginału)
 */
function calculateRungs(
  wallHeightMm: number,
  scheme: string,
  suspended: boolean = false,
  suspendedHeightMm: number = 0,
  atticPlatformDistanceMm: number = 0
) {
  const hasPlatform = scheme === 'with-platform'
  const isAtticPassage = scheme === 'attic-passage'

  // ============================================
  // PRZEJŚCIE PRZEZ ATTYKĘ - osobna logika
  // ============================================
  if (isAtticPassage) {
    // Zmienne:
    // a = dystans podest-attyka (mm)
    // b = wysokość ściany (mm)
    // c = wysokość zawieszenia (mm)
    const a = atticPlatformDistanceMm
    const b = wallHeightMm
    const c = suspendedHeightMm

    let d: number  // ilość szczebli (razem)
    let e: number  // ostatni szczebel → ziemia

    if (suspended) {
      // Dla zawieszonej drabiny - bez korekt (adjustments)
      // Uwaga: c (suspendedHeightMm) może być 0 jeśli nie wpisano wartości
      d = Math.floor((a + 36 + b - c) / 275)
      e = (a + 36 + b) - (275 * d)
    } else {
      // Dla nie-zawieszonej drabiny
      d = Math.floor((a + 36 + b) / 275)
      e = (a + 36 + b) - (275 * d)

      // Sprawdź warunki i dostosuj
      if (e < 40) {
        // Za blisko ziemi - usuń szczebel
        d = d - 1
        e = (a + 36 + b) - (275 * d)
      } else if (e > 340) {
        // Za daleko od ziemi - dodaj szczebel
        d = d + 1
        e = (a + 36 + b) - (275 * d)
      } else if (e > 40 && e < 340) {
        // W zakresie - sprawdź czy można zoptymalizować
        if (e + 275 <= 340) {
          d = d - 1
          e = (a + 36 + b) - (275 * d)
        }
      }
    }

    // Szczeble do generowania modeli = d - 2 (przełaz ma 2 szczeble)
    const ladderRungs = Math.max(0, d - 1)  // przełaz ma 1 szczebel wliczony
    const ladderLength = ladderRungs > 0 ? (ladderRungs - 1) * 275 : 0

    return {
      valid: true,
      rungCount: d,               // Razem szczebli (do wyświetlenia)
      ladderRungs: ladderRungs,  // Szczeble do generowania (bez przełazu)
      firstRungHeight: a + 36 + b,
      lastRungHeight: e,
      ladderLength,
      distanceFromGround: e,
      hasPlatform,
      isAtticPassage
    }
  }

  // ============================================
  // KLASYCZNA I Z PODESTEM - oryginalna logika
  // ============================================
  let firstRungOffset = 0

  if (hasPlatform) {
    // Drabina z podestem: pierwszy szczebel 5cm wyżej niż krawędź dachu
    firstRungOffset = LADDER_CONSTANTS.PLATFORM_OFFSET
  }

  const firstRungHeight = wallHeightMm + firstRungOffset

  // Poziom gruntu (lub zawieszenia) - tylko gdy faktycznie zawieszona > 0
  const groundLevel = (suspended && suspendedHeightMm > 0) ? suspendedHeightMm : 0
  const maxLastRungHeight = groundLevel + LADDER_CONSTANTS.MAX_GROUND_DISTANCE
  const minLastRungHeight = groundLevel + LADDER_CONSTANTS.MIN_GROUND_DISTANCE

  let rungCount = 1 // minimum 1 szczebel na górze
  let lastRungHeight = firstRungHeight // pierwszy szczebel

  // Dodawaj szczeble aż ostatni będzie w zakresie 40-330mm od ziemi/zawieszenia
  while (lastRungHeight > maxLastRungHeight) {
    rungCount++
    lastRungHeight = firstRungHeight - (rungCount - 1) * LADDER_CONSTANTS.RUNG_SPACING
  }

  // Sprawdź czy ostatni szczebel nie jest za nisko (poniżej 40mm)
  if (lastRungHeight < minLastRungHeight && rungCount > 1) {
    rungCount--
    lastRungHeight = firstRungHeight - (rungCount - 1) * LADDER_CONSTANTS.RUNG_SPACING
  }

  // Dla drabiny zawieszonej: sprawdź czy można dodać jeszcze jeden szczebel
  if (suspended && suspendedHeightMm > 0) {
    const nextRungHeight = firstRungHeight - rungCount * LADDER_CONSTANTS.RUNG_SPACING
    if (nextRungHeight >= minLastRungHeight) {
      rungCount++
      lastRungHeight = nextRungHeight
    }
  }

  const ladderLength = (rungCount - 1) * LADDER_CONSTANTS.RUNG_SPACING
  const distanceFromGround = lastRungHeight - groundLevel

  return {
    valid: true,
    rungCount,
    ladderRungs: rungCount,  // Dla klasycznej/podestem = rungCount
    firstRungHeight,
    lastRungHeight,
    ladderLength,
    distanceFromGround,
    hasPlatform,
    isAtticPassage
  }
}

/**
 * Oblicz moduły drabiny na podstawie ilości szczebli
 */
function calculateModules(rungCount: number) {
  const modules = {
    startLadder7: 0,
    repeatLadder7: 0,
    endLadder: { count: 0, rungs: 0 },
    handrails: 2,
    handrailConnectors: 2,
    connectionMounts: 0,
    clampMounts: 0,
    brackets: 0
  }

  if (rungCount <= 7) {
    // Tylko drabina końcowa
    modules.endLadder = { count: 1, rungs: rungCount }
    modules.clampMounts = 2
    modules.brackets = 2
  } else {
    // Drabina początkowa X7
    modules.startLadder7 = 1

    const remaining = rungCount - 7
    let repeatCount = Math.floor(remaining / 7)
    let endRungs = remaining % 7

    // Jeśli reszta = 0, ostatnia powielana staje się końcową
    if (endRungs === 0) {
      endRungs = 7
      repeatCount = Math.max(0, repeatCount - 1)
    }

    modules.repeatLadder7 = repeatCount
    modules.endLadder = { count: 1, rungs: endRungs }

    // Uchwyty montażowe i wsporniki
    modules.connectionMounts = 2 + repeatCount
    modules.brackets = 2 + repeatCount

    // Dodatkowe uchwyty dla drabiny końcowej >= 4 szczebli
    if (endRungs >= 4) {
      modules.clampMounts = 1
      modules.brackets += 1
    }
  }

  return modules
}

/**
 * Oblicz obręcze kosza ochronnego
 * Kosz zaczyna się 112.2cm nad górnym szczeblem
 * Ostatnia obręcz musi być między 2.2m a 3m od ZIEMI (bezwzględnie, nie od punktu zawieszenia)
 *
 * Max obręczy na drabinie:
 * - poręcze: +2
 * - każdy moduł x7: +3
 * - końcówka x7-x6: +3, x5-x4: +2, x3-x2: +1
 */
function calculateCageHoops(
  firstRungHeight: number,
  modules: ReturnType<typeof calculateModules>,
  _suspended: boolean = false,
  _suspendedHeightMm: number = 0,
  scheme: string = 'no-platform'
) {
  void _suspended; void _suspendedHeightMm; // Reserved for future use
  // Środek pierwszej obręczy jest 112.2cm nad górnym szczeblem
  const firstHoopHeight = firstRungHeight + LADDER_CONSTANTS.CAGE_START_OFFSET

  // Oblicz maksymalną ilość otworów dostępnych w modułach
  let maxHolesAvailable = LADDER_CONSTANTS.CAGE_HOLES.handrails  // +2 za poręcze

  if (modules.startLadder7 > 0) {
    maxHolesAvailable += LADDER_CONSTANTS.CAGE_HOLES.startLadder  // +3 za pierwszą x7
  }

  // +3 za każdą kolejną x7
  maxHolesAvailable += modules.repeatLadder7 * LADDER_CONSTANTS.CAGE_HOLES.repeatLadder

  if (modules.endLadder.count > 0) {
    const endRungs = modules.endLadder.rungs
    maxHolesAvailable += LADDER_CONSTANTS.CAGE_HOLES.endLadder[endRungs] || 0
  }

  // Dla przełazu attykowego: +3 (dodatkowe otwory w module attyki)
  if (scheme === 'attic-passage') {
    maxHolesAvailable += 3
  }

  // KLUCZOWE: Ostatnia obręcz musi być między 2.2m a 3m od ZIEMI (bezwzględnie)
  // Nie od punktu zawieszenia!
  const minCageHeightFromGround = LADDER_CONSTANTS.CAGE_MIN_HEIGHT  // 2200mm od ziemi

  // Oblicz obręcze idąc w dół od pierwszej
  let hoopCount = 0
  const hoopHeights: number[] = []
  let currentHeight = firstHoopHeight

  // Dodawaj obręcze dopóki:
  // 1. Wysokość obręczy >= 2.2m od ZIEMI (nie od zawieszenia)
  // 2. Nie przekroczyliśmy max dostępnych otworów
  while (currentHeight >= minCageHeightFromGround && hoopCount < maxHolesAvailable) {
    hoopHeights.push(currentHeight)
    hoopCount++
    currentHeight -= LADDER_CONSTANTS.CAGE_HOOP_SPACING
  }

  // Minimum 2 obręcze - jeśli tylko 1, to traktujemy jako 0
  if (hoopCount === 1) {
    hoopCount = 0
  }

  // Oblicz wysokość ostatniej obręczy od ziemi (bezwzględnie)
  const lastHoopHeight = hoopHeights.length > 0 ? hoopHeights[hoopHeights.length - 1] : null
  // Dla zawieszonej: dystans od punktu zawieszenia (groundLevel)
  // Dla normalnej: dystans od ziemi (groundLevel = 0)
  const cageDistanceFromGround = lastHoopHeight !== null ? lastHoopHeight : null

  return {
    count: hoopCount,
    heights: hoopHeights,
    firstHoopHeight,
    lastHoopHeight,
    cageDistanceFromGround,
    maxHolesAvailable
  }
}

/**
 * Główna funkcja obliczeniowa
 */
function calculateLadderStructure() {
  const wallHeightMm = state.value.wallHeight * 1000
  const scheme = state.value.scheme || 'no-platform'
  const suspended = state.value.suspended
  const suspendedHeightMm = state.value.suspendedHeight * 1000
  
  // Dla attyki: oblicz dystans podest-attyka w mm
  const atticPlatformDistanceMm = scheme === 'attic-passage' 
    ? actualPlatformDistance.value * 10  // cm -> mm
    : 0

  // 1. Oblicz szczeble
  const rungs = calculateRungs(wallHeightMm, scheme, suspended, suspendedHeightMm, atticPlatformDistanceMm)

  // 2. Oblicz moduły (używaj ladderRungs dla generowania modeli)
  const modules = calculateModules(rungs.ladderRungs)

  // 3. Oblicz kosz
  const cage = calculateCageHoops(rungs.firstRungHeight, modules, suspended, suspendedHeightMm, scheme)

  // 4. Oblicz numX7 i finalRungs
  const numX7 = modules.startLadder7 + modules.repeatLadder7
  const finalRungs = modules.endLadder.rungs

  return {
    numX7,
    finalRungs,
    totalRungs: rungs.rungCount,
    cageHoops: cage.count,
    maxCageHoops: cage.maxHolesAvailable,
    ladderLength: rungs.ladderLength,
    firstRungHeight: rungs.firstRungHeight,
    lastRungHeight: rungs.lastRungHeight,
    distanceFromGround: rungs.distanceFromGround,
    cageDistanceFromGround: cage.cageDistanceFromGround
  }
}

// ============================================
// LIFECYCLE I WATCHERS
// ============================================

// Aktualizuj stan 3D przy zmianach konfiguracji
watch(
  () => [
    state.value.wallHeight,
    state.value.cage,
    state.value.scheme,
    state.value.bracketSpacing,
    state.value.suspended,
    state.value.suspendedHeight,
    state.value.cageClosing,
    state.value.restingPlatform,
    state.value.insulationThickness,
    state.value.atticInsulationThickness,
    state.value.atticBackInsulationThickness,
    state.value.atticWallHeight
  ],
  () => {
    updateThreeState()
  }
)

// Pobierz dane z API przy przejściu do podsumowania
watch(
  () => currentScreen.value,
  (newScreen) => {
    if (newScreen === 'summary') {
      fetchCalculation()
    }
  }
)

// Auto-korekta wysokości bloczków gdy min się zmienia lub wartość przekracza max
watch(customBaseHeightMin, (newMin) => {
  if (state.value.descentMountType === 'custom-base') {
    if (state.value.customBaseHeight < newMin) {
      state.value.customBaseHeight = Math.ceil(newMin * 2) / 2  // Zaokrąglij do 0.5
    }
    if (state.value.customBaseHeight > 40) {
      state.value.customBaseHeight = 40
    }
  }
})

// ============================================
// WALIDACJA WYSOKOŚCI
// ============================================
function validateWallHeight() {
  wallHeightTouched.value = true
  const h = state.value.wallHeight
  if (h < 0.6) {
    wallHeightWarning.value = 'Minimalna wysokość to 0.6m'
  } else if (h > 30) {
    wallHeightWarning.value = 'Maksymalna wysokość to 30m'
  } else {
    wallHeightWarning.value = ''
  }
}

// ============================================
// OBSŁUGA WSPORNIKÓW
// ============================================
function onBracketChange() {
  const type = state.value.bracketType

  // Ustaw flagę ręcznego wyboru jeśli użytkownik wybrał 'none' lub 'custom'
  if (type === 'none' || type === 'custom') {
    bracketTypeManualOverride.value = true
  } else {
    // Użytkownik wybrał standardowy typ - resetuj flagę
    bracketTypeManualOverride.value = false
  }

  let distance = 215
  switch (type) {
    case 'short':
      distance = 215
      break
    case 'medium':
      distance = 315
      break
    case 'long':
      distance = 415
      break
    case 'none':
    case 'custom':
      distance = 0
      break
  }
  state.value.bracketSpacing = distance

  // Sync with global slider and 3D
  if (distance > 0) {
    globalWspornikDistance.value = distance
    threeCanvasRef.value?.setGlobalWspornikDistance(distance, 1)
  }
  updateThreeState()
}

// ============================================
// OBSŁUGA DRABINY ZAWIESZONEJ
// ============================================
function toggleSuspended() {
  if (!state.value.suspended) {
    state.value.suspendedHeight = 0
    state.value.portableLadder = false
  }
}

// Reset dostawianej drabiny gdy zawieszenie > 2m
watch(
  () => state.value.suspendedHeight,
  (newHeight) => {
    if (newHeight > 2) {
      state.value.portableLadder = false
    }
  }
)

// Maksymalna wysokość zawieszenia
const maxSuspendedHeight = computed(() => {
  return Math.max(0, state.value.wallHeight - 1)
})

// ============================================
// OBSŁUGA PRZESZKÓD
// ============================================
let obstacleIdCounter = 0
const obstacleAboveWallWarning = ref('')
let obstacleWarningTimeout: ReturnType<typeof setTimeout> | null = null

// Walidacja przeszkód - sprawdź czy nie przekracza wysokości ściany
function validateObstacleHeight(obstacle: { heightFrom: number; height: number }) {
  // Tylko dla przejścia przez attykę - sprawdź względem ściany wejścia
  if (state.value.scheme !== 'attic-passage') return

  const wallHeight = state.value.wallHeight || 0  // wysokość ściany wejścia w metrach
  const obstacleTop = obstacle.heightFrom + obstacle.height

  if (obstacleTop > wallHeight) {
    // Pokaż ostrzeżenie
    obstacleAboveWallWarning.value = 'Przeszkoda znajduje się ponad ścianą'

    // Ogranicz wartości - najpierw spróbuj zmniejszyć height
    const maxHeight = wallHeight - obstacle.heightFrom
    if (maxHeight > 0) {
      obstacle.height = Math.round(maxHeight * 10) / 10  // zaokrąglij do 0.1
    } else {
      // Jeśli heightFrom jest za duże, zmniejsz je
      obstacle.heightFrom = Math.max(0, Math.round((wallHeight - obstacle.height) * 10) / 10)
      if (obstacle.heightFrom + obstacle.height > wallHeight) {
        obstacle.height = Math.round((wallHeight - obstacle.heightFrom) * 10) / 10
      }
    }

    // Wyczyść poprzedni timeout
    if (obstacleWarningTimeout) {
      clearTimeout(obstacleWarningTimeout)
    }

    // Ukryj po 10 sekundach
    obstacleWarningTimeout = setTimeout(() => {
      obstacleAboveWallWarning.value = ''
    }, 10000)
  }
}

// Watch dla zmian w przeszkodach
watch(() => state.value.obstacles, (obstacles) => {
  for (const obs of obstacles) {
    validateObstacleHeight(obs)
  }
}, { deep: true })

function addObstacle() {
  state.value.obstacles.push({
    id: ++obstacleIdCounter,
    heightFrom: 0,  // wysokość od ziemi do dołu przeszkody (m)
    height: 1,       // wysokość przeszkody (m)
    type: 'window',  // 'window' | 'wall-point' | 'recess' | 'groove' | 'other'
    description: ''
  })
}

function addWallPoint() {
  state.value.obstacles.push({
    id: ++obstacleIdCounter,
    heightFrom: 0,
    height: 1,
    type: 'wall-point',  // Punkt na ścianie - nie usuwa uchwytów
    description: ''
  })
}

function removeObstacle(id: number) {
  state.value.obstacles = state.value.obstacles.filter(o => o.id !== id)
}

function toggleEave() {
  state.value.hasEave = !state.value.hasEave
  if (state.value.hasEave) {
    // Ustaw domyślne wartości (cm)
    state.value.eaveHeight = 20
    state.value.eaveDepth = 15
  }
}

// ============================================
// WYWOŁANIE API
// ============================================
async function fetchCalculation() {
  apiLoading.value = true
  apiError.value = ''

  // Map scheme value
  let scheme: 'no-platform' | 'with-platform' | 'attic-passage' = 'no-platform'
  if (state.value.scheme === 'with-platform') scheme = 'with-platform'
  else if (state.value.scheme === 'attic-passage') scheme = 'attic-passage'

  // Map bracket type
  let bracketType: 'short' | 'medium' | 'long' = 'short'
  if (state.value.bracketType === 'medium') bracketType = 'medium'
  else if (state.value.bracketType === 'long') bracketType = 'long'

  const request = {
    wallHeight: state.value.wallHeight,
    scheme,
    cage: (state.value.cage || 'no-cage') as 'no-cage' | 'with-cage' | 'full-cage',
    bracketType,
    bracketSpacing: state.value.bracketSpacing,
    purpose: (state.value.purpose || 'external') as 'external' | 'internal',
    insulationThickness: state.value.insulationThickness || 0,
    suspended: state.value.suspended,
    suspendedHeight: state.value.suspendedHeight,
    hasObstacles: state.value.hasObstacles,
    obstacles: state.value.obstacles.map(obs => ({
      id: obs.id,
      type: obs.type,
      bottomHeightMm: obs.heightFrom * 1000,
      heightMm: obs.height * 1000
    }))
  }

  try {
    // Najpierw spróbuj API
    const response = await calculateLadder(request)

    if (response.valid && response.components) {
      componentsList.value = response.components
      const p = response.pricing
      const totalDiscount = (p?.producerDiscountsTotal || 0) + (p?.sellerDiscountsTotal || 0)
      pricing.value = {
        subtotal: p?.baseProductPrice || response.totalPrice || 0,
        discount: totalDiscount,
        discountPercent: p?.subtotal ? (totalDiscount / p.subtotal * 100) : 0,
        total: p?.finalPrice || response.totalPrice || 0,
        totalWithVat: p?.finalPriceWithVat || (response.totalPrice || 0) * 1.23,
        vatRate: 23
      }
    } else {
      // Fallback do lokalnych obliczeń
      const localResult = calculateLocal(request)
      if (localResult.valid && localResult.components) {
        componentsList.value = localResult.components
      }
    }
  } catch (error) {
    console.warn('API error, using local calculation:', error)
    // Fallback do lokalnych obliczeń
    const localResult = calculateLocal(request)
    if (localResult.valid && localResult.components) {
      componentsList.value = localResult.components
    }
  } finally {
    apiLoading.value = false
  }
}

// ============================================
// AKCJE
// ============================================
const isSaving = ref(false)
const savedReference = ref<{ referenceNumber: string; accessCode: string; derivedFrom?: string; version?: number } | null>(null)
const customerEmail = ref('')
const emailError = ref('')

// Załadowana oferta z URL
const loadedOffer = ref<LoadedConfiguration | null>(null)
const isLoadingOffer = ref(false)
const loadOfferError = ref('')

// Lista drabin w ofercie
interface LadderInOffer {
  id: number
  wallHeight: number
  scheme: string
  cage: string
  bracketType: string
  quantity: number
  estimatedPrice: number
  bomItems: Array<{ id: string; name: string; quantity: number }>
}
const laddersInOffer = ref<LadderInOffer[]>([])
let nextLadderId = 1

/**
 * Sprawdź URL i załaduj ofertę jeśli są parametry ref i code
 */
async function checkUrlAndLoadOffer() {
  const urlParams = new URLSearchParams(window.location.search)
  const ref = urlParams.get('ref')
  const code = urlParams.get('code')

  if (!ref || !code) return

  isLoadingOffer.value = true
  loadOfferError.value = ''

  try {
    const result = await getConfigurationByRef(ref, code)

    if (!result.success || !result.data) {
      loadOfferError.value = result.error || 'Nie znaleziono oferty'
      return
    }

    loadedOffer.value = result.data
    customerEmail.value = result.data.customer_email || ''

    // Załaduj konfigurację do formularza
    const config = result.data.config_json
    if (config && config.ladders && config.ladders.length > 0) {
      // Załaduj wszystkie drabiny oprócz ostatniej do listy
      laddersInOffer.value = []
      for (let i = 0; i < config.ladders.length - 1; i++) {
        const l = config.ladders[i]
        laddersInOffer.value.push({
          id: nextLadderId++,
          wallHeight: l.wallHeight || l.height || 5,
          scheme: l.scheme || 'no-platform',
          cage: l.hasCage || l.cage === 'with-cage' ? 'with-cage' : 'no-cage',
          bracketType: l.bracketType || 'short',
          quantity: l.quantity || 1,
          estimatedPrice: l.price || 0,
          bomItems: []
        })
      }

      // Ostatnia drabina jest "aktualna" w formularzu
      const ladder = config.ladders[config.ladders.length - 1]

      // Ustaw parametry z zapisanej konfiguracji
      state.value.wallHeight = ladder.wallHeight || ladder.height || 5
      state.value.purpose = 'external'

      // Schemat
      if (ladder.scheme === 'with-platform') {
        state.value.scheme = 'with-platform'
      } else if (ladder.scheme === 'attic-passage') {
        state.value.scheme = 'attic-passage'
      } else {
        state.value.scheme = 'no-platform'
      }

      // Kosz
      if (ladder.hasCage || ladder.cage === 'with-cage') {
        state.value.cage = 'with-cage'
      } else {
        state.value.cage = 'no-cage'
      }

      // Wspornik
      if (ladder.bracketType) {
        state.value.bracketType = ladder.bracketType as 'short' | 'medium' | 'long'
      }

      // Izolacja
      if (ladder.insulationThickness) {
        state.value.insulationThickness = ladder.insulationThickness
      }

      console.log('[App] Załadowano ofertę:', result.data.reference_number, 'z', config.ladders.length, 'drabinami')
    }

    // Przejdź do ekranu parametrów
    currentScreen.value = 'params'

  } catch (error) {
    console.error('[App] Błąd ładowania oferty:', error)
    loadOfferError.value = 'Błąd ładowania oferty'
  } finally {
    isLoadingOffer.value = false
  }
}

function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString('pl-PL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  })
}

function getOfferLink(): string {
  if (!savedReference.value) return ''
  const baseUrl = window.location.origin + window.location.pathname
  return `${baseUrl}?ref=${savedReference.value.referenceNumber}&code=${savedReference.value.accessCode}`
}

function getVersionLink(referenceNumber: string): string {
  // Dla wersji używamy tego samego kodu dostępu co aktualna oferta
  const code = loadedOffer.value?.access_code || ''
  const baseUrl = window.location.origin + window.location.pathname
  return `${baseUrl}?ref=${referenceNumber}&code=${code}`
}

/**
 * Dodaj aktualną konfigurację do listy drabin w ofercie
 */
function addLadderToOffer() {
  const ladder: LadderInOffer = {
    id: nextLadderId++,
    wallHeight: state.value.wallHeight,
    scheme: state.value.scheme,
    cage: state.value.cage,
    bracketType: state.value.bracketType,
    quantity: 1,
    estimatedPrice: 0, // TODO: calculate
    bomItems: cachedBOMData.value?.ladder1?.items?.map(i => ({
      id: i.id,
      name: i.name,
      quantity: i.quantity
    })) || []
  }
  laddersInOffer.value.push(ladder)
}

/**
 * Usuń drabinę z listy
 */
function removeLadderFromOffer(id: number) {
  laddersInOffer.value = laddersInOffer.value.filter(l => l.id !== id)
}

/**
 * Zmień ilość drabiny
 */
function updateLadderQuantity(id: number, quantity: number) {
  const ladder = laddersInOffer.value.find(l => l.id === id)
  if (ladder && quantity >= 1 && quantity <= 99) {
    ladder.quantity = quantity
  }
}

/**
 * Pobierz label schematu
 */
function getSchemeLabel(scheme: string): string {
  switch (scheme) {
    case 'no-platform': return 'Bez podestu'
    case 'with-platform': return 'Z podestem'
    case 'attic-passage': return 'Przejscie przez attyke'
    default: return scheme
  }
}

async function generateOffer() {
  if (isSaving.value) return

  // Wymagaj emaila do wygenerowania oferty
  emailError.value = ''
  if (!customerEmail.value.trim()) {
    emailError.value = 'Podaj adres email aby wygenerować ofertę'
    return
  }
  if (!validateEmail(customerEmail.value.trim())) {
    emailError.value = 'Podaj poprawny adres email'
    return
  }

  isSaving.value = true

  try {
    // Przygotuj aktualną drabinę
    let scheme: 'no-platform' | 'with-platform' | 'attic-passage' = 'no-platform'
    if (state.value.scheme === 'with-platform') scheme = 'with-platform'
    else if (state.value.scheme === 'attic-passage') scheme = 'attic-passage'

    let bracketType: 'short' | 'medium' | 'long' = 'short'
    if (state.value.bracketType === 'medium') bracketType = 'medium'
    else if (state.value.bracketType === 'long') bracketType = 'long'

    // Zbierz wszystkie drabiny do zapisu w formacie API
    const allLadders: Array<{
      config: {
        wallHeight: number
        scheme: 'no-platform' | 'with-platform' | 'attic-passage'
        purpose: 'external' | 'internal'
        cage: 'no-cage' | 'with-cage' | 'full-cage'
        bracketType: 'short' | 'medium' | 'long'
        bracketSpacing: number
        insulationThickness: number
        suspended: boolean
        suspendedHeight: number
        hasObstacles: boolean
        obstacles: Array<{ id: number; type: string; bottomHeightMm: number; heightMm: number }>
      }
      quantity: number
    }> = []

    // Dodaj drabiny z listy
    for (const ladder of laddersInOffer.value) {
      let ladderScheme: 'no-platform' | 'with-platform' | 'attic-passage' = 'no-platform'
      if (ladder.scheme === 'with-platform') ladderScheme = 'with-platform'
      else if (ladder.scheme === 'attic-passage') ladderScheme = 'attic-passage'

      let ladderBracket: 'short' | 'medium' | 'long' = 'short'
      if (ladder.bracketType === 'medium') ladderBracket = 'medium'
      else if (ladder.bracketType === 'long') ladderBracket = 'long'

      allLadders.push({
        config: {
          wallHeight: ladder.wallHeight,
          scheme: ladderScheme,
          purpose: 'external',
          cage: ladder.cage === 'with-cage' ? 'with-cage' : 'no-cage',
          bracketType: ladderBracket,
          bracketSpacing: 1000,
          insulationThickness: 0,
          suspended: false,
          suspendedHeight: 0,
          hasObstacles: false,
          obstacles: []
        },
        quantity: ladder.quantity
      })
    }

    // Dodaj aktualną drabinę
    allLadders.push({
      config: {
        wallHeight: state.value.wallHeight,
        scheme,
        purpose: (state.value.purpose || 'external') as 'external' | 'internal',
        cage: (state.value.cage || 'no-cage') as 'no-cage' | 'with-cage' | 'full-cage',
        bracketType,
        bracketSpacing: state.value.bracketSpacing || 1000,
        insulationThickness: state.value.insulationThickness || 0,
        suspended: state.value.suspended,
        suspendedHeight: state.value.suspendedHeight || 0,
        hasObstacles: state.value.hasObstacles,
        obstacles: state.value.obstacles.map(obs => ({
          id: obs.id,
          type: obs.type,
          bottomHeightMm: obs.heightFrom * 1000,
          heightMm: obs.height * 1000
        }))
      },
      quantity: 1
    })

    const response = await saveConfiguration({
      config: { ladders: allLadders },
      customerEmail: customerEmail.value.trim(),
      parentId: loadedOffer.value?.id  // Dla wersjonowania - link do oryginalnej oferty
    })

    if (response.success && response.data) {
      savedReference.value = {
        referenceNumber: response.data.reference_number,
        accessCode: response.data.access_code,
        derivedFrom: loadedOffer.value?.reference_number,
        version: response.data.version
      }
      // Wyczyść listę drabin i załadowaną ofertę - teraz mamy nową
      laddersInOffer.value = []
      loadedOffer.value = null
    } else {
      emailError.value = 'Błąd zapisu: ' + (response.error || 'Nieznany błąd')
    }
  } catch (error) {
    console.error('Błąd zapisu konfiguracji:', error)
    emailError.value = 'Błąd zapisu konfiguracji'
  } finally {
    isSaving.value = false
  }
}

function addToCart() {
  // Zapisz do bazy i dodaj do koszyka
  generateOffer()
}

/**
 * Go to summary screen and cache BOM data
 */
function goToSummary() {
  // Cache BOM data before leaving params screen (where ThreeCanvas is mounted)
  console.log('goToSummary called, threeCanvasRef.value:', !!threeCanvasRef.value)
  if (threeCanvasRef.value) {
    const bomData = threeCanvasRef.value.generateBOM() as BOMData
    console.log('BOM data generated:', bomData)
    console.log('Ladder1 items count:', bomData.ladder1.items.length)

    // Fill in configuration data from state
    bomData.ladder1.config.wallHeight = state.value.wallHeight
    bomData.ladder1.config.scheme = state.value.scheme
    bomData.ladder1.config.cage = state.value.cage === 'with-cage'
      ? `${threeState.value.safetyCageCount} obreczy`
      : 'brak'
    bomData.ladder1.config.insulationThickness = state.value.insulationThickness || 0

    // If attic passage, fill descent side config
    if (state.value.scheme === 'attic-passage' && bomData.ladder2) {
      bomData.ladder2.config.wallHeight = state.value.atticWallHeight || 0
      bomData.ladder2.config.mountType = state.value.descentMountType
      bomData.ladder2.config.insulationThickness = state.value.atticBackHasInsulation
        ? (state.value.atticBackInsulationThickness || 0)
        : 0
      bomData.ladder2.config.minDistance = state.value.atticMinDistance || 0
    }

    cachedBOMData.value = bomData
  }

  currentScreen.value = 'summary'
}

/**
 * Export Bill of Materials to PDF
 */
async function exportBOMToPdf() {
  // Use cached data if available, otherwise try to get from scene
  let bomData: BOMData | null = cachedBOMData.value

  if (!bomData && threeCanvasRef.value) {
    bomData = threeCanvasRef.value.generateBOM() as BOMData

    // Fill in configuration data from state
    bomData.ladder1.config.wallHeight = state.value.wallHeight
    bomData.ladder1.config.scheme = state.value.scheme
    bomData.ladder1.config.cage = state.value.cage === 'with-cage'
      ? `${threeState.value.safetyCageCount} obreczy`
      : 'brak'
    bomData.ladder1.config.insulationThickness = state.value.insulationThickness || 0

    // If attic passage, fill descent side config
    if (state.value.scheme === 'attic-passage' && bomData.ladder2) {
      bomData.ladder2.config.wallHeight = state.value.atticWallHeight || 0
      bomData.ladder2.config.mountType = state.value.descentMountType
      bomData.ladder2.config.insulationThickness = state.value.atticBackHasInsulation
        ? (state.value.atticBackInsulationThickness || 0)
        : 0
      bomData.ladder2.config.minDistance = state.value.atticMinDistance || 0
    }
  }

  if (!bomData) {
    alert('Nie mozna wygenerowac PDF - brak danych')
    return
  }

  // Generate PDF (async)
  await generateBOMPdf(bomData, {
    projectName: `Drabina ${state.value.wallHeight}m - ${translateScheme(state.value.scheme)}`
  })
}

function translateScheme(scheme: string): string {
  const translations: Record<string, string> = {
    'no-platform': 'z poreczami',
    'with-platform': 'z podestem',
    'attic-passage': 'przejscie przez attyke',
    'none': 'bez zakonczen'
  }
  return translations[scheme] || scheme
}

function addAnotherLadder() {
  // Najpierw dodaj aktualną drabinę do listy
  addLadderToOffer()

  // Reset konfiguracji i powrót do pierwszego ekranu
  state.value.purpose = ''
  state.value.scheme = ''
  state.value.cage = ''
  state.value.wallHeight = 5
  state.value.bracketType = 'short'
  state.value.accessLock = false
  state.value.suspended = false
  state.value.suspendedHeight = 0
  state.value.hasObstacles = false
  state.value.obstacles = []
  cachedBOMData.value = null
  currentScreen.value = 'purpose'
}

// ============================================
// KONTROLKI 3D
// ============================================
const show3DWall = ref(true)
const show3DGround = ref(true)
const show3DInsulation = ref(false)  // Domyślnie wyłączone
const warningDismissed = ref(false)  // Czy użytkownik zamknął popup ostrzeżenia
const autoSwitchMessage = ref<string | null>(null)  // Komunikat o automatycznym przełączeniu na przełaz
const threeCanvasRef = ref<InstanceType<typeof ThreeCanvas> | null>(null)
const cachedBOMData = ref<BOMData | null>(null)  // Cache dla danych BOM przed przejściem na summary

// Computed: połączone elementy BOM z obu drabin (dla przejścia przez attykę)
const allBomItems = computed(() => {
  if (!cachedBOMData.value) return []

  // Deep copy aby nie modyfikować oryginału
  const items = cachedBOMData.value.ladder1.items.map(item => ({ ...item }))

  // Dodaj elementy z drugiej drabiny (jeśli istnieje - przejście przez attykę)
  if (cachedBOMData.value.ladder2) {
    for (const item2 of cachedBOMData.value.ladder2.items) {
      // Szukaj czy element już istnieje (po name, nie id)
      const existing = items.find(i => i.name === item2.name)
      if (existing) {
        // Dodaj ilość
        existing.quantity += item2.quantity
      } else {
        // Dodaj nowy element
        items.push({ ...item2 })
      }
    }
  }

  return items
})

// Tool modes
const measureModeActive = ref(false)
const measureAxisMode = ref<'3d' | 'x' | 'y' | 'z'>('3d')
const measureResult = ref<{ distanceMm: number; axisMode: string } | null>(null)
const techDrawingActive = ref(false)
const techDrawingView = ref('front')

// Edit mode state (sciskane mode - handled by ThreeCanvas)
const sciskaneModeActive = ref(false)

// Sciskane handle edit panel state
const sciskaneEditPanelActive = ref(false)
const sciskaneEditData = ref<{
  offsetFromBottom: number
  ladderNum: number
  connType: string
  wspornikType: string
  wspornikDistance: number
  isMidRung?: boolean  // True for mid-rung bracket (auto-added between rungs 2-3)
  isJointConnector?: boolean  // True for joint connector (at section joints)
  pairIndex?: number  // For joint connectors
} | null>(null)

// Zakresy odległości dla typów wsporników
const wspornikDistanceRanges: Record<string, { min: number; max: number }> = {
  krotki: { min: 160, max: 260 },
  sredni: { min: 260, max: 360 },
  dlugi: { min: 360, max: 460 }
}

// Computed property dla aktualnego zakresu suwaka
const currentWspornikRange = computed(() => {
  if (!sciskaneEditData.value) return { min: 160, max: 260 }
  const type = sciskaneEditData.value.wspornikType || 'krotki'
  return wspornikDistanceRanges[type] || wspornikDistanceRanges['krotki']
})

// Global settings for all brackets (editable in sciskane mode)
const globalWspornikDistance = ref(215)

// Computed type based on distance
const globalWspornikType = computed(() => {
  const d = globalWspornikDistance.value
  if (d <= 260) return 'krótki'
  if (d <= 360) return 'średni'
  return 'długi'
})

function setGlobalWspornikDistanceValue(distance: number) {
  globalWspornikDistance.value = distance
  state.value.bracketSpacing = distance
  threeCanvasRef.value?.setGlobalWspornikDistance(distance, 1)

  // Auto-update bracket type in dropdown
  if (distance <= 260) {
    state.value.bracketType = 'short'
  } else if (distance <= 360) {
    state.value.bracketType = 'medium'
  } else {
    state.value.bracketType = 'long'
  }
}

// ============================================
// AUTOMATYCZNE DOSTOSOWANIE WSPORNIKÓW DO OKAPU
// ============================================
// Wymagana długość wspornika dla okapu (cm) - drabina 15cm od okapu
const requiredCustomBracketLength = computed(() => {
  let maxCm = 0
  if (state.value.hasEave) {
    maxCm = Math.max(maxCm, state.value.eaveDepth + 15)
  }
  if (state.value.scheme === 'attic-passage') {
    // Dla attyki używaj atticInsulationThickness
    if (state.value.atticHasInsulation && state.value.atticInsulationThickness > 0) {
      maxCm = Math.max(maxCm, state.value.atticInsulationThickness + 15)
    }
  } else {
    // Dla klasycznej/z podestem używaj insulationThickness
    if (state.value.hasInsulation && state.value.insulationThickness > 0) {
      maxCm = Math.max(maxCm, state.value.insulationThickness + 15)
    }
  }
  return maxCm
})

// Uniwersalna funkcja aktualizacji odległości wsporników (bierze MAX z okapu i ocieplenia)
function updateWspornikDistanceForObstacles() {
  // Jeśli użytkownik ręcznie wybrał 'none' lub 'custom' - nie nadpisuj
  if (bracketTypeManualOverride.value) return

  // Oblicz wymaganą odległość dla okapu (cm)
  let eaveRequiredCm = 0
  if (state.value.hasEave && state.value.eaveDepth > 0) {
    eaveRequiredCm = state.value.eaveDepth + 15
  }

  // Oblicz wymaganą odległość dla ocieplenia (cm)
  let insulationRequiredCm = 0
  if (state.value.scheme === 'attic-passage') {
    // Dla attyki używaj atticInsulationThickness (strona wejścia)
    if (state.value.atticHasInsulation && state.value.atticInsulationThickness > 0) {
      insulationRequiredCm = state.value.atticInsulationThickness + 15
    }
  } else {
    // Dla klasycznej/z podestem używaj insulationThickness
    if (state.value.hasInsulation && state.value.insulationThickness > 0) {
      insulationRequiredCm = state.value.insulationThickness + 15
    }
  }

  // Weź MAX z obu
  const requiredCm = Math.max(eaveRequiredCm, insulationRequiredCm)

  // Jeśli nic nie wymaga odsunięcia - nie ruszaj (zostaw obecne ustawienia)
  if (requiredCm === 0) return

  const minDistanceMm = requiredCm * 10

  // Jeśli za daleko dla standardowych wsporników (>46cm = >460mm)
  if (minDistanceMm > 460) {
    state.value.bracketType = 'custom'
    state.value.bracketSpacing = minDistanceMm
    globalWspornikDistance.value = minDistanceMm
    threeCanvasRef.value?.setGlobalWspornikDistance(minDistanceMm, 1)
  } else {
    setGlobalWspornikDistanceValue(minDistanceMm)
  }
}

// Watcher dla okapu i ocieplenia (bierze MAX)
watch(
  () => [
    state.value.hasEave,
    state.value.eaveDepth,
    state.value.hasInsulation,
    state.value.insulationThickness,
    state.value.atticHasInsulation,
    state.value.atticInsulationThickness,
    state.value.scheme
  ],
  () => {
    updateWspornikDistanceForObstacles()
  }
)

// Funkcja pomocnicza: wybór typu wspornika na podstawie grubości ocieplenia
// do 10cm → krótkie, do 20cm → średnie, do 30cm → długie
function getBracketTypeForInsulation(insulationCm: number): 'short' | 'medium' | 'long' | 'custom' {
  if (insulationCm <= 10) return 'short'
  if (insulationCm <= 20) return 'medium'
  if (insulationCm <= 30) return 'long'
  return 'custom'
}

// Aktualizacja wsporników dla ocieplenia attyki
function updateWspornikDistanceForAtticInsulation() {
  if (state.value.scheme !== 'attic-passage') return
  if (!state.value.atticHasInsulation) return

  // Jeśli użytkownik ręcznie wybrał 'none' lub 'custom' - nie nadpisuj
  if (bracketTypeManualOverride.value) return

  const insulationCm = state.value.atticInsulationThickness || 0

  // Ustaw typ wspornika na podstawie grubości ocieplenia
  const newBracketType = getBracketTypeForInsulation(insulationCm)

  // Odległość wsporników = grubość ocieplenia + 15cm
  const distanceMm = (insulationCm + 15) * 10

  // Jeśli ocieplenie za grube dla standardowych wsporników (>30cm → >460mm)
  if (newBracketType === 'custom') {
    state.value.bracketType = 'custom'
  } else {
    state.value.bracketType = newBracketType
  }

  state.value.bracketSpacing = distanceMm
  globalWspornikDistance.value = distanceMm
  threeCanvasRef.value?.setGlobalWspornikDistance(distanceMm, 1)
}

// Watcher dla zmian ocieplenia attyki
watch(
  () => [state.value.scheme, state.value.atticHasInsulation, state.value.atticInsulationThickness],
  () => {
    updateWspornikDistanceForAtticInsulation()
  }
)


// ============================================
// AUTOMATYCZNE DOSTOSOWANIE WSPORNIKÓW DLA PRZEJŚCIA PRZEZ ATTYKĘ
// ============================================
// Zakres wsporników: 160-460mm (16-46cm) dla obu stron
// Walidacja: 1012 - (wejście + ściana + ocieplenie_zejścia) >= 160mm
// Finalny wynik: 1012 - (wejście + ściana) - mierzony od ściany
function updateAtticPassageBrackets() {
  if (state.value.scheme !== 'attic-passage') return
  if (state.value.descentMountType !== 'brackets') return

  console.log('[updateAtticPassageBrackets] called')

  // Stałe zakresu wsporników
  const MIN_BRACKET_DISTANCE = 160  // 16cm
  const MAX_BRACKET_DISTANCE = 460  // 46cm

  // 1. Oblicz minimalną odległość wejścia na podstawie ocieplenia wejścia
  const entryInsulationCm = state.value.atticHasInsulation
    ? (state.value.atticInsulationThickness || 0)
    : 0
  // Minimum = większe z: 160mm lub (ocieplenie + 15cm)
  const minEntryFromInsulation = (entryInsulationCm + 15) * 10
  const minEntryDistanceMm = Math.max(MIN_BRACKET_DISTANCE, minEntryFromInsulation)

  // 2. Ustaw typ wspornika wejścia na podstawie ocieplenia
  const entryBracketType = getBracketTypeForInsulation(entryInsulationCm)

  // Zacznij od minimalnej odległości wejścia
  let entryDistanceMm = minEntryDistanceMm

  // 3. Parametry
  const wallThicknessMm = (state.value.atticWallThickness || 25) * 10
  const descentInsulationMm = state.value.atticBackHasInsulation
    ? (state.value.atticBackInsulationThickness || 0) * 10
    : 0

  // 4. Walidacja: prześwit od ocieplenia >= 160mm (min dla wsporników)
  const clearanceFromInsulation = CONNECTOR_DISTANCE_MM - (entryDistanceMm + wallThicknessMm + descentInsulationMm)

  console.log('[updateAtticPassageBrackets] clearance check:', {
    entryDistanceMm,
    wallThicknessMm,
    descentInsulationMm,
    clearanceFromInsulation
  })

  if (clearanceFromInsulation < MIN_BRACKET_DISTANCE) {
    console.log('[updateAtticPassageBrackets] clearance < 160, cannot offer this ladder')
    // Nie możemy zaoferować - warning pokaże się z computed
  }

  // 5. Oblicz finalną odległość zejścia (od ściany, bez ocieplenia)
  let finalDescentMm = CONNECTOR_DISTANCE_MM - (entryDistanceMm + wallThicknessMm)

  console.log('[updateAtticPassageBrackets] initial finalDescent:', finalDescentMm)

  // 6. Jeśli finalDescent > 460mm, zwiększ wejście żeby zejście = 460mm
  if (finalDescentMm > MAX_BRACKET_DISTANCE) {
    // 460 = 1012 - (entry + wall)
    // entry = 1012 - 460 - wall
    const requiredEntryMm = CONNECTOR_DISTANCE_MM - MAX_BRACKET_DISTANCE - wallThicknessMm

    console.log('[updateAtticPassageBrackets] finalDescent > 460, trying to adjust entry:', {
      requiredEntryMm,
      minEntryDistanceMm
    })

    // Sprawdź czy możemy zwiększyć wejście (w zakresie 160-460)
    if (requiredEntryMm >= minEntryDistanceMm && requiredEntryMm <= MAX_BRACKET_DISTANCE) {
      entryDistanceMm = requiredEntryMm
      finalDescentMm = MAX_BRACKET_DISTANCE
    } else {
      // Nie możemy skorygować - ustaw na 460mm i pokaż warning
      console.log('[updateAtticPassageBrackets] cannot adjust entry, setting descent to 460 anyway')
      finalDescentMm = MAX_BRACKET_DISTANCE
      // Warning pokaże się z computed
    }
  }

  // 7. Jeśli finalDescent < 160mm - nie możemy zaoferować (warning z computed)
  if (finalDescentMm < MIN_BRACKET_DISTANCE) {
    console.log('[updateAtticPassageBrackets] finalDescent < 160, cannot offer this ladder')
    finalDescentMm = MIN_BRACKET_DISTANCE // Ustaw minimum dla wizualizacji
  }

  // 8. Określ typy wsporników na podstawie FINALNEJ odległości
  const descentBracketType = getBracketTypeFromDistance(finalDescentMm)
  const actualEntryBracketType = getBracketTypeFromDistance(entryDistanceMm)

  console.log('[updateAtticPassageBrackets] final:', {
    entryDistanceMm,
    actualEntryBracketType,
    finalDescentMm,
    descentBracketType
  })

  // 9. Ustaw wartości
  // Wejście
  if (!bracketTypeManualOverride.value) {
    state.value.bracketType = actualEntryBracketType !== 'custom' ? actualEntryBracketType : entryBracketType
    state.value.bracketSpacing = entryDistanceMm
    globalWspornikDistance.value = entryDistanceMm
    threeCanvasRef.value?.setGlobalWspornikDistance(entryDistanceMm, 1)
  }

  // Zejście - finalDistance mierzony od ściany
  state.value.descentBracketType = descentBracketType !== 'custom' ? descentBracketType : 'long'
  state.value.descentBracketSpacing = finalDescentMm
  threeCanvasRef.value?.setGlobalWspornikDistance(finalDescentMm, 2)
}

// Watcher dla zmian parametrów przejścia przez attykę (wsporniki)
watch(
  () => [
    state.value.scheme,
    state.value.descentMountType,
    state.value.atticWallThickness,
    state.value.atticHasInsulation,
    state.value.atticInsulationThickness,
    state.value.atticBackHasInsulation,
    state.value.atticBackInsulationThickness
  ],
  () => {
    updateAtticPassageBrackets()
  }
)

// ============================================
// AUTOMATYCZNE PRZEŁĄCZANIE TYPU MONTAŻU (na podstawie wysokości ściany)
// ============================================
function autoSwitchMountTypeByWallHeight() {
  if (state.value.scheme !== 'attic-passage') return

  const currentMount = state.value.descentMountType
  const wallHeight = state.value.atticWallHeight || 0
  const minDistanceCm = state.value.atticMinDistance || 0

  // Oblicz max wysokość dla bigfoot
  const bigfootMax = Math.max(0, 1.465 - (minDistanceCm / 100))

  // Bigfoot/custom-base: jeśli wysokość ściany > max → przełącz na wsporniki
  if (currentMount === 'bigfoot' || currentMount === 'custom-base') {
    const currentMax = atticWallHeightMax.value
    if (wallHeight > currentMax) {
      console.log('[autoSwitchMountType] wall height > max for', currentMount, '- switching to brackets')
      state.value.descentMountType = 'brackets'
      return
    }
  }

  // Wsporniki: jeśli wysokość ściany < MIN (0.51m) → przełącz na bigfoot
  const BRACKETS_MIN_HEIGHT = 0.51
  if (currentMount === 'brackets') {
    if (wallHeight < BRACKETS_MIN_HEIGHT && wallHeight <= bigfootMax) {
      console.log('[autoSwitchMountType] wall height < min for brackets - switching to bigfoot')
      state.value.descentMountType = 'bigfoot'
      return
    }
  }
}

// Watcher dla automatycznego przełączania typu montażu
watch(
  () => [
    state.value.scheme,
    state.value.atticWallHeight,
    state.value.atticMinDistance,
    state.value.customBaseHeight
  ],
  () => {
    autoSwitchMountTypeByWallHeight()
  }
)

// Watcher dla ręcznej zmiany typu montażu - dostosuj wysokość ściany jeśli poza zakresem
watch(
  () => state.value.descentMountType,
  (newMountType, oldMountType) => {
    if (state.value.scheme !== 'attic-passage') return
    if (!oldMountType) return  // Pierwsze ustawienie, nie reaguj

    const wallHeight = state.value.atticWallHeight || 0

    if (newMountType === 'brackets') {
      // Przełączono na wsporniki - min wysokość to 0.51m
      const minHeight = 0.51
      if (wallHeight < minHeight) {
        console.log('[mountType watcher] brackets: wall height below min, setting to', minHeight)
        state.value.atticWallHeight = minHeight
      }
    } else if (newMountType === 'bigfoot' || newMountType === 'custom-base') {
      // Przełączono na bigfoot/własne podłoże - sprawdź max
      const maxHeight = atticWallHeightMax.value
      if (wallHeight > maxHeight) {
        console.log('[mountType watcher]', newMountType, ': wall height above max, setting to', maxHeight)
        state.value.atticWallHeight = Math.max(0, maxHeight)
      }
    }
  }
)

// Watcher dla automatycznego przełączania na przełaz attykowy gdy murek > 30cm
watch(
  () => state.value.atticWallHeight,
  (newHeight) => {
    // Tylko w trybie klienta z murkiem attykowym i klasycznym/podestem zakończeniem
    if (!isCustomerMode.value) return
    if (customerRoofType.value !== 'with-parapet') return
    if (customerLadderEnding.value === 'attic-passage') return  // Już jest przełaz

    // Jeśli wysokość murka > 0.3m, automatycznie przełącz na przełaz attykowy
    if (newHeight > 0.3) {
      console.log('[auto-switch] Murek attykowy > 30cm, przełączam na przełaz attykowy')
      customerLadderEnding.value = 'attic-passage'
      state.value.scheme = 'attic-passage'
      autoSwitchMessage.value = `Wysokość murka ${(newHeight * 100).toFixed(0)}cm wymaga przełazu attykowego. Automatycznie zmieniono typ zakończenia.`
      warningDismissed.value = false  // Pokaż komunikat
      updateThreeState()
    }
  }
)

// Debug mode - controls visibility of advanced features (toggle with Ctrl+Shift+D)
const debugMode = ref(false)

function toggleDebugMode() {
  debugMode.value = !debugMode.value
  threeCanvasRef.value?.setDebugMode(debugMode.value)
}

// Debug editor state
const debugEditorOpen = ref(false)
const debugAvailableModels = ref<string[]>([])
const debugObjects = ref<any[]>([])
const selectedDebugObjectId = ref<string | null>(null)

// Box creation form
const newBoxForm = ref({
  width: 100,
  height: 100,
  depth: 100,
  color: '#888888'
})

// Position/rotation form for selected object
const editForm = ref({
  posX: 0,
  posY: 0,
  posZ: 0,
  rotX: 0,
  rotY: 0,
  rotZ: 0
})

function openDebugEditor() {
  debugEditorOpen.value = true
  debugAvailableModels.value = threeCanvasRef.value?.getAvailableModels() || []
  refreshDebugObjects()
}

function closeDebugEditor() {
  debugEditorOpen.value = false
}

function refreshDebugObjects() {
  debugObjects.value = threeCanvasRef.value?.getDebugObjects() || []
}

function addDebugModel(modelName: string) {
  const obj = threeCanvasRef.value?.addDebugModel(modelName)
  if (obj) {
    refreshDebugObjects()
    selectDebugObject(obj.id)
  }
}

function addDebugBox() {
  const obj = threeCanvasRef.value?.addDebugBox(
    newBoxForm.value.width,
    newBoxForm.value.height,
    newBoxForm.value.depth,
    newBoxForm.value.color
  )
  if (obj) {
    refreshDebugObjects()
    selectDebugObject(obj.id)
  }
}

function selectDebugObject(id: string | null) {
  selectedDebugObjectId.value = id
  threeCanvasRef.value?.selectDebugObject(id)

  if (id) {
    const obj = debugObjects.value.find(o => o.id === id)
    if (obj) {
      editForm.value = {
        posX: obj.position.x,
        posY: obj.position.y,
        posZ: obj.position.z,
        rotX: obj.rotation.x,
        rotY: obj.rotation.y,
        rotZ: obj.rotation.z
      }
    }
  }
}

function updateSelectedObject() {
  if (!selectedDebugObjectId.value) return

  threeCanvasRef.value?.updateDebugObject(selectedDebugObjectId.value, {
    position: {
      x: editForm.value.posX,
      y: editForm.value.posY,
      z: editForm.value.posZ
    },
    rotation: {
      x: editForm.value.rotX,
      y: editForm.value.rotY,
      z: editForm.value.rotZ
    }
  })
  refreshDebugObjects()
}

function removeDebugObject(id: string) {
  // Check if it's an existing scene object
  const obj = debugObjects.value.find(o => o.id === id)
  if (obj?.type === 'existing') {
    // Use deleteSceneObject for existing scene objects
    threeCanvasRef.value?.deleteSceneObject(id)
  } else {
    threeCanvasRef.value?.removeDebugObject(id)
  }
  if (selectedDebugObjectId.value === id) {
    selectedDebugObjectId.value = null
  }
  refreshDebugObjects()
}

function duplicateDebugObject(id: string) {
  const newObj = threeCanvasRef.value?.duplicateDebugObject(id)
  if (newObj) {
    refreshDebugObjects()
    selectDebugObject(newObj.id)
  }
}

function clearAllDebugObjects() {
  threeCanvasRef.value?.clearAllDebugObjects()
  selectedDebugObjectId.value = null
  refreshDebugObjects()
}

function collectSceneObjects() {
  threeCanvasRef.value?.collectSceneObjects()
  refreshDebugObjects()
}

// Transform mode for CAD-like editing
const transformMode = ref<'translate' | 'rotate' | 'scale'>('translate')

function setTransformMode(mode: 'translate' | 'rotate' | 'scale') {
  transformMode.value = mode
  threeCanvasRef.value?.setTransformMode(mode)
}

// Handle transform controls update (CAD gizmo drag)
function onDebugObjectUpdated(data: { id: string; position: { x: number; y: number; z: number }; rotation: { x: number; y: number; z: number } }) {
  if (selectedDebugObjectId.value === data.id) {
    editForm.value.posX = Math.round(data.position.x * 100) / 100
    editForm.value.posY = Math.round(data.position.y * 100) / 100
    editForm.value.posZ = Math.round(data.position.z * 100) / 100
    editForm.value.rotX = Math.round(data.rotation.x * 100) / 100
    editForm.value.rotY = Math.round(data.rotation.y * 100) / 100
    editForm.value.rotZ = Math.round(data.rotation.z * 100) / 100
  }
  refreshDebugObjects()
}

function handleKeyDown(e: KeyboardEvent) {
  // Ctrl+Shift+D to toggle debug mode
  if (e.ctrlKey && e.shiftKey && e.key === 'D') {
    e.preventDefault()
    toggleDebugMode()
  }

  // Ctrl+Z for undo (only in debug editor mode)
  if (e.ctrlKey && !e.shiftKey && e.key === 'z' && debugEditorOpen.value) {
    e.preventDefault()
    performUndo()
  }

  // Ctrl+Y for redo (only in debug editor mode)
  if (e.ctrlKey && e.key === 'y' && debugEditorOpen.value) {
    e.preventDefault()
    performRedo()
  }

  // Ctrl+Shift+Z for redo (alternative)
  if (e.ctrlKey && e.shiftKey && e.key === 'Z' && debugEditorOpen.value) {
    e.preventDefault()
    performRedo()
  }
}

function performUndo() {
  const success = threeCanvasRef.value?.undo()
  if (success) {
    refreshDebugObjects()
  }
}

function performRedo() {
  const success = threeCanvasRef.value?.redo()
  if (success) {
    refreshDebugObjects()
  }
}

// Align mode (Fusion-style) - simplified two-step process
const alignActive = ref(false)
const alignStep = ref('')

const alignStepText = computed(() => {
  if (alignStep.value === 'select-face') return '1. Kliknij sciane obiektu do wyrownania'
  if (alignStep.value === 'select-target') return '2. Kliknij punkt docelowy'
  return ''
})

function startAlign() {
  if (!selectedDebugObjectId.value) return
  threeCanvasRef.value?.startAlignMode()
  alignActive.value = true
  alignStep.value = 'select-face'
}

function cancelAlign() {
  threeCanvasRef.value?.cancelAlignMode()
  alignActive.value = false
  alignStep.value = ''
}

// Check align state periodically
function checkAlignState() {
  const state = threeCanvasRef.value?.getAlignState()
  if (state) {
    alignActive.value = state.mode
    alignStep.value = state.step
    if (state.step === 'done' && !state.mode) {
      refreshDebugObjects()
    }
  }
}

// Poll for align state changes
setInterval(checkAlignState, 100)

// Extrude mode (Fusion-style push/pull)
const extrudeActive = ref(false)

function startExtrude() {
  if (!selectedDebugObjectId.value) return
  threeCanvasRef.value?.startExtrudeMode()
  extrudeActive.value = true
}

function cancelExtrude() {
  threeCanvasRef.value?.cancelExtrudeMode()
  extrudeActive.value = false
}

// Check extrude state periodically
function checkExtrudeState() {
  const state = threeCanvasRef.value?.getExtrudeState()
  if (state) {
    extrudeActive.value = state.mode
    if (!state.mode && !state.active) {
      refreshDebugObjects()
    }
  }
}

// Poll for extrude state changes
setInterval(checkExtrudeState, 100)

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown)
  // Sprawdź URL i załaduj ofertę jeśli są parametry
  checkUrlAndLoadOffer()

  // Dla trybu customer - ustaw domyślne wartości i przeskocz do params
  if (isCustomerMode.value) {
    state.value.purpose = 'external'
    state.value.scheme = 'no-platform'
    state.value.hasInsulation = true
    currentScreen.value = 'params'
  }
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
})

// Additional cage options
const cageClosingEnabled = ref(false)

// Collision warning state
const collisionWarning = ref<{
  expectedBrackets: number
  actualBrackets: number
  missingBrackets: number
  message: string
} | null>(null)

function onCollisionWarning(data: {
  expectedBrackets: number
  actualBrackets: number
  missingBrackets: number
  message: string
}) {
  if (data.missingBrackets > 0) {
    collisionWarning.value = data
  } else {
    collisionWarning.value = null
  }
}

// Reset warningDismissed gdy zmieni się ostrzeżenie (żeby nowe ostrzeżenia były widoczne)
watch([atticThicknessWarning, atticBracketWarning, () => collisionWarning.value?.message], () => {
  warningDismissed.value = false
})

function toggle3DWall() {
  show3DWall.value = !show3DWall.value
  // ThreeCanvas automatycznie się zaktualizuje przez props
}

function toggle3DGround() {
  show3DGround.value = !show3DGround.value
  // ThreeCanvas automatycznie się zaktualizuje przez props
}

function toggle3DInsulation() {
  show3DInsulation.value = !show3DInsulation.value
  // ThreeCanvas automatycznie się zaktualizuje przez props
}

// Measurement tool
function toggleMeasureMode() {
  measureModeActive.value = !measureModeActive.value
  measureResult.value = null
  if (threeCanvasRef.value) {
    threeCanvasRef.value.setMeasureMode(measureModeActive.value)
  }
  // Turn off tech drawing when enabling measure
  if (measureModeActive.value && techDrawingActive.value) {
    toggleTechDrawing()
  }
}

function setMeasureAxis(mode: '3d' | 'x' | 'y' | 'z') {
  measureAxisMode.value = mode
  if (threeCanvasRef.value) {
    threeCanvasRef.value.setMeasureAxisMode(mode)
  }
}

function onMeasureResult(data: { distanceMm: number; axisMode: string }) {
  measureResult.value = data
}

function closeMeasureResult() {
  measureResult.value = null
  if (threeCanvasRef.value) {
    threeCanvasRef.value.clearMeasureLine()
  }
}

// Technical drawing
function toggleTechDrawing() {
  techDrawingActive.value = !techDrawingActive.value
  if (threeCanvasRef.value) {
    if (techDrawingActive.value) {
      threeCanvasRef.value.enterTechDrawingMode('front')
      // Turn off measure when enabling tech drawing
      if (measureModeActive.value) {
        measureModeActive.value = false
        threeCanvasRef.value.setMeasureMode(false)
      }
    } else {
      threeCanvasRef.value.exitTechDrawingMode()
    }
  }
}

function switchTechDrawingView() {
  if (threeCanvasRef.value) {
    threeCanvasRef.value.toggleTechDrawingView()
  }
}

function setTechDrawingView(view: 'front' | 'side' | 'back') {
  if (threeCanvasRef.value) {
    threeCanvasRef.value.enterTechDrawingMode(view)
  }
}

function onTechDrawingChange(data: { enabled: boolean; view: string; totalHeightMm: number }) {
  techDrawingActive.value = data.enabled
  techDrawingView.value = data.view
}

// Sciskane mode (edit handles) - delegated to ThreeCanvas
function toggleSciskaneMode() {
  sciskaneModeActive.value = !sciskaneModeActive.value
  // Turn off other modes
  if (sciskaneModeActive.value) {
    if (measureModeActive.value) {
      measureModeActive.value = false
      threeCanvasRef.value?.setMeasureMode(false)
    }
    if (techDrawingActive.value) {
      techDrawingActive.value = false
      threeCanvasRef.value?.exitTechDrawingMode()
    }
  } else {
    // Close edit panel when exiting sciskane mode
    sciskaneEditPanelActive.value = false
    sciskaneEditData.value = null
  }
  // Call ThreeCanvas method
  threeCanvasRef.value?.toggleSciskaneMode()
}

// Sciskane handle edit handlers
function onEditSciskaneHandle(data: {
  offsetFromBottom: number
  ladderNum: number
  connType: string
  wspornikType: string
  wspornikDistance: number
  isMidRung?: boolean
  isJointConnector?: boolean
  pairIndex?: number
}) {
  sciskaneEditData.value = {
    offsetFromBottom: data.offsetFromBottom,
    ladderNum: data.ladderNum,
    connType: data.connType,
    wspornikType: data.wspornikType,
    wspornikDistance: data.wspornikDistance,
    isMidRung: data.isMidRung || false,
    isJointConnector: data.isJointConnector || false,
    pairIndex: data.pairIndex
  }
  sciskaneEditPanelActive.value = true
}

function setSciskaneConnType(type: string) {
  if (!sciskaneEditData.value) return
  sciskaneEditData.value.connType = type

  if (sciskaneEditData.value.isMidRung) {
    // Update mid-rung bracket
    threeCanvasRef.value?.updateMidRungBracket(
      sciskaneEditData.value.ladderNum,
      { connType: type }
    )
  } else if (sciskaneEditData.value.isJointConnector && sciskaneEditData.value.pairIndex !== undefined) {
    // Update joint connector
    threeCanvasRef.value?.updateJointConnector(
      sciskaneEditData.value.pairIndex,
      sciskaneEditData.value.ladderNum,
      { connType: type }
    )
  } else {
    // Update regular sciskane handle
    threeCanvasRef.value?.updateSciskaneHandle(
      sciskaneEditData.value.offsetFromBottom,
      sciskaneEditData.value.ladderNum,
      { connType: type }
    )
  }
}

// Domyślne odległości dla typów wsporników
const wspornikDefaultDistances: Record<string, number> = {
  krotki: 215,
  sredni: 315,
  dlugi: 415
}

function setSciskaneWspornikType(type: string) {
  if (!sciskaneEditData.value) return

  sciskaneEditData.value.wspornikType = type

  // Ustaw domyślną odległość dla nowego typu jeśli aktualna jest poza zakresem
  const newRange = wspornikDistanceRanges[type] || wspornikDistanceRanges['krotki']
  const currentDistance = sciskaneEditData.value.wspornikDistance

  let newDistance = currentDistance
  if (currentDistance < newRange.min || currentDistance > newRange.max) {
    // Aktualna odległość poza zakresem - użyj domyślnej
    newDistance = wspornikDefaultDistances[type] || newRange.min
  }
  sciskaneEditData.value.wspornikDistance = newDistance

  if (sciskaneEditData.value.isMidRung) {
    // Update mid-rung bracket
    threeCanvasRef.value?.updateMidRungBracket(
      sciskaneEditData.value.ladderNum,
      { wspornikType: type, wspornikDistance: newDistance }
    )
  } else if (sciskaneEditData.value.isJointConnector && sciskaneEditData.value.pairIndex !== undefined) {
    // Update joint connector
    threeCanvasRef.value?.updateJointConnector(
      sciskaneEditData.value.pairIndex,
      sciskaneEditData.value.ladderNum,
      { wspornikType: type, wspornikDistance: newDistance }
    )
  } else {
    // Update regular sciskane handle
    threeCanvasRef.value?.updateSciskaneHandle(
      sciskaneEditData.value.offsetFromBottom,
      sciskaneEditData.value.ladderNum,
      { wspornikType: type, wspornikDistance: newDistance }
    )
  }
}

function setSciskaneWspornikDistance(distance: number) {
  if (!sciskaneEditData.value) return

  // Clamp distance to current type range
  const range = currentWspornikRange.value
  distance = Math.max(range.min, Math.min(range.max, distance))
  sciskaneEditData.value.wspornikDistance = distance

  if (sciskaneEditData.value.isMidRung) {
    // Update mid-rung bracket
    threeCanvasRef.value?.updateMidRungBracket(
      sciskaneEditData.value.ladderNum,
      { wspornikDistance: distance }
    )
  } else if (sciskaneEditData.value.isJointConnector && sciskaneEditData.value.pairIndex !== undefined) {
    // Update joint connector
    threeCanvasRef.value?.updateJointConnector(
      sciskaneEditData.value.pairIndex,
      sciskaneEditData.value.ladderNum,
      { wspornikDistance: distance }
    )
  } else {
    // Update regular sciskane handle
    threeCanvasRef.value?.updateSciskaneHandle(
      sciskaneEditData.value.offsetFromBottom,
      sciskaneEditData.value.ladderNum,
      { wspornikDistance: distance }
    )
  }
}

function removeCurrentSciskaneHandle() {
  if (!sciskaneEditData.value) return

  if (sciskaneEditData.value.isMidRung) {
    // Remove mid-rung bracket
    threeCanvasRef.value?.removeMidRungBracket(
      sciskaneEditData.value.ladderNum
    )
  } else if (sciskaneEditData.value.isJointConnector) {
    // Joint connectors cannot be removed, only changed to lacznik
    // This effectively "removes" the wspornik
    if (sciskaneEditData.value.pairIndex !== undefined) {
      threeCanvasRef.value?.updateJointConnector(
        sciskaneEditData.value.pairIndex,
        sciskaneEditData.value.ladderNum,
        { connType: 'lacznik' }
      )
    }
  } else {
    // Remove regular sciskane handle
    threeCanvasRef.value?.removeSciskaneHandle(
      sciskaneEditData.value.offsetFromBottom,
      sciskaneEditData.value.ladderNum
    )
  }
  closeSciskaneEditPanel()
}

function closeSciskaneEditPanel() {
  sciskaneEditPanelActive.value = false
  sciskaneEditData.value = null
}

// Cage correction
function addCageHoop() {
  cageCorrection.value = Math.min(cageCorrection.value + 1, 5)
}

function removeCageHoop() {
  cageCorrection.value = Math.max(cageCorrection.value - 1, -5)
}

function toggleCageClosing() {
  cageClosingEnabled.value = !cageClosingEnabled.value
  state.value.cageClosing = cageClosingEnabled.value
}
</script>

<template>
  <div class="app-container">
    <!-- Debug mode indicator -->
    <div v-if="debugMode" id="debugIndicator">
      DEBUG MODE (Ctrl+Shift+D)
      <button @click="openDebugEditor" class="debug-editor-btn">Edytor Modeli</button>
    </div>

    <!-- Debug Editor Panel -->
    <div v-if="debugEditorOpen" class="debug-editor-panel">
      <div class="debug-editor-header">
        <h3>Edytor Modeli</h3>
        <button @click="closeDebugEditor" class="close-btn">&times;</button>
      </div>

      <div class="debug-editor-content">
        <!-- Add Model Section -->
        <div class="debug-section">
          <h4>Dodaj Model</h4>
          <div class="model-grid">
            <button
              v-for="model in debugAvailableModels"
              :key="model"
              @click="addDebugModel(model)"
              class="model-btn"
            >
              {{ model }}
            </button>
          </div>
        </div>

        <!-- Add Box Section -->
        <div class="debug-section">
          <h4>Dodaj Prostokat</h4>
          <div class="box-form">
            <div class="form-row">
              <label>Szer (mm):</label>
              <input type="number" v-model.number="newBoxForm.width" />
            </div>
            <div class="form-row">
              <label>Wys (mm):</label>
              <input type="number" v-model.number="newBoxForm.height" />
            </div>
            <div class="form-row">
              <label>Gl (mm):</label>
              <input type="number" v-model.number="newBoxForm.depth" />
            </div>
            <div class="form-row">
              <label>Kolor:</label>
              <input type="color" v-model="newBoxForm.color" />
            </div>
            <button @click="addDebugBox" class="add-box-btn">Dodaj</button>
          </div>
        </div>

        <!-- Scene Objects Collection -->
        <div class="debug-section">
          <h4>Istniejace Modele</h4>
          <button @click="collectSceneObjects" class="collect-btn">
            Zbierz obiekty ze sceny
          </button>
        </div>

        <!-- Objects List -->
        <div class="debug-section">
          <h4>Obiekty ({{ debugObjects.length }})</h4>
          <div class="objects-list">
            <div
              v-for="obj in debugObjects"
              :key="obj.id"
              class="object-item"
              :class="{ selected: selectedDebugObjectId === obj.id, existing: obj.type === 'existing' }"
              @click="selectDebugObject(obj.id)"
            >
              <span class="obj-name">{{ obj.name }}</span>
              <span class="obj-type" :class="obj.type">[{{ obj.type === 'existing' ? 'scena' : obj.type }}]</span>
              <div class="obj-actions">
                <button v-if="obj.type !== 'existing'" @click.stop="duplicateDebugObject(obj.id)" title="Duplikuj">D</button>
                <button @click.stop="removeDebugObject(obj.id)" title="Usun" class="delete-btn">X</button>
              </div>
            </div>
          </div>
          <button v-if="debugObjects.length > 0" @click="clearAllDebugObjects" class="clear-all-btn">
            Usun wszystkie
          </button>
        </div>

        <!-- Edit Selected Object -->
        <div v-if="selectedDebugObjectId" class="debug-section">
          <h4>Tryb edycji (CAD)</h4>
          <div class="transform-mode-btns">
            <button
              :class="{ active: transformMode === 'translate' }"
              @click="setTransformMode('translate')"
              title="Przesuń (G)"
            >
              Przesuń
            </button>
            <button
              :class="{ active: transformMode === 'rotate' }"
              @click="setTransformMode('rotate')"
              title="Obróć (R)"
            >
              Obróć
            </button>
            <button
              :class="{ active: transformMode === 'scale' }"
              @click="setTransformMode('scale')"
              title="Skaluj (S)"
            >
              Skaluj
            </button>
          </div>

          <h4>Pozycja / Rotacja</h4>
          <div class="edit-form">
            <div class="form-row">
              <label>X (mm):</label>
              <input type="number" v-model.number="editForm.posX" @change="updateSelectedObject" />
            </div>
            <div class="form-row">
              <label>Y (mm):</label>
              <input type="number" v-model.number="editForm.posY" @change="updateSelectedObject" />
            </div>
            <div class="form-row">
              <label>Z (mm):</label>
              <input type="number" v-model.number="editForm.posZ" @change="updateSelectedObject" />
            </div>
            <h5>Rotacja (stopnie)</h5>
            <div class="form-row">
              <label>Rot X:</label>
              <input type="number" v-model.number="editForm.rotX" @change="updateSelectedObject" />
            </div>
            <div class="form-row">
              <label>Rot Y:</label>
              <input type="number" v-model.number="editForm.rotY" @change="updateSelectedObject" />
            </div>
            <div class="form-row">
              <label>Rot Z:</label>
              <input type="number" v-model.number="editForm.rotZ" @change="updateSelectedObject" />
            </div>
          </div>

          <!-- Align Mode (Fusion-style) -->
          <h4>Wyrownaj do punktu</h4>
          <div class="align-section">
            <button
              v-if="!alignActive"
              @click="startAlign"
              class="align-btn"
            >
              Wyrownaj
            </button>
            <div v-else class="align-status">
              <div class="align-step">{{ alignStepText }}</div>
              <button @click="cancelAlign" class="align-cancel-btn">Anuluj</button>
            </div>
          </div>

          <!-- Extrude Mode (Fusion-style push/pull) -->
          <h4>Wyciaganie</h4>
          <div class="align-section">
            <button
              v-if="!extrudeActive"
              @click="startExtrude"
              class="align-btn extrude-btn"
            >
              Wyciagnij
            </button>
            <div v-else class="align-status">
              <div class="align-step">Przeciagnij sciane aby zmienic rozmiar</div>
              <button @click="cancelExtrude" class="align-cancel-btn">Anuluj</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ============================================
         NAGŁÓWEK GLOBALNY
         ============================================ -->
    <header class="app-header">
      <!-- Przycisk wstecz dla admin / refresh dla customer -->
      <button
        v-if="!isCustomerMode"
        class="back-button"
        :disabled="!canGoBack"
        @click="goBack"
        title="Wróć"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M19 12H5M12 19l-7-7 7-7"/>
        </svg>
      </button>
      <button
        v-else
        class="back-button reset-button"
        @click="showResetConfirm = true"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M23 4v6h-6M1 20v-6h6"/>
          <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
        </svg>
        <span class="reset-tooltip">Zacznij od nowa</span>
      </button>
      <div v-if="!isCustomerMode" class="header-title">
        <h1>{{ screenTitle }}</h1>
        <div class="step-indicator">{{ stepIndicator }}</div>
      </div>

      <!-- Selektor widoku dla customer mode -->
      <div v-if="isCustomerMode && currentScreen === 'params'" class="header-view-selector">
        <button
          class="header-view-btn"
          :class="{ active: techDrawingActive && techDrawingView === 'front' }"
          @click="setTechDrawingView('front')"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="4" y="4" width="16" height="16" rx="1"/>
          </svg>
          <span>Przód</span>
        </button>
        <button
          class="header-view-btn"
          :class="{ active: techDrawingActive && techDrawingView === 'side' }"
          @click="setTechDrawingView('side')"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 4L4 8v8l8 4 8-4V8l-8-4z"/>
          </svg>
          <span>Bok</span>
        </button>
        <button
          class="header-view-btn"
          :class="{ active: techDrawingActive && techDrawingView === 'back' }"
          @click="setTechDrawingView('back')"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="4" y="4" width="16" height="16" rx="1"/>
            <line x1="4" y1="4" x2="20" y2="20"/>
          </svg>
          <span>Tył</span>
        </button>
        <button
          class="header-view-btn"
          :class="{ active: !techDrawingActive }"
          @click="techDrawingActive && toggleTechDrawing()"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
            <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
            <line x1="12" y1="22.08" x2="12" y2="12"/>
          </svg>
          <span>3D</span>
        </button>
      </div>

      <!-- Popup potwierdzenia resetu -->
      <div v-if="showResetConfirm" class="reset-confirm-overlay" @click.self="showResetConfirm = false">
        <div class="reset-confirm-popup">
          <h3>Zacząć od nowa?</h3>
          <p>Wszystkie wprowadzone dane zostaną usunięte.</p>
          <div class="reset-confirm-buttons">
            <button class="btn-cancel" @click="showResetConfirm = false">Anuluj</button>
            <button class="btn-confirm" @click="resetWizard">Tak, zacznij od nowa</button>
          </div>
        </div>
      </div>
    </header>

    <!-- ============================================
         GŁÓWNA ZAWARTOŚĆ
         ============================================ -->
    <main class="app-content">

      <!-- ========== EKRAN 1: Wybór przeznaczenia ========== -->
      <div v-if="currentScreen === 'purpose'" class="screen">
        <div class="fullscreen-layout">
          <div class="screen-intro">
            <h2>Wybierz przeznaczenie drabiny</h2>
            <p>Określ, gdzie będzie zamontowana Twoja drabina techniczna</p>
          </div>

          <div class="choice-grid-fullscreen cols-2">
            <div
              class="choice-card-large"
              :class="{ selected: state.purpose === 'internal' }"
              @click="selectPurpose('internal')"
            >
              <div class="card-image">&#127968;</div>
              <div class="card-body">
                <div class="card-title">Wewnętrzna</div>
                <div class="card-description">
                  Drabiny do użytku wewnątrz budynków - do pomieszczeń technicznych, maszynowni, poddaszy
                </div>
              </div>
            </div>

            <div
              class="choice-card-large"
              :class="{ selected: state.purpose === 'external' }"
              @click="selectPurpose('external')"
            >
              <div class="card-image">&#127981;</div>
              <div class="card-body">
                <div class="card-title">Zewnętrzna</div>
                <div class="card-description">
                  Drabiny fasadowe i ewakuacyjne - montowane na zewnątrz budynków, zgodne z przepisami BHP
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ========== EKRAN 2: Parametry (SPLIT LAYOUT z iframe) ========== -->
      <div v-if="currentScreen === 'params'" class="screen">
        <div class="split-layout">
          <!-- Lewa strona - wizualizacja 3D (bezpośrednia integracja Three.js) -->
          <div class="visualization-panel">
            <div class="viewer3d-container">
              <ThreeCanvas
                ref="threeCanvasRef"
                v-bind="threeCanvasProps"
                @ready="onThreeReady"
                @update="onThreeUpdate"
                @measureResult="onMeasureResult"
                @techDrawingChange="onTechDrawingChange"
                @editSciskaneHandle="onEditSciskaneHandle"
                @collisionWarning="onCollisionWarning"
                @debugObjectUpdated="onDebugObjectUpdated"
              />

              <!-- Lekki popup ostrzeżenia u góry modelu 3D (tylko jeden na raz, priorytet: autoSwitch > thickness > bracket > collision) -->
              <div v-if="(autoSwitchMessage || atticThicknessWarning || atticBracketWarning || collisionWarning) && !warningDismissed" class="model-toast" :class="{ 'model-toast-info': autoSwitchMessage }">
                <div class="model-toast-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path v-if="autoSwitchMessage" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    <path v-else d="M12 9v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                  </svg>
                </div>
                <div class="model-toast-content">
                  <template v-if="autoSwitchMessage">
                    <strong>Automatyczna zmiana:</strong> {{ autoSwitchMessage }}
                  </template>
                  <template v-else-if="atticThicknessWarning">
                    {{ atticThicknessWarning }}
                  </template>
                  <template v-else-if="atticBracketWarning">
                    {{ atticBracketWarning }}
                  </template>
                  <template v-else-if="collisionWarning">
                    <strong>Kolizja z przeszkodą:</strong> {{ collisionWarning.message }}
                  </template>
                </div>
                <button class="model-toast-close" @click="warningDismissed = true; autoSwitchMessage = null">&times;</button>
              </div>

              <!-- Kontrolki widoczności 3D (prawy górny róg) - ukryte w customer mode -->
              <div v-if="!isCustomerMode || debugMode" class="viewer3d-visibility">
                <button
                  class="viewer3d-visibility-btn"
                  :class="{ active: show3DWall }"
                  @click="toggle3DWall"
                  title="Pokaż/ukryj ścianę"
                >
                  Ściana: {{ show3DWall ? 'ON' : 'OFF' }}
                </button>
                <button
                  class="viewer3d-visibility-btn"
                  :class="{ active: show3DGround }"
                  @click="toggle3DGround"
                  title="Pokaż/ukryj podłogę"
                >
                  Podłoga: {{ show3DGround ? 'ON' : 'OFF' }}
                </button>
                <button
                  class="viewer3d-visibility-btn"
                  :class="{ active: show3DInsulation }"
                  @click="toggle3DInsulation"
                  title="Pokaż/ukryj ocieplenie"
                >
                  Ocieplenie: {{ show3DInsulation ? 'ON' : 'OFF' }}
                </button>
              </div>

              <!-- GŁÓWNE KONTROLKI (lewy górny róg) - ukryte w customer mode -->
              <div v-if="!isCustomerMode || debugMode" id="controls">
                <button
                  class="btn btn-tech btn-with-tooltip"
                  :class="{ 'btn-active': techDrawingActive }"
                  @click="toggleTechDrawing"
                >
                  📐<span class="btn-tooltip">Rysunek techniczny</span>
                </button>
                <button
                  class="btn btn-tech btn-with-tooltip"
                  :class="{ 'btn-active': measureModeActive }"
                  @click="toggleMeasureMode"
                >
                  📏<span class="btn-tooltip">Miarka</span>
                </button>
                <button
                  class="btn btn-tech btn-with-tooltip"
                  :class="{ 'btn-active': sciskaneModeActive }"
                  @click="toggleSciskaneMode"
                >
                  🔧<span class="btn-tooltip">Edytuj uchwyty</span>
                </button>
              </div>

              <!-- TOOLBAR MIARKI (środek góry) - ukryty w customer mode -->
              <div v-if="!isCustomerMode || debugMode" id="measureToolbar" :class="{ active: measureModeActive }">
                <span class="measure-toolbar-label">Tryb:</span>
                <button
                  class="measure-mode-btn"
                  :class="{ active: measureAxisMode === '3d' }"
                  @click="setMeasureAxis('3d')"
                >
                  3D
                  <span class="tooltip">Odległość przestrzenna</span>
                </button>
                <button
                  class="measure-mode-btn"
                  :class="{ active: measureAxisMode === 'x' }"
                  @click="setMeasureAxis('x')"
                >
                  X
                  <span class="tooltip">Tylko szerokość</span>
                </button>
                <button
                  class="measure-mode-btn"
                  :class="{ active: measureAxisMode === 'y' }"
                  @click="setMeasureAxis('y')"
                >
                  Y
                  <span class="tooltip">Tylko wysokość</span>
                </button>
                <button
                  class="measure-mode-btn"
                  :class="{ active: measureAxisMode === 'z' }"
                  @click="setMeasureAxis('z')"
                >
                  Z
                  <span class="tooltip">Tylko głębokość</span>
                </button>
                <div class="measure-toolbar-divider"></div>
                <button class="measure-close-btn" @click="toggleMeasureMode" title="Zamknij miarkę">✕</button>
              </div>

              <!-- WYNIK POMIARU (środek ekranu) -->
              <div v-if="measureResult" id="measureResultPopup">
                {{ measureResult.distanceMm.toFixed(1) }} mm
                <button class="measure-result-close-btn" @click="closeMeasureResult">×</button>
              </div>

              <!-- PANEL EDYCJI UCHWYTU SCISKANE (środek ekranu) -->
              <div v-if="sciskaneEditPanelActive && sciskaneEditData" id="connectionPanel" class="active">
                <h3>{{ sciskaneEditData.isJointConnector ? 'Edycja łącznika' : (sciskaneEditData.isMidRung ? 'Edycja uchwytu (środkowy)' : 'Edycja uchwytu') }}</h3>

                <div class="connection-row">
                  <label>Typ połączenia</label>
                  <div class="connection-types">
                    <button
                      class="connection-type-btn"
                      :class="{ active: sciskaneEditData.connType === 'uchwyt' }"
                      @click="setSciskaneConnType('uchwyt')"
                    >Uchwyt</button>
                    <!-- Ściskany - tylko dla midRung i sciskane (nie dla joint connectors) -->
                    <button
                      v-if="!sciskaneEditData.isJointConnector"
                      class="connection-type-btn"
                      :class="{ active: sciskaneEditData.connType === 'sciskany' }"
                      @click="setSciskaneConnType('sciskany')"
                    >Ściskany</button>
                    <!-- Łącznik - tylko dla joint connectors -->
                    <button
                      v-if="sciskaneEditData.isJointConnector"
                      class="connection-type-btn"
                      :class="{ active: sciskaneEditData.connType === 'lacznik' }"
                      @click="setSciskaneConnType('lacznik')"
                    >Łącznik</button>
                  </div>
                </div>

                <div class="wspornik-row">
                  <label>Typ wspornika</label>
                  <div class="wspornik-types">
                    <button
                      class="wspornik-type-btn"
                      :class="{ active: sciskaneEditData.wspornikType === 'krotki' }"
                      @click="setSciskaneWspornikType('krotki')"
                    >Krótki</button>
                    <button
                      class="wspornik-type-btn"
                      :class="{ active: sciskaneEditData.wspornikType === 'sredni' }"
                      @click="setSciskaneWspornikType('sredni')"
                    >Średni</button>
                    <button
                      class="wspornik-type-btn"
                      :class="{ active: sciskaneEditData.wspornikType === 'dlugi' }"
                      @click="setSciskaneWspornikType('dlugi')"
                    >Długi</button>
                  </div>
                </div>

                <!-- Slider tylko w trybie debug -->
                <div v-if="debugMode" class="wspornik-row">
                  <label>Odległość od ściany</label>
                  <input
                    type="range"
                    class="wspornik-slider"
                    :min="currentWspornikRange.min"
                    :max="currentWspornikRange.max"
                    step="5"
                    :value="sciskaneEditData.wspornikDistance"
                    @input="setSciskaneWspornikDistance(Number(($event.target as HTMLInputElement).value))"
                  >
                  <div class="wspornik-value">{{ sciskaneEditData.wspornikDistance }} mm ({{ currentWspornikRange.min }}-{{ currentWspornikRange.max }})</div>
                </div>

                <div class="connection-actions">
                  <button class="remove-btn" @click="removeCurrentSciskaneHandle">Usuń uchwyt</button>
                  <button class="close-btn" @click="closeSciskaneEditPanel">Zamknij</button>
                </div>
              </div>

              <!-- PANEL KOREKTY KOSZA (lewy dolny róg) - w trybie debug lub edycji uchwytów -->
              <div v-if="(debugMode || sciskaneModeActive) && state.cage === 'with-cage'" id="safetyCageControls">
                <div class="cage-panel cage-panel-1">
                  <span class="cage-label cage-label-1">Korekta kosza</span>
                  <button class="cage-btn cage-btn-add" @click="addCageHoop">+</button>
                  <span class="cage-count">{{ threeState.safetyCageCount + cageCorrection }}/{{ threeState.maxCageHoops }}</span>
                  <button class="cage-btn cage-btn-remove" @click="removeCageHoop">-</button>
                  <label class="cage-checkbox-label cage-checkbox-label-1">
                    <input type="checkbox" class="cage-checkbox" v-model="cageClosingEnabled" @change="toggleCageClosing"> Zamknij
                  </label>
                </div>
              </div>

              <!-- PANEL ODLEGŁOŚCI WSPORNIKÓW (lewy dolny róg) - w trybie edycji uchwwtów -->
              <div v-if="sciskaneModeActive" id="globalSettingsPanel" :class="{ 'with-cage': state.cage === 'with-cage' }">
                <label>Odl. wsporników</label>
                <input
                  type="range"
                  class="global-slider"
                  min="160"
                  max="460"
                  step="5"
                  :value="globalWspornikDistance"
                  @input="setGlobalWspornikDistanceValue(Number(($event.target as HTMLInputElement).value))"
                >
                <span class="global-value">{{ globalWspornikDistance }} mm</span>
                <span class="global-type">{{ globalWspornikType }}</span>
              </div>

              <!-- Panel rysunku technicznego (góra środek) -->
              <div v-if="techDrawingActive && !isCustomerMode" id="techDrawingPanel">
                <span class="tech-label">Rysunek techniczny</span>
                <span class="tech-view">Widok: {{ techDrawingView }}</span>
                <span class="tech-hint">Przeciągnij = przesuń | Scroll = zoom</span>
                <button class="tech-switch-btn" @click="switchTechDrawingView">Zmień widok</button>
                <button class="tech-close-btn" @click="toggleTechDrawing">✕</button>
              </div>


              <!-- WATCHDOG PANEL (prawy dolny róg) -->
              <div class="watchdog-panel">
                <div class="watchdog-item">
                  <span class="watchdog-label">Ostatni szczebel → ziemia:</span>
                  <span class="watchdog-value">{{ threeState.lastRungToGround }} mm</span>
                </div>
                <div v-if="state.cage === 'with-cage' && threeState.lastHoopToGround > 0" class="watchdog-item">
                  <span class="watchdog-label">Ostatnia obręcz → ziemia:</span>
                  <span class="watchdog-value">{{ threeState.lastHoopToGround }} mm</span>
                </div>
                <div v-if="state.scheme === 'attic-passage' && descentLadderData?.lastRungToRoof !== undefined" class="watchdog-item">
                  <span class="watchdog-label">Ostatni szczebel → dach:</span>
                  <span class="watchdog-value">{{ descentLadderData.lastRungToRoof }} mm</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Prawa strona - panel konfiguracji -->
          <div class="config-panel-wrapper">
            <div class="config-panel">
              <div class="config-panel-header">
                <h2 v-if="!isCustomerMode">Parametry drabiny</h2>
                <p v-if="!isCustomerMode">Wprowadź szczegółowe wymiary i opcje montażu</p>
                <!-- Progress bar dla customer -->
                <div v-if="isCustomerMode" class="customer-progress">
                  <h2 class="customer-step-title">{{ customerWizardSteps.find(s => s.id === customerWizardStep)?.title || 'Konfiguracja' }}</h2>
                  <div class="customer-progress-row">
                    <div class="customer-progress-bar">
                      <div class="customer-progress-fill" :style="{ width: customerWizardProgress + '%' }"></div>
                    </div>
                    <span class="customer-progress-text">Krok {{ currentCustomerStepIndex }} z {{ visibleCustomerSteps.length }}</span>
                  </div>
                  <p class="customer-step-desc">{{ customerWizardSteps.find(s => s.id === customerWizardStep)?.desc || '' }}</p>
                </div>
              </div>

              <!-- Banner załadowanej oferty -->
              <div v-if="loadedOffer" class="loaded-offer-banner">
                <div class="loaded-offer-icon">&#128196;</div>
                <div class="loaded-offer-info">
                  <div class="loaded-offer-title">Edytujesz oferte</div>
                  <div class="loaded-offer-ref">{{ loadedOffer.reference_number }}</div>
                </div>
                <div class="loaded-offer-meta">
                  <span>Wersja {{ loadedOffer.version || 1 }}</span>
                  <span>{{ formatDate(loadedOffer.created_at) }}</span>
                </div>
              </div>

              <!-- Błąd ładowania oferty -->
              <div v-if="loadOfferError" class="load-error-banner">
                {{ loadOfferError }}
              </div>

              <!-- Ładowanie oferty -->
              <div v-if="isLoadingOffer" class="loading-offer-banner">
                Ladowanie oferty...
              </div>

              <!-- ============================================ -->
              <!-- WIZARD DLA TRYBU CUSTOMER -->
              <!-- ============================================ -->
              <div v-if="isCustomerMode" class="customer-wizard">
                <!-- KROK 1: Typ dachu -->
                <div v-if="customerWizardStep === 1" class="wizard-step">
                  <div class="roof-type-options">
                    <button
                      class="roof-type-btn"
                      :class="{ selected: customerRoofType === 'flat' }"
                      @click="setCustomerRoofType('flat')"
                    >
                      <span class="roof-icon">&#9632;</span>
                      <span class="roof-label">Dach plaski</span>
                      <span class="roof-desc">Standardowy dach bez wystajacych elementow</span>
                    </button>
                    <button
                      class="roof-type-btn"
                      :class="{ selected: customerRoofType === 'with-eave' }"
                      @click="setCustomerRoofType('with-eave')"
                    >
                      <span class="roof-icon">&#9582;</span>
                      <span class="roof-label">Dach z okapem</span>
                      <span class="roof-desc">Dach z wystajacym okapem nad sciana</span>
                    </button>
                    <button
                      class="roof-type-btn"
                      :class="{ selected: customerRoofType === 'with-parapet' }"
                      @click="setCustomerRoofType('with-parapet')"
                    >
                      <span class="roof-icon">&#9633;</span>
                      <span class="roof-label">Murek attykowy</span>
                      <span class="roof-desc">Sciana zakonczna murkiem</span>
                    </button>
                  </div>
                </div>

                <!-- KROK 2: Zakończenie drabiny -->
                <div v-if="customerWizardStep === 2" class="wizard-step">
                  <div class="roof-type-options">
                    <button
                      class="roof-type-btn"
                      :class="{ selected: customerLadderEnding === 'classic' }"
                      @click="setCustomerLadderEnding('classic')"
                    >
                      <span class="roof-icon">&#128682;</span>
                      <span class="roof-label">Klasyczna</span>
                      <span class="roof-desc">Z poreczami asekuracyjnymi</span>
                    </button>
                    <button
                      class="roof-type-btn"
                      :class="{ selected: customerLadderEnding === 'platform' }"
                      @click="setCustomerLadderEnding('platform')"
                    >
                      <span class="roof-icon">&#9634;</span>
                      <span class="roof-label">Z podestem</span>
                      <span class="roof-desc">Platforma wyjsciowa na dachu</span>
                    </button>
                    <button
                      v-if="customerRoofType === 'with-parapet'"
                      class="roof-type-btn"
                      :class="{ selected: customerLadderEnding === 'attic-passage' }"
                      @click="setCustomerLadderEnding('attic-passage')"
                    >
                      <span class="roof-icon">&#8645;</span>
                      <span class="roof-label">Przelaz attykowy</span>
                      <span class="roof-desc">Przejscie przez murek z drabina zejsciowa</span>
                    </button>
                  </div>
                </div>

                <!-- KROK 3: Kosz ochronny -->
                <div v-if="customerWizardStep === 3" class="wizard-step">
                  <div class="info-box" style="margin-bottom: 1.5rem; padding: 14px 16px; background: rgba(52, 152, 219, 0.1); border-radius: 10px; border-left: 4px solid #3498db;">
                    <p style="margin: 0; color: #3498db; font-size: 0.9rem; line-height: 1.5;">
                      <strong>Informacja:</strong> Kosz ochronny jest wymagany przepisami dla drabin ewakuacyjnych powyżej 3m wysokości ściany.
                    </p>
                  </div>
                  <div class="toggle-options">
                    <button
                      class="toggle-btn"
                      :class="{ selected: state.cage === 'no-cage' }"
                      @click="state.cage = 'no-cage'"
                    >
                      Bez kosza
                    </button>
                    <button
                      class="toggle-btn"
                      :class="{ selected: state.cage === 'with-cage' }"
                      @click="state.cage = 'with-cage'"
                    >
                      Z koszem ochronnym
                    </button>
                  </div>
                  <div v-if="state.cage === 'with-cage'" class="cage-options" style="margin-top: 1rem;">
                    <label class="customer-checkbox">
                      <input type="checkbox" v-model="state.cageClosing" />
                      <span class="customer-checkbox-box">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                          <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                      </span>
                      <span class="customer-checkbox-text">
                        Zamykanie kosza od dolu
                        <small>blokada dostepu do drabiny</small>
                      </span>
                    </label>
                    <label class="customer-checkbox">
                      <input type="checkbox" v-model="state.restingPlatform" />
                      <span class="customer-checkbox-box">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                          <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                      </span>
                      <span class="customer-checkbox-text">
                        Podest spoczynkowy
                        <small>wymagany dla drabin o wysokości ściany powyżej 10m</small>
                      </span>
                    </label>
                  </div>
                </div>

                <!-- KROK 4: Wymiary scian -->
                <div v-if="customerWizardStep === 4" class="wizard-step">
                  <!-- Dla przejścia attykowego lub murka - dwie sekcje wysokości -->
                  <template v-if="customerLadderEnding === 'attic-passage' || customerRoofType === 'with-parapet'">
                    <h4 class="section-title">Strona drabiny (wejscie)</h4>
                    <div class="form-group">
                      <label>Wysokosc sciany</label>
                      <div class="input-with-unit">
                        <input
                          type="number"
                          v-model.number="state.wallHeight"
                          min="0.6"
                          max="30"
                          step="0.1"
                        />
                        <span class="unit">m</span>
                      </div>
                      <span class="hint">Od 0.6 m do 30 m</span>
                    </div>

                    <h4 class="section-title" style="margin-top: 1.5rem;">Strona dachu (zejscie)</h4>
                    <div class="form-group">
                      <label>Wysokosc murka attykowego</label>
                      <div class="input-with-unit">
                        <input
                          type="number"
                          v-model.number="state.atticWallHeight"
                          min="0"
                          :max="state.wallHeight"
                          step="0.1"
                        />
                        <span class="unit">m</span>
                      </div>
                      <span class="hint">Wysokosc murka nad dachem (0 = brak murka)</span>
                    </div>
                  </template>

                  <!-- Dla klasycznej/z podestem bez murka - tylko wysokość ściany -->
                  <template v-else>
                    <div class="form-group">
                      <label>Wysokosc sciany</label>
                      <div class="input-with-unit">
                        <input
                          type="number"
                          v-model.number="state.wallHeight"
                          min="0.6"
                          max="30"
                          step="0.1"
                        />
                        <span class="unit">m</span>
                      </div>
                      <span class="hint">Od 0.6 m do 30 m</span>
                    </div>
                    <div class="form-group">
                      <label>Grubość całkowita ocieplenia</label>
                      <div class="input-with-unit">
                        <input
                          type="number"
                          v-model.number="state.insulationThickness"
                          min="0"
                          max="30"
                          step="1"
                        />
                        <span class="unit">cm</span>
                      </div>
                      <span class="hint">Styropian, welna lub inne (0-30 cm)</span>
                    </div>
                  </template>
                </div>

                <!-- KROK 5: Izolacja (dla attyki/murka) -->
                <div v-if="customerWizardStep === 5" class="wizard-step">
                  <h4>Strona drabiny (wejscie)</h4>
                  <div class="form-group">
                    <label>Grubosc izolacji</label>
                    <div class="input-with-unit">
                      <input
                        type="number"
                        v-model.number="state.atticInsulationThickness"
                        min="0"
                        max="30"
                        step="1"
                        @input="state.atticHasInsulation = state.atticInsulationThickness > 0"
                      />
                      <span class="unit">cm</span>
                    </div>
                  </div>

                  <h4 style="margin-top: 1.5rem;">Strona dachu (zejscie)</h4>
                  <div class="form-group">
                    <label>Grubosc izolacji</label>
                    <div class="input-with-unit">
                      <input
                        type="number"
                        v-model.number="state.atticBackInsulationThickness"
                        min="0"
                        max="30"
                        step="1"
                        @input="state.atticBackHasInsulation = state.atticBackInsulationThickness > 0"
                      />
                      <span class="unit">cm</span>
                    </div>
                  </div>

                  <h4 style="margin-top: 1.5rem;">Murek attykowy</h4>
                  <div class="form-group">
                    <label>Grubosc murka</label>
                    <div class="input-with-unit">
                      <input
                        type="number"
                        v-model.number="state.atticWallThickness"
                        min="10"
                        max="60"
                        step="1"
                      />
                      <span class="unit">cm</span>
                    </div>
                    <span class="hint">Grubosc sciany attyki (10-60 cm)</span>
                  </div>
                </div>

                <!-- KROK 6: Okap (tylko dla with-eave) -->
                <div v-if="customerWizardStep === 6" class="wizard-step">
                  <div class="form-group">
                    <label>Glebokosc okapu</label>
                    <p class="input-hint">Jak daleko okap wystaje od sciany w strone drabiny</p>
                    <div class="input-with-unit">
                      <input
                        type="number"
                        v-model.number="state.eaveDepth"
                        min="1"
                        max="80"
                        step="1"
                      />
                      <span class="unit">cm</span>
                    </div>
                  </div>
                  <div class="form-group">
                    <label>Wysokosc okapu</label>
                    <p class="input-hint">Pionowy wymiar okapu</p>
                    <div class="input-with-unit">
                      <input
                        type="number"
                        v-model.number="state.eaveHeight"
                        min="1"
                        max="200"
                        step="1"
                      />
                      <span class="unit">cm</span>
                    </div>
                  </div>
                </div>

                <!-- KROK 7: Przeszkody -->
                <div v-if="customerWizardStep === 7" class="wizard-step">
                  <div class="toggle-options">
                    <button
                      class="toggle-btn"
                      :class="{ selected: state.obstacles.length === 0 }"
                      @click="state.hasObstacles = false; state.obstacles = []"
                    >
                      Brak przeszkod
                    </button>
                    <button
                      class="toggle-btn"
                      :class="{ selected: state.obstacles.length > 0 }"
                      @click="addFirstObstacle"
                    >
                      Mam przeszkody
                    </button>
                  </div>
                  <div v-if="state.obstacles.length > 0" class="obstacles-section">
                    <!-- Lista przeszkód z edytowalnymi inputami -->
                    <div class="obstacles-list-customer">
                      <div v-for="(obs, index) in state.obstacles" :key="obs.id" class="obstacle-item-editable">
                        <div class="obstacle-header">
                          <span class="obstacle-number">Przeszkoda {{ index + 1 }}</span>
                          <button class="obstacle-remove-btn" @click="removeObstacle(obs.id)">Usun</button>
                        </div>
                        <div class="form-row-customer">
                          <div class="form-group">
                            <label>Od ziemi</label>
                            <div class="input-with-unit">
                              <input type="number" v-model.number="obs.heightFrom" min="0" :max="state.wallHeight - 0.5" step="0.1" />
                              <span class="unit">m</span>
                            </div>
                          </div>
                          <div class="form-group">
                            <label>Wysokosc</label>
                            <div class="input-with-unit">
                              <input type="number" v-model.number="obs.height" min="0.1" max="3" step="0.1" />
                              <span class="unit">m</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                    <!-- Przycisk dodawania kolejnej -->
                    <button class="add-obstacle-btn" @click="addCustomerObstacle">+ Dodaj kolejna przeszkode</button>
                  </div>
                </div>

                <!-- KROK 8: Zawieszenie -->
                <div v-if="customerWizardStep === 8" class="wizard-step">
                  <div class="toggle-options-with-desc">
                    <button
                      class="toggle-btn-desc"
                      :class="{ selected: !state.suspended }"
                      @click="state.suspended = false"
                    >
                      <span class="toggle-label">Drabina do ziemi</span>
                      <span class="toggle-desc">Można wejść bezpośrednio z poziomu gruntu</span>
                    </button>
                    <button
                      class="toggle-btn-desc"
                      :class="{ selected: state.suspended }"
                      @click="state.suspended = true"
                    >
                      <span class="toggle-label">Drabina zawieszona</span>
                      <span class="toggle-desc">Drabina zaczyna się wyżej nad ziemią</span>
                    </button>
                  </div>
                  <div v-if="state.suspended" class="suspended-height">
                    <label>Wysokosc zawieszenia</label>
                    <div class="input-with-unit">
                      <input
                        type="number"
                        v-model.number="state.suspendedHeight"
                        min="0"
                        max="5"
                        step="0.1"
                      />
                      <span class="unit">m</span>
                    </div>
                    <span class="hint">Odleglosc od ziemi do dolu drabiny (0 - 5 m)</span>

                    <!-- Dostawiana drabina - tylko gdy zawieszenie <= 2m -->
                    <div v-if="state.suspendedHeight > 0 && state.suspendedHeight <= 2" class="form-group" style="margin-top: 1rem;">
                      <label class="checkbox-wrapper-styled">
                        <input type="checkbox" v-model="state.portableLadder">
                        <span class="checkbox-custom-styled">
                          <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3">
                            <path d="M5 12l5 5L20 7"/>
                          </svg>
                        </span>
                        <span class="checkbox-label-styled">
                          <span class="label-title">Dostawiana drabina</span>
                          <span class="label-description">Drabina przenośna do wejścia na drabinę stałą</span>
                        </span>
                      </label>
                    </div>
                  </div>

                </div>

                <!-- KROK 9: Podsumowanie -->
                <div v-if="customerWizardStep === 9" class="wizard-step">
                  <!-- Wskazówka interakcji z modelem 3D -->
                  <div class="interaction-hint" style="margin-bottom: 1.5rem; padding: 14px 16px; background: rgba(52, 152, 219, 0.1); border-radius: 10px; border-left: 4px solid #3498db;">
                    <p style="margin: 0; color: #3498db; font-size: 0.9rem; line-height: 1.5;">
                      <strong>Wskazówka:</strong> Teraz możesz obracać i przesuwać model drabiny, aby dokładnie przyjrzeć się temu, co zamierzasz zamówić.
                    </p>
                  </div>

                  <!-- Edytowalna lista podsumowania -->
                  <div class="summary-list">
                    <!-- Zakończenie drabiny - rozwijalna edycja -->
                    <div class="summary-expand-item" :class="{ expanded: summaryExpandedItem === 'scheme' }">
                      <div class="summary-expand-header" @click="summaryExpandedItem = summaryExpandedItem === 'scheme' ? null : 'scheme'">
                        <div class="summary-edit-content">
                          <span class="summary-edit-label">Zakończenie drabiny</span>
                          <span class="summary-edit-value">
                            {{ customerLadderEnding === 'classic' ? 'Klasyczne' : customerLadderEnding === 'platform' ? 'Z podestem' : 'Przełaz attykowy' }}
                            <span v-if="state.atticWallHeight > 0.3 && customerLadderEnding === 'attic-passage'" class="locked-icon" title="Wymagane dla murka > 0.3m">🔒</span>
                          </span>
                        </div>
                        <span class="summary-expand-icon">{{ summaryExpandedItem === 'scheme' ? '▲' : '▼' }}</span>
                      </div>
                      <div v-if="summaryExpandedItem === 'scheme'" class="summary-expand-content">
                        <div class="toggle-options-vertical">
                          <button
                            class="toggle-btn-vertical"
                            :class="{ selected: customerLadderEnding === 'classic', disabled: state.atticWallHeight > 0.3 }"
                            :disabled="state.atticWallHeight > 0.3"
                            @click="state.atticWallHeight <= 0.3 && setCustomerLadderEnding('classic')"
                          >
                            <span class="toggle-btn-text">Klasyczne z poręczami</span>
                            <span v-if="state.atticWallHeight > 0.3" class="toggle-btn-lock">🔒</span>
                          </button>
                          <button
                            class="toggle-btn-vertical"
                            :class="{ selected: customerLadderEnding === 'platform', disabled: state.atticWallHeight > 0.3 }"
                            :disabled="state.atticWallHeight > 0.3"
                            @click="state.atticWallHeight <= 0.3 && setCustomerLadderEnding('platform')"
                          >
                            <span class="toggle-btn-text">Z podestem</span>
                            <span v-if="state.atticWallHeight > 0.3" class="toggle-btn-lock">🔒</span>
                          </button>
                          <button
                            v-if="customerRoofType === 'with-parapet'"
                            class="toggle-btn-vertical"
                            :class="{ selected: customerLadderEnding === 'attic-passage' }"
                            @click="setCustomerLadderEnding('attic-passage')"
                          >
                            <span class="toggle-btn-text">Przełaz attykowy</span>
                            <span v-if="state.atticWallHeight > 0.3" class="toggle-btn-required">wymagany</span>
                          </button>
                        </div>
                        <p v-if="state.atticWallHeight > 0.3" class="scheme-lock-info">
                          Murek attykowy > 0.3m wymaga przełazu attykowego
                        </p>
                      </div>
                    </div>

                    <!-- Wysokość ściany - rozwijalna edycja -->
                    <div class="summary-expand-item" :class="{ expanded: summaryExpandedItem === 'height' }">
                      <div class="summary-expand-header" @click="summaryExpandedItem = summaryExpandedItem === 'height' ? null : 'height'">
                        <div class="summary-edit-content">
                          <span class="summary-edit-label">Wysokość ściany</span>
                          <span class="summary-edit-value" v-if="customerLadderEnding === 'attic-passage'">{{ state.wallHeight }}m | {{ state.atticWallHeight }}m</span>
                          <span class="summary-edit-value" v-else>{{ state.wallHeight }} m</span>
                        </div>
                        <span class="summary-expand-icon">{{ summaryExpandedItem === 'height' ? '▲' : '▼' }}</span>
                      </div>
                      <div v-if="summaryExpandedItem === 'height'" class="summary-expand-content">
                        <div v-if="customerLadderEnding === 'attic-passage'" class="summary-dual-inputs">
                          <div class="form-group compact">
                            <label>Wejście</label>
                            <div class="input-with-unit">
                              <input type="number" v-model.number="state.wallHeight" min="0.6" max="30" step="0.1" />
                              <span class="unit">m</span>
                            </div>
                          </div>
                          <div class="form-group compact">
                            <label>Zejście</label>
                            <div class="input-with-unit">
                              <input type="number" v-model.number="state.atticWallHeight" min="0" :max="state.wallHeight" step="0.1" />
                              <span class="unit">m</span>
                            </div>
                          </div>
                        </div>
                        <div v-else class="form-group compact">
                          <div class="input-with-unit">
                            <input type="number" v-model.number="state.wallHeight" min="0.6" max="30" step="0.1" />
                            <span class="unit">m</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <!-- Ocieplenie - dla attyki -->
                    <div v-if="customerLadderEnding === 'attic-passage'" class="summary-expand-item" :class="{ expanded: summaryExpandedItem === 'insulation' }">
                      <div class="summary-expand-header" @click="summaryExpandedItem = summaryExpandedItem === 'insulation' ? null : 'insulation'">
                        <div class="summary-edit-content">
                          <span class="summary-edit-label">Ocieplenie</span>
                          <span class="summary-edit-value">{{ state.atticInsulationThickness }}cm | {{ state.atticBackInsulationThickness }}cm</span>
                        </div>
                        <span class="summary-expand-icon">{{ summaryExpandedItem === 'insulation' ? '▲' : '▼' }}</span>
                      </div>
                      <div v-if="summaryExpandedItem === 'insulation'" class="summary-expand-content">
                        <div class="summary-dual-inputs">
                          <div class="form-group compact">
                            <label>Wejście</label>
                            <div class="input-with-unit">
                              <input type="number" v-model.number="state.atticInsulationThickness" min="0" max="30" step="1" />
                              <span class="unit">cm</span>
                            </div>
                          </div>
                          <div class="form-group compact">
                            <label>Zejście</label>
                            <div class="input-with-unit">
                              <input type="number" v-model.number="state.atticBackInsulationThickness" min="0" max="30" step="1" />
                              <span class="unit">cm</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <!-- Grubość murka - dla attyki -->
                    <div v-if="customerLadderEnding === 'attic-passage'" class="summary-expand-item" :class="{ expanded: summaryExpandedItem === 'wallThickness' }">
                      <div class="summary-expand-header" @click="summaryExpandedItem = summaryExpandedItem === 'wallThickness' ? null : 'wallThickness'">
                        <div class="summary-edit-content">
                          <span class="summary-edit-label">Grubość murka</span>
                          <span class="summary-edit-value">{{ state.atticWallThickness }} cm</span>
                        </div>
                        <span class="summary-expand-icon">{{ summaryExpandedItem === 'wallThickness' ? '▲' : '▼' }}</span>
                      </div>
                      <div v-if="summaryExpandedItem === 'wallThickness'" class="summary-expand-content">
                        <div class="form-group compact">
                          <div class="input-with-unit">
                            <input type="number" v-model.number="state.atticWallThickness" min="10" max="60" step="1" />
                            <span class="unit">cm</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <!-- Ocieplenie - dla płaskiego dachu lub z okapem (nie attyka) -->
                    <div v-if="customerLadderEnding !== 'attic-passage'" class="summary-expand-item" :class="{ expanded: summaryExpandedItem === 'simpleInsulation' }">
                      <div class="summary-expand-header" @click="summaryExpandedItem = summaryExpandedItem === 'simpleInsulation' ? null : 'simpleInsulation'">
                        <div class="summary-edit-content">
                          <span class="summary-edit-label">Ocieplenie</span>
                          <span class="summary-edit-value">{{ state.insulationThickness }} cm</span>
                        </div>
                        <span class="summary-expand-icon">{{ summaryExpandedItem === 'simpleInsulation' ? '▲' : '▼' }}</span>
                      </div>
                      <div v-if="summaryExpandedItem === 'simpleInsulation'" class="summary-expand-content">
                        <div class="form-group compact">
                          <div class="input-with-unit">
                            <input type="number" v-model.number="state.insulationThickness" min="0" max="30" step="1" />
                            <span class="unit">cm</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <!-- Parametry okapu - dla dachu z okapem -->
                    <div v-if="customerRoofType === 'with-eave'" class="summary-expand-item" :class="{ expanded: summaryExpandedItem === 'eave' }">
                      <div class="summary-expand-header" @click="summaryExpandedItem = summaryExpandedItem === 'eave' ? null : 'eave'">
                        <div class="summary-edit-content">
                          <span class="summary-edit-label">Okap</span>
                          <span class="summary-edit-value">{{ state.eaveDepth }}cm x {{ state.eaveHeight }}cm</span>
                        </div>
                        <span class="summary-expand-icon">{{ summaryExpandedItem === 'eave' ? '▲' : '▼' }}</span>
                      </div>
                      <div v-if="summaryExpandedItem === 'eave'" class="summary-expand-content">
                        <div class="summary-dual-inputs">
                          <div class="form-group compact">
                            <label>Głębokość</label>
                            <div class="input-with-unit">
                              <input type="number" v-model.number="state.eaveDepth" min="1" max="80" step="1" />
                              <span class="unit">cm</span>
                            </div>
                          </div>
                          <div class="form-group compact">
                            <label>Wysokość</label>
                            <div class="input-with-unit">
                              <input type="number" v-model.number="state.eaveHeight" min="1" max="200" step="1" />
                              <span class="unit">cm</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <!-- Kosz ochronny - rozwijalna edycja -->
                    <div class="summary-expand-item" :class="{ expanded: summaryExpandedItem === 'cage' }">
                      <div class="summary-expand-header" @click="summaryExpandedItem = summaryExpandedItem === 'cage' ? null : 'cage'">
                        <div class="summary-edit-content">
                          <span class="summary-edit-label">Kosz ochronny</span>
                          <span class="summary-edit-value">{{ state.cage === 'with-cage' ? 'Tak' : 'Nie' }}</span>
                        </div>
                        <span class="summary-expand-icon">{{ summaryExpandedItem === 'cage' ? '▲' : '▼' }}</span>
                      </div>
                      <div v-if="summaryExpandedItem === 'cage'" class="summary-expand-content">
                        <div class="toggle-options compact">
                          <button class="toggle-btn" :class="{ selected: state.cage === 'no-cage' }" @click="state.cage = 'no-cage'">Bez kosza</button>
                          <button class="toggle-btn" :class="{ selected: state.cage === 'with-cage' }" @click="state.cage = 'with-cage'">Z koszem</button>
                        </div>
                      </div>
                    </div>

                    <!-- Zawieszenie - rozwijalna edycja -->
                    <div class="summary-expand-item" :class="{ expanded: summaryExpandedItem === 'suspended' }">
                      <div class="summary-expand-header" @click="summaryExpandedItem = summaryExpandedItem === 'suspended' ? null : 'suspended'">
                        <div class="summary-edit-content">
                          <span class="summary-edit-label">Zawieszenie</span>
                          <span class="summary-edit-value">{{ state.suspended ? state.suspendedHeight + ' m od ziemi' : 'Do ziemi' }}</span>
                        </div>
                        <span class="summary-expand-icon">{{ summaryExpandedItem === 'suspended' ? '▲' : '▼' }}</span>
                      </div>
                      <div v-if="summaryExpandedItem === 'suspended'" class="summary-expand-content">
                        <div class="toggle-options compact">
                          <button class="toggle-btn" :class="{ selected: !state.suspended }" @click="state.suspended = false">Do ziemi</button>
                          <button class="toggle-btn" :class="{ selected: state.suspended }" @click="state.suspended = true">Zawieszona</button>
                        </div>
                        <div v-if="state.suspended" class="form-group compact" style="margin-top: 0.75rem;">
                          <label>Wysokość od ziemi</label>
                          <div class="input-with-unit">
                            <input type="number" v-model.number="state.suspendedHeight" min="0" max="5" step="0.1" />
                            <span class="unit">m</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <!-- Szybkie opcje -->
                  <div class="summary-quick-options">
                    <h4>Dodatkowe opcje</h4>

                    <!-- Blokada dostępu (zamykanie kosza) -->
                    <label v-if="state.cage === 'with-cage'" class="summary-quick-checkbox">
                      <input type="checkbox" v-model="state.cageClosing" />
                      <span class="checkmark"></span>
                      <span class="quick-label">
                        <span class="quick-title">Blokada dostępu</span>
                        <span class="quick-desc">Zamykany kosz ochronny</span>
                      </span>
                    </label>

                    <!-- Podest spoczynkowy -->
                    <label v-if="state.wallHeight > 5" class="summary-quick-checkbox">
                      <input type="checkbox" v-model="state.restingPlatform" />
                      <span class="checkmark"></span>
                      <span class="quick-label">
                        <span class="quick-title">Podest spoczynkowy</span>
                        <span class="quick-desc">Wymagany dla drabin powyżej 10m</span>
                      </span>
                    </label>

                    <!-- Dostawiana drabina -->
                    <label v-if="state.suspended && state.suspendedHeight <= 2" class="summary-quick-checkbox">
                      <input type="checkbox" v-model="state.portableLadder" />
                      <span class="checkmark"></span>
                      <span class="quick-label">
                        <span class="quick-title">Dostawiana drabina</span>
                        <span class="quick-desc">Przenośna drabina do wejścia</span>
                      </span>
                    </label>

                    <p v-if="state.cage !== 'with-cage' && state.wallHeight <= 5 && !(state.suspended && state.suspendedHeight <= 2)" class="no-options-hint">
                      Brak dodatkowych opcji dla tej konfiguracji
                    </p>
                  </div>
                </div>

                <!-- Fixed buttons for step 9 -->
                <div v-if="customerWizardStep === 9" class="summary-fixed-actions">
                  <button class="btn-back" @click="customerPrevStep">
                    ← Wstecz
                  </button>
                  <button class="btn-secondary" @click="addAnotherLadder">
                    + Dodaj kolejną drabinę
                  </button>
                  <button class="btn-primary" @click="goToSummary">
                    Przejdź do wyceny
                  </button>
                </div>

                <!-- Nawigacja wizarda (ukryta w podsumowaniu) -->
                <div v-if="customerWizardStep !== 9" class="wizard-nav">
                  <button
                    class="wizard-nav-btn prev"
                    :disabled="currentCustomerStepIndex <= 1"
                    @click="customerPrevStep"
                  >
                    Wstecz
                  </button>
                  <button
                    v-if="customerWizardStep < 9"
                    class="wizard-nav-btn next"
                    :disabled="(customerWizardStep === 1 && !customerRoofType) || (customerWizardStep === 2 && !customerLadderEnding)"
                    @click="customerNextStep"
                  >
                    Dalej
                  </button>
                </div>
              </div>

              <!-- ============================================ -->
              <!-- NORMALNE INPUTY DLA ADMIN MODE -->
              <!-- ============================================ -->
              <div v-if="!isCustomerMode" class="config-panel-content">
                <!-- Typ drabiny (read-only info) -->
                <div class="config-type-badge">
                  <span class="type-label">Typ drabiny:</span>
                  <span class="type-value">{{ state.purpose === 'external' ? 'Zewnętrzna' : 'Wewnętrzna' }}</span>
                </div>

                <!-- Schemat zakończenia (tylko dla zewnętrznej) -->
                <div v-if="state.purpose === 'external'" class="form-group">
                  <label>Schemat zakończenia drabiny</label>
                  <div class="scheme-selector">
                    <div
                      class="scheme-option"
                      :class="{ selected: state.scheme === 'no-platform' }"
                      @click="selectScheme('no-platform')"
                    >
                      <div class="scheme-icon">&#128270;</div>
                      <div class="scheme-label">Klasyczna</div>
                      <div class="scheme-desc">Z poręczami asekuracyjnymi</div>
                    </div>
                    <div
                      class="scheme-option"
                      :class="{ selected: state.scheme === 'with-platform' }"
                      @click="selectScheme('with-platform')"
                    >
                      <div class="scheme-icon">&#128187;</div>
                      <div class="scheme-label">Z podestem</div>
                      <div class="scheme-desc">Platforma wyjściowa na dachu</div>
                    </div>
                    <div
                      class="scheme-option"
                      :class="{ selected: state.scheme === 'attic-passage' }"
                      @click="selectScheme('attic-passage')"
                    >
                      <div class="scheme-icon">&#127970;</div>
                      <div class="scheme-label">Przejście przez attykę</div>
                      <div class="scheme-desc">Do budynków z attyką</div>
                    </div>
                  </div>
                </div>

                <!-- ============================================ -->
                <!-- STRONA WEJŚCIA (tylko dla attic-passage) -->
                <!-- ============================================ -->
                <div v-if="state.scheme === 'attic-passage'" class="form-section attic-entry-section">
                  <div class="form-section-title">Strona wejścia</div>

                  <!-- Wysokość ściany (strona wejścia) -->
                  <div class="form-group">
                    <label for="wallHeightEntry">Wysokość ściany</label>
                    <div class="input-with-unit">
                      <input
                        type="number"
                        id="wallHeightEntry"
                        v-model.number="state.wallHeight"
                        min="0.6"
                        max="30"
                        step="0.1"
                        class="form-input"
                        @blur="validateWallHeight"
                      />
                      <span class="unit">m</span>
                    </div>
                    <div class="hint">Zakres: 0.6 - 30 m</div>
                  </div>

                  <!-- Grubość ściany -->
                  <div class="form-group">
                    <label for="atticWallThickness">Grubość ściany</label>
                    <div class="input-with-unit">
                      <input
                        type="number"
                        id="atticWallThickness"
                        v-model.number="state.atticWallThickness"
                        min="10"
                        :max="atticWallThicknessMax"
                        step="1"
                        class="form-input input-small"
                        placeholder="25"
                      />
                      <span class="unit">cm</span>
                    </div>
                    <div class="hint">Grubość ściany attyki (10-{{ atticWallThicknessMax }} cm)</div>
                  </div>

                  <!-- Rodzaj wsporników (tylko debug) -->
                  <div v-if="debugMode" class="form-group">
                    <label for="bracketTypeEntry">Rodzaj wsporników</label>
                    <select id="bracketTypeEntry" v-model="state.bracketType" class="form-select" @change="onBracketChange">
                      <option value="short">Krótkie (16-26 cm)</option>
                      <option value="medium">Średnie (26-36 cm)</option>
                      <option value="long">Długie (36-46 cm)</option>
                    </select>
                  </div>

                  <!-- Ocieplenie strona wejścia -->
                  <div class="form-group">
                    <label class="checkbox-wrapper-styled">
                      <input type="checkbox" v-model="state.atticHasInsulation">
                      <span class="checkbox-custom-styled">
                        <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3">
                          <path d="M5 12l5 5L20 7"/>
                        </svg>
                      </span>
                      <span class="checkbox-label-styled">
                        <span class="label-title">Ocieplenie</span>
                        <span class="label-description">Warstwa izolacji od strony drabiny</span>
                      </span>
                    </label>
                  </div>

                  <!-- Grubość ocieplenia - tylko gdy włączone -->
                  <div v-if="state.atticHasInsulation" class="form-group">
                    <label for="atticInsulationThickness">Grubość ocieplenia</label>
                    <div class="input-with-unit">
                      <input
                        type="number"
                        id="atticInsulationThickness"
                        v-model.number="state.atticInsulationThickness"
                        min="1"
                        :max="atticInsulationMax"
                        step="1"
                        class="form-input input-small"
                        placeholder="10"
                      />
                      <span class="unit">cm</span>
                    </div>
                    <div class="hint">Grubość ocieplenia (1-{{ atticInsulationMax }} cm)</div>
                  </div>

                  <!-- Kosz ochronny -->
                  <div class="form-group">
                    <label>Kosz ochronny</label>
                    <div class="cage-selector">
                      <div
                        class="cage-option"
                        :class="{ selected: state.cage === 'no-cage' }"
                        @click="selectCage('no-cage')"
                      >
                        <div class="cage-icon">&#10060;</div>
                        <div class="cage-content">
                          <div class="cage-label">Bez kosza</div>
                          <div class="cage-desc">Drabina bez zabezpieczenia bocznego</div>
                        </div>
                      </div>
                      <div
                        class="cage-option"
                        :class="{ selected: state.cage === 'with-cage' }"
                        @click="selectCage('with-cage')"
                      >
                        <div class="cage-icon">&#128737;</div>
                        <div class="cage-content">
                          <div class="cage-label">Z koszem ochronnym</div>
                          <div class="cage-desc">Obowiązkowy przy wysokości powyżej 3m (wg przepisów BHP)</div>
                        </div>
                      </div>
                    </div>

                    <!-- Dodatkowe opcje kosza (widoczne gdy kosz wybrany) -->
                    <div v-if="state.cage === 'with-cage'" class="cage-options">
                      <label class="checkbox-wrapper-styled">
                        <input type="checkbox" v-model="state.accessLock">
                        <span class="checkbox-custom-styled">
                          <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3">
                            <path d="M5 12l5 5L20 7"/>
                          </svg>
                        </span>
                        <span class="checkbox-label-styled">
                          <span class="label-title">Blokada dostępu</span>
                          <span class="label-description">Zamykana klapka uniemożliwiająca wejście osobom niepowołanym</span>
                        </span>
                      </label>
                      <label class="checkbox-wrapper-styled">
                        <input type="checkbox" v-model="state.restingPlatform">
                        <span class="checkbox-custom-styled">
                          <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3">
                            <path d="M5 12l5 5L20 7"/>
                          </svg>
                        </span>
                        <span class="checkbox-label-styled">
                          <span class="label-title">Podest spoczynkowy</span>
                          <span class="label-description">Platforma do odpoczynku przy długich drabinach</span>
                        </span>
                      </label>
                    </div>
                  </div>

                </div>

                <!-- ============================================ -->
                <!-- OPCJE DODATKOWE (tylko dla attic-passage) -->
                <!-- ============================================ -->
                <div v-if="state.scheme === 'attic-passage'" class="form-section attic-options-section">
                  <div class="form-section-title">Opcje dodatkowe</div>

                  <!-- Drabina zawieszona -->
                  <div class="form-group">
                    <label class="checkbox-wrapper-styled">
                      <input type="checkbox" v-model="state.suspended" @change="toggleSuspended">
                      <span class="checkbox-custom-styled">
                        <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3">
                          <path d="M5 12l5 5L20 7"/>
                        </svg>
                      </span>
                      <span class="checkbox-label-styled">
                        <span class="label-title">Drabina zawieszona nad ziemią</span>
                        <span class="label-description">Drabina nie sięga poziomu gruntu</span>
                      </span>
                    </label>

                    <div v-if="state.suspended" class="conditional-field">
                      <label for="suspendedHeightAttic">Wysokość zawieszenia nad ziemią</label>
                      <div class="input-with-unit">
                        <input
                          type="number"
                          id="suspendedHeightAttic"
                          v-model.number="state.suspendedHeight"
                          min="0"
                          :max="maxSuspendedHeight"
                          step="0.1"
                          class="form-input"
                        >
                        <span class="unit">m</span>
                      </div>
                      <div class="hint">Maksymalnie: {{ maxSuspendedHeight.toFixed(1) }} m</div>
                    </div>
                  </div>

                  <!-- Przeszkody w miejscu montażu -->
                  <div class="form-group">
                    <label class="checkbox-wrapper-styled">
                      <input type="checkbox" v-model="state.hasObstacles">
                      <span class="checkbox-custom-styled">
                        <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3">
                          <path d="M5 12l5 5L20 7"/>
                        </svg>
                      </span>
                      <span class="checkbox-label-styled">
                        <span class="label-title">Przeszkody w miejscu montażu</span>
                        <span class="label-description">Okna lub inne elementy uniemożliwiające montaż</span>
                      </span>
                    </label>

                    <!-- Wybór typu przeszkody -->
                    <div v-if="state.hasObstacles" class="conditional-field">
                      <div class="obstacle-type-selector">
                        <!-- Okno / miejsce bez wsporników -->
                        <div class="obstacle-type-card obstacle-type-card--window" @click="addObstacle">
                          <div class="obstacle-type-photo">
                            <svg viewBox="0 0 80 60" fill="none" class="window-svg">
                              <!-- Wall (side view) -->
                              <rect x="5" y="5" width="14" height="50" fill="#9ca3af" stroke="#6b7280" stroke-width="1"/>
                              <!-- Window area on wall - nice blue -->
                              <rect x="5" y="18" width="14" height="20" fill="#3b82f6" fill-opacity="0.4" stroke="#60a5fa" stroke-width="1.5"/>
                              <!-- Window cross -->
                              <line x1="12" y1="18" x2="12" y2="38" stroke="#93c5fd" stroke-width="1"/>
                              <line x1="5" y1="28" x2="19" y2="28" stroke="#93c5fd" stroke-width="1"/>
                              <!-- Bracket above window -->
                              <line x1="19" y1="12" x2="35" y2="12" stroke="#6b7280" stroke-width="3"/>
                              <circle cx="35" cy="12" r="2" fill="#4b5563"/>
                              <!-- Bracket below window -->
                              <line x1="19" y1="48" x2="35" y2="48" stroke="#6b7280" stroke-width="3"/>
                              <circle cx="35" cy="48" r="2" fill="#4b5563"/>
                              <!-- Dimension arrows - blue -->
                              <line x1="42" y1="18" x2="42" y2="38" stroke="#60a5fa" stroke-width="1.5"/>
                              <polygon points="39,20 42,15 45,20" fill="#60a5fa"/>
                              <polygon points="39,36 42,41 45,36" fill="#60a5fa"/>
                            </svg>
                          </div>
                          <div class="obstacle-type-label">Okno / miejsce bez wsporników</div>
                          <div class="obstacle-type-desc">Obszar gdzie nie można zamontować uchwytów</div>
                        </div>

                        <!-- Punkt na ścianie - tylko w debug mode -->
                        <div v-if="debugMode" class="obstacle-type-card obstacle-type-card--wall-point" @click="addWallPoint">
                          <div class="obstacle-type-photo">
                            <svg viewBox="0 0 80 60" fill="none" class="wall-point-svg">
                              <!-- Wall (side view) -->
                              <rect x="5" y="5" width="14" height="50" fill="#9ca3af" stroke="#6b7280" stroke-width="1"/>
                              <!-- Green point area on wall -->
                              <rect x="5" y="18" width="14" height="20" fill="#22c55e" fill-opacity="0.4" stroke="#16a34a" stroke-width="1.5"/>
                              <!-- Crosshair -->
                              <line x1="12" y1="23" x2="12" y2="33" stroke="#15803d" stroke-width="1.5"/>
                              <line x1="7" y1="28" x2="17" y2="28" stroke="#15803d" stroke-width="1.5"/>
                              <!-- Brackets still visible -->
                              <line x1="19" y1="12" x2="35" y2="12" stroke="#6b7280" stroke-width="3"/>
                              <circle cx="35" cy="12" r="2" fill="#4b5563"/>
                              <line x1="19" y1="28" x2="35" y2="28" stroke="#6b7280" stroke-width="3"/>
                              <circle cx="35" cy="28" r="2" fill="#4b5563"/>
                              <line x1="19" y1="48" x2="35" y2="48" stroke="#6b7280" stroke-width="3"/>
                              <circle cx="35" cy="48" r="2" fill="#4b5563"/>
                            </svg>
                          </div>
                          <div class="obstacle-type-label">Punkt na ścianie</div>
                          <div class="obstacle-type-desc">Zaznaczenie bez wpływu na uchwyty</div>
                        </div>

                        <!-- Okap -->
                        <div
                          class="obstacle-type-card obstacle-type-card--eave"
                          :class="{ 'is-active': state.hasEave, 'is-disabled': state.hasEave }"
                          @click="!state.hasEave && toggleEave()"
                        >
                          <div class="obstacle-type-photo">
                            <svg viewBox="0 0 80 60" fill="none" class="eave-svg">
                              <!-- Wall (side view) -->
                              <rect x="5" y="18" width="14" height="40" fill="#9ca3af" stroke="#6b7280" stroke-width="1"/>
                              <!-- Eave/okap -->
                              <rect x="5" y="8" width="55" height="12" fill="#d1d5db" stroke="#9ca3af" stroke-width="1"/>
                              <!-- Eave shadow/depth -->
                              <rect x="19" y="18" width="41" height="3" fill="rgba(0,0,0,0.15)"/>
                              <!-- Depth arrow -->
                              <line x1="19" y1="3" x2="60" y2="3" stroke="#f59e0b" stroke-width="2"/>
                              <polygon points="57,0 62,3 57,6" fill="#f59e0b"/>
                              <line x1="19" y1="0" x2="19" y2="6" stroke="#f59e0b" stroke-width="1"/>
                              <!-- Height arrow -->
                              <line x1="68" y1="8" x2="68" y2="20" stroke="#60a5fa" stroke-width="2"/>
                              <polygon points="65,10 68,5 71,10" fill="#60a5fa"/>
                              <polygon points="65,18 68,23 71,18" fill="#60a5fa"/>
                              <!-- Label hints -->
                              <text x="38" y="3" font-size="6" fill="#f59e0b" text-anchor="middle">głęb.</text>
                              <text x="75" y="16" font-size="6" fill="#60a5fa" text-anchor="middle">wys.</text>
                            </svg>
                          </div>
                          <div class="obstacle-type-label">
                            Okap/rynna
                            <span v-if="state.hasEave" class="badge-added">Dodano</span>
                          </div>
                          <div class="obstacle-type-desc">Wystający dach lub rynna nad drabiną</div>
                        </div>
                      </div>

                      <!-- Okap/rynna - parametry -->
                      <div v-if="state.hasEave" class="eave-settings">
                        <div class="eave-settings-header">
                          <span class="eave-title">Parametry okapu/rynny</span>
                          <button class="btn-remove-eave" @click="toggleEave" title="Usuń okap/rynnę">×</button>
                        </div>
                        <div class="eave-inputs">
                          <div class="input-group-small">
                            <label>Głębokość (cm)</label>
                            <input
                              type="number"
                              v-model.number="state.eaveDepth"
                              min="1"
                              max="80"
                              step="1"
                              class="form-input-small"
                              title="Jak daleko okap wystaje w stronę drabiny"
                            >
                          </div>
                          <div class="input-group-small">
                            <label>Wysokość (cm)</label>
                            <input
                              type="number"
                              v-model.number="state.eaveHeight"
                              min="1"
                              max="200"
                              step="1"
                              class="form-input-small"
                              title="Wysokość okapu"
                            >
                          </div>
                        </div>
                      </div>

                      <!-- Lista okien/przeszkód -->
                      <div v-if="state.obstacles.length > 0" class="obstacles-list">
                        <div class="obstacles-list-header">Okna i przeszkody</div>
                        <div v-for="obstacle in state.obstacles" :key="obstacle.id" class="obstacle-item">
                          <div class="obstacle-inputs">
                            <div class="input-group-small">
                              <label>Od ziemi (m)</label>
                              <input type="number" v-model.number="obstacle.heightFrom" min="0" :max="state.wallHeight" step="0.1" class="form-input-small" title="Odległość od ziemi do dolnej krawędzi przeszkody">
                            </div>
                            <div class="input-group-small">
                              <label>Wysokość (m)</label>
                              <input type="number" v-model.number="obstacle.height" min="0.1" :max="state.wallHeight - obstacle.heightFrom" step="0.1" class="form-input-small" title="Wysokość przeszkody">
                            </div>
                            <button class="btn-remove-obstacle" @click="removeObstacle(obstacle.id)" title="Usuń">×</button>
                          </div>
                          <div class="obstacle-preview">
                            <span :class="['obstacle-badge', obstacle.type === 'wall-point' ? 'type-wall-point' : 'type-window']">{{ obstacle.type === 'wall-point' ? 'Punkt' : 'Okno' }}</span>
                            <span class="obstacle-range">{{ obstacle.heightFrom.toFixed(1) }}m - {{ (obstacle.heightFrom + obstacle.height).toFixed(1) }}m</span>
                          </div>
                        </div>
                      </div>

                      <!-- Ostrzeżenie o przeszkodzie ponad ścianą -->
                      <div v-if="obstacleAboveWallWarning" class="obstacle-above-wall-warning">
                        <div class="obstacle-warning-icon">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M12 9v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                          </svg>
                        </div>
                        <div class="obstacle-warning-text">{{ obstacleAboveWallWarning }}</div>
                      </div>

                      <!-- Ostrzeżenie o kolizji uchwytów -->
                      <div v-if="collisionWarning" class="collision-warning">
                        <div class="collision-warning-icon">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M12 9v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                          </svg>
                        </div>
                        <div class="collision-warning-text">
                          <strong>Kolizja z przeszkodą</strong>
                          <p>{{ collisionWarning.message }}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- ============================================ -->
                <!-- STRONA ZEJŚCIA (tylko dla attic-passage) -->
                <!-- ============================================ -->
                <div v-if="state.scheme === 'attic-passage'" class="form-section attic-descent-section">
                  <div class="form-section-title">Strona zejścia</div>

                  <!-- Wysokość ściany -->
                  <div class="form-group">
                    <label for="atticWallHeight">Wysokość ściany</label>
                    <div class="input-with-unit">
                      <input
                        type="number"
                        id="atticWallHeight"
                        v-model.number="state.atticWallHeight"
                        :min="state.descentMountType === 'brackets' ? 0.51 : 0"
                        :max="atticWallHeightMax"
                        step="0.01"
                        class="form-input"
                        :placeholder="state.descentMountType === 'brackets' ? 'min. 0.51' : 'np. 0.2'"
                      />
                      <span class="unit">m</span>
                    </div>
                    <div v-if="state.descentMountType === 'bigfoot' || state.descentMountType === 'custom-base'" class="hint">
                      Max. {{ atticWallHeightMax.toFixed(3) }} m dla {{ state.descentMountType === 'bigfoot' ? 'BIGFOOT' : 'podłoża ' + state.customBaseHeight + 'cm' }}
                    </div>
                  </div>

                  <!-- Ocieplenie strona zejścia -->
                  <div class="form-group">
                    <label class="checkbox-wrapper-styled">
                      <input type="checkbox" v-model="state.atticBackHasInsulation">
                      <span class="checkbox-custom-styled">
                        <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3">
                          <path d="M5 12l5 5L20 7"/>
                        </svg>
                      </span>
                      <span class="checkbox-label-styled">
                        <span class="label-title">Ocieplenie</span>
                        <span class="label-description">Warstwa izolacji od strony dachu</span>
                      </span>
                    </label>
                  </div>

                  <!-- Grubość ocieplenia - tylko gdy włączone -->
                  <div v-if="state.atticBackHasInsulation" class="form-group">
                    <label for="atticBackInsulationThickness">Grubość ocieplenia</label>
                    <div class="input-with-unit">
                      <input
                        type="number"
                        id="atticBackInsulationThickness"
                        v-model.number="state.atticBackInsulationThickness"
                        min="1"
                        :max="atticBackInsulationMax"
                        step="1"
                        class="form-input input-small"
                        placeholder="10"
                      />
                      <span class="unit">cm</span>
                    </div>
                    <div class="hint">Grubość ocieplenia (1-{{ atticBackInsulationMax }} cm)</div>
                  </div>

                  <!-- Typ montażu strona zejścia -->
                  <div class="form-group">
                    <label for="descentMountType">Typ montażu</label>
                    <select id="descentMountType" v-model="state.descentMountType" class="form-select">
                      <option value="bigfoot">Na BIGFOOT</option>
                      <option value="custom-base">Własne podłoże (bloczki/podkładki)</option>
                      <option value="brackets">Na Wspornikach</option>
                      <option value="self">Montaż na własną rękę</option>
                    </select>
                  </div>

                  <!-- Wysokość podłoża - tylko dla custom-base -->
                  <div v-if="state.descentMountType === 'custom-base'" class="form-group">
                    <label for="customBaseHeight">Wysokość podłoża (bloczków/podkładek)</label>
                    <div class="input-with-unit">
                      <input
                        type="number"
                        id="customBaseHeight"
                        v-model.number="state.customBaseHeight"
                        :min="Math.max(0, customBaseHeightMin)"
                        max="40"
                        step="0.5"
                        class="form-input input-small"
                        placeholder="np. 9"
                      />
                      <span class="unit">cm</span>
                    </div>
                    <div class="hint">
                      Wysokość podłoża (0-40 cm).
                      <span v-if="customBaseHeightMin > 0" class="warning-hint">
                        Min. {{ customBaseHeightMin.toFixed(1) }} cm dla tej konfiguracji.
                      </span>
                    </div>
                  </div>

                  <!-- Wsporniki - tylko dla brackets -->
                  <div v-if="state.descentMountType === 'brackets'" class="form-group">
                    <label for="descentBracketType">Rodzaj wsporników</label>
                    <select id="descentBracketType" v-model="state.descentBracketType" class="form-select">
                      <option value="short">Krótkie (16-26 cm)</option>
                      <option value="medium">Średnie (26-36 cm)</option>
                      <option value="long">Długie (36-46 cm)</option>
                    </select>
                  </div>

                  <!-- Kosz ochronny - dla brackets i self -->
                  <div v-if="state.descentMountType === 'brackets' || state.descentMountType === 'self'" class="form-group">
                    <label for="descentCageType">Kosz ochronny</label>
                    <select id="descentCageType" v-model="state.descentCageType" class="form-select">
                      <option value="no-cage">Bez kosza</option>
                      <option value="with-cage">Z koszem ochronnym</option>
                    </select>

                    <!-- Blokada dostępu - gdy kosz wybrany -->
                    <div v-if="state.descentCageType === 'with-cage'" class="checkbox-group" style="margin-top: 15px;">
                      <label class="checkbox-label">
                        <input type="checkbox" v-model="state.descentAccessLock" />
                        <span>Blokada dostępu (1 szt.)</span>
                      </label>
                    </div>
                  </div>

                  <!-- Wybór uchwytu - tylko dla self -->
                  <div v-if="state.descentMountType === 'self'" class="form-group">
                    <label for="selfBracketType">Wybierz uchwyt</label>
                    <select id="selfBracketType" v-model="state.selfBracketType" class="form-select">
                      <option value="ready">Gotowe uchwyty (bez wsporników)</option>
                      <option value="connecting">Uchwyt łączący (łączy tylko drabiny ze sobą)</option>
                    </select>
                  </div>

                  <!-- PARAMETRY ATTYKI -->
                  <div class="form-section-title" style="margin-top: 20px;">Parametry attyki</div>

                  <!-- Aktualny dystans podest-attyka (wyliczony) - dla bigfoot i custom-base -->
                  <div v-if="state.descentMountType === 'bigfoot' || state.descentMountType === 'custom-base'" class="form-group">
                    <div class="attic-info-box">
                      <span class="attic-info-label">Aktualny dystans podest-attyka:</span>
                      <span class="attic-info-value">{{ actualPlatformDistance.toFixed(1) }} cm</span>
                    </div>
                  </div>

                  <!-- Dystans pomiędzy podestem a attyką (input) -->
                  <div class="form-group">
                    <label for="atticMinDistance">
                      {{ state.descentMountType === 'bigfoot' || state.descentMountType === 'custom-base'
                         ? 'Minimalny dystans pomiędzy podestem a attyką'
                         : 'Dystans pomiędzy podestem a attyką' }}
                    </label>
                    <div class="input-with-unit">
                      <input
                        type="number"
                        id="atticMinDistance"
                        v-model.number="state.atticMinDistance"
                        min="0"
                        max="60"
                        step="1"
                        class="form-input input-small"
                        placeholder="0"
                      />
                      <span class="unit">cm</span>
                    </div>
                    <div class="hint">Standardowo: 5 cm. Max: 60 cm</div>
                  </div>

                  <!-- Checkbox: pozwól na mniejszy dystans (bigfoot/custom-base) -->
                  <div v-if="showLowDistanceCheckbox" class="form-group">
                    <label class="checkbox-wrapper-styled">
                      <input
                        type="checkbox"
                        :checked="state.descentMountType === 'bigfoot' ? state.bigfootAllowLowDistance : state.customBaseAllowLowDistance"
                        @change="handleLowDistanceCheckbox(($event.target as HTMLInputElement).checked)"
                      >
                      <span class="checkbox-custom-styled">
                        <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3">
                          <path d="M5 12l5 5L20 7"/>
                        </svg>
                      </span>
                      <span class="checkbox-label-styled">
                        <span class="label-title">Pozwól na mniejszy dystans niż {{ (minDistanceThresholdMm / 10).toFixed(1) }} cm</span>
                        <span class="label-description">
                          Aktualnie: {{ ((state.atticMinDistance || 0) + (state.atticWallHeight || 0) * 100).toFixed(1) }} cm
                          <span v-if="hiddenDistanceMm > 0">
                            (+ ukryty: {{ (hiddenDistanceMm / 10).toFixed(1) }} cm)
                          </span>
                        </span>
                      </span>
                    </label>
                  </div>

                  <!-- Info o szerokości murka - dla brackets -->
                  <div v-if="state.descentMountType === 'brackets'" class="form-group">
                    <div class="attic-info-box">
                      <div class="attic-info-title">Dopuszczalna szerokość murka:</div>
                      <div class="attic-info-row">
                        <span>Min:</span>
                        <span class="attic-info-value">{{ wallThicknessMin }} cm</span>
                      </div>
                      <div class="attic-info-row">
                        <span>Max:</span>
                        <span class="attic-info-value">{{ wallThicknessMax }} cm</span>
                      </div>
                    </div>
                  </div>
                </div>



                <!-- Kosz ochronny (tylko dla zewnętrznej i nie-attyki) -->
                <div v-if="state.purpose === 'external' && state.scheme !== 'attic-passage'" class="form-group">
                  <label>Kosz ochronny</label>
                  <div class="cage-selector">
                    <div
                      class="cage-option"
                      :class="{ selected: state.cage === 'no-cage' }"
                      @click="selectCage('no-cage')"
                    >
                      <div class="cage-icon">&#10060;</div>
                      <div class="cage-content">
                        <div class="cage-label">Bez kosza</div>
                        <div class="cage-desc">Drabina bez zabezpieczenia bocznego</div>
                      </div>
                    </div>
                    <div
                      class="cage-option"
                      :class="{ selected: state.cage === 'with-cage' }"
                      @click="selectCage('with-cage')"
                    >
                      <div class="cage-icon">&#128737;</div>
                      <div class="cage-content">
                        <div class="cage-label">Z koszem ochronnym</div>
                        <div class="cage-desc">Obowiązkowy przy wysokości powyżej 3m (wg przepisów BHP)</div>
                      </div>
                    </div>
                  </div>

                  <!-- Dodatkowe opcje kosza (widoczne gdy kosz wybrany) -->
                  <div v-if="state.cage === 'with-cage'" class="cage-options">
                    <label class="checkbox-wrapper-styled">
                      <input type="checkbox" v-model="state.accessLock">
                      <span class="checkbox-custom-styled">
                        <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3">
                          <path d="M5 12l5 5L20 7"/>
                        </svg>
                      </span>
                      <span class="checkbox-label-styled">
                        <span class="label-title">Blokada dostępu</span>
                        <span class="label-description">Zamykana klapka uniemożliwiająca wejście osobom niepowołanym</span>
                      </span>
                    </label>
                    <label class="checkbox-wrapper-styled">
                      <input type="checkbox" v-model="state.restingPlatform">
                      <span class="checkbox-custom-styled">
                        <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3">
                          <path d="M5 12l5 5L20 7"/>
                        </svg>
                      </span>
                      <span class="checkbox-label-styled">
                        <span class="label-title">Podest spoczynkowy</span>
                        <span class="label-description">Platforma do odpoczynku przy długich drabinach</span>
                      </span>
                    </label>
                  </div>
                </div>

                <!-- Progress bar -->
                <div class="progress-bar">
                  <div class="progress-bar-fill" :style="{ width: formProgress + '%' }"></div>
                </div>

                <!-- Wysokość ściany (nie dla attyki - jest w Strona wejścia) -->
                <div v-if="state.scheme !== 'attic-passage'" class="form-group">
                  <div v-if="wallHeightWarning" class="form-warning">{{ wallHeightWarning }}</div>
                  <label for="wallHeight">Wysokość ściany</label>
                  <div class="input-with-unit">
                    <input
                      type="number"
                      id="wallHeight"
                      v-model.number="state.wallHeight"
                      min="0.6"
                      max="30"
                      step="0.1"
                      class="form-input"
                      :class="{ invalid: wallHeightWarning }"
                      @input="validateWallHeight"
                      @blur="validateWallHeight"
                    >
                    <span class="unit">m</span>
                  </div>
                  <div class="hint">Zakres: 0.6 - 30 m</div>
                </div>

                <!-- Rodzaj wsporników (tylko debug, zewnętrzna, nie dla attic-passage) -->
                <div v-if="debugMode && state.purpose === 'external' && state.scheme !== 'attic-passage'" class="form-group bracket-group">
                  <label for="bracketType">Rodzaj wsporników</label>
                  <select
                    id="bracketType"
                    v-model="state.bracketType"
                    class="form-select"
                    @change="onBracketChange"
                  >
                    <option value="short">Krótkie (16-26 cm) - ocieplenie do 10 cm</option>
                    <option value="medium">Średnie (26-36 cm) - ocieplenie do 20 cm</option>
                    <option value="long">Długie (36-46 cm) - ocieplenie do 30 cm</option>
                    <option value="none">Bez wsporników (montaż po mojej stronie)</option>
                    <option value="custom">Inne - potrzebuję dłuższe</option>
                  </select>
                  <a href="#" class="bracket-help-link" @click.prevent="showBracketInfo = !showBracketInfo">
                    Nie wiesz który wybrać?
                  </a>

                  <!-- Popup z informacją o wspornikach -->
                  <div v-if="showBracketInfo" class="bracket-info-popup">
                    <div class="bracket-info-content">
                      <button type="button" class="popup-close" @click="showBracketInfo = false">&times;</button>
                      <h4>Jak dobrać wsporniki?</h4>
                      <p class="popup-intro">
                        Wartość w centymetrach oznacza <strong>zakres regulacji odległości</strong> od ściany do drabiny.
                      </p>
                      <ul>
                        <li><strong>16-26 cm</strong> - ocieplenie <em>do 10 cm</em></li>
                        <li><strong>26-36 cm</strong> - ocieplenie <em>do 20 cm</em></li>
                        <li><strong>36-46 cm</strong> - ocieplenie <em>do 30 cm</em></li>
                      </ul>
                      <p class="popup-note">
                        Wybierz wsporniki tak, aby zakres regulacji pokrywał grubość ocieplenia + minimum 15 cm odstępu.
                      </p>
                    </div>
                  </div>

                  <div v-if="state.bracketType === 'custom'" class="hint warning">
                    <template v-if="state.hasEave && requiredCustomBracketLength > 46">
                      Okap/rynna wymaga wsporników o długości min. <strong>{{ requiredCustomBracketLength }} cm</strong>
                      (drabina 15cm od okapu). Skontaktuj się z nami.
                    </template>
                    <template v-else>
                      Skontaktuj się z nami w sprawie niestandardowych wsporników
                    </template>
                  </div>
                </div>

                <!-- Ocieplenie przedniej ściany (tylko klasyczna/z podestem) -->
                <div v-if="state.purpose === 'external' && state.scheme !== 'attic-passage'" class="form-group">
                  <label class="checkbox-wrapper-styled">
                    <input type="checkbox" v-model="state.hasInsulation">
                    <span class="checkbox-custom-styled">
                      <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3">
                        <path d="M5 12l5 5L20 7"/>
                      </svg>
                    </span>
                    <span class="checkbox-label-styled">
                      <span class="label-title">Ocieplenie</span>
                      <span class="label-description">Warstwa izolacji na przedniej ścianie</span>
                    </span>
                  </label>

                  <!-- Grubość ocieplenia - tylko gdy włączone -->
                  <div v-if="state.hasInsulation" class="conditional-field">
                    <label for="insulationThickness">Grubość ocieplenia</label>
                    <div class="input-with-unit">
                      <input
                        type="number"
                        id="insulationThickness"
                        v-model.number="state.insulationThickness"
                        min="1"
                        max="30"
                        step="1"
                        class="form-input input-small"
                        placeholder="10"
                      />
                      <span class="unit">cm</span>
                    </div>
                    <div class="hint">Grubość ocieplenia (1-30 cm)</div>
                  </div>
                </div>

                <!-- Drabina zawieszona (tylko zewnętrzna, nie attyka) -->
                <div v-if="state.purpose === 'external' && state.scheme !== 'attic-passage'" class="form-group">
                  <label class="checkbox-wrapper-styled">
                    <input type="checkbox" v-model="state.suspended" @change="toggleSuspended">
                    <span class="checkbox-custom-styled">
                      <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3">
                        <path d="M5 12l5 5L20 7"/>
                      </svg>
                    </span>
                    <span class="checkbox-label-styled">
                      <span class="label-title">Drabina zawieszona nad ziemią</span>
                      <span class="label-description">Drabina nie sięga poziomu gruntu</span>
                    </span>
                  </label>

                  <!-- Pole warunkowe - wysokość zawieszenia -->
                  <div v-if="state.suspended" class="conditional-field">
                    <label for="suspendedHeight">Wysokość zawieszenia nad ziemią</label>
                    <div class="input-with-unit">
                      <input
                        type="number"
                        id="suspendedHeight"
                        v-model.number="state.suspendedHeight"
                        min="0"
                        :max="maxSuspendedHeight"
                        step="0.1"
                        class="form-input"
                      >
                      <span class="unit">m</span>
                    </div>
                    <div class="hint">Maksymalnie: {{ maxSuspendedHeight.toFixed(1) }} m</div>

                    <!-- Dostawiana drabina - tylko gdy zawieszenie <= 2m -->
                    <div v-if="state.suspendedHeight > 0 && state.suspendedHeight <= 2" class="form-group" style="margin-top: 1rem;">
                      <label class="checkbox-wrapper-styled">
                        <input type="checkbox" v-model="state.portableLadder">
                        <span class="checkbox-custom-styled">
                          <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3">
                            <path d="M5 12l5 5L20 7"/>
                          </svg>
                        </span>
                        <span class="checkbox-label-styled">
                          <span class="label-title">Dostawiana drabina</span>
                          <span class="label-description">Drabina przenośna do wejścia na drabinę stałą</span>
                        </span>
                      </label>
                    </div>
                  </div>
                </div>

                <!-- Przeszkody w miejscu montażu (tylko zewnętrzna, nie attyka) -->
                <div v-if="state.purpose === 'external' && state.scheme !== 'attic-passage'" class="form-group">
                  <label class="checkbox-wrapper-styled">
                    <input type="checkbox" v-model="state.hasObstacles">
                    <span class="checkbox-custom-styled">
                      <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3">
                        <path d="M5 12l5 5L20 7"/>
                      </svg>
                    </span>
                    <span class="checkbox-label-styled">
                      <span class="label-title">Przeszkody w miejscu montażu</span>
                      <span class="label-description">Okna lub inne elementy uniemożliwiające montaż</span>
                    </span>
                  </label>

                  <!-- Wybór typu przeszkody -->
                  <div v-if="state.hasObstacles" class="conditional-field">
                    <div class="obstacle-type-selector">
                      <!-- Okno / miejsce bez wsporników -->
                      <div class="obstacle-type-card obstacle-type-card--window" @click="addObstacle">
                        <div class="obstacle-type-photo">
                          <svg viewBox="0 0 80 60" fill="none" class="window-svg">
                            <!-- Wall (side view) -->
                            <rect x="5" y="5" width="14" height="50" fill="#9ca3af" stroke="#6b7280" stroke-width="1"/>
                            <!-- Window area on wall - nice blue -->
                            <rect x="5" y="18" width="14" height="20" fill="#3b82f6" fill-opacity="0.4" stroke="#60a5fa" stroke-width="1.5"/>
                            <!-- Window cross -->
                            <line x1="12" y1="18" x2="12" y2="38" stroke="#93c5fd" stroke-width="1"/>
                            <line x1="5" y1="28" x2="19" y2="28" stroke="#93c5fd" stroke-width="1"/>
                            <!-- Bracket above window -->
                            <line x1="19" y1="12" x2="35" y2="12" stroke="#6b7280" stroke-width="3"/>
                            <circle cx="35" cy="12" r="2" fill="#4b5563"/>
                            <!-- Bracket below window -->
                            <line x1="19" y1="48" x2="35" y2="48" stroke="#6b7280" stroke-width="3"/>
                            <circle cx="35" cy="48" r="2" fill="#4b5563"/>
                            <!-- Dimension arrows - blue -->
                            <line x1="42" y1="18" x2="42" y2="38" stroke="#60a5fa" stroke-width="1.5"/>
                            <polygon points="39,20 42,15 45,20" fill="#60a5fa"/>
                            <polygon points="39,36 42,41 45,36" fill="#60a5fa"/>
                          </svg>
                        </div>
                        <div class="obstacle-type-label">Okno / miejsce bez wsporników</div>
                        <div class="obstacle-type-desc">Obszar gdzie nie można zamontować uchwytów</div>
                      </div>

                      <!-- Punkt na ścianie - tylko w debug mode -->
                      <div v-if="debugMode" class="obstacle-type-card obstacle-type-card--wall-point" @click="addWallPoint">
                        <div class="obstacle-type-photo">
                          <svg viewBox="0 0 80 60" fill="none" class="wall-point-svg">
                            <!-- Wall (side view) -->
                            <rect x="5" y="5" width="14" height="50" fill="#9ca3af" stroke="#6b7280" stroke-width="1"/>
                            <!-- Green point area on wall -->
                            <rect x="5" y="18" width="14" height="20" fill="#22c55e" fill-opacity="0.4" stroke="#16a34a" stroke-width="1.5"/>
                            <!-- Crosshair -->
                            <line x1="12" y1="23" x2="12" y2="33" stroke="#15803d" stroke-width="1.5"/>
                            <line x1="7" y1="28" x2="17" y2="28" stroke="#15803d" stroke-width="1.5"/>
                            <!-- Brackets still visible -->
                            <line x1="19" y1="12" x2="35" y2="12" stroke="#6b7280" stroke-width="3"/>
                            <circle cx="35" cy="12" r="2" fill="#4b5563"/>
                            <line x1="19" y1="28" x2="35" y2="28" stroke="#6b7280" stroke-width="3"/>
                            <circle cx="35" cy="28" r="2" fill="#4b5563"/>
                            <line x1="19" y1="48" x2="35" y2="48" stroke="#6b7280" stroke-width="3"/>
                            <circle cx="35" cy="48" r="2" fill="#4b5563"/>
                          </svg>
                        </div>
                        <div class="obstacle-type-label">Punkt na ścianie</div>
                        <div class="obstacle-type-desc">Zaznaczenie bez wpływu na uchwyty</div>
                      </div>

                      <!-- Okap -->
                      <div
                        class="obstacle-type-card obstacle-type-card--eave"
                        :class="{ 'is-active': state.hasEave, 'is-disabled': state.hasEave }"
                        @click="!state.hasEave && toggleEave()"
                      >
                        <div class="obstacle-type-photo">
                          <svg viewBox="0 0 80 60" fill="none" class="eave-svg">
                            <!-- Wall (side view) -->
                            <rect x="5" y="18" width="14" height="40" fill="#9ca3af" stroke="#6b7280" stroke-width="1"/>
                            <!-- Eave/okap -->
                            <rect x="5" y="8" width="55" height="12" fill="#d1d5db" stroke="#9ca3af" stroke-width="1"/>
                            <!-- Eave shadow/depth -->
                            <rect x="19" y="18" width="41" height="3" fill="rgba(0,0,0,0.15)"/>
                            <!-- Depth arrow -->
                            <line x1="19" y1="3" x2="60" y2="3" stroke="#f59e0b" stroke-width="2"/>
                            <polygon points="57,0 62,3 57,6" fill="#f59e0b"/>
                            <line x1="19" y1="0" x2="19" y2="6" stroke="#f59e0b" stroke-width="1"/>
                            <!-- Height arrow -->
                            <line x1="68" y1="8" x2="68" y2="20" stroke="#60a5fa" stroke-width="2"/>
                            <polygon points="65,10 68,5 71,10" fill="#60a5fa"/>
                            <polygon points="65,18 68,23 71,18" fill="#60a5fa"/>
                            <!-- Label hints -->
                            <text x="38" y="3" font-size="6" fill="#f59e0b" text-anchor="middle">głęb.</text>
                            <text x="75" y="16" font-size="6" fill="#60a5fa" text-anchor="middle">wys.</text>
                          </svg>
                        </div>
                        <div class="obstacle-type-label">
                          Okap/rynna
                          <span v-if="state.hasEave" class="badge-added">Dodano</span>
                        </div>
                        <div class="obstacle-type-desc">Wystający dach lub rynna nad drabiną</div>
                      </div>
                    </div>

                    <!-- Okap/rynna - parametry -->
                    <div v-if="state.hasEave" class="eave-settings">
                      <div class="eave-settings-header">
                        <span class="eave-title">Parametry okapu/rynny</span>
                        <button class="btn-remove-eave" @click="toggleEave" title="Usuń okap/rynnę">×</button>
                      </div>
                      <div class="eave-inputs">
                        <div class="input-group-small">
                          <label>Głębokość (cm)</label>
                          <input
                            type="number"
                            v-model.number="state.eaveDepth"
                            min="1"
                            max="80"
                            step="1"
                            class="form-input-small"
                            title="Jak daleko okap wystaje w stronę drabiny"
                          >
                        </div>
                        <div class="input-group-small">
                          <label>Wysokość (cm)</label>
                          <input
                            type="number"
                            v-model.number="state.eaveHeight"
                            min="1"
                            max="200"
                            step="1"
                            class="form-input-small"
                            title="Wysokość okapu"
                          >
                        </div>
                      </div>
                    </div>

                    <!-- Lista okien/przeszkód -->
                    <div v-if="state.obstacles.length > 0" class="obstacles-list">
                      <div class="obstacles-list-header">Okna i przeszkody</div>
                      <div v-for="obstacle in state.obstacles" :key="obstacle.id" class="obstacle-item">
                        <div class="obstacle-inputs">
                          <div class="input-group-small">
                            <label>Od ziemi (m)</label>
                            <input type="number" v-model.number="obstacle.heightFrom" min="0" :max="state.wallHeight" step="0.1" class="form-input-small" title="Odległość od ziemi do dolnej krawędzi przeszkody">
                          </div>
                          <div class="input-group-small">
                            <label>Wysokość (m)</label>
                            <input type="number" v-model.number="obstacle.height" min="0.1" :max="state.wallHeight - obstacle.heightFrom" step="0.1" class="form-input-small" title="Wysokość przeszkody">
                          </div>
                          <button class="btn-remove-obstacle" @click="removeObstacle(obstacle.id)" title="Usuń">×</button>
                        </div>
                        <div class="obstacle-preview">
                          <span :class="['obstacle-badge', obstacle.type === 'wall-point' ? 'type-wall-point' : 'type-window']">{{ obstacle.type === 'wall-point' ? 'Punkt' : 'Okno' }}</span>
                          <span class="obstacle-range">{{ obstacle.heightFrom.toFixed(1) }}m - {{ (obstacle.heightFrom + obstacle.height).toFixed(1) }}m</span>
                        </div>
                      </div>
                    </div>

                    <!-- Ostrzeżenie o przeszkodzie ponad ścianą -->
                    <div v-if="obstacleAboveWallWarning" class="obstacle-above-wall-warning">
                      <div class="obstacle-warning-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <path d="M12 9v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                        </svg>
                      </div>
                      <div class="obstacle-warning-text">{{ obstacleAboveWallWarning }}</div>
                    </div>

                    <!-- Ostrzeżenie o kolizji uchwytów -->
                    <div v-if="collisionWarning" class="collision-warning">
                      <div class="collision-warning-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <path d="M12 9v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                        </svg>
                      </div>
                      <div class="collision-warning-text">
                        <strong>Kolizja z przeszkodą</strong>
                        <p>{{ collisionWarning.message }}</p>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Info z iframe -->
                <div class="config-summary" style="margin-top: 20px;">
                  <div class="config-summary-title">Podgląd konfiguracji 3D</div>
                  <div class="config-summary-row">
                    <span class="label">Moduły X7:</span>
                    <span class="value">{{ threeState.numX7Ladders }} szt.</span>
                  </div>
                  <div class="config-summary-row">
                    <span class="label">Moduł końcowy:</span>
                    <span class="value">{{ threeState.finalLadderRungs }} szczebli</span>
                  </div>
                  <div class="config-summary-row">
                    <span class="label">Razem szczebli:</span>
                    <span class="value">{{ threeState.totalRungs }} szt.</span>
                  </div>
                  <div v-if="state.cage === 'with-cage'" class="config-summary-row">
                    <span class="label">Segmenty kosza:</span>
                    <span class="value">{{ threeState.safetyCageCount }} szt.</span>
                  </div>
                </div>
              </div>

              <div v-if="!isCustomerMode" class="config-panel-footer">
                <button class="btn btn-secondary" @click="goBack">Wstecz</button>
                <button class="btn btn-primary" @click="goToSummary">Dalej</button>
              </div>
            </div>
          </div>

        </div>
      </div>

      <!-- ========== EKRAN 5: Podsumowanie (FULLSCREEN) ========== -->
      <div v-if="currentScreen === 'summary'" class="screen">
        <div class="summary-full-layout">
          <div class="config-panel summary-panel">
            <div class="config-panel-header">
              <h2>Podsumowanie zamówienia</h2>
              <p>Twoja konfiguracja drabiny technicznej</p>
            </div>

            <!-- Banner załadowanej oferty -->
            <div v-if="loadedOffer" class="loaded-offer-banner" style="margin: 15px 20px;">
              <div class="loaded-offer-icon">&#128196;</div>
              <div class="loaded-offer-info">
                <div class="loaded-offer-title">Oferta</div>
                <div class="loaded-offer-ref">{{ loadedOffer.reference_number }}</div>
              </div>
              <div class="loaded-offer-meta">
                <span>Wersja {{ loadedOffer.version || 1 }}</span>
                <span>{{ formatDate(loadedOffer.created_at) }}</span>
              </div>
            </div>

            <!-- Historia wersji -->
            <div v-if="loadedOffer?.versions && loadedOffer.versions.length > 1" class="version-history" style="margin: 0 20px 15px;">
              <div class="version-history-title">Historia wersji:</div>
              <div class="version-chips">
                <a
                  v-for="v in loadedOffer.versions"
                  :key="v.id"
                  :href="getVersionLink(v.reference_number)"
                  class="version-chip"
                  :class="{ 'current': v.id === loadedOffer.id }"
                >
                  v{{ v.version }}
                </a>
              </div>
            </div>

            <div class="config-panel-content">
              <!-- Specyfikacja techniczna -->
              <div class="summary-section">
                <div class="summary-section-title">Specyfikacja techniczna</div>
                <div class="summary-card">
                  <div class="summary-row">
                    <span class="label">Moduły X7 (7 szczebli):</span>
                    <span class="value">{{ threeState.numX7Ladders }} szt.</span>
                  </div>
                  <div class="summary-row">
                    <span class="label">Moduł końcowy:</span>
                    <span class="value">{{ threeState.finalLadderRungs }} szczebli</span>
                  </div>
                  <div class="summary-row highlight-row">
                    <span class="label">Całkowita liczba szczebli:</span>
                    <span class="value">{{ threeState.totalRungs }} szt.</span>
                  </div>
                  <div v-if="cachedBOMData?.ladder1?.config?.lastRungToGround" class="summary-row">
                    <span class="label">Ostatni szczebel od ziemi:</span>
                    <span class="value">{{ cachedBOMData.ladder1.config.lastRungToGround }} mm</span>
                  </div>
                  <div v-if="cachedBOMData?.ladder1?.config?.lastCageToGround && state.cage === 'with-cage'" class="summary-row">
                    <span class="label">Ostatnia obręcz od ziemi:</span>
                    <span class="value">{{ cachedBOMData.ladder1.config.lastCageToGround }} mm</span>
                  </div>
                </div>
              </div>

              <!-- Lista drabin w ofercie -->
              <div v-if="laddersInOffer.length > 0" class="ladders-in-offer-section">
                <div class="summary-section-title">Drabiny w ofercie ({{ laddersInOffer.length }})</div>
                <div class="ladders-list">
                  <div v-for="ladder in laddersInOffer" :key="ladder.id" class="ladder-item">
                    <div class="ladder-item-info">
                      <div class="ladder-item-title">
                        Drabina {{ ladder.wallHeight }}m
                        <span v-if="ladder.cage === 'with-cage'" class="ladder-tag">Kosz</span>
                      </div>
                      <div class="ladder-item-details">
                        {{ getSchemeLabel(ladder.scheme) }}
                      </div>
                    </div>
                    <div class="ladder-item-quantity">
                      <button class="qty-btn" @click="updateLadderQuantity(ladder.id, ladder.quantity - 1)">-</button>
                      <span class="qty-value">{{ ladder.quantity }}</span>
                      <button class="qty-btn" @click="updateLadderQuantity(ladder.id, ladder.quantity + 1)">+</button>
                    </div>
                    <button class="ladder-remove-btn" @click="removeLadderFromOffer(ladder.id)">
                      &#10005;
                    </button>
                  </div>
                </div>
              </div>

              <!-- Aktualna drabina (jeszcze nie dodana) -->
              <div class="current-ladder-section">
                <div class="summary-section-title">
                  {{ laddersInOffer.length > 0 ? 'Nowa drabina' : 'Aktualna drabina' }}
                </div>
                <div class="current-ladder-card">
                  <div class="ladder-item-info">
                    <div class="ladder-item-title">
                      Drabina {{ state.wallHeight }}m
                      <span v-if="state.cage === 'with-cage'" class="ladder-tag">Kosz</span>
                    </div>
                    <div class="ladder-item-details">
                      {{ getSchemeLabel(state.scheme) }}
                    </div>
                  </div>
                </div>
              </div>

              <!-- Przycisk dodania kolejnej drabiny -->
              <div class="add-ladder-section">
                <button class="btn btn-outline-dashed btn-block" @click="addAnotherLadder">
                  + Dodaj kolejna drabine do zamowienia
                </button>
              </div>

              <!-- Wyceniona lista elementów -->
              <PricedBOM
                v-if="cachedBOMData"
                :bomItems="allBomItems"
              />

              <div class="email-input-section">
                <label for="customer-email">Email do oferty:</label>
                <input
                  id="customer-email"
                  type="email"
                  v-model="customerEmail"
                  placeholder="Podaj swoj adres email"
                  class="email-input"
                  :class="{ 'input-error': emailError }"
                  @input="emailError = ''"
                />
                <p v-if="emailError" class="error-message">{{ emailError }}</p>
              </div>

              <div class="summary-actions">
                <button class="btn btn-outline btn-block" @click="generateOffer" :disabled="isSaving">
                  <span>&#128196;</span>
                  {{ loadedOffer ? 'Zapisz jako nowa oferte' : 'Wygeneruj oferte' }}
                </button>
                <button class="btn btn-outline btn-block" @click="exportBOMToPdf">
                  <span>&#128462;</span> Eksportuj liste elementow (PDF)
                </button>
                <button class="btn btn-success btn-block" @click="addToCart">
                  <span>&#128722;</span> Dodaj do koszyka
                </button>
              </div>

              <!-- Wyświetl zapisaną ofertę -->
              <div v-if="savedReference" class="saved-offer-info">
                <div class="saved-offer-title">Oferta zapisana!</div>
                <div class="saved-offer-details">
                  <div><strong>Numer:</strong> {{ savedReference.referenceNumber }}</div>
                  <div><strong>Kod dostepu:</strong> {{ savedReference.accessCode }}</div>
                  <div v-if="savedReference.version && savedReference.version > 1">
                    <strong>Wersja:</strong> {{ savedReference.version }}
                  </div>
                  <div v-if="savedReference.derivedFrom" class="derived-from">
                    Utworzona z: {{ savedReference.derivedFrom }}
                  </div>
                </div>
                <div class="saved-offer-link">
                  <a :href="getOfferLink()" target="_blank">Otworz oferte w nowym oknie</a>
                </div>
              </div>
            </div>

            <div class="config-panel-footer">
              <button class="btn btn-secondary" @click="currentScreen = 'params'">Wstecz</button>
              <button class="btn btn-primary" @click="addToCart">Zamów teraz</button>
            </div>
          </div>
        </div>
      </div>

    </main>
  </div>
</template>

<style>
/* ============================================
   RESET I ZMIENNE CSS (1:1 z oryginału)
   ============================================ */
*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

:root {
  --bg-primary: #1a1a1a;
  --bg-secondary: #2d2d2d;
  --bg-card: #3a3a3a;
  --bg-card-hover: #4a4a4a;
  --text-primary: #ffffff;
  --text-secondary: #b0b0b0;
  --text-muted: #808080;
  --accent: #4a9eff;
  --accent-hover: #6bb3ff;
  --accent-dark: #2d7cd6;
  --border: #505050;
  --success: #4caf50;
  --warning: #ff9800;
  --error: #f44336;
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 16px;
  --shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  --transition: all 0.3s ease;
}

html {
  height: 100%;
}

body {
  min-height: 100%;
  font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
  background-color: var(--bg-primary);
  color: var(--text-primary);
  line-height: 1.6;
  overflow-x: hidden;
}

#app {
  height: 100vh;
  height: 100dvh;
}

/* Debug indicator */
#debugIndicator {
  position: fixed;
  top: 5px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(255, 152, 0, 0.9);
  color: #000;
  padding: 4px 12px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: bold;
  z-index: 1000;
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: 10px;
}

.debug-editor-btn {
  background: #333;
  color: #fff;
  border: none;
  padding: 2px 8px;
  border-radius: 3px;
  cursor: pointer;
  font-size: 10px;
}

.debug-editor-btn:hover {
  background: #555;
}

/* Debug Editor Panel */
.debug-editor-panel {
  position: fixed;
  top: 40px;
  right: 10px;
  width: 320px;
  max-height: calc(100vh - 60px);
  background: rgba(30, 30, 30, 0.95);
  border: 1px solid #555;
  border-radius: 8px;
  z-index: 1001;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.debug-editor-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 15px;
  background: #222;
  border-bottom: 1px solid #444;
}

.debug-editor-header h3 {
  margin: 0;
  font-size: 14px;
  color: #ff9800;
}

.close-btn {
  background: none;
  border: none;
  color: #aaa;
  font-size: 20px;
  cursor: pointer;
  padding: 0;
  line-height: 1;
}

.close-btn:hover {
  color: #fff;
}

.debug-editor-content {
  padding: 10px;
  overflow-y: auto;
  max-height: calc(100vh - 120px);
}

.debug-section {
  margin-bottom: 15px;
  padding-bottom: 15px;
  border-bottom: 1px solid #444;
}

.debug-section:last-child {
  border-bottom: none;
  margin-bottom: 0;
}

.debug-section h4 {
  margin: 0 0 10px 0;
  font-size: 12px;
  color: #aaa;
  text-transform: uppercase;
}

.debug-section h5 {
  margin: 10px 0 5px 0;
  font-size: 11px;
  color: #888;
}

.model-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.model-btn {
  background: #444;
  color: #fff;
  border: none;
  padding: 4px 8px;
  border-radius: 3px;
  font-size: 10px;
  cursor: pointer;
}

.model-btn:hover {
  background: #666;
}

.box-form, .edit-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.form-row label {
  width: 70px;
  font-size: 11px;
  color: #aaa;
}

.form-row input[type="number"] {
  flex: 1;
  background: #333;
  border: 1px solid #555;
  color: #fff;
  padding: 4px 8px;
  border-radius: 3px;
  font-size: 12px;
}

.form-row input[type="color"] {
  width: 50px;
  height: 25px;
  border: none;
  cursor: pointer;
}

.add-box-btn {
  background: #4caf50;
  color: #fff;
  border: none;
  padding: 6px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  margin-top: 5px;
}

.add-box-btn:hover {
  background: #66bb6a;
}

.objects-list {
  max-height: 150px;
  overflow-y: auto;
  margin-bottom: 10px;
}

.object-item {
  display: flex;
  align-items: center;
  padding: 6px 8px;
  background: #333;
  border-radius: 3px;
  margin-bottom: 4px;
  cursor: pointer;
  font-size: 11px;
}

.object-item:hover {
  background: #444;
}

.object-item.selected {
  background: #1976d2;
}

.obj-name {
  flex: 1;
  color: #fff;
}

.obj-type {
  color: #888;
  font-size: 10px;
  margin-right: 10px;
}

.obj-actions {
  display: flex;
  gap: 4px;
}

.obj-actions button {
  background: #555;
  color: #fff;
  border: none;
  width: 20px;
  height: 20px;
  border-radius: 3px;
  cursor: pointer;
  font-size: 10px;
}

.obj-actions button:hover {
  background: #777;
}

.obj-actions .delete-btn:hover {
  background: #f44336;
}

.clear-all-btn {
  background: #f44336;
  color: #fff;
  border: none;
  padding: 6px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 11px;
  width: 100%;
}

.clear-all-btn:hover {
  background: #e53935;
}

.collect-btn {
  background: #1976d2;
  color: #fff;
  border: none;
  padding: 8px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 11px;
  width: 100%;
}

.collect-btn:hover {
  background: #1565c0;
}

.object-item.existing {
  border-left: 3px solid #ff9800;
}

.obj-type.existing {
  color: #ff9800;
}

.transform-mode-btns {
  display: flex;
  gap: 5px;
  margin-bottom: 15px;
}

.transform-mode-btns button {
  flex: 1;
  background: #444;
  color: #fff;
  border: none;
  padding: 8px 10px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 11px;
  transition: background 0.2s;
}

.transform-mode-btns button:hover {
  background: #555;
}

.transform-mode-btns button.active {
  background: #1976d2;
}

/* Align section */
.align-section {
  background: #333;
  padding: 10px;
  border-radius: 4px;
  margin-top: 10px;
}

.align-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.align-row label {
  color: #aaa;
  font-size: 11px;
  min-width: 50px;
}

.align-row select {
  flex: 1;
  background: #444;
  color: #fff;
  border: 1px solid #555;
  padding: 6px;
  border-radius: 4px;
  font-size: 11px;
}

.align-axis-btns {
  display: flex;
  gap: 4px;
}

.align-axis-btns button {
  background: #444;
  color: #fff;
  border: none;
  width: 32px;
  height: 28px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  font-weight: bold;
}

.align-axis-btns button:hover {
  background: #555;
}

.align-axis-btns button.active {
  background: #1976d2;
}

.align-btn {
  width: 100%;
  background: #4caf50;
  color: #fff;
  border: none;
  padding: 10px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  font-weight: bold;
  transition: background 0.2s;
}

.align-btn:hover {
  background: #43a047;
}

.align-btn.extrude-btn {
  background: #ff8800;
}

.align-btn.extrude-btn:hover {
  background: #e67e00;
}

.align-status {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.align-step {
  color: #ff9800;
  font-size: 12px;
  font-weight: bold;
  padding: 8px;
  background: rgba(255, 152, 0, 0.1);
  border-radius: 4px;
  text-align: center;
  animation: pulse 1.5s infinite;
}

.align-cancel-btn {
  width: 100%;
  background: #666;
  color: #fff;
  border: none;
  padding: 8px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 11px;
}

.align-cancel-btn:hover {
  background: #888;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}

/* ============================================
   LAYOUT APLIKACJI
   ============================================ */
.app-container {
  height: 100vh;
  height: 100dvh;
  width: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* ============================================
   NAGŁÓWEK
   ============================================ */
.app-header {
  padding: 15px 30px;
  background-color: var(--bg-secondary);
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  gap: 15px;
  flex-shrink: 0;
}

.back-button {
  width: 44px;
  height: 44px;
  border: none;
  background-color: var(--bg-card);
  color: var(--text-primary);
  border-radius: var(--radius-md);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: var(--transition);
  flex-shrink: 0;
}

.back-button:hover:not(:disabled) {
  background-color: var(--accent);
}

.back-button:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.back-button svg {
  width: 22px;
  height: 22px;
}

.header-title {
  flex: 1;
  min-width: 0;
}

.header-title h1 {
  font-size: 1.4rem;
  font-weight: 600;
  margin-bottom: 2px;
}

.header-title .step-indicator {
  font-size: 0.9rem;
  color: var(--text-muted);
}

/* ============================================
   GŁÓWNA ZAWARTOŚĆ
   ============================================ */
.app-content {
  flex: 1;
  overflow: hidden;
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.screen {
  flex: 1;
  min-height: 0;
  height: 100%;
  animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* ============================================
   EKRANY PEŁNOEKRANOWE
   ============================================ */
.fullscreen-layout {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 30px 20px;
  overflow-y: auto;
}

.screen-intro {
  text-align: center;
  margin-bottom: 30px;
  max-width: 600px;
}

.screen-intro h2 {
  font-size: 1.8rem;
  font-weight: 600;
  margin-bottom: 8px;
}

.screen-intro p {
  color: var(--text-secondary);
  font-size: 1.1rem;
}

/* Siatka kafelków */
.choice-grid-fullscreen {
  display: grid;
  gap: 25px;
  width: 100%;
  max-width: 900px;
}

.choice-grid-fullscreen.cols-2 {
  grid-template-columns: repeat(2, 1fr);
}

.choice-grid-fullscreen.cols-3 {
  grid-template-columns: repeat(3, 1fr);
}

/* Kafelki wyboru */
.choice-card-large {
  background-color: var(--bg-card);
  border: 2px solid transparent;
  border-radius: var(--radius-xl);
  cursor: pointer;
  transition: var(--transition);
  overflow: hidden;
}

.choice-card-large:hover {
  border-color: var(--accent);
  transform: translateY(-4px);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.4);
}

.choice-card-large.selected {
  border-color: var(--accent);
  background: linear-gradient(135deg, rgba(74, 158, 255, 0.15) 0%, rgba(74, 158, 255, 0.05) 100%);
  box-shadow: 0 0 20px rgba(74, 158, 255, 0.3);
}

.choice-card-large.selected .card-title {
  color: var(--accent);
}

.choice-card-large .card-image {
  width: 100%;
  height: 180px;
  background-color: var(--bg-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 4rem;
  border-bottom: 1px solid var(--border);
}

.choice-card-large .card-body {
  padding: 20px 25px 25px;
  text-align: center;
}

.choice-card-large .card-title {
  font-size: 1.3rem;
  font-weight: 600;
  margin-bottom: 8px;
}

.choice-card-large .card-description {
  font-size: 0.95rem;
  color: var(--text-secondary);
  line-height: 1.5;
}

/* ============================================
   SPLIT LAYOUT (ekran params)
   ============================================ */
.split-layout {
  width: 100%;
  height: 100%;
  display: flex;
  min-height: 0;
  overflow: hidden;
}

.visualization-panel {
  flex: 1;
  height: 100%;
  min-width: 300px;
  position: relative;
  overflow: hidden;
  background: #1a1a1a;
}

.viewer3d-container {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}

.viewer3d-container iframe {
  width: 100%;
  height: 100%;
  border: none;
}

.config-panel-wrapper {
  position: relative;
  height: 100%;
  width: 520px;
  max-width: 50%;
  flex-shrink: 0;
}

.config-panel {
  width: 100%;
  height: 100%;
  background-color: var(--bg-secondary);
  display: flex;
  flex-direction: column;
  box-shadow: -4px 0 20px rgba(0, 0, 0, 0.3);
  min-height: 0;
  overflow: hidden;
}

.config-panel-header {
  padding: 25px 30px;
  border-bottom: 1px solid var(--border);
}

.config-panel-header h2 {
  font-size: 1.3rem;
  font-weight: 600;
  margin-bottom: 5px;
}

.config-panel-header p {
  font-size: 0.9rem;
  color: var(--text-muted);
}

/* Loaded offer banner */
.loaded-offer-banner {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 20px;
  margin: 0 20px 15px;
  background: linear-gradient(135deg, #1e3a5f 0%, #2d4a6f 100%);
  border: 1px solid var(--accent);
  border-radius: 8px;
}

.loaded-offer-icon {
  font-size: 24px;
}

.loaded-offer-info {
  flex: 1;
}

.loaded-offer-title {
  font-size: 0.75rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.loaded-offer-ref {
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--accent);
  font-family: monospace;
}

.loaded-offer-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  font-size: 0.8rem;
  color: var(--text-muted);
}

.load-error-banner {
  padding: 12px 20px;
  margin: 0 20px 15px;
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid #ef4444;
  border-radius: 8px;
  color: #ef4444;
  font-size: 0.9rem;
}

.loading-offer-banner {
  padding: 12px 20px;
  margin: 0 20px 15px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text-muted);
  font-size: 0.9rem;
  text-align: center;
}

.config-panel-content {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 25px 30px;
  min-height: 0;
}

.config-panel-footer {
  padding: 20px 30px;
  border-top: 1px solid var(--border);
  background-color: var(--bg-primary);
  display: flex;
  gap: 12px;
}

/* ============================================
   PODSUMOWANIE KONFIGURACJI
   ============================================ */
.config-summary {
  background-color: var(--bg-primary);
  border-radius: var(--radius-md);
  padding: 18px;
  margin-bottom: 25px;
}

.config-summary-title {
  font-size: 0.85rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 12px;
}

.config-summary-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid var(--border);
}

.config-summary-row:last-child {
  border-bottom: none;
}

.config-summary-row .label {
  color: var(--text-secondary);
  font-size: 0.9rem;
}

.config-summary-row .value {
  color: var(--text-primary);
  font-weight: 600;
  font-size: 0.95rem;
}

/* ============================================
   FORMULARZE
   ============================================ */
.form-group {
  margin-bottom: 24px;
}

.form-group label {
  display: block;
  font-size: 0.95rem;
  font-weight: 500;
  color: var(--text-secondary);
  margin-bottom: 10px;
}

.form-group .hint {
  font-size: 0.85rem;
  color: var(--text-muted);
  margin-top: 6px;
}

.form-group .hint.warning-hint {
  color: #e67e22;
  background: rgba(230, 126, 34, 0.1);
  padding: 8px 12px;
  border-radius: 6px;
  border-left: 3px solid #e67e22;
}

/* ============================================
   SEKCJA STRONY ZEJŚCIA (ATTYKA)
   ============================================ */
.attic-entry-section {
  background: var(--bg-secondary);
  border-radius: var(--radius-lg);
  padding: 20px;
  margin-bottom: 24px;
  border: 1px solid var(--border);
}

.attic-entry-section .form-section-title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 16px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--border);
}

.attic-descent-section {
  background: var(--bg-secondary);
  border-radius: var(--radius-lg);
  padding: 20px;
  margin-bottom: 24px;
  border: 1px solid var(--border);
}

.attic-descent-section .form-section-title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 16px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--border);
}

.attic-options-section {
  background: var(--bg-secondary);
  border-radius: var(--radius-lg);
  padding: 20px;
  margin-bottom: 24px;
  border: 1px solid var(--border);
}

.attic-options-section .form-section-title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 16px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--border);
}

.attic-info-box {
  padding: 12px 16px;
  background: var(--bg-tertiary);
  border-radius: var(--radius-sm);
  border-left: 3px solid var(--primary);
}

.attic-info-title {
  font-weight: 500;
  margin-bottom: 8px;
  color: var(--text-primary);
}

.attic-info-label {
  color: var(--text-muted);
  font-size: 0.9rem;
}

.attic-info-value {
  font-weight: 600;
  color: var(--primary);
}

.attic-info-row {
  display: flex;
  justify-content: space-between;
  padding: 4px 0;
}

.attic-info-row span:first-child {
  color: var(--text-muted);
}

.input-small {
  max-width: 120px;
}

.input-with-unit {
  display: flex;
  align-items: center;
  gap: 8px;
}

.input-with-unit .form-input {
  flex: 1;
}

.input-with-unit .unit {
  font-size: 0.9rem;
  color: var(--text-muted);
  font-weight: 500;
  min-width: 30px;
}

.checkbox-group {
  padding: 10px 0;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  font-size: 0.95rem;
  color: var(--text-secondary);
}

.checkbox-label input[type="checkbox"] {
  width: 18px;
  height: 18px;
  accent-color: var(--primary);
}

.input-with-buttons {
  display: flex;
  align-items: center;
  gap: 12px;
}

.input-field {
  flex: 1;
  height: 52px;
  padding: 0 16px;
  border: 2px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 1.2rem;
  font-weight: 600;
  text-align: center;
  transition: border-color 0.2s;
}

.input-field:focus {
  outline: none;
  border-color: var(--accent);
}

.input-btn {
  width: 52px;
  height: 52px;
  border: 2px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--bg-card);
  color: var(--accent);
  font-size: 1.5rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.input-btn:hover {
  background: var(--accent);
  color: white;
  border-color: var(--accent);
}

/* ============================================
   PRZYCISKI
   ============================================ */
.btn {
  padding: 14px 28px;
  border: none;
  border-radius: var(--radius-md);
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: var(--transition);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.btn-primary {
  background: linear-gradient(135deg, var(--accent) 0%, var(--accent-dark) 100%);
  color: white;
  flex: 1;
}

.btn-primary:hover {
  background: linear-gradient(135deg, var(--accent-hover) 0%, var(--accent) 100%);
  transform: translateY(-2px);
  box-shadow: 0 4px 15px rgba(74, 158, 255, 0.3);
}

.btn-secondary {
  background: var(--bg-card);
  color: var(--text-primary);
  border: 1px solid var(--border);
}

.btn-secondary:hover {
  background: var(--bg-card-hover);
}

/* ============================================
   PROGRESS BAR
   ============================================ */
.progress-bar {
  width: 100%;
  height: 6px;
  background: var(--bg-primary);
  border-radius: 3px;
  margin-bottom: 20px;
  overflow: hidden;
}

.progress-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--accent) 0%, var(--success) 100%);
  border-radius: 3px;
  transition: width 0.3s ease;
}

/* ============================================
   INPUT Z JEDNOSTKĄ
   ============================================ */
.input-with-unit {
  display: flex;
  align-items: center;
  gap: 0;
}

.input-with-unit .form-input {
  flex: 1;
  height: 48px;
  padding: 0 16px;
  border: 2px solid var(--border);
  border-radius: var(--radius-md) 0 0 var(--radius-md);
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 1.1rem;
  font-weight: 500;
  transition: border-color 0.2s;
}

.input-with-unit .form-input:focus {
  outline: none;
  border-color: var(--accent);
}

.input-with-unit .form-input.invalid {
  border-color: var(--error);
}

.input-with-unit .unit {
  height: 48px;
  padding: 0 16px;
  background: var(--bg-card);
  border: 2px solid var(--border);
  border-left: none;
  border-radius: 0 var(--radius-md) var(--radius-md) 0;
  color: var(--text-secondary);
  font-size: 1rem;
  font-weight: 500;
  display: flex;
  align-items: center;
}

/* ============================================
   OSTRZEŻENIA FORMULARZA
   ============================================ */
.form-warning {
  margin-bottom: 8px;
  padding: 8px 12px;
  background: rgba(244, 67, 54, 0.1);
  border: 1px solid var(--error);
  border-radius: 6px;
  color: var(--error);
  font-size: 13px;
  font-weight: 500;
}

/* ============================================
   SELECT
   ============================================ */
.form-select {
  width: 100%;
  height: 48px;
  padding: 0 16px;
  border: 2px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 0.95rem;
  cursor: pointer;
  transition: border-color 0.2s;
}

.form-select:focus {
  outline: none;
  border-color: var(--accent);
}

/* ============================================
   CHECKBOX
   ============================================ */
.checkbox-wrapper {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  cursor: pointer;
  padding: 14px;
  border: 2px solid var(--border);
  border-radius: var(--radius-md);
  transition: all 0.2s;
}

.checkbox-wrapper:hover {
  border-color: var(--accent);
  background: rgba(74, 158, 255, 0.05);
}

.checkbox-wrapper input[type="checkbox"] {
  display: none;
}

.checkbox-custom {
  width: 24px;
  height: 24px;
  min-width: 24px;
  border: 2px solid var(--border);
  border-radius: 6px;
  background: var(--bg-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.checkbox-wrapper input[type="checkbox"]:checked + .checkbox-custom {
  background: var(--accent);
  border-color: var(--accent);
}

.checkbox-custom svg {
  width: 16px;
  height: 16px;
  opacity: 0;
  transition: opacity 0.2s;
}

.checkbox-wrapper input[type="checkbox"]:checked + .checkbox-custom svg {
  opacity: 1;
}

.checkbox-label {
  flex: 1;
}

.checkbox-label .label-title {
  display: block;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.checkbox-label .label-description {
  display: block;
  font-size: 13px;
  color: var(--text-secondary);
}

/* ============================================
   POLE WARUNKOWE
   ============================================ */
.conditional-field {
  margin-top: 15px;
  padding: 15px;
  background: var(--bg-secondary);
  border-radius: var(--radius-md);
  border-left: 3px solid var(--accent);
}

.conditional-field label {
  display: block;
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--text-secondary);
  margin-bottom: 8px;
}

/* ============================================
   LISTA PRZESZKÓD
   ============================================ */
/* Obstacle type selector */
.obstacle-type-selector {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 16px;
}

.obstacle-type-card {
  background: linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 12px;
  padding: 16px;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  text-align: center;
}

.obstacle-type-card:hover:not(.is-disabled) {
  border-color: rgba(74, 158, 255, 0.5);
  background: linear-gradient(135deg, rgba(74, 158, 255, 0.1) 0%, rgba(74, 158, 255, 0.03) 100%);
  transform: translateY(-2px);
}

.obstacle-type-card.is-active {
  border-color: rgba(76, 175, 80, 0.6);
  background: linear-gradient(135deg, rgba(76, 175, 80, 0.15) 0%, rgba(76, 175, 80, 0.05) 100%);
}

.obstacle-type-card.is-disabled {
  opacity: 0.7;
  cursor: default;
}

.obstacle-type-icon {
  width: 48px;
  height: 48px;
  margin: 0 auto 12px;
  color: rgba(255,255,255,0.7);
}

.obstacle-type-icon svg {
  width: 100%;
  height: 100%;
}

.obstacle-type-card:hover:not(.is-disabled) .obstacle-type-icon {
  color: #4a9eff;
}

.obstacle-type-card.is-active .obstacle-type-icon {
  color: #4CAF50;
}

.obstacle-type-label {
  font-weight: 600;
  font-size: 0.95rem;
  color: #fff;
  margin-bottom: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.badge-added {
  font-size: 0.7rem;
  padding: 2px 8px;
  background: #4CAF50;
  border-radius: 10px;
  font-weight: 500;
}

.obstacle-type-desc {
  font-size: 0.8rem;
  color: rgba(255,255,255,0.5);
  line-height: 1.4;
}

/* Photo placeholder for eave card */
.obstacle-type-photo {
  width: 100%;
  height: 70px;
  margin-bottom: 10px;
  border-radius: 8px;
  overflow: hidden;
  background: linear-gradient(180deg, #1f2937 0%, #111827 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px;
}

.eave-svg {
  width: 100%;
  height: 100%;
  opacity: 0.9;
  transition: all 0.25s ease;
}

.obstacle-type-card--eave:hover:not(.is-disabled) .eave-svg {
  opacity: 1;
  transform: scale(1.05);
}

.obstacle-type-card--eave.is-active .obstacle-type-photo {
  background: linear-gradient(180deg, #1e3a2f 0%, #14532d 100%);
  border: 1px solid rgba(76, 175, 80, 0.4);
}

.obstacle-type-card--eave.is-active .eave-svg {
  opacity: 1;
}

.window-svg {
  width: 100%;
  height: 100%;
  opacity: 0.9;
  transition: all 0.25s ease;
}

.obstacle-type-card--window:hover .window-svg {
  opacity: 1;
  transform: scale(1.05);
}

/* Eave settings */
.eave-settings {
  background: linear-gradient(135deg, rgba(76, 175, 80, 0.1) 0%, rgba(76, 175, 80, 0.03) 100%);
  border: 1px solid rgba(76, 175, 80, 0.3);
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 16px;
}

.eave-settings-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.eave-title {
  font-weight: 600;
  color: #81c784;
  font-size: 0.9rem;
}

.btn-remove-eave {
  width: 28px;
  height: 28px;
  border: none;
  background: rgba(244, 67, 54, 0.2);
  color: #f44336;
  border-radius: 6px;
  cursor: pointer;
  font-size: 18px;
  line-height: 1;
  transition: all 0.2s;
}

.btn-remove-eave:hover {
  background: rgba(244, 67, 54, 0.4);
}

.eave-inputs {
  display: flex;
  gap: 12px;
}

.eave-inputs .input-group-small {
  flex: 1;
}

.obstacles-list-header {
  font-size: 0.85rem;
  font-weight: 600;
  color: rgba(255,255,255,0.6);
  margin-bottom: 10px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.obstacles-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 15px;
}

.obstacle-item {
  background: var(--bg-card);
  padding: 12px;
  border-radius: var(--radius-md);
}

.obstacle-inputs {
  display: flex;
  align-items: flex-end;
  gap: 10px;
}

.input-group-small {
  flex: 1;
}

.input-group-small label {
  display: block;
  font-size: 11px;
  color: var(--text-muted);
  margin-bottom: 4px;
}

.form-input-small {
  width: 100%;
  height: 36px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 0.9rem;
}

.btn-remove-obstacle {
  width: 36px;
  height: 36px;
  border: none;
  border-radius: var(--radius-sm);
  background: var(--error);
  color: white;
  font-size: 1.2rem;
  cursor: pointer;
  transition: opacity 0.2s;
}

.btn-remove-obstacle:hover {
  opacity: 0.8;
}

.btn-add-obstacle {
  width: 100%;
  padding: 10px;
  border: 2px dashed var(--accent);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--accent);
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-add-obstacle:hover {
  background: rgba(74, 158, 255, 0.1);
}

/* Collision warning */
.collision-warning {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-top: 12px;
  padding: 12px;
  background: rgba(255, 152, 0, 0.1);
  border: 1px solid rgba(255, 152, 0, 0.3);
  border-radius: 8px;
  color: #ff9800;
}

.collision-warning-icon {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
}

.collision-warning-icon svg {
  width: 100%;
  height: 100%;
}

.collision-warning-text {
  flex: 1;
}

.collision-warning-text strong {
  display: block;
  margin-bottom: 4px;
  font-size: 0.9rem;
}

.collision-warning-text p {
  margin: 0;
  font-size: 0.85rem;
  color: rgba(255, 152, 0, 0.85);
  line-height: 1.4;
}

/* Lekki toast ostrzeżenia u góry modelu 3D */
.model-toast {
  position: absolute;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: 90%;
  padding: 10px 16px;
  background: rgba(239, 68, 68, 0.95);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  color: white;
  font-size: 0.85rem;
  z-index: 100;
}

.model-toast-icon {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
}

.model-toast-icon svg {
  width: 100%;
  height: 100%;
}

.model-toast-content {
  flex: 1;
  line-height: 1.4;
}

.model-toast-content strong {
  font-weight: 600;
}

.model-toast-close {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.2);
  border: none;
  border-radius: 4px;
  color: white;
  font-size: 18px;
  cursor: pointer;
  transition: background 0.2s;
}

.model-toast-close:hover {
  background: rgba(255, 255, 255, 0.3);
}

.model-toast-info {
  background: rgba(52, 152, 219, 0.95);
}

/* ============================================
   KONTROLKI 3D - EXACT COPY FROM ORIGINAL
   ============================================ */

/* Visibility controls (prawy górny róg) */
.viewer3d-visibility {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 20;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.viewer3d-visibility-btn {
  padding: 8px 12px;
  background: rgba(50, 50, 50, 0.8);
  color: white;
  border: 1px solid rgba(255,255,255,0.2);
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.2s;
  backdrop-filter: blur(5px);
}

.viewer3d-visibility-btn.active {
  background: rgba(76, 175, 80, 0.9);
  border-color: #6fcf7c;
}

.viewer3d-visibility-btn:hover {
  background: rgba(80, 80, 80, 0.9);
}

/* MAIN CONTROLS - exact from original */
#controls {
  position: fixed;
  top: 80px;
  left: 12px;
  z-index: 100;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px;
  background: linear-gradient(165deg, rgba(30,35,45,0.9) 0%, rgba(18,22,28,0.95) 100%);
  border-radius: 12px;
  border: 1px solid rgba(255,255,255,0.06);
  box-shadow: 0 8px 32px rgba(0,0,0,0.5);
  backdrop-filter: blur(10px);
}

#controls .btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 46px;
  height: 46px;
  background: linear-gradient(145deg, #4caf50 0%, #388e3c 100%);
  color: white;
  border: 1px solid rgba(255,255,255,0.15);
  border-radius: 8px;
  font-size: 18px;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.25s ease;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
  box-shadow: 0 4px 12px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1);
  padding: 0;
}

#controls .btn:hover {
  background: linear-gradient(145deg, #66bb6a 0%, #43a047 100%);
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.15);
}

#controls .btn:active {
  transform: translateY(0) scale(0.96);
  box-shadow: 0 2px 6px rgba(0,0,0,0.4), inset 0 1px 3px rgba(0,0,0,0.2);
}

#controls .btn-tech {
  background: linear-gradient(145deg, #3d5a80 0%, #293d52 100%);
  font-size: 20px;
  width: 46px;
  height: 46px;
  border: 1px solid rgba(255,255,255,0.15);
  box-shadow: 0 4px 12px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1);
  transition: all 0.25s ease;
}

#controls .btn-tech:hover {
  background: linear-gradient(145deg, #4a6d96 0%, #344c66 100%);
  box-shadow: 0 6px 16px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.15);
  transform: translateY(-2px);
}

#controls .btn-tech:active {
  background: linear-gradient(145deg, #293d52 0%, #1e2d3d 100%);
  transform: translateY(0) scale(0.96);
  box-shadow: 0 2px 6px rgba(0,0,0,0.4), inset 0 1px 3px rgba(0,0,0,0.2);
}

#controls .btn-active {
  background: linear-gradient(145deg, #4caf50 0%, #388e3c 100%) !important;
  border-color: #6fcf7c !important;
  box-shadow: 0 0 12px rgba(76,175,80,0.5), 0 4px 12px rgba(0,0,0,0.4) !important;
}

#controls .btn-with-tooltip {
  position: relative;
}

#controls .btn-tooltip {
  position: absolute;
  left: calc(100% + 12px);
  top: 50%;
  transform: translateY(-50%);
  background: linear-gradient(165deg, rgba(30,35,45,0.98) 0%, rgba(18,22,28,0.99) 100%);
  color: rgba(255,255,255,0.9);
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s ease, transform 0.2s ease;
  box-shadow: 0 4px 16px rgba(0,0,0,0.5);
  border: 1px solid rgba(255,255,255,0.1);
  font-family: 'Segoe UI', Arial, sans-serif;
  z-index: 200;
}

#controls .btn-tooltip::before {
  content: '';
  position: absolute;
  left: -6px;
  top: 50%;
  transform: translateY(-50%);
  border: 6px solid transparent;
  border-right-color: rgba(30,35,45,0.98);
}

#controls .btn-with-tooltip:hover .btn-tooltip {
  opacity: 1;
  transform: translateY(-50%) translateX(4px);
}

/* MEASURE TOOLBAR - exact from original */
#measureToolbar {
  position: fixed;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 150;
  display: none;
  background: linear-gradient(165deg, rgba(30,35,45,0.95) 0%, rgba(18,22,28,0.98) 100%);
  padding: 8px 12px;
  border-radius: 12px;
  border: 1px solid rgba(255,255,255,0.08);
  box-shadow: 0 8px 32px rgba(0,0,0,0.5);
  backdrop-filter: blur(10px);
  gap: 6px;
  align-items: center;
}

#measureToolbar.active {
  display: flex;
}

.measure-toolbar-label {
  color: rgba(255,255,255,0.6);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-right: 6px;
  font-family: 'Segoe UI', Arial, sans-serif;
}

#measureToolbar .measure-mode-btn {
  width: 38px;
  height: 38px;
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 8px;
  background: linear-gradient(145deg, #2a2f3a 0%, #1e222a 100%);
  color: rgba(255,255,255,0.7);
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  font-family: 'Segoe UI', Arial, sans-serif;
  padding: 0;
}

#measureToolbar .measure-mode-btn:hover {
  background: linear-gradient(145deg, #363c4a 0%, #282d38 100%);
  color: white;
  transform: translateY(-2px);
}

#measureToolbar .measure-mode-btn.active {
  background: linear-gradient(145deg, #4caf50 0%, #388e3c 100%);
  color: white;
  border-color: rgba(255,255,255,0.2);
  box-shadow: 0 4px 12px rgba(76,175,80,0.4);
}

#measureToolbar .measure-mode-btn .tooltip {
  position: absolute;
  bottom: -32px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0,0,0,0.9);
  color: white;
  padding: 5px 10px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 500;
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s ease;
}

#measureToolbar .measure-mode-btn:hover .tooltip {
  opacity: 1;
}

.measure-toolbar-divider {
  width: 1px;
  height: 24px;
  background: rgba(255,255,255,0.15);
  margin: 0 6px;
}

#measureToolbar .measure-close-btn {
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 6px;
  background: linear-gradient(145deg, #e53935 0%, #c62828 100%);
  color: white;
  font-size: 16px;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-left: 4px;
  padding: 0;
}

#measureToolbar .measure-close-btn:hover {
  background: linear-gradient(145deg, #ef5350 0%, #d32f2f 100%);
  transform: scale(1.05);
}

/* MEASURE RESULT POPUP - exact from original */
#measureResultPopup {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: linear-gradient(165deg, rgba(30,35,45,0.98) 0%, rgba(18,22,28,0.99) 100%);
  color: #6fcf7c;
  padding: 24px 32px;
  border-radius: 14px;
  border: 1px solid rgba(255,255,255,0.1);
  border-top: 3px solid #4CAF50;
  box-shadow: 0 20px 60px rgba(0,0,0,0.7);
  font-size: 28px;
  font-weight: 700;
  font-family: 'Consolas', 'Monaco', monospace;
  z-index: 300;
  backdrop-filter: blur(12px);
}

#measureResultPopup .measure-result-close-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 24px;
  height: 24px;
  background: transparent;
  border: none;
  color: rgba(255,255,255,0.5);
  font-size: 18px;
  cursor: pointer;
  transition: color 0.2s;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

#measureResultPopup .measure-result-close-btn:hover {
  color: white;
}

/* CONNECTION PANEL - exact from original */
#connectionPanel {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: linear-gradient(165deg, rgba(28,32,40,0.98) 0%, rgba(18,20,26,0.99) 100%);
  padding: 28px 32px;
  border-radius: 14px;
  border: 1px solid rgba(255,255,255,0.08);
  border-top: 3px solid #4CAF50;
  box-shadow: 0 20px 60px rgba(0,0,0,0.7), 0 0 1px rgba(255,255,255,0.1);
  z-index: 300;
  display: none;
  color: white;
  font-size: 14px;
  min-width: 320px;
  font-family: 'Segoe UI', Arial, sans-serif;
  backdrop-filter: blur(12px);
}

#connectionPanel.active {
  display: block;
}

#connectionPanel h3 {
  margin: 0 0 22px 0;
  text-align: center;
  color: #6fcf7c;
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 0.5px;
  text-transform: uppercase;
}

.connection-row {
  margin: 14px 0;
}

.connection-row label {
  display: block;
  margin-bottom: 10px;
  color: rgba(255,255,255,0.6);
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.connection-types {
  display: flex;
  gap: 8px;
  justify-content: center;
}

.connection-type-btn {
  padding: 12px 22px;
  background: linear-gradient(145deg, #2a2f3a 0%, #1e222a 100%);
  color: rgba(255,255,255,0.85);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  transition: all 0.2s ease;
  box-shadow: 0 2px 8px rgba(0,0,0,0.3);
}

.connection-type-btn:hover {
  background: linear-gradient(145deg, #363c4a 0%, #282d38 100%);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0,0,0,0.4);
}

.connection-type-btn.active {
  background: linear-gradient(145deg, #4caf50 0%, #388e3c 100%);
  border-color: rgba(255,255,255,0.2);
  color: white;
  box-shadow: 0 4px 12px rgba(76,175,80,0.4);
}

.wspornik-row {
  margin: 16px 0;
}

.wspornik-row label {
  display: block;
  margin-bottom: 10px;
  color: rgba(255,255,255,0.6);
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.wspornik-slider {
  width: 100%;
  height: 6px;
  -webkit-appearance: none;
  background: linear-gradient(90deg, #2a2f3a 0%, #363c4a 100%);
  border-radius: 3px;
  outline: none;
  border: 1px solid rgba(255,255,255,0.1);
}

.wspornik-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 18px;
  height: 18px;
  background: linear-gradient(145deg, #4caf50 0%, #388e3c 100%);
  border-radius: 50%;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(76,175,80,0.4);
  border: 2px solid rgba(255,255,255,0.2);
  transition: transform 0.15s ease;
}

.wspornik-slider::-webkit-slider-thumb:hover {
  transform: scale(1.1);
}

.wspornik-value {
  text-align: center;
  font-size: 20px;
  font-weight: 700;
  margin-top: 8px;
  color: #6fcf7c;
  font-family: 'Consolas', 'Monaco', monospace;
}

.wspornik-types {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: center;
}

.wspornik-type-btn {
  padding: 10px 16px;
  background: linear-gradient(145deg, #2a2f3a 0%, #1e222a 100%);
  color: rgba(255,255,255,0.85);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  transition: all 0.2s ease;
  box-shadow: 0 2px 6px rgba(0,0,0,0.3);
}

.wspornik-type-btn:hover {
  background: linear-gradient(145deg, #363c4a 0%, #282d38 100%);
  transform: translateY(-1px);
}

.wspornik-type-btn.active {
  background: linear-gradient(145deg, #4caf50 0%, #388e3c 100%);
  border-color: rgba(255,255,255,0.2);
  color: white;
  box-shadow: 0 3px 10px rgba(76,175,80,0.4);
}

#connectionPanel .close-btn {
  width: 100%;
  margin-top: 22px;
  padding: 12px;
  background: linear-gradient(145deg, #2a2f3a 0%, #1e222a 100%);
  color: rgba(255,255,255,0.8);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  transition: all 0.2s ease;
}

#connectionPanel .close-btn:hover {
  background: linear-gradient(145deg, #363c4a 0%, #282d38 100%);
  color: white;
}

.connection-actions {
  display: flex;
  gap: 10px;
  margin-top: 22px;
}

.connection-actions .remove-btn {
  flex: 1;
  padding: 12px;
  background: linear-gradient(145deg, #e53935 0%, #c62828 100%);
  color: white;
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  transition: all 0.2s ease;
}

.connection-actions .remove-btn:hover {
  background: linear-gradient(145deg, #ef5350 0%, #d32f2f 100%);
}

.connection-actions .close-btn {
  flex: 1;
  padding: 12px;
  background: linear-gradient(145deg, #2a2f3a 0%, #1e222a 100%);
  color: rgba(255,255,255,0.8);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  transition: all 0.2s ease;
  margin-top: 0;
  width: auto;
}

.connection-actions .close-btn:hover {
  background: linear-gradient(145deg, #363c4a 0%, #282d38 100%);
  color: white;
}

/* SAFETY CAGE CONTROLS - exact from original */
#safetyCageControls {
  position: fixed;
  bottom: 10px;
  left: 10px;
  z-index: 100;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  font-family: 'Segoe UI', Arial, sans-serif;
}

.cage-panel {
  background: linear-gradient(165deg, rgba(30,35,45,0.95) 0%, rgba(18,22,28,0.98) 100%);
  padding: 10px 14px;
  border-radius: 10px;
  border: 1px solid rgba(255,255,255,0.08);
  box-shadow: 0 8px 24px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05);
  display: flex;
  align-items: center;
  gap: 10px;
  backdrop-filter: blur(10px);
}

.cage-panel-1 {
  border-left: 3px solid #4CAF50;
}

.cage-label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  opacity: 0.9;
}

.cage-label-1 {
  color: #6fcf7c;
}

.cage-btn {
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: bold;
  font-size: 18px;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px rgba(0,0,0,0.3);
  padding: 0;
}

.cage-btn-add {
  background: linear-gradient(145deg, #4caf50 0%, #388e3c 100%);
  color: white;
}

.cage-btn-add:hover {
  background: linear-gradient(145deg, #66bb6a 0%, #43a047 100%);
  transform: scale(1.08);
}

.cage-btn-add:active {
  transform: scale(0.95);
}

.cage-btn-remove {
  background: linear-gradient(145deg, #e53935 0%, #c62828 100%);
  color: white;
}

.cage-btn-remove:hover {
  background: linear-gradient(145deg, #ef5350 0%, #d32f2f 100%);
  transform: scale(1.08);
}

.cage-btn-remove:active {
  transform: scale(0.95);
}

.cage-count {
  color: white;
  font-size: 14px;
  font-weight: 700;
  min-width: 45px;
  text-align: center;
  font-family: 'Consolas', 'Monaco', monospace;
  letter-spacing: 1px;
}

.cage-checkbox-label {
  font-size: 10px;
  margin-left: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
  opacity: 0.85;
  transition: opacity 0.2s;
}

.cage-checkbox-label:hover {
  opacity: 1;
}

.cage-checkbox-label-1 {
  color: #81c784;
}

.cage-checkbox {
  width: 14px;
  height: 14px;
  cursor: pointer;
  accent-color: #4CAF50;
}

/* GLOBAL SETTINGS PANEL */
#globalSettingsPanel {
  position: fixed;
  bottom: 10px;
  left: 10px;
  z-index: 100;
  background: linear-gradient(165deg, rgba(30,35,45,0.95) 0%, rgba(18,22,28,0.98) 100%);
  padding: 10px 14px;
  border-radius: 10px;
  border: 1px solid rgba(255,255,255,0.08);
  border-left: 3px solid #2196F3;
  box-shadow: 0 8px 24px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05);
  backdrop-filter: blur(10px);
  font-family: 'Segoe UI', Arial, sans-serif;
  display: flex;
  align-items: center;
  gap: 10px;
}

#globalSettingsPanel.with-cage {
  bottom: 70px;
}

#globalSettingsPanel label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: #90caf9;
  opacity: 0.9;
  white-space: nowrap;
}

.global-slider {
  width: 120px;
  height: 6px;
  border-radius: 3px;
  background: rgba(255,255,255,0.1);
  appearance: none;
  -webkit-appearance: none;
  cursor: pointer;
}

.global-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: linear-gradient(145deg, #2196F3 0%, #1976D2 100%);
  cursor: pointer;
  box-shadow: 0 2px 6px rgba(0,0,0,0.3);
  transition: transform 0.15s ease;
}

.global-slider::-webkit-slider-thumb:hover {
  transform: scale(1.15);
}

.global-slider::-moz-range-thumb {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: linear-gradient(145deg, #2196F3 0%, #1976D2 100%);
  cursor: pointer;
  border: none;
  box-shadow: 0 2px 6px rgba(0,0,0,0.3);
}

.global-value {
  font-size: 13px;
  font-weight: 700;
  color: white;
  font-family: 'Consolas', 'Monaco', monospace;
  min-width: 65px;
}

.global-type {
  font-size: 10px;
  font-weight: 600;
  color: #90caf9;
  text-transform: uppercase;
  padding: 3px 8px;
  background: rgba(33, 150, 243, 0.2);
  border-radius: 4px;
  letter-spacing: 0.5px;
}

/* TECH DRAWING PANEL */
#techDrawingPanel {
  position: fixed;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 100;
  background: linear-gradient(165deg, rgba(30,30,40,0.95) 0%, rgba(20,20,30,0.98) 100%);
  padding: 12px 18px;
  border-radius: 12px;
  border: 1px solid rgba(255,255,255,0.15);
  box-shadow: 0 8px 32px rgba(0,0,0,0.5);
  display: flex;
  align-items: center;
  gap: 15px;
  font-family: 'Segoe UI', Arial, sans-serif;
}

#techDrawingPanel .tech-label {
  font-weight: 600;
  font-size: 14px;
  color: #fff;
}

#techDrawingPanel .tech-view {
  font-size: 13px;
  color: #aaa;
}

#techDrawingPanel .tech-hint {
  font-size: 11px;
  color: #666;
  border-left: 1px solid #444;
  padding-left: 12px;
  margin-left: 4px;
}

#techDrawingPanel .tech-switch-btn {
  padding: 8px 15px;
  border: none;
  border-radius: 6px;
  background: linear-gradient(145deg, #3d5a80 0%, #293d52 100%);
  color: white;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

#techDrawingPanel .tech-switch-btn:hover {
  background: linear-gradient(145deg, #4a6d96 0%, #344c66 100%);
}

#techDrawingPanel .tech-close-btn {
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: linear-gradient(145deg, #e53935 0%, #c62828 100%);
  color: white;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}

#techDrawingPanel .tech-close-btn:hover {
  background: linear-gradient(145deg, #ef5350 0%, #d32f2f 100%);
  transform: scale(1.05);
}

/* WATCHDOG PANEL (prawy dolny róg) */
.watchdog-panel {
  position: absolute;
  bottom: 12px;
  right: 12px;
  z-index: 100;
  background: linear-gradient(165deg, rgba(30,30,40,0.95) 0%, rgba(20,20,30,0.98) 100%);
  padding: 10px 14px;
  border-radius: 8px;
  border: 1px solid rgba(255,255,255,0.1);
  box-shadow: 0 4px 20px rgba(0,0,0,0.4);
  font-family: 'Consolas', 'Monaco', monospace;
  min-width: 200px;
}

.watchdog-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 4px 0;
}

.watchdog-item:not(:last-child) {
  border-bottom: 1px solid rgba(255,255,255,0.08);
  padding-bottom: 6px;
  margin-bottom: 4px;
}

.watchdog-label {
  font-size: 11px;
  color: rgba(255,255,255,0.7);
  white-space: nowrap;
}

.watchdog-value {
  font-size: 14px;
  font-weight: 700;
  color: #4ade80;
  text-shadow: 0 0 8px rgba(74,222,128,0.3);
}


/* ============================================
   HINT (uzupełnienie)
   ============================================ */
.hint {
  font-size: 0.85rem;
  color: var(--text-muted);
  margin-top: 6px;
}

/* ============================================
   SUMMARY
   ============================================ */
.summary-section {
  margin-bottom: 24px;
}

.summary-section-title {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border);
}

.summary-card {
  background: var(--bg-secondary);
  border-radius: var(--radius-md);
  padding: 16px;
}

.summary-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid var(--border);
}

.summary-row:last-child {
  border-bottom: none;
}

.summary-row .label {
  color: var(--text-secondary);
  font-size: 0.9rem;
}

.summary-row .value {
  color: var(--text-primary);
  font-weight: 500;
}

.summary-row .value.highlight {
  color: var(--accent);
  font-weight: 700;
  font-size: 1.1rem;
}

.summary-row.highlight-row {
  background: rgba(74, 158, 255, 0.1);
  margin: 8px -16px;
  padding: 12px 16px;
  border-radius: var(--radius-sm);
  border-bottom: none;
}

.summary-row.highlight-row .value {
  color: var(--accent);
  font-weight: 700;
}

/* Promo code */
.promo-code-input {
  display: flex;
  gap: 10px;
}

.promo-code-input .form-input {
  flex: 1;
  height: 44px;
  padding: 0 14px;
  border: 2px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 0.95rem;
  text-transform: uppercase;
}

.promo-code-input .form-input:focus {
  outline: none;
  border-color: var(--accent);
}

.btn-accent {
  background: var(--accent);
  color: white;
  border: none;
  padding: 0 20px;
  height: 44px;
  border-radius: var(--radius-md);
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-accent:hover {
  background: var(--accent-hover);
}

.promo-message {
  margin-top: 10px;
  padding: 10px 14px;
  border-radius: var(--radius-md);
  font-size: 0.9rem;
  background: rgba(244, 67, 54, 0.1);
  color: var(--error);
  border: 1px solid var(--error);
}

.promo-message.success {
  background: rgba(76, 175, 80, 0.1);
  color: var(--success);
  border: 1px solid var(--success);
}

/* Cage options (checkboxes) */
.cage-options {
  margin-top: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* Styled checkbox like original configurator */
.checkbox-wrapper-styled {
  display: flex !important;
  flex-direction: row !important;
  align-items: flex-start !important;
  gap: 14px;
  cursor: pointer;
  padding: 16px 18px;
  margin-bottom: 0 !important;
  background: linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 12px;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  overflow: hidden;
  flex-wrap: nowrap;
}

.checkbox-wrapper-styled::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(135deg, rgba(74, 158, 255, 0.1) 0%, rgba(74, 158, 255, 0.02) 100%);
  opacity: 0;
  transition: opacity 0.25s ease;
}

.checkbox-wrapper-styled:hover {
  border-color: rgba(74, 158, 255, 0.4);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.checkbox-wrapper-styled:hover::before {
  opacity: 1;
}

.checkbox-wrapper-styled input[type="checkbox"] {
  display: none;
}

.checkbox-custom-styled {
  width: 26px;
  height: 26px;
  min-width: 26px;
  flex-shrink: 0;
  border: 2px solid rgba(255, 255, 255, 0.25);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  background: rgba(255, 255, 255, 0.05);
  position: relative;
  z-index: 1;
  margin-top: 2px;
}

.checkbox-custom-styled svg {
  width: 14px;
  height: 14px;
  opacity: 0;
  transform: scale(0.5);
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.checkbox-wrapper-styled:hover .checkbox-custom-styled {
  border-color: rgba(74, 158, 255, 0.5);
}

.checkbox-wrapper-styled input[type="checkbox"]:checked + .checkbox-custom-styled {
  background: linear-gradient(135deg, #4a9eff 0%, #2d7cd6 100%);
  border-color: #4a9eff;
  box-shadow: 0 2px 8px rgba(74, 158, 255, 0.4);
}

.checkbox-wrapper-styled input[type="checkbox"]:checked + .checkbox-custom-styled svg {
  opacity: 1;
  transform: scale(1);
}

.checkbox-label-styled {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
  min-width: 0;
  position: relative;
  z-index: 1;
}

.checkbox-label-styled .label-title {
  font-weight: 600;
  font-size: 1rem;
  color: #ffffff;
  letter-spacing: 0.01em;
}

.checkbox-label-styled .label-description {
  font-size: 0.875rem;
  color: rgba(255, 255, 255, 0.6);
  line-height: 1.5;
}

/* Active state styling */
.checkbox-wrapper-styled:has(input[type="checkbox"]:checked) {
  border-color: rgba(74, 158, 255, 0.5);
  background: linear-gradient(135deg, rgba(74, 158, 255, 0.12) 0%, rgba(74, 158, 255, 0.04) 100%);
}

.checkbox-wrapper-styled:has(input[type="checkbox"]:checked) .label-title {
  color: #6bb3ff;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  font-size: 0.95rem;
  color: var(--text-primary);
}

.checkbox-label input[type="checkbox"] {
  display: none;
}

.checkbox-label .checkmark {
  width: 22px;
  height: 22px;
  border: 2px solid var(--border);
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  flex-shrink: 0;
}

.checkbox-label input[type="checkbox"]:checked + .checkmark {
  background: var(--accent);
  border-color: var(--accent);
}

.checkbox-label input[type="checkbox"]:checked + .checkmark::after {
  content: '✓';
  color: white;
  font-size: 14px;
  font-weight: bold;
}

/* Obstacle type selector */
.obstacle-type {
  min-width: 100px;
}

.form-select-small {
  height: 36px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 0.85rem;
}

.obstacle-preview {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed var(--border);
}

.obstacle-badge {
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
}

.obstacle-badge.type-window {
  background: rgba(33, 150, 243, 0.2);
  color: #2196f3;
}

.obstacle-badge.type-recess {
  background: rgba(255, 152, 0, 0.2);
  color: #ff9800;
}

.obstacle-badge.type-groove {
  background: rgba(156, 39, 176, 0.2);
  color: #9c27b0;
}

.obstacle-badge.type-other {
  background: rgba(158, 158, 158, 0.2);
  color: #9e9e9e;
}

.obstacle-range {
  font-size: 0.85rem;
  color: var(--text-secondary);
}

/* Components list */
.components-list {
  max-height: 300px;
  overflow-y: auto;
}

.components-empty {
  text-align: center;
  color: var(--text-secondary);
  padding: 20px;
  font-style: italic;
}

.component-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 0;
  border-bottom: 1px solid var(--border);
}

.component-row:last-child {
  border-bottom: none;
}

.component-name {
  flex: 1;
  color: var(--text-primary);
  font-size: 0.9rem;
}

.component-qty {
  min-width: 60px;
  text-align: center;
  color: var(--accent);
  font-weight: 600;
  font-size: 0.9rem;
}

.component-price {
  min-width: 80px;
  text-align: right;
  color: var(--text-secondary);
  font-size: 0.9rem;
}

/* Pricing card */
.pricing-card .discount-row {
  color: var(--success);
}

.pricing-card .discount-row .value {
  color: var(--success);
}

.pricing-card .total-row {
  background: rgba(74, 158, 255, 0.15);
  margin: 12px -16px -16px;
  padding: 16px;
  border-radius: 0 0 var(--radius-md) var(--radius-md);
  border-bottom: none;
}

.pricing-card .total-row .label {
  font-weight: 600;
  color: var(--text-primary);
}

.pricing-card .total-row .value {
  font-size: 1.2rem;
}

/* Loading indicator */
.loading-indicator {
  display: inline-block;
  margin-left: 10px;
  font-size: 0.8rem;
  color: var(--accent);
  font-weight: normal;
}

/* Email input for offer */
.email-input-section {
  margin-top: 24px;
  padding: 16px;
  background: var(--bg-card);
  border-radius: 8px;
  border: 1px solid var(--border);
}

.email-input-section label {
  display: block;
  margin-bottom: 8px;
  font-weight: 500;
  color: var(--text-primary);
}

.email-input {
  width: 100%;
  padding: 12px 14px;
  font-size: 1rem;
  border: 2px solid var(--border);
  border-radius: 6px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  transition: border-color 0.2s;
}

.email-input:focus {
  outline: none;
  border-color: var(--accent);
}

.email-input.input-error {
  border-color: #e74c3c;
}

.email-input::placeholder {
  color: var(--text-secondary);
}

.error-message {
  color: #e74c3c;
  font-size: 0.85rem;
  margin-top: 6px;
}

/* Summary actions */
.summary-actions {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 24px;
  padding-top: 20px;
  border-top: 2px solid var(--border);
}

/* Saved offer info */
.saved-offer-info {
  margin-top: 20px;
  padding: 16px;
  background: linear-gradient(135deg, #064e3b 0%, #065f46 100%);
  border: 1px solid #10b981;
  border-radius: 10px;
}

.saved-offer-title {
  font-size: 1.1rem;
  font-weight: 600;
  color: #10b981;
  margin-bottom: 12px;
}

.saved-offer-details {
  font-size: 0.95rem;
  line-height: 1.6;
  color: var(--text-primary);
}

.saved-offer-details strong {
  color: var(--text-muted);
}

.saved-offer-link {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid rgba(16, 185, 129, 0.3);
}

.saved-offer-link a {
  color: #10b981;
  text-decoration: none;
  font-weight: 500;
}

.saved-offer-link a:hover {
  text-decoration: underline;
}

.derived-from {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid rgba(16, 185, 129, 0.3);
  font-size: 0.85rem;
  color: var(--text-muted);
}

/* Version history */
.version-history {
  padding: 12px 16px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 8px;
}

.version-history-title {
  font-size: 0.8rem;
  color: var(--text-muted);
  margin-bottom: 8px;
}

.version-chips {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.version-chip {
  padding: 4px 12px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 4px;
  font-size: 0.85rem;
  color: var(--text-primary);
  text-decoration: none;
  transition: all 0.2s;
}

.version-chip:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.version-chip.current {
  background: var(--accent);
  border-color: var(--accent);
  color: white;
  pointer-events: none;
}

/* Ladders in offer list */
.ladders-in-offer-section {
  margin-bottom: 20px;
}

.ladders-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ladder-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 8px;
}

.ladder-item-info {
  flex: 1;
}

.ladder-item-title {
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
}

.ladder-tag {
  font-size: 0.7rem;
  padding: 2px 6px;
  background: #3b82f6;
  color: white;
  border-radius: 4px;
  font-weight: 500;
}

.ladder-item-details {
  font-size: 0.85rem;
  color: var(--text-muted);
  margin-top: 2px;
}

.ladder-item-quantity {
  display: flex;
  align-items: center;
  gap: 8px;
}

.qty-btn {
  width: 28px;
  height: 28px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  cursor: pointer;
  font-size: 1rem;
}

.qty-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.qty-value {
  min-width: 24px;
  text-align: center;
  font-weight: 600;
}

.ladder-remove-btn {
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: #ef4444;
  cursor: pointer;
  font-size: 1rem;
}

.ladder-remove-btn:hover {
  background: rgba(239, 68, 68, 0.15);
}

.current-ladder-section {
  margin-bottom: 16px;
}

.current-ladder-card {
  padding: 12px 14px;
  background: linear-gradient(135deg, #1e3a5f 0%, #2d4a6f 100%);
  border: 2px solid var(--accent);
  border-radius: 8px;
}

.add-ladder-section {
  margin-bottom: 20px;
}

.btn-outline-dashed {
  background: transparent;
  border: 2px dashed var(--border);
  color: var(--text-muted);
  padding: 14px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-outline-dashed:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.btn-block {
  width: 100%;
  justify-content: center;
}

.btn-outline {
  background: transparent;
  border: 2px solid var(--accent);
  color: var(--accent);
}

.btn-outline:hover {
  background: rgba(74, 158, 255, 0.1);
}

.btn-success {
  background: #10b981;
  color: white;
  border: none;
}

.btn-success:hover {
  background: #059669;
}

/* ============================================
   SUMMARY FULLSCREEN LAYOUT
   ============================================ */
.summary-full-layout {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  padding: 30px 20px;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

.summary-panel {
  max-width: 900px;
  width: 100%;
  margin: 0 auto;
}

.add-ladder-section {
  margin: 24px 0;
}

.btn-outline-dashed {
  background: transparent;
  border: 2px dashed var(--accent);
  color: var(--accent);
  padding: 20px;
  font-size: 1rem;
  font-weight: 500;
  transition: all 0.2s;
}

.btn-outline-dashed:hover {
  background: rgba(74, 158, 255, 0.1);
  border-color: var(--accent-hover);
}

/* ============================================
   BRACKET INFO POPUP
   ============================================ */
.bracket-group {
  position: relative;
}

.bracket-help-link {
  display: inline-block;
  margin-top: 8px;
  color: var(--accent);
  font-size: 0.85rem;
  text-decoration: none;
  cursor: pointer;
}

.bracket-help-link:hover {
  text-decoration: underline;
}

.bracket-info-popup {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  z-index: 100;
  margin-top: 8px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  animation: popupFadeIn 0.2s ease;
}

@keyframes popupFadeIn {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.bracket-info-content {
  position: relative;
  padding: 20px;
}

.bracket-info-content h4 {
  color: var(--accent);
  font-size: 1rem;
  margin-bottom: 12px;
}

.popup-close {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 28px;
  height: 28px;
  background: transparent;
  border: none;
  color: var(--text-secondary);
  font-size: 1.5rem;
  cursor: pointer;
  line-height: 1;
}

.popup-close:hover {
  color: var(--text-primary);
}

.popup-intro {
  font-size: 0.9rem;
  color: var(--text-secondary);
  margin-bottom: 12px;
}

.bracket-info-content ul {
  list-style: none;
  padding: 0;
  margin: 0 0 12px 0;
}

.bracket-info-content li {
  padding: 8px 0;
  border-bottom: 1px solid var(--border);
  font-size: 0.9rem;
  color: var(--text-primary);
}

.bracket-info-content li:last-child {
  border-bottom: none;
}

.popup-note {
  font-size: 0.8rem;
  color: var(--text-muted);
  margin-top: 12px;
  padding: 10px;
  background: rgba(74, 158, 255, 0.1);
  border-radius: var(--radius-sm);
}

.hint.warning {
  color: var(--warning);
  background: rgba(255, 152, 0, 0.1);
  padding: 10px;
  border-radius: var(--radius-sm);
  margin-top: 8px;
}

/* ============================================
   CONFIG TYPE BADGE
   ============================================ */
.config-type-badge {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  background: var(--bg-primary);
  border-radius: var(--radius-md);
  margin-bottom: 20px;
  border-left: 3px solid var(--accent);
}

.config-type-badge .type-label {
  color: var(--text-secondary);
  font-size: 0.9rem;
}

.config-type-badge .type-value {
  color: var(--accent);
  font-weight: 600;
  font-size: 1rem;
}

/* ============================================
   SCHEME SELECTOR (inline cards)
   ============================================ */
.scheme-selector {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.scheme-option {
  background: var(--bg-primary);
  border: 2px solid var(--border);
  border-radius: var(--radius-md);
  padding: 16px 12px;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s ease;
}

.scheme-option:hover {
  border-color: var(--accent);
  background: rgba(74, 158, 255, 0.05);
}

.scheme-option.selected {
  border-color: var(--accent);
  background: rgba(74, 158, 255, 0.15);
  box-shadow: 0 0 12px rgba(74, 158, 255, 0.2);
}

.scheme-option .scheme-icon {
  font-size: 1.8rem;
  margin-bottom: 8px;
}

.scheme-option .scheme-label {
  font-weight: 600;
  font-size: 0.9rem;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.scheme-option.selected .scheme-label {
  color: var(--accent);
}

.scheme-option .scheme-desc {
  font-size: 0.75rem;
  color: var(--text-muted);
  line-height: 1.3;
}

/* ============================================
   CAGE SELECTOR (horizontal cards)
   ============================================ */
.cage-selector {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.cage-option {
  display: flex;
  align-items: center;
  gap: 15px;
  background: var(--bg-primary);
  border: 2px solid var(--border);
  border-radius: var(--radius-md);
  padding: 16px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.cage-option:hover {
  border-color: var(--accent);
  background: rgba(74, 158, 255, 0.05);
}

.cage-option.selected {
  border-color: var(--accent);
  background: rgba(74, 158, 255, 0.15);
  box-shadow: 0 0 12px rgba(74, 158, 255, 0.2);
}

.cage-option .cage-icon {
  font-size: 1.5rem;
  min-width: 40px;
  text-align: center;
}

.cage-option .cage-content {
  flex: 1;
}

.cage-option .cage-label {
  font-weight: 600;
  font-size: 0.95rem;
  color: var(--text-primary);
  margin-bottom: 3px;
}

.cage-option.selected .cage-label {
  color: var(--accent);
}

.cage-option .cage-desc {
  font-size: 0.8rem;
  color: var(--text-muted);
  line-height: 1.4;
}

/* ============================================
   RESPONSIVE
   ============================================ */
@media (max-width: 900px) {
  .split-layout {
    flex-direction: column;
  }

  .visualization-panel {
    height: 40vh;
    min-height: 250px;
  }

  .config-panel-wrapper {
    width: 100%;
    max-width: 100%;
    flex: 1;
  }

  .choice-grid-fullscreen.cols-2,
  .choice-grid-fullscreen.cols-3 {
    grid-template-columns: 1fr;
  }

  .viewer3d-controls {
    top: 5px;
    right: 5px;
  }

  .viewer3d-visibility-btn {
    padding: 6px 10px;
    font-size: 11px;
  }

  /* Scheme selector - stack on mobile */
  .scheme-selector {
    grid-template-columns: 1fr;
  }

  .scheme-option {
    display: flex;
    align-items: center;
    text-align: left;
    gap: 12px;
    padding: 14px;
  }

  .scheme-option .scheme-icon {
    font-size: 1.5rem;
    margin-bottom: 0;
    min-width: 40px;
    text-align: center;
  }

  .scheme-option .scheme-label {
    margin-bottom: 2px;
  }
}

/* Ostrzeżenie o przeszkodzie ponad ścianą */
.obstacle-above-wall-warning {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
  border: 1px solid #f59e0b;
  border-radius: 8px;
  margin-top: 12px;
  animation: fadeIn 0.3s ease;
}

.obstacle-warning-icon {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  color: #d97706;
}

.obstacle-warning-icon svg {
  width: 100%;
  height: 100%;
}

.obstacle-warning-text {
  color: #92400e;
  font-weight: 500;
  font-size: 14px;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(-5px); }
  to { opacity: 1; transform: translateY(0); }
}

/* Wall point obstacle type */
.obstacle-type-card--wall-point:hover .wall-point-svg rect:nth-child(2) {
  fill: #22c55e;
  fill-opacity: 0.6;
}

.obstacle-badge.type-wall-point {
  background: #22c55e;
  color: white;
}

/* ============================================ */
/* CUSTOMER WIZARD STYLES - DARK THEME */
/* ============================================ */
.customer-progress {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

.customer-step-title {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}

.customer-step-desc {
  font-size: 0.9rem;
  color: var(--text-muted);
  margin: 0;
}

.customer-progress-row {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.customer-progress-bar {
  flex: 1;
  height: 8px;
  background: var(--bg-card);
  border-radius: 4px;
  overflow: hidden;
}

.customer-progress-fill {
  height: 100%;
  background: var(--accent);
  transition: width 0.4s ease;
}

.customer-progress-text {
  font-size: 0.95rem;
  color: var(--text-secondary);
  font-weight: 500;
  white-space: nowrap;
}

.customer-wizard {
  padding: 1.5rem;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.wizard-step {
  flex: 1;
  animation: fadeIn 0.3s ease;
}

.wizard-step h3 {
  margin: 0 0 1.25rem 0;
  font-size: 1.3rem;
  color: var(--text-primary);
  font-weight: 600;
}

.wizard-step .step-intro {
  color: var(--text-secondary);
  margin-bottom: 1.5rem;
  font-size: 1rem;
  line-height: 1.6;
}

.roof-type-options {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.roof-type-btn {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  padding: 1.25rem;
  border: 2px solid var(--border);
  border-radius: 10px;
  background: var(--bg-card);
  cursor: pointer;
  transition: all 0.2s ease;
  text-align: left;
}

.roof-type-btn:hover {
  border-color: var(--accent);
  background: var(--bg-card-hover);
}

.roof-type-btn.selected {
  border-color: var(--accent);
  background: rgba(74, 158, 255, 0.15);
}

.roof-type-btn .roof-icon {
  font-size: 1.75rem;
  margin-bottom: 0.5rem;
  color: var(--text-secondary);
}

.roof-type-btn.selected .roof-icon {
  color: var(--accent);
}

.roof-type-btn .roof-label {
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--text-primary);
}

.roof-type-btn .roof-desc {
  font-size: 0.9rem;
  color: var(--text-muted);
  margin-top: 0.25rem;
}

.toggle-options {
  display: flex;
  gap: 0.75rem;
  margin-bottom: 1.25rem;
}

.toggle-btn {
  flex: 1;
  padding: 1rem 1.25rem;
  border: 2px solid var(--border);
  border-radius: 8px;
  background: var(--bg-card);
  color: var(--text-primary);
  cursor: pointer;
  font-weight: 600;
  font-size: 0.95rem;
  transition: all 0.2s ease;
}

.toggle-btn:hover {
  border-color: var(--accent);
  background: var(--bg-card-hover);
}

.toggle-btn.selected {
  border-color: var(--accent);
  background: rgba(74, 158, 255, 0.15);
  color: var(--accent);
}

/* Toggle buttons with descriptions */
.toggle-options-with-desc {
  display: flex;
  gap: 0.75rem;
  margin-bottom: 1.25rem;
}

.toggle-btn-desc {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 1.25rem 1rem;
  border: 2px solid var(--border);
  border-radius: 10px;
  background: var(--bg-card);
  cursor: pointer;
  transition: all 0.2s ease;
  text-align: center;
}

.toggle-btn-desc:hover {
  border-color: var(--accent);
  background: var(--bg-card-hover);
}

.toggle-btn-desc.selected {
  border-color: var(--accent);
  background: rgba(74, 158, 255, 0.15);
}

.toggle-btn-desc .toggle-label {
  font-weight: 600;
  font-size: 1rem;
  color: var(--text-primary);
}

.toggle-btn-desc.selected .toggle-label {
  color: var(--accent);
}

.toggle-btn-desc .toggle-desc {
  font-size: 0.8rem;
  color: var(--text-muted);
  line-height: 1.3;
}

.cage-options,
.suspended-height,
.obstacles-section {
  margin-top: 1.25rem;
  padding: 1.25rem;
  background: var(--bg-card);
  border-radius: 8px;
  border: 1px solid var(--border);
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
  cursor: pointer;
  font-size: 1rem;
  color: var(--text-primary);
}

.checkbox-label input {
  width: 20px;
  height: 20px;
  accent-color: var(--accent);
}

.customer-wizard .summary-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  background: var(--bg-card);
  padding: 1.25rem;
  border-radius: 10px;
  border: 1px solid var(--border);
}

.customer-wizard .summary-item {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.customer-wizard .summary-item .label {
  font-size: 0.8rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.customer-wizard .summary-item .value {
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--text-primary);
}

/* Edytowalna lista podsumowania */
.customer-wizard .summary-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-right: 4px;
}

/* Scrollable content for step 9 */
.customer-wizard .wizard-step:has(.summary-list) {
  max-height: calc(100vh - 380px);
  overflow-y: auto;
  padding-bottom: 180px;
}

.customer-wizard .wizard-step:has(.summary-list)::-webkit-scrollbar {
  width: 6px;
}

.customer-wizard .wizard-step:has(.summary-list)::-webkit-scrollbar-track {
  background: var(--bg-secondary);
  border-radius: 3px;
}

.customer-wizard .wizard-step:has(.summary-list)::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: 3px;
}

.customer-wizard .wizard-step:has(.summary-list)::-webkit-scrollbar-thumb:hover {
  background: var(--text-muted);
}

.customer-wizard .summary-list::-webkit-scrollbar {
  width: 6px;
}

.customer-wizard .summary-list::-webkit-scrollbar-track {
  background: var(--bg-secondary);
  border-radius: 3px;
}

.customer-wizard .summary-list::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: 3px;
}

.customer-wizard .summary-list::-webkit-scrollbar-thumb:hover {
  background: var(--text-muted);
}

.customer-wizard .summary-edit-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.customer-wizard .summary-edit-item:hover {
  border-color: var(--accent);
  background: rgba(52, 152, 219, 0.05);
}

.customer-wizard .summary-edit-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.customer-wizard .summary-edit-label {
  font-size: 0.75rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.customer-wizard .summary-edit-value {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-primary);
}

.customer-wizard .summary-edit-icon {
  font-size: 1.1rem;
  color: var(--text-muted);
  opacity: 0.5;
  transition: opacity 0.2s ease;
}

.customer-wizard .summary-edit-item:hover .summary-edit-icon {
  opacity: 1;
  color: var(--accent);
}

/* Expandable summary items */
.customer-wizard .summary-expand-item {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow: hidden;
  transition: all 0.2s ease;
}

.customer-wizard .summary-expand-item.expanded {
  border-color: var(--accent);
}

.customer-wizard .summary-expand-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  cursor: pointer;
  transition: background 0.2s ease;
}

.customer-wizard .summary-expand-header:hover {
  background: rgba(52, 152, 219, 0.05);
}

.customer-wizard .summary-expand-icon {
  font-size: 0.8rem;
  color: var(--text-muted);
  transition: transform 0.2s ease;
}

.customer-wizard .summary-expand-content {
  padding: 12px 16px;
  border-top: 1px solid var(--border);
  background: rgba(0, 0, 0, 0.1);
}

.customer-wizard .toggle-options.compact {
  margin-bottom: 0;
}

.customer-wizard .toggle-options.compact .toggle-btn {
  padding: 0.75rem 1rem;
  font-size: 0.9rem;
}

.customer-wizard .form-group.compact {
  margin-bottom: 0;
}

.customer-wizard .form-group.compact label {
  font-size: 0.85rem;
  margin-bottom: 0.25rem;
}

.customer-wizard .form-group.compact .input-with-unit input {
  padding: 0.5rem 0.75rem;
}

/* Dual inputs side by side */
.customer-wizard .summary-dual-inputs {
  display: flex;
  gap: 12px;
}

.customer-wizard .summary-dual-inputs .form-group {
  flex: 1;
}

/* Vertical toggle buttons for scheme selection */
.customer-wizard .toggle-options-vertical {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.customer-wizard .toggle-btn-vertical {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border: 2px solid var(--border);
  border-radius: 8px;
  background: var(--bg-card);
  color: var(--text-primary);
  cursor: pointer;
  font-size: 0.9rem;
  font-weight: 500;
  transition: all 0.2s ease;
}

.customer-wizard .toggle-btn-vertical:hover:not(.disabled) {
  border-color: var(--accent);
  background: var(--bg-card-hover);
}

.customer-wizard .toggle-btn-vertical.selected {
  border-color: var(--accent);
  background: rgba(74, 158, 255, 0.15);
  color: var(--accent);
}

.customer-wizard .toggle-btn-vertical.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.customer-wizard .toggle-btn-vertical .toggle-btn-lock {
  font-size: 0.85rem;
}

.customer-wizard .toggle-btn-vertical .toggle-btn-required {
  font-size: 0.75rem;
  color: var(--accent);
  background: rgba(74, 158, 255, 0.2);
  padding: 2px 8px;
  border-radius: 4px;
}

.customer-wizard .scheme-lock-info {
  margin: 8px 0 0 0;
  font-size: 0.8rem;
  color: var(--text-muted);
  font-style: italic;
}

.customer-wizard .locked-icon {
  margin-left: 6px;
  font-size: 0.85rem;
}

/* Quick options section */
.customer-wizard .summary-quick-options {
  margin-top: 1.5rem;
  padding-top: 1rem;
  border-top: 1px solid var(--border);
}

.customer-wizard .summary-quick-options h4 {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text-secondary);
  margin: 0 0 1rem 0;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.customer-wizard .summary-quick-checkbox {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 14px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 10px;
  cursor: pointer;
  margin-bottom: 8px;
  transition: all 0.2s ease;
}

.customer-wizard .summary-quick-checkbox:hover {
  border-color: var(--accent);
  background: rgba(52, 152, 219, 0.05);
}

.customer-wizard .summary-quick-checkbox input[type="checkbox"] {
  display: none;
}

.customer-wizard .summary-quick-checkbox .checkmark {
  width: 22px;
  height: 22px;
  min-width: 22px;
  border: 2px solid var(--border);
  border-radius: 6px;
  background: var(--bg-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.customer-wizard .summary-quick-checkbox input:checked + .checkmark {
  background: var(--accent);
  border-color: var(--accent);
}

.customer-wizard .summary-quick-checkbox input:checked + .checkmark::after {
  content: '✓';
  color: white;
  font-size: 14px;
  font-weight: bold;
}

.customer-wizard .summary-quick-checkbox .quick-label {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.customer-wizard .summary-quick-checkbox .quick-title {
  font-weight: 600;
  font-size: 0.95rem;
  color: var(--text-primary);
}

.customer-wizard .summary-quick-checkbox .quick-desc {
  font-size: 0.8rem;
  color: var(--text-muted);
}

.customer-wizard .no-options-hint {
  font-size: 0.85rem;
  color: var(--text-muted);
  font-style: italic;
  text-align: center;
  padding: 1rem;
}

/* Fixed actions at bottom of step 9 */
.customer-wizard .summary-fixed-actions {
  position: absolute;
  bottom: 20px;
  left: 0;
  right: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px 20px;
  background: linear-gradient(to top, var(--bg-secondary) 80%, transparent);
  z-index: 10;
}

.customer-wizard .summary-fixed-actions button {
  width: 100%;
  padding: 14px;
  border-radius: 10px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.customer-wizard .summary-fixed-actions .btn-secondary {
  background: var(--bg-card);
  border: 2px solid var(--border);
  color: var(--text-primary);
}

.customer-wizard .summary-fixed-actions .btn-secondary:hover {
  border-color: var(--accent);
  background: rgba(52, 152, 219, 0.1);
}

.customer-wizard .summary-fixed-actions .btn-primary {
  background: var(--accent);
  border: none;
  color: white;
}

.customer-wizard .summary-fixed-actions .btn-primary:hover {
  background: #2980b9;
}

.customer-wizard .summary-fixed-actions .btn-back {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text-muted);
  padding: 10px;
  font-size: 0.9rem;
}

.customer-wizard .summary-fixed-actions .btn-back:hover {
  border-color: var(--text-primary);
  color: var(--text-primary);
}

/* Reset button in header - same style as back button */
.back-button.reset-button {
  position: relative;
}

.back-button.reset-button .reset-tooltip {
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  margin-top: 8px;
  padding: 6px 12px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 0.8rem;
  color: var(--text-primary);
  white-space: nowrap;
  opacity: 0;
  visibility: hidden;
  transition: all 0.2s ease;
  pointer-events: none;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  z-index: 1000;
}

.back-button.reset-button .reset-tooltip::before {
  content: '';
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  border: 6px solid transparent;
  border-bottom-color: var(--border);
}

.back-button.reset-button .reset-tooltip::after {
  content: '';
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  border: 5px solid transparent;
  border-bottom-color: var(--bg-card);
}

.back-button.reset-button:hover .reset-tooltip {
  opacity: 1;
  visibility: visible;
}

/* Header view selector for customer mode */
.header-view-selector {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 8px;
  background: linear-gradient(165deg, rgba(30,30,40,0.95) 0%, rgba(20,20,30,0.98) 100%);
  padding: 8px;
  border-radius: 12px;
  border: 1px solid rgba(255,255,255,0.15);
  box-shadow: 0 4px 20px rgba(0,0,0,0.3);
}

.header-view-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 10px 18px;
  background: transparent;
  border: 2px solid transparent;
  border-radius: 8px;
  color: #aaa;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.header-view-btn svg {
  width: 22px;
  height: 22px;
}

.header-view-btn:hover {
  color: #fff;
  background: rgba(255,255,255,0.1);
}

.header-view-btn.active {
  color: var(--accent);
  border-color: var(--accent);
  background: rgba(74, 158, 255, 0.15);
}

/* Reset confirmation popup */
.reset-confirm-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.reset-confirm-popup {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 2rem;
  max-width: 400px;
  width: 90%;
  text-align: center;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}

.reset-confirm-popup h3 {
  margin: 0 0 0.75rem 0;
  font-size: 1.25rem;
  color: var(--text-primary);
}

.reset-confirm-popup p {
  margin: 0 0 1.5rem 0;
  color: var(--text-muted);
  font-size: 0.95rem;
}

.reset-confirm-buttons {
  display: flex;
  gap: 12px;
  justify-content: center;
}

.reset-confirm-buttons button {
  padding: 12px 24px;
  border-radius: 8px;
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.reset-confirm-buttons .btn-cancel {
  background: var(--bg-card);
  border: 1px solid var(--border);
  color: var(--text-primary);
}

.reset-confirm-buttons .btn-cancel:hover {
  border-color: var(--text-muted);
}

.reset-confirm-buttons .btn-confirm {
  background: #e74c3c;
  border: none;
  color: white;
}

.reset-confirm-buttons .btn-confirm:hover {
  background: #c0392b;
}

.wizard-nav {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: auto;
  padding-top: 1.5rem;
  border-top: 1px solid var(--border);
  gap: 1rem;
}

.wizard-nav-btn {
  padding: 0.875rem 2rem;
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.wizard-nav-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.wizard-nav-btn.prev {
  background: var(--bg-card);
  color: var(--text-secondary);
  border: 1px solid var(--border);
}

.wizard-nav-btn.prev:hover:not(:disabled) {
  background: var(--bg-card-hover);
  color: var(--text-primary);
}

.wizard-nav-btn.next {
  background: var(--accent);
  color: white;
  flex: 1;
  max-width: 200px;
}

.wizard-nav-btn.next:hover:not(:disabled) {
  background: var(--accent-hover);
}

.customer-wizard .btn-primary {
  padding: 1rem 2rem;
  border: none;
  border-radius: 8px;
  background: #27ae60;
  color: white;
  font-size: 1.1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.customer-wizard .btn-primary:hover {
  background: #2ecc71;
}

.customer-wizard .form-group {
  margin-bottom: 1.5rem;
}

.customer-wizard .form-group label {
  display: block;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 0.75rem;
  font-size: 1rem;
}

.customer-wizard .input-with-unit {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.customer-wizard .input-with-unit input {
  flex: 1;
  max-width: 160px;
  padding: 0.875rem 1rem;
  border: 2px solid var(--border);
  border-radius: 8px;
  font-size: 1.15rem;
  font-weight: 500;
  background: var(--bg-card);
  color: var(--text-primary);
  transition: border-color 0.2s;
}

.customer-wizard .input-with-unit input:focus {
  outline: none;
  border-color: var(--accent);
}

.customer-wizard .input-with-unit .unit {
  font-size: 1.1rem;
  color: var(--text-secondary);
  font-weight: 500;
}

.customer-wizard .hint {
  display: block;
  font-size: 0.9rem;
  color: var(--text-muted);
  margin-top: 0.5rem;
}

/* Customer checkbox styled */
.customer-checkbox {
  display: flex;
  align-items: flex-start;
  gap: 0.875rem;
  cursor: pointer;
  padding: 1rem;
  background: var(--bg-primary);
  border-radius: 8px;
  border: 1px solid var(--border);
  transition: all 0.2s;
}

.customer-checkbox:hover {
  border-color: var(--accent);
}

.customer-checkbox input {
  display: none;
}

.customer-checkbox-box {
  width: 24px;
  height: 24px;
  min-width: 24px;
  border: 2px solid var(--border);
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-card);
  transition: all 0.2s;
}

.customer-checkbox-box svg {
  width: 16px;
  height: 16px;
  opacity: 0;
  transition: opacity 0.2s;
}

.customer-checkbox input:checked + .customer-checkbox-box {
  background: var(--accent);
  border-color: var(--accent);
}

.customer-checkbox input:checked + .customer-checkbox-box svg {
  opacity: 1;
  color: white;
}

.customer-checkbox-text {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  color: var(--text-primary);
  font-weight: 500;
  font-size: 1rem;
}

.customer-checkbox-text small {
  font-weight: 400;
  font-size: 0.85rem;
  color: var(--text-muted);
}

.cage-info {
  color: var(--text-secondary);
  font-size: 0.95rem;
  margin: 0;
  padding: 0.75rem;
  background: var(--bg-primary);
  border-radius: 6px;
  border-left: 3px solid var(--accent);
}

/* Obstacles customer */
.obstacles-list-customer {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.obstacle-item-customer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  background: var(--bg-primary);
  border-radius: 8px;
  border: 1px solid var(--border);
}

.obstacle-item-info {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.obstacle-type-label {
  font-weight: 600;
  color: var(--text-primary);
}

.obstacle-dims {
  font-size: 0.85rem;
  color: var(--text-muted);
}

.obstacle-remove-btn {
  padding: 0.5rem 0.75rem;
  background: transparent;
  border: 1px solid #e74c3c;
  border-radius: 6px;
  color: #e74c3c;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.2s;
}

.obstacle-remove-btn:hover {
  background: #e74c3c;
  color: white;
}

.obstacle-item-editable {
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 0.75rem;
}

.obstacle-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
}

.obstacle-number {
  font-weight: 600;
  color: var(--text-primary);
  font-size: 0.9rem;
}

.form-row-customer {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}

.add-obstacle-btn {
  width: 100%;
  padding: 0.75rem;
  background: transparent;
  border: 1px dashed var(--accent);
  border-radius: 8px;
  color: var(--accent);
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.2s;
}

.add-obstacle-btn:hover {
  background: rgba(52, 152, 219, 0.1);
  border-style: solid;
}

.add-obstacle-form {
  padding: 1rem;
  background: var(--bg-primary);
  border-radius: 8px;
  border: 1px solid var(--border);
}

.form-row-customer {
  display: flex;
  gap: 1rem;
  margin-bottom: 1rem;
}

.form-row-customer .form-group {
  flex: 1;
}

.add-obstacle-btn {
  width: 100%;
  padding: 0.75rem 1rem;
  background: var(--accent);
  border: none;
  border-radius: 8px;
  color: white;
  font-weight: 600;
  font-size: 0.95rem;
  cursor: pointer;
  transition: background 0.2s;
}

.add-obstacle-btn:hover {
  background: var(--accent-hover);
}
</style>
