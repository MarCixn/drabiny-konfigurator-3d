<script setup lang="ts">
/**
 * SellerEmbedLayout - Mode C
 * Compact configurator for embedding in seller panel
 * All options in single view + PostMessage communication
 */

import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import ThreeCanvas from '../components/ThreeCanvas.vue'
import { calculateLocal } from '../services/api'
import { postMessageService, type LadderConfig, type ConfigResult } from '../services/postMessage'

// ============================================
// REFS
// ============================================
const threeCanvasRef = ref<InstanceType<typeof ThreeCanvas> | null>(null)

// ============================================
// STATE
// ============================================
const state = ref({
  purpose: 'external' as 'external' | 'internal',
  scheme: 'no-platform' as 'no-platform' | 'with-platform' | 'attic-passage',
  cage: 'no-cage' as 'no-cage' | 'with-cage',
  wallHeight: 5,
  bracketType: 'short' as 'short' | 'medium' | 'long' | 'custom',
  bracketTypeManual: false,  // Czy użytkownik ręcznie wybrał wspornik wejścia
  bracketSpacing: 215,
  insulationThickness: 0,
  // Suspension
  suspended: false,
  suspendedHeight: 2.5,
  // Eave
  hasEave: false,
  eaveDepth: 30,
  eaveHeight: 50,
  // Attic
  atticWallHeight: 1,
  atticWallThickness: 25,
  atticInsulationThickness: 0,
  atticBackInsulationThickness: 0,
  atticMinDistance: 5,  // Dystans podest-attyka w cm (domyślnie 5cm = 50mm)
  descentMountType: 'custom-base' as 'standard' | 'bigfoot' | 'custom-base' | 'brackets' | 'self',
  descentBracketType: 'short' as 'short' | 'medium' | 'long',
  descentBracketTypeManual: false,  // Czy użytkownik ręcznie wybrał wspornik zejścia
  descentBracketSpacing: 215,  // Odległość wsporników strony zejścia (mm)
  customBaseHeight: 0,  // Wysokość własnego podłoża w cm (0 dla "brak")
  // Options
  cageClosing: false,
  restingPlatform: false,
  portableLadder: false,
  accessLock: false,
  hasHandrails: true,  // +1.1m poręcze asekuracyjne
  // Obstacles
  hasObstacles: false,
  obstacles: [] as Array<{ id: number; type: string; heightFrom: number; height: number }>
})

// Expanded item in accordion
const expandedItem = ref<string | null>(null)

// BOM & Pricing
const bomItems = ref<Array<{ code: string; name: string; quantity: number; unit: string; unitPrice: number; totalPrice: number }>>([])
const pricing = ref({ netto: 0, vat: 0, brutto: 0 })
const isCalculating = ref(false)

// Flaga blokująca watchery podczas applyConfig
let isApplyingConfig = false

// ============================================
// COMPUTED - ThreeCanvas Props
// ============================================
function calculateLadderStructure() {
  const wallHeightMm = state.value.wallHeight * 1000
  const RUNG_SPACING = 275
  const RAIL_HEIGHT_X7 = 1925
  const MAX_GROUND_DISTANCE = 300
  const HANDRAIL_HEIGHT = 1100
  const PLATFORM_OFFSET = 50

  let totalClimbHeight = wallHeightMm
  if (state.value.scheme === 'with-platform') totalClimbHeight += PLATFORM_OFFSET
  if (state.value.scheme !== 'attic-passage') totalClimbHeight += HANDRAIL_HEIGHT

  // Calculate distance from ground
  let distanceFromGround = totalClimbHeight % RUNG_SPACING
  if (distanceFromGround < MAX_GROUND_DISTANCE / 2) {
    distanceFromGround += RUNG_SPACING
  }

  // Calculate number of full x7 modules
  const climbableHeight = totalClimbHeight - distanceFromGround
  const numX7 = Math.floor(climbableHeight / RAIL_HEIGHT_X7)

  // Calculate final rungs
  const remainingHeight = climbableHeight - numX7 * RAIL_HEIGHT_X7
  const finalRungs = Math.ceil(remainingHeight / RUNG_SPACING)

  // Calculate cage hoops
  const cageStartHeight = Math.max(2200, state.value.suspended ? state.value.suspendedHeight * 1000 : 0)
  const cageHeight = totalClimbHeight - cageStartHeight
  const cageHoops = Math.max(0, Math.ceil(cageHeight / 700))

  return { numX7, finalRungs, cageHoops, distanceFromGround }
}

// Aktualny dystans podest-attyka (obliczony dla BIGFOOT/custom-base, prosty dla brackets/self)
// MUSI BYĆ PRZED threeCanvasProps i descentLadderData!
const actualPlatformDistance = computed(() => {
  const mountType = state.value.descentMountType
  if (mountType !== 'bigfoot' && mountType !== 'custom-base') {
    return state.value.atticMinDistance || 5  // Default 5cm
  }

  const wallHeightMm = (state.value.atticWallHeight || 0) * 1000
  const minDistanceMm = (state.value.atticMinDistance || 5) * 10  // Default 5cm = 50mm
  const BIGFOOT_HEIGHT = 90
  const RUNG_SPACING = 275
  const BIGFOOT_CONNECTION_OVERLAP = 105

  const footHeight = mountType === 'custom-base'
    ? (state.value.customBaseHeight || 0) * 10
    : BIGFOOT_HEIGHT

  const baseHeight = RUNG_SPACING + footHeight
  const extendedHeight = baseHeight + BIGFOOT_CONNECTION_OVERLAP
  const targetHeight = wallHeightMm + minDistanceMm

  let calculatedPlatformDistance = 0
  if (targetHeight <= baseHeight) {
    calculatedPlatformDistance = baseHeight - wallHeightMm
  } else if (targetHeight <= extendedHeight) {
    calculatedPlatformDistance = extendedHeight - wallHeightMm
  } else {
    for (let i = 1; i <= 4; i++) {
      const totalHeight = baseHeight + (i * RUNG_SPACING)
      if (totalHeight >= targetHeight) {
        calculatedPlatformDistance = totalHeight - wallHeightMm
        break
      }
    }
  }
  return calculatedPlatformDistance / 10  // mm -> cm
})

