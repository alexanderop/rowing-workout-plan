<script setup lang="ts">
import type { DrawerContentEmits, DrawerContentProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import { DrawerContent, DrawerOverlay, DrawerPortal, useForwardPropsEmits } from 'reka-ui'
import { cn } from '@/lib/utils'
import { useNumericInputContext } from './numericInputContext'

const props = defineProps<
  DrawerContentProps & {
    class?: HTMLAttributes['class']
    overlayClass?: HTMLAttributes['class']
  }
>()
const emits = defineEmits<DrawerContentEmits>()

defineSlots<{
  default: () => unknown
}>()

const delegatedProps = reactiveOmit(props, 'class', 'overlayClass')
const forwarded = useForwardPropsEmits(delegatedProps, emits)
const input = useNumericInputContext()
</script>

<template>
  <DrawerPortal>
    <DrawerOverlay
      data-slot="numeric-input-overlay"
      :class="
        cn(
          'fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
          props.overlayClass,
        )
      "
    />
    <DrawerContent
      data-slot="numeric-input-content"
      v-bind="forwarded"
      :class="
        cn(
          'bg-background fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border shadow-lg outline-none safe-area-bottom [--safe-bottom-min:1rem]',
          '[transform:translateY(var(--drawer-swipe-movement-y,0px))] transition-transform duration-300 will-change-transform data-[swiping]:duration-0',
          'data-[state=open]:animate-drawer-up data-[state=closed]:animate-drawer-down',
          props.class,
        )
      "
      @keydown="input.handleKeydown"
    >
      <slot />
    </DrawerContent>
  </DrawerPortal>
</template>
