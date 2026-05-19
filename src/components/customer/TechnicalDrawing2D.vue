<script setup lang="ts">
/**
 * TechnicalDrawing2D.vue
 * SVG side view of the wall with ladder configuration
 * Dynamically updates based on customer store state
 */

import { computed } from 'vue'
import { useCustomerStore } from '../../stores/customer.store'

const store = useCustomerStore()

// SVG dimensions
const SVG_WIDTH = 600
const SVG_HEIGHT = 500
const PADDING = 60
const DIMENSION_OFFSET = 30

// Scale: pixels per meter (adjusted to fit view)
const scale = computed(() => {
  const maxHeight = Math.max(store.config.wallHeight, 6)
  return (SVG_HEIGHT - PADDING * 2) / maxHeight
})

// Ground level Y position
const groundY = computed(() => SVG_HEIGHT - PADDING)

// Wall dimensions in pixels
const wallHeightPx = computed(() => store.config.wallHeight * scale.value)
const wallTopY = computed(() => groundY.value - wallHeightPx.value)

// Insulation thickness in pixels
const insulationPx = computed(() => (store.config.insulationThickness / 100) * scale.value)

// Wall X position
const wallX = computed(() => PADDING + 100)
const wallWidth = 20

// Ladder position
const ladderX = computed(() => wallX.value + wallWidth + insulationPx.value + 10)

// Eave dimensions
const eaveWidthPx = computed(() => (store.config.eaveWidth / 100) * scale.value)
const eaveDepthPx = computed(() => (store.config.eaveDepth / 100) * scale.value)

// Roof type shapes
const roofPath = computed(() => {
  const topY = wallTopY.value
  const leftX = wallX.value - 20
  const rightX = wallX.value + wallWidth + insulationPx.value + 60

  switch (store.config.roofType) {
    case 'flat':
      return `M ${leftX} ${topY} L ${rightX} ${topY}`

    case 'with-eave':
      // Eave: horizontal part sticking out
      const eaveEndX = wallX.value + wallWidth + insulationPx.value + eaveDepthPx.value
      return `M ${leftX} ${topY - eaveWidthPx.value}
              L ${wallX.value + wallWidth + insulationPx.value} ${topY - eaveWidthPx.value}
              L ${wallX.value + wallWidth + insulationPx.value} ${topY}
              L ${eaveEndX} ${topY}
              L ${eaveEndX} ${topY + 5}`

    case 'with-parapet':
      // Parapet: small wall on top
      const parapetHeight = 30
      return `M ${leftX} ${topY}
              L ${leftX} ${topY - parapetHeight}
              M ${rightX} ${topY}
              L ${rightX} ${topY - parapetHeight}`

    default:
      return ''
  }
})

// Ladder rungs
const ladderRungs = computed(() => {
  const rungs: { y: number }[] = []
  const rungSpacing = 0.28 * scale.value // 28cm spacing
  const startY = store.config.isSuspended
    ? groundY.value - (store.config.suspendedHeight * scale.value)
    : groundY.value

  let y = startY - rungSpacing
  while (y > wallTopY.value + 20) {
    rungs.push({ y })
    y -= rungSpacing
  }
  return rungs
})

// Obstacles
const obstacleRects = computed(() => {
  return store.config.obstacles.map(obs => ({
    id: obs.id,
    y: groundY.value - ((obs.heightFrom + obs.height) * scale.value),
    height: obs.height * scale.value,
    type: obs.type
  }))
})

// Dimension line helper
function formatDimension(meters: number): string {
  if (meters >= 1) {
    return `${meters.toFixed(1)} m`
  }
  return `${Math.round(meters * 100)} cm`
}
</script>

