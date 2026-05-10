/**
 * Obliczenia dla przejścia przez attykę
 * Przepisane z oryginalnego konfiguratora
 */

// ============================================
// INTERFACE DLA KONFIGURACJI ATTYKI
// ============================================
export interface AtticConfig {
  // Strona wejścia
  entryWallHeight: number       // m
  entryBracketType: 'short' | 'medium' | 'long' | 'none'
  entryCageType: 'no-cage' | 'with-cage'
  entryAccessLock: boolean
  entrySuspended: boolean
  entrySuspendedHeight: number  // m
  entryObstacles: Array<{ id: number; bottomHeight: number; height: number; type: string }>

  // Strona zejścia
  atticWallHeight: number       // m - wysokość murka attyki
  atticMinDistance: number      // cm - dystans podest-attyka
  descentMountType: '' | 'bigfoot' | 'custom-base' | 'brackets' | 'self'
  customBaseHeight: number      // cm
  descentBracketType: 'short' | 'medium' | 'long'
  descentCageType: 'no-cage' | 'with-cage'
  descentAccessLock: boolean
  selfBracketType: 'ready' | 'connecting'
}

export interface AtticSpecification {
  valid: boolean
  isAttic: boolean
  components: Array<{ name: string; quantity: number; unit: string }>
  summary: {
    entryWallHeight: number
    atticWallHeight: number
    atticMinDistance: number
    entryRungCount: number
    entryCageHoops: number
    descentRungCount: number
    descentCageHoops: number
    calculatedPlatformDistance?: number
  }
  warnings: string[]
  errors: string[]
}

// ============================================
// STAŁE DLA OBLICZEŃ ATTYKI
// ============================================
const ATTIC_CONSTANTS = {
  RUNG_SPACING: 275,           // mm - rozstaw szczebli
  BIGFOOT_HEIGHT: 90,          // mm - wysokość BIGFOOT
  BIGFOOT_CONNECTION_OVERLAP: 105, // mm - nakładka łączenia
  BIGFOOT_MAX_ADDITIONAL_RUNGS: 4, // max dodatkowych szczebli poniżej attyki
  ATTIC_RUNGS: 2,              // szczeble przejścia przez attykę
  ATTIC_OFFSET: 550,           // 2 * 275mm
  MIN_LAST_RUNG: 40,           // mm - min wysokość ostatniego szczebla
  MAX_LAST_RUNG: 330,          // mm - max wysokość ostatniego szczebla
  CAGE_START_FROM_RUNG: 1213.3, // mm - pierwsza obręcz od pierwszego szczebla
  CAGE_HOOP_SPACING: 641.7,    // mm - skok między obręczami
  CAGE_MIN_HEIGHT: 2200,       // mm - min wysokość końcowej obręczy
  CAGE_MAX_HEIGHT: 3000,       // mm - max wysokość końcowej obręczy
  // Otwory na kosz wg typu drabiny
  CAGE_HOLES: {
    atticPassage: 3,
    repeatLadder: 3,
    endLadder: { 1: 0, 2: 0, 3: 1, 4: 1, 5: 2, 6: 2, 7: 3 } as Record<number, number>
  }
}

/**
 * Oblicz kątowniki łączące kosz
 */
function calculateCageBrackets(hoopCount: number): { bracket4: number; bracket3: number; bracket2: number } {
  if (hoopCount <= 1) return { bracket4: 0, bracket3: 0, bracket2: 0 }

  const gaps = hoopCount - 1
  const bracket4 = Math.floor(gaps / 3)
  const remainder = gaps % 3

  let bracket3 = 0
  let bracket2 = 0

  if (remainder === 1) {
    bracket2 = 1
  } else if (remainder === 2) {
    bracket3 = 1
  }

  return { bracket4, bracket3, bracket2 }
}

/**
 * Generuj specyfikację dla przejścia przez attykę
 */
