/**
 * Typy dla przeszkód na drabinie
 */

export type ObstacleType = 'window' | 'pipe' | 'ledge' | 'other'

export interface Obstacle {
  id: string
  type: ObstacleType
  name: string
  positionY: number // pozycja Y (wysokość) w mm od podstawy
  height: number // wysokość przeszkody w mm
  width: number // szerokość przeszkody w mm
  depth: number // głębokość (odległość od ściany) w mm
  offsetX: number // przesunięcie w poziomie względem osi drabiny w mm
}

export interface ObstacleCollision {
  obstacleId: string
  rungIndex: number
  collisionType: 'rung' | 'bracket' | 'connector'
  severity: 'warning' | 'error'
  message: string
}

export const OBSTACLE_PRESETS: Record<ObstacleType, Partial<Obstacle>> = {
  window: {
    name: 'Okno',
    height: 1200,
    width: 800,
    depth: 200
  },
  pipe: {
    name: 'Rura',
    height: 100,
    width: 100,
    depth: 150
  },
  ledge: {
    name: 'Gzyms',
    height: 150,
    width: 1000,
    depth: 200
  },
  other: {
    name: 'Inna przeszkoda',
    height: 500,
    width: 500,
    depth: 200
  }
}
