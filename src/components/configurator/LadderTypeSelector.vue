<script setup lang="ts">
import { useConfigStore } from '@/stores'
import type { LadderType } from '@/types'

const configStore = useConfigStore()

function selectType(type: LadderType) {
  configStore.setType(type)
}
</script>

<template>
  <div class="type-selector">
    <div class="choice-grid cols-2">
      <div
        class="choice-card"
        :class="{ selected: configStore.config.type === 'facade' }"
        @click="selectType('facade')"
      >
        <div class="choice-card-icon">🏢</div>
        <div class="choice-card-title">Drabina fasadowa</div>
        <div class="choice-card-description">
          Montaż na zewnętrznej ścianie budynku
        </div>
      </div>

      <div
        class="choice-card"
        :class="{ selected: configStore.config.type === 'chimney' }"
        @click="selectType('chimney')"
      >
        <div class="choice-card-icon">🏭</div>
        <div class="choice-card-title">Drabina kominowa</div>
        <div class="choice-card-description">
          Montaż na kominie lub wieży
        </div>
      </div>
    </div>

    <div class="config-summary">
      <div class="config-summary-title">Wybrany typ</div>
      <div class="config-summary-row">
        <span class="label">Typ drabiny:</span>
        <span class="value">
          {{ configStore.config.type === 'facade' ? 'Fasadowa' : 'Kominowa' }}
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.type-selector {
  display: flex;
  flex-direction: column;
  gap: 25px;
}
</style>
