<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
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
    data-slot="numeric-input-cancel"
    variant="ghost"
    :class="cn('justify-self-start text-muted-foreground', props.class)"
    @click="input.cancel"
  >
    <slot>{{ t('common.buttons.cancel') }}</slot>
  </AtomButton>
</template>
