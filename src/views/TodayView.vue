<script setup lang="ts">
import { AsyncResult, useAtomValue } from '@effect/atom-vue'
import { Result } from 'effect'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import AtomButton from '@/components/atoms/AtomButton.vue'
import TemplatePageLayout from '@/components/templates/TemplatePageLayout.vue'

import { activePlanAtom, benchmarkAtom, completedSessionsAtom } from '@/features/training/atoms'
import SessionRow from '@/features/training/components/SessionRow.vue'
import { nextSession, positionFor } from '@/features/training/schedule'
import { describeSession, sessionDistanceM, sessionDurationMs } from '@/features/training/session'
import { targetInWeek, weekAt, weekRows } from '@/features/training/week'
import { useNow } from '@/composables/useNow'
import { useTargetText } from '@/features/training/useTargetText'
import { useTrainingFormat } from '@/features/training/useTrainingFormat'
import { RouteNames } from '@/router'

/**
 * What to row today — the app's home, and the only screen that answers the
 * question a rower actually opens the app with.
 *
 * "Today" is the next unfinished session rather than anything date-based:
 * the plan is a sequence, not a calendar, so a week off does not put you
 * behind and a double session does not put you ahead. `positionFor` and
 * `nextSession` both derive that from the log.
 */

const { t } = useI18n()
const { metres, longDay } = useTrainingFormat()
const { targetText } = useTargetText()

/** One frozen empty set, so a screen with nothing loaded does not allocate one per render. */
const EMPTY: ReadonlySet<string> = new Set()

const plan = useAtomValue(() => activePlanAtom)
const benchmark = useAtomValue(() => benchmarkAtom)
const completed = useAtomValue(() => completedSessionsAtom)

const state = computed(() =>
  AsyncResult.all({
    plan: plan.value,
    benchmark: benchmark.value,
    completed: completed.value,
  }),
)
const data = computed(() => AsyncResult.getOrElse(state.value, () => null))

// Today is the home route, so it is the screen most likely to be the first
// thing a broken database is seen through — and the one where a blank body
// is least distinguishable from "still loading".
const loadFailed = computed(() => AsyncResult.isFailure(state.value))

/**
 * The three reads, named once each.
 *
 * Not decoration: every one of these is an optional chain, and reaching
 * through `data` at each use site is what pushed the functions below past the
 * shell's complexity budget. Naming them is what the budget is asking for.
 */
const activePlan = computed(() => data.value?.plan ?? null)
const benchmark2kMs = computed(() => data.value?.benchmark?.timeMs ?? null)
const completedIds = computed(() => data.value?.completed ?? EMPTY)

// The one clock read on the screen, and it is for display only: what to row
// comes from the log, never from the date. Refreshed on resume, so a phone
// left on this screen overnight does not still say yesterday.
const now = useNow()
const today = computed(() => longDay.value(now.value))

const position = computed(() => {
  const current = activePlan.value
  return current === null ? null : positionFor(current, completedIds.value)
})

const session = computed(() => {
  const current = activePlan.value
  return current === null ? null : nextSession(current, completedIds.value)
})

/** The week the next session sits in — the rest of it is listed underneath. */
const week = computed(() => {
  const at = position.value
  return at === null ? null : weekAt(activePlan.value?.weeks ?? [], at.weekIndex)
})

const target = computed(() => {
  const current = session.value
  const at = position.value
  const plan = activePlan.value
  if (current === null || at === null || plan === null) return null

  return targetInWeek(plan, current, benchmark2kMs.value, at.weekIndex)
})

// The same rule the week list underneath uses, so one screen cannot print two
// different targets for one session — a steady row reads as a band in both.
const splitText = computed(() =>
  session.value === null ? '' : targetText.value(session.value, target.value),
)

const description = computed(() => (session.value === null ? null : describeSession(session.value)))

/** "~27 min incl. rest" — enough to know whether there is time for it. */
const durationText = computed(() => {
  const current = session.value
  const splitMs = target.value?.splitMs
  if (current === null || splitMs === undefined) return ''

  return Result.getOrElse(
    Result.map(sessionDurationMs(current, splitMs), (durationMs) =>
      t('today.duration', { minutes: Math.round(durationMs / 60_000) }),
    ),
    () => '',
  )
})

