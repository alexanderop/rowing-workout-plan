<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { SessionTarget } from '../targets'
import type { PlanSession } from '../types'
import { useTargetText } from '../useTargetText'

const { session, target } = defineProps<{
  session: PlanSession
  target: SessionTarget
}>()

const { t } = useI18n()
const { targetText } = useTargetText()

// Every number on this card comes from `targetFor`; the card only decides how
// many digits of each to show. Watts are whole — a monitor never shows a
// fraction of one — and the split keeps the tenth a rower steers by.
// A band for steady, a number otherwise — the same rule every other screen
// reads targets by. The stat is wider for a band; `tabular-nums` keeps it
// from shifting the two beside it.
const splitText = computed(() => targetText.value(session, target))
const rateText = computed(() =>
  t('plans.detail.rate', { low: target.rateRange.low, high: target.rateRange.high }),
)
const wattsText = computed(() => t('plans.detail.watts', { watts: Math.round(target.watts) }))
</script>

<template>
  <dl class="grid grid-cols-3 gap-2 rounded-lg border bg-card p-4 text-center">
    <div class="flex flex-col gap-0.5">
      <dd class="text-lg font-semibold tabular-nums">{{ splitText }}</dd>
      <dt class="text-xs text-muted-foreground">{{ t('plans.detail.splitLabel') }}</dt>
    </div>
    <div class="flex flex-col gap-0.5">
      <dd class="text-lg font-semibold tabular-nums">{{ rateText }}</dd>
      <dt class="text-xs text-muted-foreground">{{ t('plans.detail.rateLabel') }}</dt>
    </div>
    <div class="flex flex-col gap-0.5">
      <dd class="text-lg font-semibold tabular-nums">{{ wattsText }}</dd>
      <dt class="text-xs text-muted-foreground">{{ t('plans.detail.powerLabel') }}</dt>
    </div>
  </dl>
</template>
