<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
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
  <article class="flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-xs">
    <div class="flex flex-col gap-0.5">
      <h3 class="font-semibold">{{ plan.name }}</h3>
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
         gives a screen reader the same information. `aria-valuetext` carries
         the sentence above so the bar is not announced as a bare percentage
         with no unit. -->
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
  </article>
</template>
