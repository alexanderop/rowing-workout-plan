<script setup lang="ts">
import { AsyncResult, useAtomValue } from '@effect/atom-vue'
import { Effect, Result } from 'effect'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AtomButton from '@/components/atoms/AtomButton.vue'
import TemplatePageLayout from '@/components/templates/TemplatePageLayout.vue'
import { useDbWrite } from '@/composables/useDbWrite'
import { useReportFailure } from '@/composables/useReportFailure'
import { enrolInPlan } from '@/db'
import { activePlanAtom, benchmarkAtom, completedSessionsAtom } from '@/features/training/atoms'
import { PLANS } from '@/features/training/catalog'
import ActivePlanCard from '@/features/training/components/ActivePlanCard.vue'
import BenchmarkSheet from '@/features/training/components/BenchmarkSheet.vue'
import PlanCard from '@/features/training/components/PlanCard.vue'
import { formatSplit } from '@/features/training/pace'
import type { Plan } from '@/features/training/types'
import { useToastStore } from '@/stores/toast'

const { t } = useI18n()
const toast = useToastStore()

// Three subscriptions, one value. `AsyncResult.all` reports the first failure
// and stays waiting until every part has landed, so the screen has one
// loading state and one error state rather than three of each. Subscribing is
// the load; there is no onMounted fetch and no re-read after a write.
const benchmark = useAtomValue(() => benchmarkAtom)
const activePlan = useAtomValue(() => activePlanAtom)
const completed = useAtomValue(() => completedSessionsAtom)

const state = computed(() =>
  AsyncResult.all({
    benchmark: benchmark.value,
    plan: activePlan.value,
    completed: completed.value,
  }),
)

// `getOrElse` keeps the last good value on screen while a refresh is in
// flight, so enrolling does not flash the page empty on its way back.
const data = computed(() => AsyncResult.getOrElse(state.value, () => null))
const loadFailed = computed(() => AsyncResult.isFailure(state.value))

/** The 2k as a rower reads it, for the line that says what you are paced from. */
const benchmarkText = computed(() =>
  Result.getOrElse(formatSplit(data.value?.benchmark?.timeMs ?? 0), () => ''),
)

/** Everything except the plan you are already on — switching to it is a no-op. */
const browsable = computed(() => PLANS.filter((plan) => plan.id !== data.value?.plan?.id))

/**
 * The attribution line, de-duplicated: both plans in the catalogue name the
 * same source today, and printing it twice would read as two claims.
 */
const sources = computed(() => [...new Set(PLANS.map((plan) => plan.source))].join(', '))

const sheetOpen = ref(false)

// The write edge, with the in-flight guard — the whole card is the control,
// so a double tap used to enrol twice and leave a dead enrolment row behind
// the live one. Invalidates the training key once the write lands, so the
// active card and the browse list both re-read from disk.
const { write } = useDbWrite()

// The shared failure branch: a structured log for the developer, a toast for
// the user — see useReportFailure for why it is an Effect.
const reportFailure = useReportFailure('plans')

/**
 * Enrolling deactivates whatever you were on, in one transaction — see
 * `EnrolmentsRepo.create`. Nothing in the log is touched, which is why the
 * copy can promise that switching keeps your history.
 */
async function handleEnrol(plan: Plan): Promise<void> {
  const failed = reportFailure('enrol in plan', t('plans.toast.enrolFailed'))

  await write(
    enrolInPlan({ planId: plan.id }).pipe(
      Effect.tap(() =>
        Effect.sync(() => toast.showToast(t('plans.toast.enrolled', { name: plan.name }))),
      ),
      Effect.catchTags({ 'Db.DatabaseError': failed, 'Db.EnrolmentInvalidError': failed }),
    ),
  )
}
</script>

<template>
  <TemplatePageLayout :title="t('plans.title')" :subtitle="t('plans.subtitle')" :show-back="false">
    <div class="mx-auto flex w-full max-w-lg flex-col gap-section p-4">
      <div v-if="loadFailed" role="alert" class="rounded-lg border border-dashed p-8 text-center">
        <p class="text-sm text-muted-foreground">{{ t('plans.loadError') }}</p>
      </div>

      <template v-else-if="data">
        <!-- The gate. Every target on every screen is derived from the 2k, so
             a plan browsed without one would show a schedule with no paces in
             it — the screen asks first rather than shipping that. -->
        <section
          v-if="data.benchmark === null"
          class="flex flex-col items-center gap-3 rounded-lg border border-dashed p-8 text-center"
        >
          <h2 class="text-section-title font-semibold">{{ t('benchmark.empty.title') }}</h2>
          <p class="text-sm text-muted-foreground">{{ t('benchmark.empty.body') }}</p>
          <AtomButton @click="sheetOpen = true">{{ t('benchmark.empty.action') }}</AtomButton>
        </section>

        <template v-else>
          <section class="flex flex-col gap-3">
            <h2 class="text-section-title font-semibold">{{ t('plans.active.heading') }}</h2>
            <ActivePlanCard v-if="data.plan" :plan="data.plan" :completed="data.completed" />
            <div v-else class="rounded-lg border border-dashed p-6 text-center">
              <p class="font-medium">{{ t('plans.none.title') }}</p>
              <p class="mt-1 text-sm text-muted-foreground">{{ t('plans.none.body') }}</p>
            </div>
          </section>

          <section class="flex flex-col gap-3">
            <h2 class="text-section-title font-semibold">{{ t('plans.browse.heading') }}</h2>
            <ul class="flex list-none flex-col gap-3 p-0">
              <li v-for="plan in browsable" :key="plan.id">
                <PlanCard :plan="plan" @enrol="handleEnrol(plan)" />
              </li>
            </ul>
          </section>

          <div class="flex items-center justify-between gap-2 rounded-lg border p-4">
            <p class="min-w-0 text-sm text-muted-foreground">
              {{ t('benchmark.current', { time: benchmarkText }) }}
            </p>
            <AtomButton variant="outline" size="sm" @click="sheetOpen = true">
              {{ t('benchmark.change') }}
            </AtomButton>
          </div>

          <p class="text-xs text-muted-foreground">{{ t('plans.source', { sources }) }}</p>
        </template>
      </template>

      <BenchmarkSheet v-model:open="sheetOpen" />
    </div>
  </TemplatePageLayout>
</template>
