import { watch } from 'vue'
import { useConfigStore, useThreeDStore } from '@/stores'
import type { Specification, Component } from '@/types'

/**
 * Composable do obliczeń modułów drabiny
 * Przeniesiona logika z LadderCalculator.php
 */
export function useLadderCalculator() {
  const configStore = useConfigStore()
  const threeDStore = useThreeDStore()

  // Stałe z PHP
  const RUNG_SPACING = 275 // mm - odstęp między szczeblami
  const MAX_GROUND_DISTANCE = 330 // mm - max odległość ostatniego szczebla od ziemi
  const MIN_GROUND_DISTANCE = 40 // mm - min odległość
  const PLATFORM_OFFSET = 50 // mm - przesunięcie pierwszego szczebla dla podestu
  const CAGE_START_OFFSET = 1114 // mm - offset startu kosza od pierwszego szczebla
  const CAGE_HOOP_SPACING = 641.7 // mm - odstęp między obręczami kosza
  const CAGE_MIN_HEIGHT = 2200 // mm - minimalna wysokość kosza

  // Ilość otworów na obręcze w modułach
  const CAGE_HOLES = {
    handrails: 2,
    startLadder: 3,
    repeatLadder: 3,
    endLadder: {
      7: 3, 6: 3,
      5: 2, 4: 2,
      3: 1, 2: 1,
      1: 0
    } as Record<number, number>
  }

  /**
   * Oblicz ilość szczebli dla drabiny
   */
  function calculateRungs(wallHeightMm: number, scheme: string): {
    valid: boolean
    rungCount: number
    firstRungHeight: number
    lastRungHeight: number
    ladderLength: number
  } {
    const hasPlatform = scheme === 'with-platform'
    const firstRungOffset = hasPlatform ? PLATFORM_OFFSET : 0
    const firstRungHeight = wallHeightMm + firstRungOffset

    let rungCount = 1
    let lastRungHeight = firstRungHeight

    // Dodawaj szczeble dopóki ostatni nie będzie w dopuszczalnej odległości od ziemi
    while (lastRungHeight > MAX_GROUND_DISTANCE) {
      rungCount++
      lastRungHeight = firstRungHeight - (rungCount - 1) * RUNG_SPACING
    }

    // Jeśli ostatni szczebel jest za nisko, usuń jeden
    if (lastRungHeight < MIN_GROUND_DISTANCE && rungCount > 1) {
      rungCount--
      lastRungHeight = firstRungHeight - (rungCount - 1) * RUNG_SPACING
    }

    const ladderLength = (rungCount - 1) * RUNG_SPACING

    return {
      valid: true,
      rungCount,
      firstRungHeight,
      lastRungHeight,
      ladderLength
    }
  }

  /**
   * Oblicz moduły drabiny na podstawie ilości szczebli
   */
  function calculateModules(rungCount: number): {
    startLadder7: number
    repeatLadder7: number
    endLadder: { count: number; rungs: number }
    handrails: number
    handrailConnectors: number
    connectionMounts: number
    clampMounts: number
    brackets: number
  } {
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
   * Oblicz ilość obręczy kosza ochronnego
   */
  function calculateCageHoops(
    firstRungHeight: number,
    modules: ReturnType<typeof calculateModules>,
    cageOption: string,
    fullCage: boolean = false
  ): {
    count: number
    heights: number[]
    maxHolesAvailable: number
  } {
    if (cageOption === 'no-cage') {
      return { count: 0, heights: [], maxHolesAvailable: 0 }
    }

    const firstHoopHeight = firstRungHeight + CAGE_START_OFFSET

    // Oblicz maksymalną ilość otworów dostępnych w modułach
    let maxHolesAvailable = CAGE_HOLES.handrails

    if (modules.startLadder7 > 0) {
      maxHolesAvailable += CAGE_HOLES.startLadder
    }

    maxHolesAvailable += modules.repeatLadder7 * CAGE_HOLES.repeatLadder

    if (modules.endLadder.count > 0) {
      const endRungs = modules.endLadder.rungs
      maxHolesAvailable += CAGE_HOLES.endLadder[endRungs] || 0
    }

    let hoopCount = 0
    const hoopHeights: number[] = []
    let currentHeight = firstHoopHeight

    if (fullCage || cageOption === 'from-ground') {
      // Kosz na całej wysokości
      while (hoopCount < maxHolesAvailable) {
        hoopHeights.push(currentHeight)
        hoopCount++
        currentHeight -= CAGE_HOOP_SPACING
      }
    } else {
      // Kosz od 3m (CAGE_MIN_HEIGHT = 2200mm to wysokość ostatniej obręczy)
      while (currentHeight >= CAGE_MIN_HEIGHT && hoopCount < maxHolesAvailable) {
        hoopHeights.push(currentHeight)
        hoopCount++
        currentHeight -= CAGE_HOOP_SPACING
      }
    }

    // Jeśli tylko jedna obręcz - nie montujemy kosza
    if (hoopCount === 1) {
      return { count: 0, heights: [], maxHolesAvailable }
    }

    return {
      count: hoopCount,
      heights: hoopHeights,
      maxHolesAvailable
    }
  }

  /**
   * Główna funkcja obliczeniowa
   */
  function calculate(): Specification {
    const { wallHeight, scheme, cage } = configStore.config
    const wallHeightMm = wallHeight * 1000

    console.log('[useLadderCalculator] calculate:', { wallHeight, wallHeightMm, scheme, cage })

    // 1. Oblicz szczeble
    const rungs = calculateRungs(wallHeightMm, scheme)
    console.log('[useLadderCalculator] rungs:', rungs)

    // 2. Oblicz moduły
    const modules = calculateModules(rungs.rungCount)

    // 3. Oblicz kosz
    const cageResult = calculateCageHoops(
      rungs.firstRungHeight,
      modules,
      cage,
      cage === 'from-ground'
    )

    // 4. Przygotuj specyfikację
    const numX7 = modules.startLadder7 + modules.repeatLadder7
    const numX8 = 0 // X8 nie jest używane w tej wersji
    const finalRungs = modules.endLadder.rungs

    // 5. Generuj listę komponentów
    const components = generateComponents(modules, scheme, cageResult.count)

    const specification: Specification = {
      numX7Ladders: numX7,
      numX8Ladders: numX8,
      finalLadderRungs: finalRungs,
      totalRungs: rungs.rungCount,
      safetyCageCount: cageResult.count,
      totalHeightMm: rungs.ladderLength,
      components
    }

    return specification
  }

  /**
   * Generuj listę komponentów
   */
  function generateComponents(
    modules: ReturnType<typeof calculateModules>,
    scheme: string,
    cageCount: number
  ): Component[] {
    const components: Component[] = []
    let id = 0

    // Moduły drabiny X7 (początkowa + powielane)
    const totalX7 = modules.startLadder7 + modules.repeatLadder7
    if (totalX7 > 0) {
      components.push({
        id: `comp_${++id}`,
        name: 'Moduł drabiny X7 (7 szczebli)',
        quantity: totalX7,
        unit: 'szt.'
      })
    }

    // Moduł końcowy
    if (modules.endLadder.count > 0) {
      components.push({
        id: `comp_${++id}`,
        name: `Moduł końcowy (${modules.endLadder.rungs} szczebli)`,
        quantity: modules.endLadder.count,
        unit: 'szt.'
      })
    }

    // Łączniki modułowe
    const connectorCount = totalX7 + modules.endLadder.count - 1
    if (connectorCount > 0) {
      components.push({
        id: `comp_${++id}`,
        name: 'Łącznik modułowy',
        quantity: connectorCount,
        unit: 'szt.'
      })
    }

    // Zakończenie drabiny
    if (scheme === 'with-platform') {
      components.push({
        id: `comp_${++id}`,
        name: 'Podest z poręczami',
        quantity: 1,
        unit: 'kpl.'
      })
    } else {
      components.push({
        id: `comp_${++id}`,
        name: 'Poręcze asekuracyjne',
        quantity: modules.handrails,
        unit: 'szt.'
      })

      // Łączniki poręczy - tylko dla poręczy asekuracyjnych, NIE dla podestu
      if (modules.handrailConnectors > 0) {
        components.push({
          id: `comp_${++id}`,
          name: 'Łączniki poręczy asekuracyjnych',
          quantity: modules.handrailConnectors,
          unit: 'szt.'
        })
      }
    }

    // Uchwyty montażowe
    if (modules.connectionMounts > 0) {
      components.push({
        id: `comp_${++id}`,
        name: 'Uchwyty montażowe (para)',
        quantity: modules.connectionMounts,
        unit: 'szt.'
      })
    }

    // Uchwyty ściskane
    if (modules.clampMounts > 0) {
      components.push({
        id: `comp_${++id}`,
        name: 'Uchwyty ściskane (para)',
        quantity: modules.clampMounts,
        unit: 'szt.'
      })
    }

    // Wsporniki
    if (modules.brackets > 0) {
      components.push({
        id: `comp_${++id}`,
        name: 'Wspornik (para)',
        quantity: modules.brackets,
        unit: 'szt.'
      })
    }

    // Kosz bezpieczeństwa
    if (cageCount > 0) {
      components.push({
        id: `comp_${++id}`,
        name: 'Obręcz kosza bezpieczeństwa',
        quantity: cageCount,
        unit: 'szt.'
      })

      // Kątowniki łączące kosz
      const cageAngles = Math.max(0, (cageCount - 1) * 3)
      if (cageAngles > 0) {
        components.push({
          id: `comp_${++id}`,
          name: 'Kątownik łączący kosz',
          quantity: cageAngles,
          unit: 'szt.'
        })
      }
    }

    return components
  }

  /**
   * Aktualizuj store 3D na podstawie obliczeń
   */
  function updateThreeDStore(spec: Specification) {
    threeDStore.updateState({
      numX7Ladders: spec.numX7Ladders,
      numX8Ladders: spec.numX8Ladders,
      finalLadderRungs: spec.finalLadderRungs,
      totalRungs: spec.totalRungs,
      safetyCageCount: spec.safetyCageCount
    })

    configStore.setSpecification(spec)
  }

  /**
   * Przelicz i zaktualizuj wszystko
   */
  function recalculate() {
    const spec = calculate()
    console.log('[useLadderCalculator] recalculate:', {
      wallHeight: configStore.config.wallHeight,
      numX7: spec.numX7Ladders,
      finalRungs: spec.finalLadderRungs,
      totalRungs: spec.totalRungs
    })
    updateThreeDStore(spec)
    return spec
  }

  // Automatyczne przeliczanie przy zmianie konfiguracji
  watch(
    () => configStore.config,
    () => {
      recalculate()
    },
    { deep: true }
  )

  return {
    calculate,
    calculateRungs,
    calculateModules,
    calculateCageHoops,
    generateComponents,
    recalculate
  }
}
