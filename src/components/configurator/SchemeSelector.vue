<script setup lang="ts">
import { useConfigStore } from '@/stores'
import type { Scheme } from '@/types'

const configStore = useConfigStore()

function selectScheme(scheme: Scheme) {
  configStore.setScheme(scheme)
}
</script>

<template>
  <div class="scheme-selector">
    <div class="choice-grid cols-2">
      <div
        class="choice-card"
        :class="{ selected: configStore.config.scheme === 'no-platform' }"
        @click="selectScheme('no-platform')"
      >
        <div class="choice-card-icon">
          <svg viewBox="0 0 80 100" width="60" height="75">
            <!-- Drabina -->
            <rect x="20" y="25" width="5" height="75" fill="var(--text-secondary)"/>
            <rect x="55" y="25" width="5" height="75" fill="var(--text-secondary)"/>
            <!-- Szczeble -->
            <rect x="20" y="40" width="40" height="4" fill="var(--text-muted)"/>
            <rect x="20" y="60" width="40" height="4" fill="var(--text-muted)"/>
            <rect x="20" y="80" width="40" height="4" fill="var(--text-muted)"/>
            <!-- Poręcze asekuracyjne -->
            <rect x="18" y="5" width="4" height="35" fill="var(--accent)"/>
            <rect x="58" y="5" width="4" height="35" fill="var(--accent)"/>
          </svg>
        </div>
        <div class="choice-card-title">Poręcze asekuracyjne</div>
        <div class="choice-card-description">
          Poręcze wystające 1,1m ponad wyjście
        </div>
      </div>

      <div
        class="choice-card"
        :class="{ selected: configStore.config.scheme === 'with-platform' }"
        @click="selectScheme('with-platform')"
      >
        <div class="choice-card-icon">
          <svg viewBox="0 0 80 100" width="60" height="75">
            <!-- Drabina -->
            <rect x="20" y="35" width="5" height="65" fill="var(--text-secondary)"/>
            <rect x="55" y="35" width="5" height="65" fill="var(--text-secondary)"/>
            <!-- Szczeble -->
            <rect x="20" y="50" width="40" height="4" fill="var(--text-muted)"/>
            <rect x="20" y="70" width="40" height="4" fill="var(--text-muted)"/>
            <!-- Podest -->
            <rect x="10" y="30" width="60" height="6" fill="var(--accent)"/>
            <!-- Poręcze podestu -->
            <rect x="8" y="5" width="4" height="30" fill="var(--accent)"/>
            <rect x="68" y="5" width="4" height="30" fill="var(--accent)"/>
            <rect x="8" y="5" width="64" height="4" fill="var(--accent)"/>
          </svg>
        </div>
        <div class="choice-card-title">Podest z poręczami</div>
        <div class="choice-card-description">
          Wygodne wyjście z podestem
        </div>
      </div>
    </div>

    <div class="config-summary">
      <div class="config-summary-title">Wybrany wariant</div>
      <div class="config-summary-row">
        <span class="label">Zakończenie:</span>
        <span class="value">
          {{ configStore.config.scheme === 'with-platform' ? 'Podest z poręczami' : 'Poręcze asekuracyjne' }}
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.scheme-selector {
  display: flex;
  flex-direction: column;
  gap: 25px;
}
</style>
