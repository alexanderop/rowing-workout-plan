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
  <div data-slot="numeric-input-controls" :class="cn('mt-auto flex flex-col gap-4', props.class)">
    <slot />
  </div>
</template>
