/**
 * Typy dla wizualizacji 3D
 */

export type ConnectorType = 'modulowy' | 'scienny' | 'dachowy' | 'kominowy' | 'attykowy'

export type WspornikType = 'standard' | 'regulowany' | 'attykowy'

export interface ThreeDState {
  numX7Ladders: number
  numX8Ladders: number
  finalLadderRungs: number
  totalRungs: number
  safetyCageCount: number
  connectorTypes: ConnectorType[]
  wspornikTypes: WspornikType[]
  wspornikPositions: number[] // pozycje Y wsporników w mm
}

export interface ThreeDConfig {
  showGrid: boolean
  showAxes: boolean
  autoRotate: boolean
  cameraPosition: CameraPosition
}

export interface CameraPosition {
  x: number
  y: number
  z: number
}

// Stałe dla Three.js
export const THREE_CONSTANTS = {
  // Kolory
  LADDER_COLOR: 0xc0c0c0, // Srebrny dla aluminium
  CAGE_COLOR: 0xffd700, // Złoty dla kosza
  CONNECTOR_COLOR: 0x808080, // Szary dla łączników
  WSPORNIK_COLOR: 0x606060, // Ciemnoszary dla wsporników
  WALL_COLOR: 0xd4c4b0, // Beżowy dla ściany
  GROUND_COLOR: 0x228b22, // Zielony dla podłoża

  // Wymiary modeli (w jednostkach Three.js, 1 = 1mm)
  SCALE_FACTOR: 0.001, // Konwersja mm -> jednostki Three.js

  // Kamera
  DEFAULT_CAMERA_POSITION: { x: 3, y: 5, z: 8 },
  CAMERA_FOV: 60,
  CAMERA_NEAR: 0.1,
  CAMERA_FAR: 1000
} as const
