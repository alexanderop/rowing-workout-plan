<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()

defineSlots<{
  default: () => unknown
}>()
</script>

<template>
  <header
    data-slot="numeric-input-header"
    :class="cn('grid min-h-touch-target grid-cols-[1fr_auto_1fr] items-center gap-3', props.class)"
  >
    <slot />
  </header>
</template>
