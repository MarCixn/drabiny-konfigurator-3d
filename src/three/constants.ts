/**
 * Stałe dla Three.js i modeli 3D
 */

// Wymiary modułów drabiny (w mm)
export const LADDER_DIMENSIONS = {
  X7_HEIGHT: 1922, // Wysokość modułu X7 (7 szczebli)
  X8_HEIGHT: 2200, // Wysokość modułu X8 (8 szczebli)
  RUNG_SPACING: 275, // Odstęp między szczeblami
  LADDER_WIDTH: 400, // Szerokość drabiny
  RUNG_DIAMETER: 30, // Średnica szczebla
  RAIL_WIDTH: 50, // Szerokość szyny bocznej
  RAIL_DEPTH: 25 // Głębokość szyny bocznej
} as const

// Wymiary kosza bezpieczeństwa
export const CAGE_DIMENSIONS = {
  HOOP_SPACING: 641.7, // Odstęp między obręczami
  HOOP_RADIUS: 400, // Promień obręczy
  HOOP_TUBE_RADIUS: 15, // Promień rurki obręczy
  BAR_RADIUS: 10 // Promień pręta pionowego
} as const

// Wymiary wsporników
export const BRACKET_DIMENSIONS = {
  SHORT: 215, // Krótki wspornik
  MEDIUM: 315, // Średni wspornik
  LONG: 415 // Długi wspornik
} as const

// Kolory (hex)
export const COLORS = {
  LADDER_ALUMINUM: 0xb8b8b8, // Aluminium
  LADDER_PAINTED: 0x2b5797, // Malowana (niebieski RAL)
  CAGE_YELLOW: 0xffd700, // Kosz - żółty
  BRACKET_GRAY: 0x606060, // Wspornik - szary
  WALL_BEIGE: 0xd4c4b0, // Ściana
  GROUND_GREEN: 0x228b22, // Podłoże
  GRID_GRAY: 0xcccccc, // Siatka
  SKY_BLUE: 0x87ceeb // Niebo
} as const

// Ustawienia kamery
export const CAMERA_SETTINGS = {
  FOV: 60,
  NEAR: 0.1,
  FAR: 1000,
  DEFAULT_POSITION: { x: 3, y: 5, z: 8 },
  DEFAULT_TARGET: { x: 0, y: 3, z: 0 }
} as const

// Ustawienia świateł
export const LIGHT_SETTINGS = {
  AMBIENT_COLOR: 0xffffff,
  AMBIENT_INTENSITY: 0.6,
  DIRECTIONAL_COLOR: 0xffffff,
  DIRECTIONAL_INTENSITY: 0.8,
  DIRECTIONAL_POSITION: { x: 5, y: 10, z: 7.5 }
} as const

// Skala (1 jednostka Three.js = 1 metr)
export const SCALE = {
  MM_TO_UNITS: 0.001, // mm -> jednostki Three.js
  M_TO_UNITS: 1 // m -> jednostki Three.js
} as const
