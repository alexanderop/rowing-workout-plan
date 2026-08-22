<script setup lang="ts">
import type { LabelProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import { Label } from 'reka-ui'
import { cn } from '@/lib/utils'

const props = defineProps<LabelProps & { class?: HTMLAttributes['class'] }>()

defineSlots<{
  default: () => unknown
}>()

const delegatedProps = reactiveOmit(props, 'class')
</script>

<template>
  <Label
    data-slot="label"
    v-bind="delegatedProps"
    :class="
      cn(
        'text-sm leading-none font-medium select-none peer-disabled:cursor-not-allowed peer-disabled:opacity-50',
        props.class,
      )
    "
  >
    <slot />
  </Label>
</template>
