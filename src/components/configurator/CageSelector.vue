<script setup lang="ts">
import { useConfigStore, useThreeDStore } from '@/stores'
import type { CageOption } from '@/types'

const configStore = useConfigStore()
const threeDStore = useThreeDStore()

function selectCage(cage: CageOption) {
  configStore.setCage(cage)
}
</script>

<template>
  <div class="cage-selector">
    <div class="choice-grid">
      <div
        class="choice-card"
        :class="{ selected: configStore.config.cage === 'no-cage' }"
        @click="selectCage('no-cage')"
      >
        <div class="choice-card-icon">🚫</div>
        <div class="choice-card-title">Bez kosza</div>
        <div class="choice-card-description">
          Drabina bez kosza bezpieczeństwa
        </div>
      </div>

      <div
        class="choice-card"
        :class="{ selected: configStore.config.cage === 'from-3m' }"
        @click="selectCage('from-3m')"
      >
        <div class="choice-card-icon">🛡️</div>
        <div class="choice-card-title">Kosz od 3m</div>
        <div class="choice-card-description">
          Kosz rozpoczyna się od wysokości 3m
        </div>
      </div>

      <div
        class="choice-card"
        :class="{ selected: configStore.config.cage === 'from-ground' }"
        @click="selectCage('from-ground')"
      >
        <div class="choice-card-icon">🔒</div>
        <div class="choice-card-title">Kosz od podstawy</div>
        <div class="choice-card-description">
          Kosz na całej wysokości drabiny
        </div>
      </div>
    </div>

    <div class="config-summary">
      <div class="config-summary-title">Konfiguracja kosza</div>
      <div class="config-summary-row">
        <span class="label">Typ kosza:</span>
        <span class="value">
          <template v-if="configStore.config.cage === 'no-cage'">Brak</template>
          <template v-else-if="configStore.config.cage === 'from-3m'">Od 3m</template>
          <template v-else>Od podstawy</template>
        </span>
      </div>
      <div v-if="configStore.config.cage !== 'no-cage'" class="config-summary-row">
        <span class="label">Obręcze kosza:</span>
        <span class="value">{{ threeDStore.state.safetyCageCount }} szt.</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cage-selector {
  display: flex;
  flex-direction: column;
  gap: 25px;
}
</style>