// Obliczenia drabiny zejścia (dla attyki)
// MUSI BYĆ PRZED threeCanvasProps!
const descentLadderData = computed(() => {
  if (state.value.scheme !== 'attic-passage') {
    return null
  }

  const mountType = state.value.descentMountType
  const descentWallHeightMm = (state.value.atticWallHeight || 0) * 1000
  const minDistanceMm = (state.value.atticMinDistance || 5) * 10  // Default 5cm = 50mm
  const platformDistanceMm = actualPlatformDistance.value * 10

  const RUNG_SPACING = 275
  const BIGFOOT_HEIGHT = 90
  const BIGFOOT_CONNECTION_OVERLAP = 105
  const MIN_LAST_RUNG = 40
  const MAX_LAST_RUNG = 330

  if (mountType === 'bigfoot' || mountType === 'custom-base') {
    const footHeight = mountType === 'custom-base'
      ? (state.value.customBaseHeight || 0) * 10
      : BIGFOOT_HEIGHT

    const baseHeight = RUNG_SPACING + footHeight
    const extendedHeight = baseHeight + BIGFOOT_CONNECTION_OVERLAP
    const targetHeight = descentWallHeightMm + minDistanceMm

    let descentRungs = 0
    let calculatedPlatformDistance = 0

    if (targetHeight <= baseHeight) {
      calculatedPlatformDistance = baseHeight - descentWallHeightMm
      descentRungs = 0
    } else if (targetHeight <= extendedHeight) {
      calculatedPlatformDistance = extendedHeight - descentWallHeightMm
      descentRungs = 0
    } else {
      for (let i = 1; i <= 4; i++) {
        const totalHeight = baseHeight + (i * RUNG_SPACING)
        if (totalHeight >= targetHeight) {
          descentRungs = i
          calculatedPlatformDistance = totalHeight - descentWallHeightMm
          break
        }
      }
    }

    return {
      type: mountType,
      rungs: descentRungs,
      repeatLadder7: 0,
      endLadderRungs: descentRungs,
      platformDistanceMm: calculatedPlatformDistance
    }

  } else if (mountType === 'brackets' || mountType === 'self') {
    const ladderHeight = descentWallHeightMm + platformDistanceMm - 515
    let rungCount = Math.max(1, Math.round(ladderHeight / RUNG_SPACING))

    const actualLadderSpan = (rungCount - 1) * RUNG_SPACING
    const lastRungOffset = ladderHeight - actualLadderSpan

    if (lastRungOffset > MAX_LAST_RUNG) {
      rungCount++
    } else if (lastRungOffset < MIN_LAST_RUNG && rungCount > 1) {
      rungCount--
    }

    rungCount = Math.max(1, rungCount)

    const finalLadderSpan = (rungCount - 1) * RUNG_SPACING
    const lastRungToRoof = ladderHeight - finalLadderSpan

    let numX7 = 0
    let endLadderRungs = rungCount

    if (rungCount <= 7) {
      endLadderRungs = rungCount
    } else {
      numX7 = 1
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

const threeCanvasProps = computed(() => {
  const ladderConfig = calculateLadderStructure()

  // Efektywny schemat - jeśli hasHandrails=false i klasyczna, użyj 'none' (bez poręczy)
  // Dla podestu zawsze zachowaj 'with-platform' (podest się renderuje razem z poręczami)
  const effectiveScheme = (!state.value.hasHandrails && state.value.scheme === 'no-platform')
    ? 'none'
    : state.value.scheme

  // Oblicz czy pokazać ocieplenie attyki (tylko dla attic-passage i gdy grubość > 0)
  const isAtticPassage = state.value.scheme === 'attic-passage'
  const showAtticInsulation = isAtticPassage && state.value.atticInsulationThickness > 0
  const showAtticBackInsulation = isAtticPassage && state.value.atticBackInsulationThickness > 0

  console.log('=== threeCanvasProps COMPUTED ===')
  console.log('isAtticPassage:', isAtticPassage)
  console.log('state.atticInsulationThickness:', state.value.atticInsulationThickness)
  console.log('showAtticInsulation:', showAtticInsulation)
  console.log('showAtticBackInsulation:', showAtticBackInsulation)

  return {
    numX7Ladders: ladderConfig.numX7,
    finalLadderRungs: ladderConfig.finalRungs,
    safetyCageCount: state.value.cage === 'with-cage' ? ladderConfig.cageHoops : 0,
    wallHeight: state.value.wallHeight,
    scheme: effectiveScheme,
    wspornikDistance: state.value.bracketSpacing || 215,
    showWall: true,
    showGround: true,
    showInsulation: state.value.insulationThickness > 0,
    // Ocieplenie dla klasyczna/z_podestem
    hasInsulation: state.value.insulationThickness > 0,
    insulationThickness: state.value.insulationThickness * 10,  // cm -> mm
    // Ocieplenie dla przełaz attykowy (strona wejścia) - z walidacją scheme
    atticHasInsulation: showAtticInsulation,
    atticInsulationThickness: showAtticInsulation
      ? (state.value.atticInsulationThickness || 10) * 10  // cm -> mm, default 10cm
      : 0,
    suspended: state.value.suspended,
    suspendedHeight: state.value.suspendedHeight,
    hasHandrails: state.value.hasHandrails,
    obstacles: state.value.obstacles.map(obs => ({
      id: obs.id,
      bottomHeightMm: obs.heightFrom * 1000,
      heightMm: obs.height * 1000,
      topHeightMm: (obs.heightFrom + obs.height) * 1000,
      type: obs.type
    })),
    cageClosing: state.value.cageClosing,
    restingPlatform: state.value.restingPlatform,
    showWsporniki: true,
    distanceFromGround: ladderConfig.distanceFromGround || 160,
    eave: state.value.hasEave ? {
      height: state.value.eaveHeight * 10,
      depth: state.value.eaveDepth * 10
    } : null,
    // NAPRAWIONE: użyj actualPlatformDistance * 10 (cm -> mm) zamiast atticMinDistance * 1000
    atticPlatformDistance: isAtticPassage ? actualPlatformDistance.value * 10 : 0,
    atticWallHeight: isAtticPassage ? state.value.atticWallHeight * 1000 : 0,
    showDescentWall: isAtticPassage,
    descentMountType: isAtticPassage ? state.value.descentMountType : '',
    customBaseHeight: state.value.descentMountType === 'custom-base' ? state.value.customBaseHeight * 10 : 0,  // cm -> mm, 0 dla "brak"
    // Opcje dla wsporników (przełaz attykowy)
    atticWallThickness: isAtticPassage ? state.value.atticWallThickness * 10 : 0,  // cm -> mm
    // Ocieplenie strona zejścia - z walidacją scheme
    atticBackHasInsulation: showAtticBackInsulation,
    atticBackInsulationThickness: showAtticBackInsulation
      ? (state.value.atticBackInsulationThickness || 10) * 10  // cm -> mm, default 10cm
      : 0,
    // Dane drabiny zejścia (dla attyki z wspornikach)
    descentLadder: descentLadderData.value,
    // Odległość wsporników dla drabiny zejścia (przełaz attykowy z wsporniki)
    descentWspornikDistance: isAtticPassage && state.value.descentMountType === 'brackets'
      ? state.value.descentBracketSpacing
      : 0
  }
})

// ============================================
// METHODS
// ============================================
async function calculateBOM() {
  isCalculating.value = true
  try {
    const result = calculateLocal({
      wallHeight: state.value.wallHeight,
      scheme: state.value.scheme,
      purpose: state.value.purpose,
      cage: state.value.cage,
      bracketType: state.value.bracketType,
      bracketSpacing: state.value.bracketSpacing,
      insulationThickness: state.value.insulationThickness,
      suspended: state.value.suspended,
      suspendedHeight: state.value.suspendedHeight,
      hasObstacles: state.value.hasObstacles,
      obstacles: state.value.obstacles.map(o => ({
        id: o.id,
        type: o.type,
        bottomHeightMm: o.heightFrom * 1000,
        heightMm: o.height * 1000
      }))
    })

    if (result && result.components) {
      bomItems.value = result.components
      const total = result.components.reduce((sum, item) => sum + (item.unitPrice || 0) * item.quantity, 0)
      pricing.value = {
        netto: total,
        vat: total * 0.23,
        brutto: total * 1.23
      }
    }
  } catch (error) {
    console.error('[Seller] Calculate error:', error)
  } finally {
    isCalculating.value = false
  }
}

function getConfigForPostMessage(): LadderConfig {
  return {
    purpose: state.value.purpose,
    scheme: state.value.scheme,
    wallHeight: state.value.wallHeight,
    cage: state.value.cage,
    cageClosing: state.value.cageClosing,
    bracketType: state.value.bracketType,
    bracketTypeManual: state.value.bracketTypeManual,
    bracketSpacing: state.value.bracketSpacing,
    insulationThickness: state.value.insulationThickness,
    suspended: state.value.suspended,
    suspendedHeight: state.value.suspendedHeight,
    atticWallHeight: state.value.atticWallHeight,
    atticWallThickness: state.value.atticWallThickness,
    atticInsulationThickness: state.value.atticInsulationThickness,
    atticBackInsulationThickness: state.value.atticBackInsulationThickness,
    descentMountType: state.value.descentMountType,
    descentBracketType: state.value.descentBracketType,
    descentBracketTypeManual: state.value.descentBracketTypeManual,
    customBaseHeight: state.value.customBaseHeight,  // 0 dla "brak"
    restingPlatform: state.value.restingPlatform,
    portableLadder: state.value.portableLadder,
    accessLock: state.value.accessLock,
    hasHandrails: state.value.hasHandrails,
    hasObstacles: state.value.hasObstacles,
    obstacles: state.value.obstacles
  }
}

function applyConfig(config: LadderConfig) {
  console.log('=== applyConfig CALLED ===')
  console.log('config.atticInsulationThickness =', config.atticInsulationThickness)
  console.log('state.atticInsulationThickness BEFORE =', state.value.atticInsulationThickness)

  isApplyingConfig = true  // Zablokuj watchery

  if (config.purpose) state.value.purpose = config.purpose
  if (config.scheme) state.value.scheme = config.scheme
  if (config.wallHeight !== undefined) state.value.wallHeight = config.wallHeight
  if (config.cage) state.value.cage = config.cage
  if (config.cageClosing !== undefined) state.value.cageClosing = config.cageClosing

  // Dla attic-passage + brackets:
  // - jeśli config.bracketType !== null: ręczny wybór, ustaw flagę i wartość
  // - jeśli config.bracketType === null: Vue samo obliczy w updateAtticPassageBrackets
  const isAtticBrackets = config.scheme === 'attic-passage' && config.descentMountType === 'brackets'
  if (isAtticBrackets && config.bracketType) {
    // Ręczny wybór wspornika wejścia dla przełazu attykowego
    state.value.bracketTypeManual = true
    state.value.bracketType = config.bracketType
    const bracketDistances: Record<string, number> = { short: 215, medium: 315, long: 415 }
    // Obsługa niestandardowego wspornika
    if (config.bracketType === 'custom') {
      state.value.bracketSpacing = config.bracketSpacing ?? (config.bracketCustom ? config.bracketCustom * 10 : 300)
    } else {
      state.value.bracketSpacing = bracketDistances[config.bracketType] || 215
    }
  } else if (isAtticBrackets) {
    // Tryb ocieplenie - Vue samo obliczy
    state.value.bracketTypeManual = false
  } else {
    // Dla nie-attic-passage
    if (config.bracketType) state.value.bracketType = config.bracketType
    // Obsługa niestandardowego wspornika
    if (config.bracketType === 'custom') {
      state.value.bracketSpacing = config.bracketSpacing ?? (config.bracketCustom ? config.bracketCustom * 10 : 300)
    } else if (config.bracketSpacing !== undefined) {
      state.value.bracketSpacing = config.bracketSpacing
    }
  }

  if (config.insulationThickness !== undefined) state.value.insulationThickness = config.insulationThickness
  if (config.suspended !== undefined) state.value.suspended = config.suspended
  if (config.suspendedHeight !== undefined) state.value.suspendedHeight = config.suspendedHeight
  if (config.atticWallHeight !== undefined) state.value.atticWallHeight = config.atticWallHeight
  if (config.atticWallThickness !== undefined) state.value.atticWallThickness = config.atticWallThickness
  if (config.atticInsulationThickness !== undefined) {
    console.log('=== Setting atticInsulationThickness:', config.atticInsulationThickness)
    state.value.atticInsulationThickness = config.atticInsulationThickness
    console.log('=== state.atticInsulationThickness AFTER =', state.value.atticInsulationThickness)
  }
  if (config.atticBackInsulationThickness !== undefined) {
    console.log('=== Setting atticBackInsulationThickness:', config.atticBackInsulationThickness)
    state.value.atticBackInsulationThickness = config.atticBackInsulationThickness
    console.log('=== state.atticBackInsulationThickness AFTER =', state.value.atticBackInsulationThickness)
  }
  if (config.atticMinDistance !== undefined) state.value.atticMinDistance = config.atticMinDistance
  if (config.descentMountType) {
    state.value.descentMountType = config.descentMountType
    // Dla "brak" (custom-base) z formularza sprzedawcy, ustaw customBaseHeight na 0
    if (config.descentMountType === 'custom-base') {
      state.value.customBaseHeight = 0
    }
  }
  // Dla attic-passage + brackets:
  // - jeśli descentBracketTypeManual === true: użyj wartości z config (ręczny wybór)
  // - jeśli descentBracketTypeManual === false: oblicz automatycznie w updateAtticPassageBrackets
  if (config.descentBracketTypeManual) {
    // Ręczny wybór wspornika zejścia - ustaw flagę i wartość
    state.value.descentBracketTypeManual = true
    if (config.descentBracketType) {
      state.value.descentBracketType = config.descentBracketType
      const descentBracketDistances: Record<string, number> = { short: 215, medium: 315, long: 415 }
      state.value.descentBracketSpacing = descentBracketDistances[config.descentBracketType] || 215
    }
  } else {
    // Automatyczny wybór - resetuj flagę
    state.value.descentBracketTypeManual = false
    // Dla nie-attic-passage, ustaw wartość z config
    if (!isAtticBrackets && config.descentBracketType) {
      state.value.descentBracketType = config.descentBracketType
      const descentBracketDistances: Record<string, number> = { short: 215, medium: 315, long: 415 }
      state.value.descentBracketSpacing = descentBracketDistances[config.descentBracketType] || 215
    }
  }
  if (config.restingPlatform !== undefined) state.value.restingPlatform = config.restingPlatform
  if (config.portableLadder !== undefined) state.value.portableLadder = config.portableLadder
  if (config.accessLock !== undefined) state.value.accessLock = config.accessLock
  if (config.hasHandrails !== undefined) state.value.hasHandrails = config.hasHandrails
  if (config.hasObstacles !== undefined) state.value.hasObstacles = config.hasObstacles
  if (config.obstacles) state.value.obstacles = config.obstacles

  // Odblokuj watchery i wywołaj updateAtticPassageBrackets po wszystkich zmianach
  nextTick(() => {
    isApplyingConfig = false
    updateAtticPassageBrackets()
    calculateBOM()
  })
}

function sendResult() {
  const result: ConfigResult = {
    config: getConfigForPostMessage(),
    components: bomItems.value.map(item => ({
      id: item.code,
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      unitPrice: item.unitPrice
    })),
    pricing: pricing.value
  }
  postMessageService.sendConfigResult(result)
}

function addObstacle() {
  const maxId = state.value.obstacles.reduce((max, o) => Math.max(max, o.id), 0)
  state.value.obstacles.push({
    id: maxId + 1,
    type: 'window',
    heightFrom: 1,
    height: 1
  })
}

function removeObstacle(id: number) {
  state.value.obstacles = state.value.obstacles.filter(o => o.id !== id)
}

// ============================================
// STAŁE I FUNKCJE POMOCNICZE (z AdminLayout)
// ============================================
// Odległość między uchwytami strony wejścia i zejścia = 1012mm (stała konstrukcyjna)
const CONNECTOR_DISTANCE_MM = 1012

const bracketDistances: Record<string, number> = {
  short: 215,
  medium: 315,
  long: 415
}

// Funkcja pomocnicza: typ wspornika na podstawie odległości (mm)
function getBracketTypeFromDistance(distanceMm: number): 'short' | 'medium' | 'long' | 'custom' {
  if (distanceMm < 160) return 'custom' // Za mała
  if (distanceMm <= 260) return 'short'
  if (distanceMm <= 360) return 'medium'
  if (distanceMm <= 460) return 'long'
  return 'custom' // Za duża
}

// Funkcja pomocnicza: wybór typu wspornika na podstawie grubości ocieplenia
// do 10cm → krótkie, do 20cm → średnie, do 30cm → długie
function getBracketTypeForInsulation(insulationCm: number): 'short' | 'medium' | 'long' | 'custom' {
  if (insulationCm <= 10) return 'short'
  if (insulationCm <= 20) return 'medium'
  if (insulationCm <= 30) return 'long'
  return 'custom'
}

// ============================================
// AUTOMATYCZNE DOSTOSOWANIE WSPORNIKÓW DLA PRZEJŚCIA PRZEZ ATTYKĘ
// (skopiowane z AdminLayout - działający mechanizm)
// ============================================
function updateAtticPassageBrackets() {
  if (state.value.scheme !== 'attic-passage') return
  if (state.value.descentMountType !== 'brackets') return

  console.log('[SellerEmbed] updateAtticPassageBrackets called with:', {
    atticInsulationThickness: state.value.atticInsulationThickness,
    atticBackInsulationThickness: state.value.atticBackInsulationThickness,
    atticWallThickness: state.value.atticWallThickness,
    bracketTypeManual: state.value.bracketTypeManual,
    descentBracketTypeManual: state.value.descentBracketTypeManual
  })

  // Stałe zakresu wsporników
  const MIN_BRACKET_DISTANCE = 160  // 16cm
  const MAX_BRACKET_DISTANCE = 460  // 46cm

  // 1. Oblicz minimalną odległość wejścia na podstawie ocieplenia wejścia
  const entryInsulationCm = state.value.atticInsulationThickness || 0
  // Minimum = większe z: 160mm lub (ocieplenie + 15cm)
  const minEntryFromInsulation = (entryInsulationCm + 15) * 10
  const minEntryDistanceMm = Math.max(MIN_BRACKET_DISTANCE, minEntryFromInsulation)

  // 2. Ustaw typ wspornika wejścia na podstawie ocieplenia
  const entryBracketType = getBracketTypeForInsulation(entryInsulationCm)

  // Zacznij od minimalnej odległości wejścia
  let entryDistanceMm = minEntryDistanceMm

  // 3. Parametry
  const wallThicknessMm = (state.value.atticWallThickness || 25) * 10
  const descentInsulationMm = (state.value.atticBackInsulationThickness || 0) * 10

  // 4. Walidacja: prześwit od ocieplenia >= 160mm (min dla wsporników)
  const clearanceFromInsulation = CONNECTOR_DISTANCE_MM - (entryDistanceMm + wallThicknessMm + descentInsulationMm)

  console.log('[SellerEmbed] updateAtticPassageBrackets clearance check:', {
    entryDistanceMm,
    wallThicknessMm,
    descentInsulationMm,
    clearanceFromInsulation
  })

  // 5. Oblicz finalną odległość zejścia (od ściany, bez ocieplenia)
  let finalDescentMm = CONNECTOR_DISTANCE_MM - (entryDistanceMm + wallThicknessMm)

  console.log('[SellerEmbed] updateAtticPassageBrackets initial finalDescent:', finalDescentMm)

  // 6. Jeśli finalDescent > 460mm, zwiększ wejście żeby zejście = 460mm
  if (finalDescentMm > MAX_BRACKET_DISTANCE) {
    const requiredEntryMm = CONNECTOR_DISTANCE_MM - MAX_BRACKET_DISTANCE - wallThicknessMm
    if (requiredEntryMm >= minEntryDistanceMm && requiredEntryMm <= MAX_BRACKET_DISTANCE) {
      entryDistanceMm = requiredEntryMm
      finalDescentMm = MAX_BRACKET_DISTANCE
    } else {
      finalDescentMm = MAX_BRACKET_DISTANCE
    }
  }

  // 7. Jeśli finalDescent < 160mm - ustaw minimum dla wizualizacji
  if (finalDescentMm < MIN_BRACKET_DISTANCE) {
    finalDescentMm = MIN_BRACKET_DISTANCE
  }

  // 8. Określ typy wsporników na podstawie FINALNEJ odległości
  const descentBracketType = getBracketTypeFromDistance(finalDescentMm)
  const actualEntryBracketType = getBracketTypeFromDistance(entryDistanceMm)

  console.log('[SellerEmbed] updateAtticPassageBrackets final:', {
    entryDistanceMm,
    actualEntryBracketType,
    finalDescentMm,
    descentBracketType
  })

  // 9. Ustaw wartości - WEJŚCIE (tylko jeśli nie jest ręcznie wybrany)
  if (!state.value.bracketTypeManual) {
    state.value.bracketType = actualEntryBracketType !== 'custom' ? actualEntryBracketType : entryBracketType
    state.value.bracketSpacing = entryDistanceMm
  } else {
    // Ręczny wybór - użyj spacing na podstawie wybranego typu
    const manualBracketDistances: Record<string, number> = { short: 215, medium: 315, long: 415 }
    state.value.bracketSpacing = manualBracketDistances[state.value.bracketType] || 215
    entryDistanceMm = state.value.bracketSpacing
  }

  // 10. Ustaw wartości - ZEJŚCIE (tylko jeśli nie jest ręcznie wybrany)
  if (!state.value.descentBracketTypeManual) {
    state.value.descentBracketType = descentBracketType !== 'custom' ? descentBracketType : 'long'
    state.value.descentBracketSpacing = finalDescentMm
  } else {
    // Ręczny wybór - użyj spacing na podstawie wybranego typu
    const manualBracketDistances: Record<string, number> = { short: 215, medium: 315, long: 415 }
    state.value.descentBracketSpacing = manualBracketDistances[state.value.descentBracketType] || 215
    finalDescentMm = state.value.descentBracketSpacing
  }

  // 11. KLUCZOWE: Zaktualizuj wizualizację 3D dla obu stron
  nextTick(() => {
    if (threeCanvasRef.value) {
      console.log('[SellerEmbed] Setting bracket distances - entry:', entryDistanceMm, 'descent:', finalDescentMm)
      threeCanvasRef.value.setGlobalWspornikDistance(entryDistanceMm, 1)
      threeCanvasRef.value.setGlobalWspornikDistance(finalDescentMm, 2)
    }
  })
}

// ============================================
// WATCHERS
// ============================================
// Watcher dla zmian parametrów przejścia przez attykę (wsporniki)
// - identyczny jak w AdminLayout
watch(
  () => [
    state.value.scheme,
    state.value.descentMountType,
    state.value.atticWallThickness,
    state.value.atticInsulationThickness,
    state.value.atticBackInsulationThickness
  ],
  () => {
    if (isApplyingConfig) return  // Zablokowane podczas applyConfig
    updateAtticPassageBrackets()
  }
)

// Watcher dla klasycznej/z podestem - prosty dobór wsporników na podstawie ocieplenia
watch(() => [state.value.insulationThickness, state.value.scheme], ([insulation, scheme]) => {
  if (isApplyingConfig) return  // Zablokowane podczas applyConfig
  if (scheme !== 'attic-passage') {
    const insulationCm = Number(insulation) || 0
    const newBracketType = getBracketTypeForInsulation(insulationCm)
    if (newBracketType !== 'custom') {
      state.value.bracketType = newBracketType
      state.value.bracketSpacing = bracketDistances[newBracketType] || 215
      nextTick(() => {
        if (threeCanvasRef.value) {
          threeCanvasRef.value.setGlobalWspornikDistance(state.value.bracketSpacing, 1)
        }
      })
    }
  }
})

// Watcher dla ogólnych zmian stanu - BOM i wysyłka
watch(() => state.value, () => {
  if (isApplyingConfig) return  // Zablokowane podczas applyConfig
  calculateBOM()
  sendResult()
}, { deep: true })

// ============================================
// LIFECYCLE
// ============================================
onMounted(() => {
  console.log('=== SellerEmbedLayout MOUNTED ===')
  postMessageService.startListening()

  postMessageService.on('LOAD_CONFIG', (data) => {
    console.log('=== LOAD_CONFIG HANDLER CALLED ===', data)
    if (data.payload) {
      const cfg = data.payload as LadderConfig
      console.log('=== PAYLOAD EXISTS ===')
      console.log('scheme:', cfg.scheme)
      console.log('atticInsulationThickness:', cfg.atticInsulationThickness)
      console.log('atticBackInsulationThickness:', cfg.atticBackInsulationThickness)
      applyConfig(cfg)
      console.log('[SellerEmbed] State after apply:', {
        bracketType: state.value.bracketType,
        bracketSpacing: state.value.bracketSpacing,
        insulationThickness: state.value.insulationThickness,
        atticInsulationThickness: state.value.atticInsulationThickness,
        atticBackInsulationThickness: state.value.atticBackInsulationThickness,
        descentMountType: state.value.descentMountType,
        descentBracketType: state.value.descentBracketType,
        descentBracketSpacing: state.value.descentBracketSpacing,
        atticMinDistance: state.value.atticMinDistance
      })
      nextTick(() => {
        console.log('[SellerEmbed] threeCanvasProps:', {
          scheme: threeCanvasProps.value.scheme,
          descentMountType: threeCanvasProps.value.descentMountType,
          wspornikDistance: threeCanvasProps.value.wspornikDistance,
          atticHasInsulation: threeCanvasProps.value.atticHasInsulation,
          atticInsulationThickness: threeCanvasProps.value.atticInsulationThickness,
          atticBackHasInsulation: threeCanvasProps.value.atticBackHasInsulation,
          atticBackInsulationThickness: threeCanvasProps.value.atticBackInsulationThickness,
          descentLadder: threeCanvasProps.value.descentLadder
        })

        // updateAtticPassageBrackets jest już wywoływany w applyConfig
        sendResult()
      })
    }
  })

  postMessageService.on('GET_CONFIG', () => sendResult())

  nextTick(() => {
    calculateBOM()
    postMessageService.notifyReady()
  })
})

onUnmounted(() => {
  postMessageService.stopListening()
})
</script>

<template>
  <div class="seller-embed">
    <!-- 3D Preview -->
    <div class="seller-preview">
      <ThreeCanvas ref="threeCanvasRef" v-bind="threeCanvasProps" />
    </div>

    <!-- Config Panel -->
    <div class="seller-config">
      <div class="seller-config-scroll">
        <!-- Schemat drabiny -->
        <div class="config-section" :class="{ expanded: expandedItem === 'scheme' }">
          <div class="config-header" @click="expandedItem = expandedItem === 'scheme' ? null : 'scheme'">
            <div class="config-label">
              <span class="label-text">Typ drabiny</span>
              <span class="label-value">
                {{ state.scheme === 'no-platform' ? 'Klasyczna' : state.scheme === 'with-platform' ? 'Z podestem' : 'Przejscie attykowe' }}
              </span>
            </div>
            <span class="config-arrow">{{ expandedItem === 'scheme' ? '▲' : '▼' }}</span>
          </div>
          <div v-if="expandedItem === 'scheme'" class="config-content">
            <div class="toggle-group vertical">
              <button class="toggle-btn" :class="{ selected: state.scheme === 'no-platform' }" @click="state.scheme = 'no-platform'">Klasyczna z poreczami</button>
              <button class="toggle-btn" :class="{ selected: state.scheme === 'with-platform' }" @click="state.scheme = 'with-platform'">Z podestem</button>
              <button class="toggle-btn" :class="{ selected: state.scheme === 'attic-passage' }" @click="state.scheme = 'attic-passage'">Przejscie attykowe</button>
            </div>
          </div>
        </div>

        <!-- Wysokosc sciany -->
        <div class="config-section" :class="{ expanded: expandedItem === 'height' }">
          <div class="config-header" @click="expandedItem = expandedItem === 'height' ? null : 'height'">
            <div class="config-label">
              <span class="label-text">Wysokosc sciany</span>
              <span class="label-value">
                {{ state.wallHeight }} m
                <template v-if="state.scheme === 'attic-passage'"> | {{ state.atticWallHeight }} m</template>
              </span>
            </div>
            <span class="config-arrow">{{ expandedItem === 'height' ? '▲' : '▼' }}</span>
          </div>
          <div v-if="expandedItem === 'height'" class="config-content">
            <div class="input-row">
              <label>Wejscie</label>
              <div class="input-unit">
                <input type="number" v-model.number="state.wallHeight" min="0.6" max="30" step="0.1" />
                <span>m</span>
              </div>
            </div>
            <div v-if="state.scheme === 'attic-passage'" class="input-row">
              <label>Zejscie</label>
              <div class="input-unit">
                <input type="number" v-model.number="state.atticWallHeight" min="0" :max="state.wallHeight" step="0.1" />
                <span>m</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Ocieplenie -->
        <div class="config-section" :class="{ expanded: expandedItem === 'insulation' }">
          <div class="config-header" @click="expandedItem = expandedItem === 'insulation' ? null : 'insulation'">
            <div class="config-label">
              <span class="label-text">Ocieplenie</span>
              <span class="label-value">
                <template v-if="state.scheme === 'attic-passage'">
                  {{ state.atticInsulationThickness }} cm | {{ state.atticBackInsulationThickness }} cm
                </template>
                <template v-else>
                  {{ state.insulationThickness }} cm
                </template>
              </span>
            </div>
            <span class="config-arrow">{{ expandedItem === 'insulation' ? '▲' : '▼' }}</span>
          </div>
          <div v-if="expandedItem === 'insulation'" class="config-content">
            <template v-if="state.scheme === 'attic-passage'">
              <div class="input-row">
                <label>Wejscie</label>
                <div class="input-unit">
                  <input type="number" v-model.number="state.atticInsulationThickness" min="0" max="30" step="1" />
                  <span>cm</span>
                </div>
              </div>
              <div class="input-row">
                <label>Zejscie</label>
                <div class="input-unit">
                  <input type="number" v-model.number="state.atticBackInsulationThickness" min="0" max="30" step="1" />
                  <span>cm</span>
                </div>
              </div>
            </template>
            <template v-else>
              <div class="input-row">
                <label>Grubosc</label>
                <div class="input-unit">
                  <input type="number" v-model.number="state.insulationThickness" min="0" max="30" step="1" />
                  <span>cm</span>
                </div>
              </div>
            </template>
          </div>
        </div>

        <!-- Grubosc murka attykowego -->
        <div v-if="state.scheme === 'attic-passage'" class="config-section" :class="{ expanded: expandedItem === 'wallThickness' }">
          <div class="config-header" @click="expandedItem = expandedItem === 'wallThickness' ? null : 'wallThickness'">
            <div class="config-label">
              <span class="label-text">Grubosc murka</span>
              <span class="label-value">{{ state.atticWallThickness }} cm</span>
            </div>
            <span class="config-arrow">{{ expandedItem === 'wallThickness' ? '▲' : '▼' }}</span>
          </div>
          <div v-if="expandedItem === 'wallThickness'" class="config-content">
            <div class="input-row">
              <label>Grubosc</label>
              <div class="input-unit">
                <input type="number" v-model.number="state.atticWallThickness" min="10" max="60" step="1" />
                <span>cm</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Typ wspornika -->
        <div class="config-section" :class="{ expanded: expandedItem === 'bracket' }">
          <div class="config-header" @click="expandedItem = expandedItem === 'bracket' ? null : 'bracket'">
            <div class="config-label">
              <span class="label-text">Wspornik</span>
              <span class="label-value">
                {{ state.bracketType === 'short' ? 'Krotki' : state.bracketType === 'medium' ? 'Sredni' : 'Dlugi' }}
              </span>
            </div>
            <span class="config-arrow">{{ expandedItem === 'bracket' ? '▲' : '▼' }}</span>
          </div>
          <div v-if="expandedItem === 'bracket'" class="config-content">
            <div class="toggle-group">
              <button class="toggle-btn" :class="{ selected: state.bracketType === 'short' }" @click="state.bracketType = 'short'">Krotki</button>
              <button class="toggle-btn" :class="{ selected: state.bracketType === 'medium' }" @click="state.bracketType = 'medium'">Sredni</button>
              <button class="toggle-btn" :class="{ selected: state.bracketType === 'long' }" @click="state.bracketType = 'long'">Dlugi</button>
            </div>
          </div>
        </div>

        <!-- Kosz ochronny -->
        <div class="config-section" :class="{ expanded: expandedItem === 'cage' }">
          <div class="config-header" @click="expandedItem = expandedItem === 'cage' ? null : 'cage'">
            <div class="config-label">
              <span class="label-text">Kosz ochronny</span>
              <span class="label-value">{{ state.cage === 'with-cage' ? 'Tak' : 'Nie' }}</span>
            </div>
            <span class="config-arrow">{{ expandedItem === 'cage' ? '▲' : '▼' }}</span>
          </div>
          <div v-if="expandedItem === 'cage'" class="config-content">
            <div class="toggle-group">
              <button class="toggle-btn" :class="{ selected: state.cage === 'no-cage' }" @click="state.cage = 'no-cage'">Bez kosza</button>
              <button class="toggle-btn" :class="{ selected: state.cage === 'with-cage' }" @click="state.cage = 'with-cage'">Z koszem</button>
            </div>
            <label v-if="state.cage === 'with-cage'" class="checkbox-row">
              <input type="checkbox" v-model="state.cageClosing" />
              <span>Zamykany kosz</span>
            </label>
          </div>
        </div>

        <!-- Zawieszenie -->
        <div class="config-section" :class="{ expanded: expandedItem === 'suspended' }">
          <div class="config-header" @click="expandedItem = expandedItem === 'suspended' ? null : 'suspended'">
            <div class="config-label">
              <span class="label-text">Zawieszenie</span>
              <span class="label-value">{{ state.suspended ? state.suspendedHeight + ' m' : 'Do ziemi' }}</span>
            </div>
            <span class="config-arrow">{{ expandedItem === 'suspended' ? '▲' : '▼' }}</span>
          </div>
          <div v-if="expandedItem === 'suspended'" class="config-content">
            <div class="toggle-group">
              <button class="toggle-btn" :class="{ selected: !state.suspended }" @click="state.suspended = false">Do ziemi</button>
              <button class="toggle-btn" :class="{ selected: state.suspended }" @click="state.suspended = true">Zawieszona</button>
            </div>
            <div v-if="state.suspended" class="input-row" style="margin-top: 0.5rem;">
              <label>Wysokosc od ziemi</label>
              <div class="input-unit">
                <input type="number" v-model.number="state.suspendedHeight" min="0" max="5" step="0.1" />
                <span>m</span>
              </div>
            </div>
            <label v-if="state.suspended && state.suspendedHeight <= 2" class="checkbox-row">
              <input type="checkbox" v-model="state.portableLadder" />
              <span>Dostawiana drabina</span>
            </label>
          </div>
        </div>

        <!-- Okap -->
        <div v-if="state.scheme !== 'attic-passage'" class="config-section" :class="{ expanded: expandedItem === 'eave' }">
          <div class="config-header" @click="expandedItem = expandedItem === 'eave' ? null : 'eave'">
            <div class="config-label">
              <span class="label-text">Okap</span>
              <span class="label-value">{{ state.hasEave ? state.eaveDepth + 'x' + state.eaveHeight + ' cm' : 'Brak' }}</span>
            </div>
            <span class="config-arrow">{{ expandedItem === 'eave' ? '▲' : '▼' }}</span>
          </div>
          <div v-if="expandedItem === 'eave'" class="config-content">
            <div class="toggle-group">
              <button class="toggle-btn" :class="{ selected: !state.hasEave }" @click="state.hasEave = false">Bez okapu</button>
              <button class="toggle-btn" :class="{ selected: state.hasEave }" @click="state.hasEave = true">Z okapem</button>
            </div>
            <template v-if="state.hasEave">
              <div class="input-row">
                <label>Glebokosc</label>
                <div class="input-unit">
                  <input type="number" v-model.number="state.eaveDepth" min="1" max="80" step="1" />
                  <span>cm</span>
                </div>
              </div>
              <div class="input-row">
                <label>Wysokosc</label>
                <div class="input-unit">
                  <input type="number" v-model.number="state.eaveHeight" min="1" max="200" step="1" />
                  <span>cm</span>
                </div>
              </div>
            </template>
          </div>
        </div>

        <!-- Przeszkody -->
        <div class="config-section" :class="{ expanded: expandedItem === 'obstacles' }">
          <div class="config-header" @click="expandedItem = expandedItem === 'obstacles' ? null : 'obstacles'">
            <div class="config-label">
              <span class="label-text">Przeszkody</span>
              <span class="label-value">{{ state.obstacles.length > 0 ? state.obstacles.length + ' szt.' : 'Brak' }}</span>
            </div>
            <span class="config-arrow">{{ expandedItem === 'obstacles' ? '▲' : '▼' }}</span>
          </div>
          <div v-if="expandedItem === 'obstacles'" class="config-content">
            <div v-for="(obstacle, index) in state.obstacles" :key="obstacle.id" class="obstacle-row">
              <span class="obstacle-num">{{ index + 1 }}.</span>
              <div class="input-unit small">
                <input type="number" v-model.number="obstacle.heightFrom" min="0" :max="state.wallHeight" step="0.1" />
                <span>m</span>
              </div>
              <span class="obstacle-sep">-</span>
              <div class="input-unit small">
                <input type="number" v-model.number="obstacle.height" min="0.1" max="3" step="0.1" />
                <span>m</span>
              </div>
              <button class="obstacle-remove" @click="removeObstacle(obstacle.id)">x</button>
            </div>
            <button class="add-btn" @click="addObstacle">+ Dodaj przeszkode</button>
          </div>
        </div>

        <!-- Dodatkowe opcje -->
        <div class="config-section options-section">
          <h4>Dodatkowe opcje</h4>
          <label v-if="state.wallHeight > 5" class="checkbox-row">
            <input type="checkbox" v-model="state.restingPlatform" />
            <span>Podest spoczynkowy</span>
          </label>
          <p v-if="state.cage !== 'with-cage' && state.wallHeight <= 5" class="no-options">
            Brak dodatkowych opcji dla tej konfiguracji
          </p>
        </div>
      </div>

      <!-- Footer z cena -->
      <div class="seller-footer">
        <div class="price-row">
          <span>Cena netto:</span>
          <span class="price">{{ pricing.netto.toFixed(2) }} PLN</span>
        </div>
        <div class="price-row total">
          <span>Cena brutto:</span>
          <span class="price">{{ pricing.brutto.toFixed(2) }} PLN</span>
        </div>
        <button class="send-btn" @click="sendResult" :disabled="isCalculating">
          {{ isCalculating ? 'Obliczanie...' : 'Wyslij konfiguracje' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.seller-embed {
  display: flex;
  height: 100vh;
  background: #1a1a2e;
  color: #fff;
  font-family: system-ui, -apple-system, sans-serif;
}

.seller-preview {
  flex: 1;
  min-width: 0;
  background: #0f0f1a;
}

.seller-config {
  width: 340px;
  display: flex;
  flex-direction: column;
  background: #1e1e32;
  border-left: 1px solid #333;
}

.seller-config-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
}

.config-section {
  background: #252540;
  border-radius: 8px;
  margin-bottom: 0.75rem;
  overflow: hidden;
}

.config-section.expanded { background: #2a2a48; }

.config-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.875rem 1rem;
  cursor: pointer;
  transition: background 0.2s;
}

.config-header:hover { background: rgba(255, 255, 255, 0.05); }

.config-label {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.label-text { font-size: 0.8rem; color: #888; }
.label-value { font-size: 0.95rem; font-weight: 500; }
.config-arrow { font-size: 0.75rem; color: #666; }

.config-content {
  padding: 0.75rem 1rem 1rem;
  border-top: 1px solid #333;
}

.toggle-group { display: flex; gap: 0.5rem; }
.toggle-group.vertical { flex-direction: column; }

.toggle-btn {
  flex: 1;
  padding: 0.6rem 0.75rem;
  background: #1a1a2e;
  border: 1px solid #444;
  border-radius: 6px;
  color: #aaa;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.2s;
}

.toggle-btn:hover { border-color: #666; color: #fff; }
.toggle-btn.selected { background: #3b82f6; border-color: #3b82f6; color: #fff; }

.input-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.input-row label { font-size: 0.85rem; color: #888; }

.input-unit {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  background: #1a1a2e;
  border: 1px solid #444;
  border-radius: 6px;
  padding: 0.4rem 0.6rem;
}

.input-unit.small { padding: 0.3rem 0.4rem; }

.input-unit input {
  width: 60px;
  background: transparent;
  border: none;
  color: #fff;
  font-size: 0.9rem;
  text-align: right;
}

.input-unit.small input { width: 45px; font-size: 0.8rem; }
.input-unit input:focus { outline: none; }
.input-unit span { font-size: 0.8rem; color: #666; }

.checkbox-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.75rem;
  cursor: pointer;
  font-size: 0.85rem;
}

.checkbox-row input { width: 16px; height: 16px; cursor: pointer; }

.obstacle-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.obstacle-num { font-size: 0.8rem; color: #888; width: 20px; }
.obstacle-sep { color: #666; }

.obstacle-remove {
  width: 24px;
  height: 24px;
  background: #e74c3c;
  border: none;
  border-radius: 4px;
  color: #fff;
  cursor: pointer;
  font-size: 0.9rem;
}

.add-btn {
  width: 100%;
  padding: 0.5rem;
  background: transparent;
  border: 1px dashed #444;
  border-radius: 6px;
  color: #888;
  font-size: 0.85rem;
  cursor: pointer;
  margin-top: 0.5rem;
}

.add-btn:hover { border-color: #666; color: #fff; }

.options-section { background: transparent; padding: 0.75rem 0; }
.options-section h4 { font-size: 0.85rem; font-weight: 500; color: #888; margin: 0 0 0.75rem; }
.no-options { font-size: 0.8rem; color: #666; margin: 0; }

.seller-footer {
  padding: 1rem;
  background: #252540;
  border-top: 1px solid #333;
}

.price-row {
  display: flex;
  justify-content: space-between;
  font-size: 0.9rem;
  color: #888;
  margin-bottom: 0.5rem;
}

.price-row.total { font-size: 1.1rem; color: #fff; font-weight: 600; margin-bottom: 1rem; }
.price { font-weight: 500; }

.send-btn {
  width: 100%;
  padding: 0.875rem;
  background: #3b82f6;
  border: none;
  border-radius: 8px;
  color: #fff;
  font-size: 0.95rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;
}

.send-btn:hover:not(:disabled) { background: #2563eb; }
.send-btn:disabled { background: #555; cursor: not-allowed; }

.seller-config-scroll::-webkit-scrollbar { width: 6px; }
.seller-config-scroll::-webkit-scrollbar-track { background: #1a1a2e; }
.seller-config-scroll::-webkit-scrollbar-thumb { background: #444; border-radius: 3px; }
.seller-config-scroll::-webkit-scrollbar-thumb:hover { background: #555; }
</style>
