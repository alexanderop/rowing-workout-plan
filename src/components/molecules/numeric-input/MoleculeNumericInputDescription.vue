<script setup lang="ts">
import type { DrawerDescriptionProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import { DrawerDescription, useForwardProps } from 'reka-ui'
import { cn } from '@/lib/utils'

const props = defineProps<DrawerDescriptionProps & { class?: HTMLAttributes['class'] }>()

defineSlots<{
  default: () => unknown
}>()

const delegatedProps = reactiveOmit(props, 'class')
const forwarded = useForwardProps(delegatedProps)
</script>

<template>
  <DrawerDescription
    data-slot="numeric-input-description"
    v-bind="forwarded"
    :class="cn('sr-only', props.class)"
  >
    <slot />
  </DrawerDescription>
</template>
