<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { RouteNames } from '@/router'
import { positionFor } from '../schedule'
import type { Plan } from '../types'

const { plan, completed } = defineProps<{
  plan: Plan
  completed: ReadonlySet<string>
}>()

const { t } = useI18n()

// Completion is derived, never stored: the ids come from the workouts that
// carry a `planSessionId`, so this card cannot disagree with the log.
const position = computed(() => positionFor(plan, completed))

// Guarded against a plan with no sessions, which would otherwise divide by
// zero and hand the bar a `NaN` width — silently, as `width: NaN%` is simply
// ignored and the bar renders full.
const percent = computed(() =>
  position.value.total === 0 ? 0 : (position.value.done / position.value.total) * 100,
)
</script>

<template>
  <!-- The card is the way into the plan, so the card is the link — a "view
       week" button in the corner would be a 44px target inside a 90px one
       that does nothing. The plan name is a <p> rather than a heading for the
       same reason it is on the browse card: a heading inside a link outlines
       a document section that does not exist, and the link's own label is
       what a screen reader reads out. -->
  <RouterLink
    :to="{
      name: RouteNames.planWeek,
      params: { planId: plan.id, week: position.weekIndex },
    }"
    :aria-label="t('plans.active.open', { week: position.weekIndex, name: plan.name })"
    class="flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-xs select-none touch-manipulation transition-[background-color,scale] duration-100 active:scale-[0.99]"
  >
    <div class="flex flex-col gap-0.5">
      <p class="font-semibold">{{ plan.name }}</p>
      <p class="text-xs text-muted-foreground">
        {{
          t('plans.active.progress', {
            week: position.weekIndex,
            weeks: plan.weeks.length,
            done: position.done,
            total: position.total,
          })
        }}
      </p>
    </div>

    <!-- A native <progress> would be the obvious element and is the one thing
         here that cannot be styled consistently across engines; the ARIA role
         gives a screen reader the same information, counted in sessions
         rather than in percent so "23 of 71" is what gets announced. -->
    <div
      role="progressbar"
      :aria-label="t('plans.active.progressLabel')"
      :aria-valuemin="0"
      :aria-valuemax="position.total"
      :aria-valuenow="position.done"
      class="h-1.5 overflow-hidden rounded-full bg-muted"
    >
      <div class="h-full rounded-full bg-primary" :style="{ width: `${percent}%` }"></div>
    </div>
  </RouterLink>
</template>
