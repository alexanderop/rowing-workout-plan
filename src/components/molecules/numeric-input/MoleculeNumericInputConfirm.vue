<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { Check } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import AtomButton from '@/components/atoms/AtomButton.vue'
import { cn } from '@/lib/utils'
import { useNumericInputContext } from './numericInputContext'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()

defineSlots<{
  default?: () => unknown
}>()

const { t } = useI18n()
const input = useNumericInputContext()
</script>

<template>
  <AtomButton
    data-slot="numeric-input-confirm"
    type="button"
    size="icon"
    :aria-label="t('common.buttons.confirm')"
    :class="cn('size-14 shrink-0 rounded-full pointer-fine:size-12', props.class)"
    @click="input.confirm"
  >
    <slot><Check class="size-6" aria-hidden="true" /></slot>
  </AtomButton>
</template>
