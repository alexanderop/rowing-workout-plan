<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { useI18n } from 'vue-i18n'
import AtomButton from '@/components/atoms/AtomButton.vue'
import { cn } from '@/lib/utils'
import { formatNumericValue } from '@/lib/numericInput'
import { useNumericInputContext } from './numericInputContext'

const props = defineProps<{
  class?: HTMLAttributes['class']
  unit?: string
}>()

const { locale, t } = useI18n()
const input = useNumericInputContext()

function formatPreset(value: number): string {
  return formatNumericValue(value, locale.value, input.options.value)
}
</script>

<template>
  <div
    data-slot="numeric-input-presets"
    role="group"
    :aria-label="t('numericInput.presets')"
    :class="cn('grid grid-cols-3 gap-2', props.class)"
  >
    <AtomButton
      v-for="preset in input.presets.value"
      :key="preset"
      data-slot="numeric-input-preset"
      type="button"
      :variant="preset === input.value.value ? 'secondary' : 'outline'"
      :aria-pressed="preset === input.value.value"
      class="min-w-0 tabular-nums"
      @click="input.dispatch({ type: 'preset', value: preset })"
    >
      <span>{{ formatPreset(preset) }}</span>
      <span v-if="props.unit" class="text-xs text-muted-foreground">{{ props.unit }}</span>
    </AtomButton>
  </div>
</template>
