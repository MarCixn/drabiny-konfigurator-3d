/**
 * Typy konfiguracji drabiny
 */

export type LadderType = 'facade' | 'chimney'

export type Scheme = 'none' | 'with-platform' | 'no-platform'

export type CageOption = 'no-cage' | 'from-3m' | 'from-ground'

export type SurfaceType = 'smooth' | 'rough'

export interface LadderConfig {
  type: LadderType
  wallHeight: number // wysokość ściany w metrach
  scheme: Scheme
  cage: CageOption
  surfaceType: SurfaceType
  bracketSpacing: number // odstęp wsporników w mm (domyślnie 1000)
}

export interface Ladder {
  id: string
  config: LadderConfig
  specification: Specification | null
  price: number
  createdAt: Date
}

export interface Specification {
  numX7Ladders: number
  numX8Ladders: number
  finalLadderRungs: number
  totalRungs: number
  safetyCageCount: number
  totalHeightMm: number
  components: Component[]
}

export interface Component {
  id: string
  name: string
  quantity: number
  unit: string
  unitPrice?: number
  totalPrice?: number
}

// Stałe wymiarów
export const LADDER_CONSTANTS = {
  X7_HEIGHT_MM: 1925, // Wysokość modułu X7
  X8_HEIGHT_MM: 2200, // Wysokość modułu X8
  RUNG_SPACING_MM: 275, // Odstęp szczebli
  RUNGS_PER_X7: 7, // Szczebli w X7
  RUNGS_PER_X8: 8, // Szczebli w X8
  PLATFORM_HEIGHT_MM: 1100, // Wysokość podestu nad ścianą
  HANDRAIL_HEIGHT_MM: 1100, // Wysokość poręczy asekuracyjnych
  CAGE_SEGMENT_HEIGHT_MM: 700, // Wysokość segmentu kosza
  CAGE_START_HEIGHT_MM: 3000, // Kosz zaczyna się od 3m
  MIN_WALL_HEIGHT_M: 0.6,
  MAX_WALL_HEIGHT_M: 30,
  DEFAULT_BRACKET_SPACING_MM: 1000
} as const
