<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { useI18n } from 'vue-i18n'
import { cn } from '@/lib/utils'
import { useNumericInputContext } from './numericInputContext'

const props = defineProps<{
  class?: HTMLAttributes['class']
  unit?: string
}>()

defineSlots<{
  hint?: (props: { value: number }) => unknown
}>()

const { t } = useI18n()
const input = useNumericInputContext()
</script>

<template>
  <div
    data-slot="numeric-input-display"
    :class="cn('flex min-w-0 flex-1 items-center gap-3', props.class)"
  >
    <slot name="hint" :value="input.value.value" />
    <div
      data-slot="numeric-input-value"
      role="status"
      :aria-label="t('numericInput.currentValue')"
      aria-live="polite"
      aria-atomic="true"
      class="flex h-16 min-w-0 flex-1 items-center justify-center rounded-xl bg-secondary/50 px-4 tabular-nums"
    >
      <span class="text-3xl font-bold">{{ input.displayText.value }}</span>
      <span v-if="props.unit" class="ml-2 text-lg text-muted-foreground">{{ props.unit }}</span>
    </div>
  </div>
</template>