// The same core projection the week-detail screen lists, so the card above
// and the list below cannot price one session two ways.
const rows = computed(() =>
  weekRows(week.value, {
    plan: activePlan.value,
    benchmark2kMs: benchmark2kMs.value,
    completedIds: completedIds.value,
  }),
)
</script>

<template>
  <TemplatePageLayout :title="t('today.title')" :subtitle="today" :show-back="false">
    <div class="mx-auto flex w-full max-w-lg flex-col gap-section p-4">
      <div v-if="loadFailed" role="alert" class="rounded-lg border border-dashed p-8 text-center">
        <p class="text-sm text-muted-foreground">{{ t('today.loadError') }}</p>
      </div>

      <template v-else-if="data">
        <!-- No plan, or no 2k: one door out rather than a half-rendered
             screen. The Plans tab is where both are set. -->
        <section
          v-if="activePlan === null || data.benchmark === null"
          class="flex flex-col items-center gap-3 rounded-lg border border-dashed p-8 text-center"
        >
          <h2 class="text-section-title font-semibold">{{ t('today.empty.title') }}</h2>
          <p class="text-sm text-muted-foreground">{{ t('today.empty.body') }}</p>
          <AtomButton as-child>
            <RouterLink :to="{ name: RouteNames.plans }">{{ t('today.empty.action') }}</RouterLink>
          </AtomButton>
        </section>

        <template v-else>
          <div class="flex flex-col gap-0.5">
            <p class="font-semibold">{{ activePlan?.name }}</p>
            <p v-if="position" class="text-xs text-muted-foreground">
              {{
                t('today.position', {
                  week: position.weekIndex,
                  weeks: activePlan?.weeks.length ?? 0,
                  position: position.sessionIndex,
                  sessions: week?.sessions.length ?? 0,
                })
              }}
            </p>
          </div>

          <section v-if="session && description" class="flex flex-col gap-3">
            <h2 class="text-section-title font-semibold">{{ t('today.heading') }}</h2>

            <RouterLink
              :to="{ name: RouteNames.session, params: { sessionId: session.id } }"
              :aria-label="
                t('today.open', {
                  title: t(`plans.session.${description.style}`, {
                    reps: description.reps,
                    distance: description.distance,
                    rest: description.rest,
                  }),
                })
              "
              class="flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-xs select-none touch-manipulation transition-[background-color,scale] duration-100 active:scale-[0.99]"
            >
              <span class="block text-xs text-muted-foreground">
                {{ t(`plans.kind.${session.kind}`) }}
              </span>
              <span class="block text-lg font-semibold">
                {{
                  t(`plans.session.${description.style}`, {
                    reps: description.reps,
                    distance: description.distance,
                    rest: description.rest,
                  })
                }}
              </span>

              <!-- `justify-between` on each cell, not just `gap`: a steady
                   target is a band and wraps to two lines where a split does
                   not, and without this the label under it sits a line lower
                   than the two beside it. The grid stretches the cells, so
                   pushing the labels to the bottom lines all three up. -->
              <dl class="grid grid-cols-3 gap-2 text-center">
                <div class="flex flex-col justify-between gap-0.5">
                  <dd class="font-semibold tabular-nums">{{ splitText }}</dd>
                  <dt class="text-xs text-muted-foreground">{{ t('today.targetLabel') }}</dt>
                </div>
                <div class="flex flex-col justify-between gap-0.5">
                  <dd class="font-semibold tabular-nums">
                    {{ metres(sessionDistanceM(session)) }}
                  </dd>
                  <dt class="text-xs text-muted-foreground">{{ t('today.distanceLabel') }}</dt>
                </div>
                <div class="flex flex-col justify-between gap-0.5">
                  <dd class="font-semibold tabular-nums">{{ durationText }}</dd>
                  <dt class="text-xs text-muted-foreground">{{ t('today.durationLabel') }}</dt>
                </div>
              </dl>
            </RouterLink>
          </section>

          <section v-else class="rounded-lg border border-dashed p-8 text-center">
            <h2 class="text-section-title font-semibold">{{ t('today.complete.title') }}</h2>
            <p class="mt-2 text-sm text-muted-foreground">
              {{ t('today.complete.body', { name: activePlan?.name ?? '' }) }}
            </p>
          </section>

          <section v-if="week" class="flex flex-col gap-3">
            <h2 class="text-section-title font-semibold">
              {{ t('today.week', { week: week.index }) }}
            </h2>
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
      </template>
    </div>
  </TemplatePageLayout>
</template>
