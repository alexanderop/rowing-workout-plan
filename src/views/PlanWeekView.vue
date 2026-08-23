<script setup lang="ts">
import { AsyncResult, useAtomValue } from '@effect/atom-vue'
import { Result } from 'effect'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import TemplatePageLayout from '@/components/templates/TemplatePageLayout.vue'
import { benchmarkAtom, completedSessionsAtom } from '@/features/training/atoms'
import { PLANS } from '@/features/training/catalog'
import SessionRow from '@/features/training/components/SessionRow.vue'
import WeekStrip from '@/features/training/components/WeekStrip.vue'
import { formatDuration, kilometres, weekDistanceM, weekWorkMs } from '@/features/training/session'
import { rotationFor, rotationNote } from '@/features/training/schedule'
import { targetFor } from '@/features/training/targets'
import type { SessionTarget } from '@/features/training/targets'
import type { PlanSession } from '@/features/training/types'

const { t } = useI18n()
const route = useRoute()

// The plan comes from the bundled catalogue, not from the database — an
// enrolment stores a plan id and nothing else, so a week is browsable
// whether or not you are on that plan.
const plan = computed(() => PLANS.find((candidate) => candidate.id === route.params.planId) ?? null)
const weekIndex = computed(() => Number(route.params.week))
const week = computed(
  () => plan.value?.weeks.find((candidate) => candidate.index === weekIndex.value) ?? null,
)

const benchmark = useAtomValue(() => benchmarkAtom)
const completed = useAtomValue(() => completedSessionsAtom)

const benchmark2kMs = computed(
  () => AsyncResult.getOrElse(benchmark.value, () => null)?.timeMs ?? null,
)
const completedIds = computed(() =>
  // SAFETY: the widening is from `Set<string>` to `ReadonlySet<string>`, which
  // is the atom's own success type — it only stops the empty fallback from
  // narrowing the computed to a mutable Set. Nothing is claimed about content.
  AsyncResult.getOrElse(completed.value, () => new Set<string>() as ReadonlySet<string>),
)

/**
 * The target for one session, or `null`.
 *
 * Two ways to get nothing and one answer for both: no 2k has been entered
 * yet, or this week is not one this plan has. The row lists the session
 * either way — what you are meant to row does not depend on knowing how fast.
 */
function targetOf(session: PlanSession): SessionTarget | null {
  const current = plan.value
  const benchmarkMs = benchmark2kMs.value
  if (current === null || benchmarkMs === null) return null

  return Result.getOrElse(
    Result.flatMap(rotationFor(current, weekIndex.value), (rotation) =>
      targetFor(session, benchmarkMs, rotation),
    ),
    () => null,
  )
}

const rows = computed(() =>
  (week.value?.sessions ?? []).map((session, index) => ({
    session,
    position: index + 1,
    target: targetOf(session),
    done: completedIds.value.has(session.id),
  })),
)

/**
 * The header line, with the timed work quoted beside the metres when a week
 * has any.
 *
 * A timed session prescribes no distance, so `weekDistanceM` leaves it out —
 * correctly, since "roughly 23 km" is the plan speaking. Adding a split-
 * derived estimate into that number would make the plan appear to say
 * something it does not, so the time is printed next to it instead.
 */
const summary = computed(() => {
  const current = week.value
  const workMs = current === null ? 0 : weekWorkMs(current)
  const params = {
    sessions: rows.value.length,
    km: kilometres(current === null ? 0 : weekDistanceM(current)),
    time: formatDuration(workMs),
    done: rows.value.filter((row) => row.done).length,
  }

  return workMs === 0 ? t('plans.week.summary', params) : t('plans.week.summaryWithTime', params)
})

/**
 * Where this week sits in the three-week cycle, as the sentence a rower needs
 * to hear before they wonder why the reps got longer. The plan is what knows
 * whether this is its last week, so it is the plan that is asked.
 */
const rotationText = computed(() => {
  const current = plan.value
  if (current === null) return ''

  return Result.getOrElse(
    Result.map(rotationNote(current, weekIndex.value), (note) =>
      t(`plans.rotation.${note.variant}`, { rotation: note.rotation, nextWeek: note.nextWeek }),
    ),
    () => '',
  )
})

const title = computed(() => t('plans.week.title', { week: weekIndex.value }))
</script>

<template>
  <TemplatePageLayout :title="title" :subtitle="plan?.name" back-to="/plans">
    <div class="mx-auto flex w-full max-w-lg flex-col gap-section p-4">
      <div
        v-if="week === null"
        role="alert"
        class="rounded-lg border border-dashed p-8 text-center"
      >
        <p class="text-sm text-muted-foreground">{{ t('plans.week.notFound') }}</p>
      </div>

      <template v-else-if="plan">
        <WeekStrip :plan="plan" :current-week="weekIndex" />

        <p v-if="rotationText !== ''" class="text-sm text-muted-foreground">{{ rotationText }}</p>

        <section class="flex flex-col gap-3">
          <h2 class="text-section-title font-semibold">{{ summary }}</h2>
          <ul class="flex list-none flex-col gap-2 p-0">
            <li v-for="row in rows" :key="row.session.id">
              <SessionRow
                :session="row.session"
                :position="row.position"
                :target="row.target"
                :done="row.done"
              />
            </li>
          </ul>
        </section>
      </template>
    </div>
  </TemplatePageLayout>
</template>
