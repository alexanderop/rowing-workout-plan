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
import { formatSplit } from '@/features/training/pace'
import { nextSession, positionFor, rotationFor } from '@/features/training/schedule'
import { describeSession, sessionDistanceM, sessionDurationMs } from '@/features/training/session'
import { targetFor } from '@/features/training/targets'
import type { SessionTarget } from '@/features/training/targets'
import type { PlanSession } from '@/features/training/types'
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
// comes from the log, never from the date.
const today = computed(() => longDay.value(Date.now()))

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
  const current = activePlan.value
  if (at === null || current === null) return null

  return current.weeks.find((candidate) => candidate.index === at.weekIndex) ?? null
})

function targetOf(planSession: PlanSession): SessionTarget | null {
  const benchmarkMs = benchmark2kMs.value
  const at = position.value
  if (benchmarkMs === null || at === null) return null

  return Result.getOrElse(
    Result.flatMap(rotationFor(at.weekIndex), (rotation) =>
      targetFor(planSession, benchmarkMs, rotation),
    ),
    () => null,
  )
}

const target = computed(() => (session.value === null ? null : targetOf(session.value)))

const splitText = computed(() =>
  Result.getOrElse(formatSplit(target.value?.splitMs ?? 0), () => ''),
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

const rows = computed(() =>
  (week.value?.sessions ?? []).map((planSession, index) => ({
    session: planSession,
    position: index + 1,
    target: targetOf(planSession),
    done: completedIds.value.has(planSession.id),
  })),
)
</script>

<template>
  <TemplatePageLayout :title="t('today.title')" :subtitle="today" :show-back="false">
    <div class="mx-auto flex w-full max-w-lg flex-col gap-section p-4">
      <template v-if="data">
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

              <dl class="grid grid-cols-3 gap-2 text-center">
                <div class="flex flex-col gap-0.5">
                  <dd class="font-semibold tabular-nums">{{ splitText }}</dd>
                  <dt class="text-xs text-muted-foreground">{{ t('today.targetLabel') }}</dt>
                </div>
                <div class="flex flex-col gap-0.5">
                  <dd class="font-semibold tabular-nums">
                    {{ metres(sessionDistanceM(session)) }}
                  </dd>
                  <dt class="text-xs text-muted-foreground">{{ t('today.distanceLabel') }}</dt>
                </div>
                <div class="flex flex-col gap-0.5">
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
