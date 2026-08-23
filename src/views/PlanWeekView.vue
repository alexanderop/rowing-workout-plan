<script setup lang="ts">
import { AsyncResult, useAtomValue } from '@effect/atom-vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import TemplatePageLayout from '@/components/templates/TemplatePageLayout.vue'
import { benchmarkAtom, completedSessionsAtom } from '@/features/training/atoms'
import { PLANS } from '@/features/training/catalog'
import SessionRow from '@/features/training/components/SessionRow.vue'
import WeekStrip from '@/features/training/components/WeekStrip.vue'
import { kilometres, weekDistanceM } from '@/features/training/session'
import { useRotationText } from '@/features/training/useRotationText'
import { weekAt, weekRows } from '@/features/training/week'

const { t } = useI18n()
const { rotationText: rotationSentence } = useRotationText()
const route = useRoute()

// The plan comes from the bundled catalogue, not from the database — an
// enrolment stores a plan id and nothing else, so a week is browsable
// whether or not you are on that plan.
const plan = computed(() => PLANS.find((candidate) => candidate.id === route.params.planId) ?? null)
const weekIndex = computed(() => Number(route.params.week))
const week = computed(() => weekAt(plan.value?.weeks ?? [], weekIndex.value))

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

// Positions, targets and the done flags are one core function, shared with
// Today: two screens listing one week cannot print two different answers for
// the same session.
const rows = computed(() =>
  weekRows(week.value, {
    benchmark2kMs: benchmark2kMs.value,
    completedIds: completedIds.value,
  }),
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
  return current === null ? '' : rotationSentence.value(current, weekIndex.value)
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