export function generateAtticSpecification(config: AtticConfig): AtticSpecification {
  const components: Array<{ name: string; quantity: number; unit: string }> = []
  const warnings: string[] = []
  const errors: string[] = []

  // Stałe elementy przejścia przez attykę
  components.push({ name: 'Przejście przez attykę', quantity: 1, unit: 'szt.' })
  components.push({ name: 'Krata WEMA 50x100cm', quantity: 1, unit: 'szt.' })
  components.push({ name: 'Uchwyt kraty WEMA', quantity: 2, unit: 'szt.' })

  // === STRONA WEJŚCIA ===
  const entryWallHeightMm = (config.entryWallHeight || 0) * 1000
  const atticWallHeightMm = (config.atticWallHeight || 0) * 1000

  // Oblicz dystans podest-attyka
  let atticMinDistanceMm = (config.atticMinDistance || 5) * 10

  // Dla BIGFOOT/custom-base - oblicz rzeczywisty dystans
  if (config.descentMountType === 'bigfoot' || config.descentMountType === 'custom-base') {
    const footHeight = config.descentMountType === 'custom-base'
      ? (config.customBaseHeight || 9) * 10
      : ATTIC_CONSTANTS.BIGFOOT_HEIGHT

    const baseHeight = ATTIC_CONSTANTS.RUNG_SPACING + footHeight
    const extendedHeight = baseHeight + ATTIC_CONSTANTS.BIGFOOT_CONNECTION_OVERLAP
    const targetHeight = atticWallHeightMm + atticMinDistanceMm

    let calculatedPlatformDistance = 0

    if (targetHeight <= baseHeight) {
      calculatedPlatformDistance = baseHeight - atticWallHeightMm
    } else if (targetHeight <= extendedHeight) {
      calculatedPlatformDistance = extendedHeight - atticWallHeightMm
    } else {
      for (let i = 1; i <= ATTIC_CONSTANTS.BIGFOOT_MAX_ADDITIONAL_RUNGS; i++) {
        const totalHeight = baseHeight + (i * ATTIC_CONSTANTS.RUNG_SPACING)
        if (totalHeight >= targetHeight) {
          calculatedPlatformDistance = totalHeight - atticWallHeightMm
          break
        }
      }
    }

    atticMinDistanceMm = calculatedPlatformDistance
  }

  // Pozycja pierwszego szczebla
  const entryFirstRungHeight = entryWallHeightMm + atticMinDistanceMm + 30

  // Poziom gruntu (lub zawieszenia)
  const entrySuspendedHeightMm = config.entrySuspended ? (config.entrySuspendedHeight || 0) * 1000 : 0
  const entryGroundLevel = entrySuspendedHeightMm

  // Zakres dla ostatniego szczebla
  const minLastRungHeight = entryGroundLevel + ATTIC_CONSTANTS.MIN_LAST_RUNG
  const maxLastRungHeight = entryGroundLevel + ATTIC_CONSTANTS.MAX_LAST_RUNG

  // Oblicz szczeble drabiny wejściowej
  let currentRungHeight = entryFirstRungHeight - ATTIC_CONSTANTS.ATTIC_OFFSET
  let entryLadderRungs = 0

  while (currentRungHeight >= minLastRungHeight) {
    entryLadderRungs++
    if (currentRungHeight >= minLastRungHeight && currentRungHeight <= maxLastRungHeight) {
      break
    }
    currentRungHeight -= ATTIC_CONSTANTS.RUNG_SPACING
  }

  // Podział na powielane i końcową
  let entryRepeatLadder7 = 0
  let entryEndLadderRungs = 0

  if (entryLadderRungs > 7) {
    let remaining = entryLadderRungs
    while (remaining > 7) {
      entryRepeatLadder7++
      remaining -= 7
    }
    entryEndLadderRungs = remaining
  } else {
    entryEndLadderRungs = entryLadderRungs
  }

  const entryRungCount = ATTIC_CONSTANTS.ATTIC_RUNGS + entryLadderRungs

  // Dodaj komponenty drabiny wejściowej
  if (entryRepeatLadder7 > 0) {
    components.push({
      name: 'Drabina powielana 7-szczeblowa (wejście)',
      quantity: entryRepeatLadder7,
      unit: 'szt.'
    })
  }
  if (entryEndLadderRungs > 0) {
    components.push({
      name: `Drabina końcowa x${entryEndLadderRungs} (wejście)`,
      quantity: 1,
      unit: 'szt.'
    })
  }

  // Uchwyty i wsporniki strona wejścia
  if (entryWallHeightMm > 0 && entryLadderRungs > 0 && config.entryBracketType !== 'none') {
    const bracketLabels: Record<string, string> = {
      'short': '16-26 cm',
      'medium': '26-36 cm',
      'long': '36-46 cm'
    }
    const bracketSize = bracketLabels[config.entryBracketType] || '16-26 cm'
    const distanceCm = atticMinDistanceMm / 10

    let entryConnectorCount = 0
    let entryClampCount = 0
    let entryLinkCount = 0
    let entryBracketCount = 0

    if (distanceCm <= 26) {
      entryBracketCount = 1
      entryConnectorCount = 1
    } else {
      entryBracketCount = 1
      entryClampCount = 1
      entryLinkCount = 1
    }

    if (entryRepeatLadder7 > 0) {
      entryConnectorCount += entryRepeatLadder7
      entryBracketCount += entryRepeatLadder7
    }

    if (entryEndLadderRungs >= 5 && entryEndLadderRungs <= 7) {
      entryClampCount += 1
      entryBracketCount += 1
    }

    if (entryConnectorCount > 0) {
      components.push({
        name: 'Uchwyt montażowo-łączący (para L+P) - wejście',
        quantity: entryConnectorCount,
        unit: 'par'
      })
    }
    if (entryClampCount > 0) {
      components.push({
        name: 'Uchwyty montażowo-ściskane (para L+P) - wejście',
        quantity: entryClampCount,
        unit: 'par'
      })
    }
    if (entryLinkCount > 0) {
      components.push({
        name: 'Uchwyt łączący (para L+P) - wejście',
        quantity: entryLinkCount,
        unit: 'par'
      })
    }
    if (entryBracketCount > 0) {
      components.push({
        name: `Wsporniki ${bracketSize} (para L+P) - wejście`,
        quantity: entryBracketCount,
        unit: 'par'
      })
    }
  }

  // Kosz ochronny strona wejścia
  let entryCageHoops = 0
  if (config.entryCageType === 'with-cage' && entryFirstRungHeight > 0) {
    let maxHolesAvailable = ATTIC_CONSTANTS.CAGE_HOLES.atticPassage
    maxHolesAvailable += entryRepeatLadder7 * ATTIC_CONSTANTS.CAGE_HOLES.repeatLadder
    if (entryEndLadderRungs > 0) {
      maxHolesAvailable += ATTIC_CONSTANTS.CAGE_HOLES.endLadder[entryEndLadderRungs] || 0
    }

    const firstHoopHeight = entryFirstRungHeight + ATTIC_CONSTANTS.CAGE_START_FROM_RUNG
    let hoopCount = 0
    let hoopHeight = firstHoopHeight

    while (hoopHeight >= ATTIC_CONSTANTS.CAGE_MIN_HEIGHT && hoopCount < maxHolesAvailable) {
      hoopCount++
      hoopHeight -= ATTIC_CONSTANTS.CAGE_HOOP_SPACING
    }

    if (hoopCount === 1) hoopCount = 0

    if (hoopCount > 0) {
      entryCageHoops = hoopCount
      components.push({
        name: 'Obręcz kosza ochronnego (wejście)',
        quantity: hoopCount,
        unit: 'szt.'
      })

      const cageBrackets = calculateCageBrackets(hoopCount)
      if (cageBrackets.bracket4 > 0) {
        components.push({ name: 'Kątownik łączący kosz 4-otworowy (wejście)', quantity: cageBrackets.bracket4, unit: 'szt.' })
      }
      if (cageBrackets.bracket3 > 0) {
        components.push({ name: 'Kątownik łączący kosz 3-otworowy (wejście)', quantity: cageBrackets.bracket3, unit: 'szt.' })
      }
      if (cageBrackets.bracket2 > 0) {
        components.push({ name: 'Kątownik łączący kosz 2-otworowy (wejście)', quantity: cageBrackets.bracket2, unit: 'szt.' })
      }
    }
  }

  // === STRONA ZEJŚCIA ===
  let descentRungCount = 0
  let descentCageHoops = 0

  if (config.descentMountType) {
    const descentWallHeightMm = atticWallHeightMm

    if (config.descentMountType === 'bigfoot' || config.descentMountType === 'custom-base') {
      const isCustomBase = config.descentMountType === 'custom-base'
      const footHeight = isCustomBase
        ? (config.customBaseHeight || 9) * 10
        : ATTIC_CONSTANTS.BIGFOOT_HEIGHT

      const minDistanceMm = (config.atticMinDistance || 5) * 10
      const targetHeight = descentWallHeightMm + minDistanceMm
      const baseHeight = ATTIC_CONSTANTS.RUNG_SPACING + footHeight
      const extendedHeight = baseHeight + ATTIC_CONSTANTS.BIGFOOT_CONNECTION_OVERLAP

      if (!isCustomBase) {
        components.push({ name: 'BIGFOOT', quantity: 1, unit: 'szt.' })
      }

      // Określ czy potrzebna drabina końcowa
      if (targetHeight <= baseHeight) {
        // Krótsze nóżki
        const atticComp = components.find(c => c.name.includes('Przejście przez attykę'))
        if (atticComp) {
          atticComp.name = isCustomBase
            ? 'Przejście przez attykę - własne podłoże, krótsze nóżki'
            : 'Przejście przez attykę - krótsze nóżki'
        }
      } else if (targetHeight <= extendedHeight) {
        // Pełne podłużnice
        if (isCustomBase) {
          const atticComp = components.find(c => c.name.includes('Przejście przez attykę'))
          if (atticComp && !atticComp.name.includes('własne podłoże')) {
            atticComp.name = 'Przejście przez attykę - własne podłoże'
          }
        }
      } else {
        // Drabina końcowa
        for (let i = 1; i <= ATTIC_CONSTANTS.BIGFOOT_MAX_ADDITIONAL_RUNGS; i++) {
          const totalHeight = baseHeight + (i * ATTIC_CONSTANTS.RUNG_SPACING)
          if (totalHeight >= targetHeight) {
            descentRungCount = i
            break
          }
        }

        if (descentRungCount > 0) {
          components.push({
            name: `Drabina końcowa ${descentRungCount}-szczeblowa (zejście)`,
            quantity: 1,
            unit: 'szt.'
          })
          components.push({
            name: 'Uchwyt łączący (para L+P) - zejście',
            quantity: 1,
            unit: 'par'
          })
        }

        if (isCustomBase) {
          const atticComp = components.find(c => c.name.includes('Przejście przez attykę'))
          if (atticComp && !atticComp.name.includes('własne podłoże')) {
            atticComp.name = 'Przejście przez attykę - własne podłoże'
          }
        }
      }

    } else if (config.descentMountType === 'brackets') {
      // Na wspornikach
      const minDistanceMm = (config.atticMinDistance || 5) * 10
      const startHeight = descentWallHeightMm + minDistanceMm + 30

      let totalRungs = 1
      let lastRungHeight = startHeight

      while (lastRungHeight - ATTIC_CONSTANTS.RUNG_SPACING >= ATTIC_CONSTANTS.MIN_LAST_RUNG) {
        const nextHeight = lastRungHeight - ATTIC_CONSTANTS.RUNG_SPACING
        if (nextHeight <= ATTIC_CONSTANTS.MAX_LAST_RUNG) {
          if (nextHeight >= ATTIC_CONSTANTS.MIN_LAST_RUNG) {
            totalRungs++
          }
          break
        }
        totalRungs++
        lastRungHeight = nextHeight
      }

      let ladderRungs = Math.max(1, totalRungs - ATTIC_CONSTANTS.ATTIC_RUNGS)

      let repeatLadder7 = 0
      let endLadderRungs = 0

      if (ladderRungs <= 7) {
        endLadderRungs = ladderRungs
      } else {
        let remaining = ladderRungs
        while (remaining > 7) {
          repeatLadder7++
          remaining -= 7
        }
        endLadderRungs = remaining
      }

      descentRungCount = ladderRungs

      if (repeatLadder7 > 0) {
        components.push({ name: 'Drabina powielana 7-szczeblowa (zejście)', quantity: repeatLadder7, unit: 'szt.' })
      }
      if (endLadderRungs > 0) {
        components.push({ name: `Drabina końcowa x${endLadderRungs} (zejście)`, quantity: 1, unit: 'szt.' })
      }

      const bracketLabels: Record<string, string> = { 'short': '16-26 cm', 'medium': '26-36 cm', 'long': '36-46 cm' }
      const bracketSize = bracketLabels[config.descentBracketType] || '16-26 cm'

      let connectorCount = 1
      let bracketCount = 1

      const needsBottomMount = (repeatLadder7 === 0 && endLadderRungs >= 3) ||
                               (repeatLadder7 > 0 && endLadderRungs >= 5)
      if (needsBottomMount) {
        components.push({ name: 'Uchwyty montażowo-ściskane (para L+P) - zejście', quantity: 1, unit: 'par' })
        bracketCount++
      }

      if (repeatLadder7 > 0) {
        connectorCount += repeatLadder7
        bracketCount += repeatLadder7
      }

      components.push({ name: `Wsporniki ${bracketSize} (para L+P) - zejście`, quantity: bracketCount, unit: 'par' })
      components.push({ name: 'Uchwyt montażowo-łączący (para L+P) - zejście', quantity: connectorCount, unit: 'par' })

      // Kosz zejścia
      if (config.descentCageType === 'with-cage') {
        const firstHoopHeight = startHeight + ATTIC_CONSTANTS.CAGE_START_FROM_RUNG
        let hoopCount = 1
        let currentHeight = firstHoopHeight

        while (true) {
          if (currentHeight >= ATTIC_CONSTANTS.CAGE_MIN_HEIGHT && currentHeight <= ATTIC_CONSTANTS.CAGE_MAX_HEIGHT) {
            break
          }
          currentHeight -= ATTIC_CONSTANTS.CAGE_HOOP_SPACING
          if (currentHeight < ATTIC_CONSTANTS.CAGE_MIN_HEIGHT) break
          hoopCount++
        }

        if (hoopCount > 0) {
          descentCageHoops = hoopCount
          components.push({ name: 'Obręcz kosza ochronnego (zejście)', quantity: hoopCount, unit: 'szt.' })

          const cageBrackets = calculateCageBrackets(hoopCount)
          if (cageBrackets.bracket4 > 0) {
            components.push({ name: 'Kątownik łączący kosz 4-otworowy (zejście)', quantity: cageBrackets.bracket4, unit: 'szt.' })
          }
          if (cageBrackets.bracket3 > 0) {
            components.push({ name: 'Kątownik łączący kosz 3-otworowy (zejście)', quantity: cageBrackets.bracket3, unit: 'szt.' })
          }
          if (cageBrackets.bracket2 > 0) {
            components.push({ name: 'Kątownik łączący kosz 2-otworowy (zejście)', quantity: cageBrackets.bracket2, unit: 'szt.' })
          }
        }
      }

    } else if (config.descentMountType === 'self') {
      // Montaż na własną rękę
      const minDistanceMm = (config.atticMinDistance || 5) * 10
      const totalHeight = descentWallHeightMm + minDistanceMm
      const MIN_HEIGHT_FOR_LADDER = 560

      if (totalHeight >= MIN_HEIGHT_FOR_LADDER) {
        let rungHeight = totalHeight - ATTIC_CONSTANTS.ATTIC_OFFSET
        let ladderRungs = 0

        while (rungHeight >= 10) { // 1cm minimum
          ladderRungs++
          if (rungHeight <= 310) break // 31cm maximum
          rungHeight -= ATTIC_CONSTANTS.RUNG_SPACING
        }

        let repeatLadder7 = 0
        let endLadderRungs = 0

        if (ladderRungs > 7) {
          let remaining = ladderRungs
          while (remaining > 7) {
            repeatLadder7++
            remaining -= 7
          }
          endLadderRungs = remaining
        } else {
          endLadderRungs = ladderRungs
        }

        descentRungCount = ladderRungs

        if (repeatLadder7 > 0) {
          components.push({ name: 'Drabina powielana 7-szczeblowa (zejście)', quantity: repeatLadder7, unit: 'szt.' })
        }
        if (endLadderRungs > 0) {
          components.push({ name: `Drabina końcowa x${endLadderRungs} (zejście)`, quantity: 1, unit: 'szt.' })
        }

        if (ladderRungs > 0) {
          if (config.selfBracketType === 'ready') {
            let connectorCount = 1 + repeatLadder7
            components.push({ name: 'Uchwyt montażowo-łączący (para L+P) - zejście', quantity: connectorCount, unit: 'par' })
            if (endLadderRungs >= 5 && endLadderRungs <= 7) {
              components.push({ name: 'Uchwyty montażowo-ściskane (para L+P) - zejście', quantity: 1, unit: 'par' })
            }
          } else {
            let connectorCount = 1 + repeatLadder7
            components.push({ name: 'Uchwyt łączący (para L+P) - zejście', quantity: connectorCount, unit: 'par' })
          }
        }
      }

      // Kosz zejścia dla self
      if (config.descentCageType === 'with-cage' && descentRungCount > 0) {
        const firstHoopHeight = (descentWallHeightMm + (config.atticMinDistance || 5) * 10) + ATTIC_CONSTANTS.CAGE_START_FROM_RUNG
        let hoopCount = 1
        let currentHeight = firstHoopHeight

        while (true) {
          if (currentHeight >= ATTIC_CONSTANTS.CAGE_MIN_HEIGHT && currentHeight <= ATTIC_CONSTANTS.CAGE_MAX_HEIGHT) {
            break
          }
          currentHeight -= ATTIC_CONSTANTS.CAGE_HOOP_SPACING
          if (currentHeight < ATTIC_CONSTANTS.CAGE_MIN_HEIGHT) break
          hoopCount++
        }

        if (hoopCount > 0) {
          descentCageHoops = hoopCount
          components.push({ name: 'Obręcz kosza ochronnego (zejście)', quantity: hoopCount, unit: 'szt.' })

          const cageBrackets = calculateCageBrackets(hoopCount)
          if (cageBrackets.bracket4 > 0) {
            components.push({ name: 'Kątownik łączący kosz 4-otworowy (zejście)', quantity: cageBrackets.bracket4, unit: 'szt.' })
          }
          if (cageBrackets.bracket3 > 0) {
            components.push({ name: 'Kątownik łączący kosz 3-otworowy (zejście)', quantity: cageBrackets.bracket3, unit: 'szt.' })
          }
          if (cageBrackets.bracket2 > 0) {
            components.push({ name: 'Kątownik łączący kosz 2-otworowy (zejście)', quantity: cageBrackets.bracket2, unit: 'szt.' })
          }
        }
      }
    }
  }

  // Blokada dostępu
  let accessLockCount = 0
  if (config.entryCageType === 'with-cage' && config.entryAccessLock) accessLockCount++
  if (config.descentCageType === 'with-cage' && config.descentAccessLock) accessLockCount++

  if (accessLockCount > 0) {
    components.push({ name: 'Blokada dostępu', quantity: accessLockCount, unit: 'szt.' })
  }

  return {
    valid: true,
    isAttic: true,
    components,
    summary: {
      entryWallHeight: config.entryWallHeight,
      atticWallHeight: config.atticWallHeight,
      atticMinDistance: config.atticMinDistance,
      entryRungCount,
      entryCageHoops,
      descentRungCount,
      descentCageHoops,
      calculatedPlatformDistance: atticMinDistanceMm / 10
    },
    warnings,
    errors
  }
}
