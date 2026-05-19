<script setup lang="ts">
/**
 * App.vue - Mode Router
 * Routes to AdminLayout with mode detection
 */

import { useAppMode } from './composables/useAppMode'
import AdminLayout from './layouts/AdminLayout.vue'

const { mode } = useAppMode()
</script>

<template>
  <AdminLayout :mode="mode" />
</template>
