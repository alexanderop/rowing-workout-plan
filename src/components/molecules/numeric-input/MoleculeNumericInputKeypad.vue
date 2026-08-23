<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { Delete } from '@lucide/vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import AtomButton from '@/components/atoms/AtomButton.vue'
import { cn } from '@/lib/utils'
import { useNumericInputContext } from './numericInputContext'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()

const { t } = useI18n()
const input = useNumericInputContext()
const digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const

/**
 * The cell to the left of the zero is one key wide and three fields want
 * different things in it: a decimal separator where fractions are accepted,
 * the `00`/`000` shortcut where a field is habitually typed in round numbers,
 * and nothing at all otherwise.
 */
const zerosKey = computed(() =>
  input.options.value.maximumFractionDigits > 0 ? '' : '0'.repeat(input.options.value.zerosKey),
)

function pressZeros(): void {
  for (let pressed = 0; pressed < zerosKey.value.length; pressed += 1)
    input.dispatch({ type: 'digit', digit: '0' })
}
</script>

<template>
  <div
    data-slot="numeric-input-keypad"
    role="group"
    :aria-label="t('numericInput.keypad')"
    :class="cn('grid grid-cols-3 gap-2', props.class)"
  >
    <span class="sr-only" role="status" aria-live="polite" aria-atomic="true">
      {{ input.state.value.fresh ? t('numericInput.replaceMode') : '' }}
    </span>

    <AtomButton
      v-for="digit in digits"
      :key="digit"
      data-slot="numeric-input-key"
      type="button"
      variant="secondary"
      class="h-14 text-xl font-semibold tabular-nums pointer-fine:h-12"
      :aria-label="digit"
      @click="input.dispatch({ type: 'digit', digit })"
    >
      {{ digit }}
    </AtomButton>

    <AtomButton
      v-if="input.options.value.maximumFractionDigits > 0"
      data-slot="numeric-input-key"
      type="button"
      variant="ghost"
      class="h-14 text-xl font-semibold pointer-fine:h-12"
      :aria-label="t('numericInput.decimal')"
      @click="input.dispatch({ type: 'decimal' })"
    >
      {{ input.decimalSeparator.value }}
    </AtomButton>
    <AtomButton
      v-else-if="zerosKey !== ''"
      data-slot="numeric-input-key"
      type="button"
      variant="secondary"
      class="h-14 text-xl font-semibold tabular-nums pointer-fine:h-12"
      :aria-label="zerosKey"
      @click="pressZeros"
    >
      {{ zerosKey }}
    </AtomButton>
    <div v-else aria-hidden="true" />

    <AtomButton
      data-slot="numeric-input-key"
      type="button"
      variant="secondary"
      class="h-14 text-xl font-semibold tabular-nums pointer-fine:h-12"
      aria-label="0"
      @click="input.dispatch({ type: 'digit', digit: '0' })"
    >
      0
    </AtomButton>

    <AtomButton
      data-slot="numeric-input-key"
      type="button"
      variant="ghost"
      class="h-14 pointer-fine:h-12"
      :aria-label="t('numericInput.backspace')"
      @click="input.dispatch({ type: 'backspace' })"
    >
      <Delete aria-hidden="true" />
    </AtomButton>
  </div>
</template>
