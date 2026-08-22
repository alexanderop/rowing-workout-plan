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
import { kilometres, weekDistanceM } from '@/features/training/session'
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
 * yet, or this week is outside the rotation table. The row lists the session
 * either way — what you are meant to row does not depend on knowing how fast.
 */
function targetOf(session: PlanSession): SessionTarget | null {
  const benchmarkMs = benchmark2kMs.value
  if (benchmarkMs === null) return null

  return Result.getOrElse(
    Result.flatMap(rotationFor(weekIndex.value), (rotation) =>
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

const summary = computed(() =>
  t('plans.week.summary', {
    sessions: rows.value.length,
    km: kilometres(week.value === null ? 0 : weekDistanceM(week.value)),
    done: rows.value.filter((row) => row.done).length,
  }),
)

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
