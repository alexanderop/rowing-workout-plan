<script setup lang="ts">
import type { DialogTitleProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import { DialogTitle, useForwardProps } from 'reka-ui'
import { cn } from '@/lib/utils'

/**
 * Publishes its id to the provider so `<MoleculeDialogContent>` can point
 * `aria-labelledby` at it. Every dialog needs one, or the screen reader
 * announces an unnamed dialog.
 */
const props = defineProps<DialogTitleProps & { class?: HTMLAttributes['class'] }>()

defineSlots<{
  default: () => unknown
}>()

// `class` is consumed here, not forwarded — reka would set it verbatim and
// the primitive's own defaults would be lost instead of merged.
const delegatedProps = reactiveOmit(props, 'class')
const forwarded = useForwardProps(delegatedProps)
</script>

<template>
  <DialogTitle
    data-slot="dialog-title"
    v-bind="forwarded"
    :class="cn('text-lg leading-none font-semibold', props.class)"
  >
    <slot />
  </DialogTitle>
</template>
