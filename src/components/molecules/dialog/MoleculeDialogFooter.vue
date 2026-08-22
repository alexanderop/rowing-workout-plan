<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'

/**
 * Column-reversed on small viewports so the confirming action sits under the
 * thumb and the dismissive one above it — the mobile convention. From `sm:`
 * up it becomes the usual right-aligned row.
 */
const props = defineProps<{
  class?: HTMLAttributes['class']
}>()

defineSlots<{
  default: () => unknown
}>()
</script>

<template>
  <div
    data-slot="dialog-footer"
    :class="cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', props.class)"
  >
    <slot />
  </div>
</template>
