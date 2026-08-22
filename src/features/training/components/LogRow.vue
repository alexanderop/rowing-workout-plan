<script setup lang="ts">
import { Result } from 'effect'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Workout } from '@/db'
import { PLANS } from '../catalog'
import { formatDuration } from '../history'
import { formatSplit } from '../pace'
import { describeSession, findSession } from '../session'
import { useTrainingFormat } from '../useTrainingFormat'

const { workout } = defineProps<{ workout: Workout }>()

const { t } = useI18n()
const { metres, day } = useTrainingFormat()

/**
 * What the row is called. A planned workout borrows the plan's own sentence,
 * so a session reads the same in the log as it did on the day it was set; a
 * free row has no sentence to borrow and says so.
 *
 * `findSession` can come up empty for a real row — a workout logged against
 * a plan an older build shipped — and that is why this falls back rather than
 * asserting: a row in the log is a thing that happened, and it stays visible
 * whatever the catalogue has since become.
 */
const planned = computed(() =>
  workout.planSessionId === undefined ? null : findSession(PLANS, workout.planSessionId),
)

const description = computed(() =>
  planned.value === null ? null : describeSession(planned.value.session),
)

const detail = computed(() =>
  t('log.entry', {
    date: day.value(workout.startedAt),
    distance: metres.value(workout.distanceM),
    duration: formatDuration(workout.durationMs),
  }),
)

const splitText = computed(() => Result.getOrElse(formatSplit(workout.avgSplitMs), () => ''))

const wattsText = computed(() =>
  workout.avgWatts === undefined
    ? ''
    : t('plans.detail.watts', { watts: Math.round(workout.avgWatts) }),
)
</script>

<template>
  <article class="flex items-center gap-3 rounded-lg border bg-card p-3">
    <span class="min-w-0 flex-1">
      <span class="block truncate text-sm font-medium">
        <template v-if="description">
          {{
            t(`plans.session.${description.style}`, {
              reps: description.reps,
              distance: description.distance,
              rest: description.rest,
            })
          }}
        </template>
        <template v-else>{{ t('log.freeRow') }}</template>
      </span>
      <span class="block truncate text-xs text-muted-foreground tabular-nums">{{ detail }}</span>
    </span>

    <span class="shrink-0 text-right">
      <span class="block text-sm font-semibold tabular-nums">{{ splitText }}</span>
      <span v-if="wattsText !== ''" class="block text-xs text-muted-foreground tabular-nums">
        {{ wattsText }}
      </span>
    </span>
  </article>
</template>