<template>
  <svg
    :viewBox="`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`"
    class="technical-drawing"
    preserveAspectRatio="xMidYMid meet"
  >
    <!-- Background -->
    <rect width="100%" height="100%" fill="#f8f9fa" />

    <!-- Ground -->
    <line
      :x1="PADDING"
      :y1="groundY"
      :x2="SVG_WIDTH - PADDING"
      :y2="groundY"
      stroke="#333"
      stroke-width="2"
    />
    <text
      :x="PADDING + 10"
      :y="groundY + 20"
      class="label"
    >Poziom gruntu</text>

    <!-- Wall -->
    <rect
      :x="wallX"
      :y="wallTopY"
      :width="wallWidth"
      :height="wallHeightPx"
      fill="#8b7355"
      stroke="#5d4e37"
      stroke-width="1"
    />

    <!-- Insulation layer -->
    <rect
      v-if="store.config.insulationThickness > 0"
      :x="wallX + wallWidth"
      :y="wallTopY"
      :width="insulationPx"
      :height="wallHeightPx"
      fill="#ffeb99"
      stroke="#d4a500"
      stroke-width="1"
      stroke-dasharray="4 2"
    />

    <!-- Roof -->
    <path
      v-if="roofPath"
      :d="roofPath"
      fill="none"
      stroke="#555"
      stroke-width="3"
    />

    <!-- Ladder rails -->
    <line
      :x1="ladderX"
      :y1="store.config.isSuspended ? groundY - (store.config.suspendedHeight * scale) : groundY"
      :x2="ladderX"
      :y2="wallTopY - 20"
      stroke="#3498db"
      stroke-width="4"
    />
    <line
      :x1="ladderX + 40"
      :y1="store.config.isSuspended ? groundY - (store.config.suspendedHeight * scale) : groundY"
      :x2="ladderX + 40"
      :y2="wallTopY - 20"
      stroke="#3498db"
      stroke-width="4"
    />

    <!-- Ladder rungs -->
    <line
      v-for="rung in ladderRungs"
      :key="rung.y"
      :x1="ladderX"
      :y1="rung.y"
      :x2="ladderX + 40"
      :y2="rung.y"
      stroke="#2980b9"
      stroke-width="3"
    />

    <!-- Safety cage (if enabled) -->
    <g v-if="store.config.hasSafetyCage">
      <ellipse
        v-for="(_, i) in Math.floor(wallHeightPx / 50)"
        :key="i"
        :cx="ladderX + 20"
        :cy="wallTopY + 50 + i * 50"
        rx="30"
        ry="8"
        fill="none"
        stroke="#e67e22"
        stroke-width="2"
        stroke-dasharray="6 3"
      />
    </g>

    <!-- Obstacles -->
    <rect
      v-for="obs in obstacleRects"
      :key="obs.id"
      :x="wallX + wallWidth + insulationPx + 2"
      :y="obs.y"
      width="20"
      :height="obs.height"
      fill="#e74c3c"
      fill-opacity="0.5"
      stroke="#c0392b"
      stroke-width="1"
    />

    <!-- Suspended marker -->
    <g v-if="store.config.isSuspended">
      <line
        :x1="ladderX - 10"
        :y1="groundY"
        :x2="ladderX + 50"
        :y2="groundY"
        stroke="#95a5a6"
        stroke-width="1"
        stroke-dasharray="4 2"
      />
      <text
        :x="ladderX + 60"
        :y="groundY - (store.config.suspendedHeight * scale / 2)"
        class="dimension"
      >{{ formatDimension(store.config.suspendedHeight) }}</text>
    </g>

    <!-- Wall height dimension -->
    <g class="dimension-line">
      <line
        :x1="wallX - DIMENSION_OFFSET"
        :y1="groundY"
        :x2="wallX - DIMENSION_OFFSET"
        :y2="wallTopY"
        stroke="#666"
        stroke-width="1"
        marker-start="url(#arrow-down)"
        marker-end="url(#arrow-up)"
      />
      <text
        :x="wallX - DIMENSION_OFFSET - 10"
        :y="(groundY + wallTopY) / 2"
        class="dimension"
        text-anchor="end"
      >{{ formatDimension(store.config.wallHeight) }}</text>
    </g>

    <!-- Arrow markers -->
    <defs>
      <marker
        id="arrow-up"
        viewBox="0 0 10 10"
        refX="5"
        refY="10"
        markerWidth="6"
        markerHeight="6"
        orient="auto"
      >
        <path d="M 0 10 L 5 0 L 10 10" fill="none" stroke="#666" />
      </marker>
      <marker
        id="arrow-down"
        viewBox="0 0 10 10"
        refX="5"
        refY="0"
        markerWidth="6"
        markerHeight="6"
        orient="auto"
      >
        <path d="M 0 0 L 5 10 L 10 0" fill="none" stroke="#666" />
      </marker>
    </defs>

    <!-- Legend -->
    <g transform="translate(400, 30)">
      <text class="legend-title">Legenda:</text>
      <g transform="translate(0, 20)">
        <rect width="15" height="10" fill="#8b7355" />
        <text x="20" y="9" class="legend-item">Sciana</text>
      </g>
      <g transform="translate(0, 40)">
        <rect width="15" height="10" fill="#ffeb99" stroke="#d4a500" />
        <text x="20" y="9" class="legend-item">Izolacja</text>
      </g>
      <g transform="translate(0, 60)">
        <rect width="15" height="10" fill="#3498db" />
        <text x="20" y="9" class="legend-item">Drabina</text>
      </g>
      <g v-if="store.config.hasSafetyCage" transform="translate(0, 80)">
        <ellipse cx="7" cy="5" rx="10" ry="4" fill="none" stroke="#e67e22" stroke-width="2" />
        <text x="20" y="9" class="legend-item">Kosz</text>
      </g>
    </g>
  </svg>
</template>

<style scoped>
.technical-drawing {
  width: 100%;
  height: 100%;
  max-width: 100%;
  max-height: 100%;
}

.label {
  font-size: 12px;
  fill: #666;
}

.dimension {
  font-size: 11px;
  fill: #333;
  font-weight: 500;
}

.legend-title {
  font-size: 12px;
  font-weight: 600;
  fill: #333;
}

.legend-item {
  font-size: 11px;
  fill: #555;
}
</style>
