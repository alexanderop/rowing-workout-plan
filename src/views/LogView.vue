<script setup lang="ts">
import { AsyncResult, useAtomValue } from '@effect/atom-vue'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AtomButton from '@/components/atoms/AtomButton.vue'
import TemplatePageLayout from '@/components/templates/TemplatePageLayout.vue'
import { workoutsAtom } from '@/features/training/atoms'
import LogRow from '@/features/training/components/LogRow.vue'
import LogWorkoutSheet from '@/features/training/components/LogWorkoutSheet.vue'
import type { WorkoutFilter } from '@/features/training/history'
import {
  elapsed,
  filterWorkouts,
  groupByWeek,
  monthTotals,
  WORKOUT_FILTERS,
} from '@/features/training/history'
import { kilometres } from '@/features/training/session'
import { useNow } from '@/composables/useNow'
import { useTrainingFormat } from '@/features/training/useTrainingFormat'

/**
 * Everything you have rowed, newest first.
 *
 * `now` is read once, when the screen is built, and handed to the pure
 * grouping — so "this week" is decided in one place and the arithmetic that
 * decides it is unit-testable at any date, not only on the day the suite runs.
 */

const { t } = useI18n()
const { month } = useTrainingFormat()

const workouts = useAtomValue(() => workoutsAtom)
const all = computed(() => AsyncResult.getOrElse(workouts.value, () => []))
const loadFailed = computed(() => AsyncResult.isFailure(workouts.value))

// Re-read when the app comes back to the foreground: "this week" is a
// statement about today, and a PWA resumed from the app switcher never
// navigates.
const now = useNow()

const filter = ref<WorkoutFilter>('all')
const visible = computed(() => filterWorkouts(all.value, filter.value))
const groups = computed(() => groupByWeek(visible.value, now.value))

// The totals deliberately ignore the filter: a month's distance is a month's
// distance, and a number that changes when you tap a chip is a number nobody
// can quote.
const totals = computed(() => monthTotals(all.value, now.value))
const totalTime = computed(() => {
  const { hours, minutes } = elapsed(totals.value.durationMs)
  if (hours === 0) return t('log.totalTimeShort', { minutes })

  return t('log.totalTime', { hours, minutes })
})

const sheetOpen = ref(false)
</script>

<template>
  <TemplatePageLayout :title="t('log.title')" :subtitle="month(now)" :show-back="false">
    <template #header-actions>
      <AtomButton size="sm" variant="outline" @click="sheetOpen = true">
        {{ t('log.action') }}
      </AtomButton>
    </template>

    <div class="mx-auto flex w-full max-w-lg flex-col gap-section p-4">
      <div v-if="loadFailed" role="alert" class="rounded-lg border border-dashed p-8 text-center">
        <p class="text-sm text-muted-foreground">{{ t('log.loadError') }}</p>
      </div>

      <template v-else>
        <dl class="grid grid-cols-3 gap-2 rounded-lg border bg-card p-4 text-center">
          <div class="flex flex-col gap-0.5">
            <dd class="text-lg font-semibold tabular-nums">
              {{ t('log.totalDistance', { km: kilometres(totals.distanceM) }) }}
            </dd>
            <dt class="text-xs text-muted-foreground">{{ t('log.distanceLabel') }}</dt>
          </div>
          <div class="flex flex-col gap-0.5">
            <dd class="text-lg font-semibold tabular-nums">{{ totalTime }}</dd>
            <dt class="text-xs text-muted-foreground">{{ t('log.timeLabel') }}</dt>
          </div>
          <div class="flex flex-col gap-0.5">
            <dd class="text-lg font-semibold tabular-nums">{{ totals.sessions }}</dd>
            <dt class="text-xs text-muted-foreground">{{ t('log.sessionsLabel') }}</dt>
          </div>
        </dl>

        <div
          role="group"
          :aria-label="t('log.filterLabel')"
          class="-mx-4 flex gap-2 overflow-x-auto px-4"
        >
          <AtomButton
            v-for="option in WORKOUT_FILTERS"
            :key="option"
            size="sm"
            :variant="option === filter ? 'default' : 'outline'"
            :aria-pressed="option === filter"
            class="min-w-touch-target"
            @click="filter = option"
          >
            {{ t(`log.filter.${option}`) }}
          </AtomButton>
        </div>

        <div v-if="groups.length === 0" class="rounded-lg border border-dashed p-8 text-center">
          <h2 class="text-section-title font-semibold">{{ t('log.empty.title') }}</h2>
          <p class="mt-2 text-sm text-muted-foreground">{{ t('log.empty.body') }}</p>
        </div>

        <section v-for="group in groups" :key="group.bucket" class="flex flex-col gap-2">
          <h2 class="text-xs font-semibold text-muted-foreground">
            {{ t(`log.bucket.${group.bucket}`) }}
          </h2>
          <ul class="flex list-none flex-col gap-2 p-0">
            <li v-for="workout in group.workouts" :key="workout.id">
              <LogRow :workout="workout" />
            </li>
          </ul>
        </section>
      </template>

      <LogWorkoutSheet v-model:open="sheetOpen" />
    </div>
  </TemplatePageLayout>
</template>
