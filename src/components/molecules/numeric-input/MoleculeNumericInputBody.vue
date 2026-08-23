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
  <div
    data-slot="numeric-input-body"
    :class="
      cn(
        'flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-4 pb-2',
        props.class,
      )
    "
  >
    <slot />
  </div>
</template>
