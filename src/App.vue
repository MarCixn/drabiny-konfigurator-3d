<script setup lang="ts">
/**
 * App.vue - Mode Router
 * Routes to appropriate layout based on URL mode parameter
 *
 * ?mode=admin    -> AdminLayout (full configurator)
 * ?mode=customer -> AdminLayout with customer wizard
 * ?mode=seller   -> AdminLayout with compact side panel + PostMessage
 * ?mode=embed    -> AdminLayout with only 3D view (for product page embed)
 */

import { useAppMode } from './composables/useAppMode'
import AdminLayout from './layouts/AdminLayout.vue'

const { mode } = useAppMode()
</script>

<template>
  <AdminLayout :mode="mode" />
</template>
