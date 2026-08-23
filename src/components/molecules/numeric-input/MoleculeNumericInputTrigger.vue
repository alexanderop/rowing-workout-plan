<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { DrawerTrigger } from 'reka-ui'
import AtomButton from '@/components/atoms/AtomButton.vue'
import { cn } from '@/lib/utils'
import { useNumericInputContext } from './numericInputContext'

const props = defineProps<{
  class?: HTMLAttributes['class']
  unit?: string
}>()

defineSlots<{
  default?: (props: { value: number; formattedValue: string }) => unknown
}>()

const input = useNumericInputContext()
</script>

<template>
  <DrawerTrigger as-child>
    <AtomButton
      data-slot="numeric-input-trigger"
      variant="outline"
      :class="cn('justify-between tabular-nums', props.class)"
    >
      <slot :value="input.slotValue.value" :formatted-value="input.formattedValue.value">
        <span>{{ input.formattedValue.value }}</span>
        <span v-if="props.unit" class="text-muted-foreground">{{ props.unit }}</span>
      </slot>
    </AtomButton>
  </DrawerTrigger>
</template>
