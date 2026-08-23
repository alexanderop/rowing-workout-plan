<script setup lang="ts">
import type { DrawerHandleProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import { DrawerHandle, useForwardProps } from 'reka-ui'
import { cn } from '@/lib/utils'

const props = defineProps<DrawerHandleProps & { class?: HTMLAttributes['class'] }>()

const delegatedProps = reactiveOmit(props, 'class')
const forwarded = useForwardProps(delegatedProps)
</script>

<template>
  <DrawerHandle
    data-slot="numeric-input-handle"
    v-bind="forwarded"
    :class="cn('mx-auto my-2 h-1.5 w-12 shrink-0 rounded-full bg-muted-foreground/30', props.class)"
  />
</template>
