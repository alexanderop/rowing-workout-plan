<script setup lang="ts">
import { AsyncResult, useAtomValue } from '@effect/atom-vue'
import { Result } from 'effect'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import AtomButton from '@/components/atoms/AtomButton.vue'
import TemplatePageLayout from '@/components/templates/TemplatePageLayout.vue'
import { benchmarkAtom, completedSessionsAtom } from '@/features/training/atoms'
import { PLANS } from '@/features/training/catalog'
import LogWorkoutSheet from '@/features/training/components/LogWorkoutSheet.vue'
import TargetsCard from '@/features/training/components/TargetsCard.vue'
import { formatSplit } from '@/features/training/pace'
import { rotationNote } from '@/features/training/schedule'
import {
  describeSession,
  findSession,
  formatDistance,
  formatRest,
  pieceDistanceM,
  sessionDistanceM,
} from '@/features/training/session'
import { isRotationShifted } from '@/features/training/targets'
import { targetInWeek } from '@/features/training/week'

const { t } = useI18n()
const route = useRoute()

// The session id names exactly one session in exactly one plan, so the whole
// screen is a lookup — no enrolment involved. A session belonging to a plan
// you are not on is still a session you can read.
const location = computed(() => findSession(PLANS, String(route.params.sessionId)))

const benchmark = useAtomValue(() => benchmarkAtom)
const completed = useAtomValue(() => completedSessionsAtom)

const sheetOpen = ref(false)

/** Already rowed — the log is what knows, so this cannot disagree with it. */
const isLogged = computed(() => {
  const current = location.value
  if (current === null) return false

  return AsyncResult.getOrElse(completed.value, () => new Set<string>()).has(current.session.id)
})
const benchmark2kMs = computed(
  () => AsyncResult.getOrElse(benchmark.value, () => null)?.timeMs ?? null,
)
const benchmarkText = computed(() =>
  Result.getOrElse(formatSplit(benchmark2kMs.value ?? 0), () => ''),
)

const description = computed(() => {
  const current = location.value
  return current === null ? null : describeSession(current.session)
})

const title = computed(() => {
  const current = description.value
  if (current === null) return t('plans.detail.notFound')

  return t(`plans.session.${current.style}`, {
    reps: current.reps,
    distance: current.distance,
    rest: current.rest,
  })
})

const subtitle = computed(() => {
  const current = location.value
  if (current === null) return undefined

  return t('plans.detail.position', {
    week: current.week.index,
    position: current.position,
    sessions: current.week.sessions.length,
  })
})

/** The whole point of the screen, and `null` until there is a 2k to derive it from. */
const target = computed(() => {
  const current = location.value
  if (current === null) return null

  return targetInWeek(current.session, benchmark2kMs.value, current.week.index)
})

/** One piece of this session, written out — the same distance on every row. */
const repDistance = computed(() => {
  const current = location.value
  return current === null ? '' : formatDistance(pieceDistanceM(current.session))
})

/**
 * The per-rep list. Every kind has one — a steady row is one piece and reads
 * as such — and `pacedTwoK` is the reason it exists: its three reps are not
 * three of the same effort, and one split at the top of the screen would pace
 * two of them wrong.
 */
const reps = computed(() =>
  (target.value?.reps ?? []).map((rep, index) => ({
    index: index + 1,
    distance: repDistance.value,
    split: Result.getOrElse(formatSplit(rep.splitMs), () => ''),
  })),
)

const restText = computed(() => {
  const restMs = location.value?.session.restMs
  return restMs === undefined ? '' : t('plans.detail.rest', { rest: formatRest(restMs) })
})

/**
 * The coaching note, shown only for the kinds a rotation actually re-paces.
 * Telling someone to take a tenth off their steady rows next cycle is telling
 * them to stop rowing steady.
 */
const coachText = computed(() => {
  const current = location.value
  if (current === null || !isRotationShifted(current.session.kind)) return ''

  return Result.getOrElse(
    Result.map(rotationNote(current.plan, current.week.index), (note) =>
      t(`plans.coach.${note.variant}`, { rotation: note.rotation, nextWeek: note.nextWeek }),
    ),
    () => '',
  )
})

const backTo = computed(() => {
  const current = location.value
  if (current === null) return '/plans'

  return `/plans/${current.plan.id}/weeks/${current.week.index}`
})
</script>

<template>
  <TemplatePageLayout :title="title" :subtitle="subtitle" :back-to="backTo">
    <div class="mx-auto flex w-full max-w-lg flex-col gap-section p-4">
      <div
        v-if="location === null"
        role="alert"
        class="rounded-lg border border-dashed p-8 text-center"
      >
        <p class="text-sm text-muted-foreground">{{ t('plans.detail.notFound') }}</p>
      </div>

      <template v-else>
        <p class="text-xs text-muted-foreground">{{ t(`plans.kind.${location.session.kind}`) }}</p>

        <!-- Labelled by its own heading, so the three figures are a named
             region rather than a bare definition list floating in the page. -->
        <section v-if="target" aria-labelledby="session-targets" class="flex flex-col gap-2">
          <h2 id="session-targets" class="text-sm text-muted-foreground">
            {{ t('plans.detail.targets', { time: benchmarkText }) }}
          </h2>
          <TargetsCard :session="location.session" :target="target" />
        </section>

        <p
          v-else
          class="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground"
        >
          {{ t('plans.detail.noBenchmark') }}
        </p>

        <section v-if="reps.length > 0" class="flex flex-col gap-2">
          <h2 class="text-section-title font-semibold">{{ t('plans.detail.pieces') }}</h2>
          <p v-if="restText !== ''" class="text-xs text-muted-foreground">{{ restText }}</p>
          <ol class="flex list-none flex-col gap-1 p-0">
            <li
              v-for="rep in reps"
              :key="rep.index"
              class="flex items-center gap-3 rounded-md border px-3 py-2"
            >
              <!-- The visible number is an ordinal; "Rep 3" is what makes it
                   one when the list is read out rather than looked at. It is a
                   second, hidden element rather than an `aria-label` on the
                   number: a bare <span> has no role, and a name on an element
                   that cannot be named is silently dropped — which is exactly
                   what a browser's accessibility tree showed it doing. -->
              <span class="sr-only">{{ t('plans.detail.rep', { index: rep.index }) }}</span>
              <span
                aria-hidden="true"
                class="w-6 shrink-0 text-xs text-muted-foreground tabular-nums"
              >
                {{ rep.index }}
              </span>
              <span class="min-w-0 flex-1 truncate text-sm">{{ rep.distance }}</span>
              <span class="shrink-0 text-sm font-semibold tabular-nums">{{ rep.split }}</span>
            </li>
          </ol>
        </section>

        <p v-if="coachText !== ''" class="text-sm text-muted-foreground">{{ coachText }}</p>

        <!-- The only write on this screen, and the one that moves the plan
             on: a workout carrying this session's id is what `positionFor`
             counts, so logging here is what advances Today. -->
        <div class="flex flex-col gap-2">
          <AtomButton @click="sheetOpen = true">{{ t('plans.detail.log') }}</AtomButton>
          <p v-if="isLogged" class="text-center text-xs text-muted-foreground">
            {{ t('plans.detail.logged') }}
          </p>
        </div>

        <LogWorkoutSheet
          v-model:open="sheetOpen"
          :plan-session-id="location.session.id"
          :distance-m="sessionDistanceM(location.session)"
        />
      </template>
    </div>
  </TemplatePageLayout>
</template>
