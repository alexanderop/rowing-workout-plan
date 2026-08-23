<script setup lang="ts">
import type { DrawerTitleProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import { DrawerTitle, useForwardProps } from 'reka-ui'
import { cn } from '@/lib/utils'

const props = defineProps<DrawerTitleProps & { class?: HTMLAttributes['class'] }>()

defineSlots<{
  default: () => unknown
}>()

const delegatedProps = reactiveOmit(props, 'class')
const forwarded = useForwardProps(delegatedProps)
</script>

<template>
  <DrawerTitle
    data-slot="numeric-input-title"
    v-bind="forwarded"
    :class="cn('text-center text-sm font-semibold tracking-wider uppercase', props.class)"
  >
    <slot />
  </DrawerTitle>
</template>
