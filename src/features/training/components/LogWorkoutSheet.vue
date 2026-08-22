<script setup lang="ts">
import { useAtomSet } from '@effect/atom-vue'
import { Effect, Result } from 'effect'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import AtomButton from '@/components/atoms/AtomButton.vue'
import AtomInput from '@/components/atoms/AtomInput.vue'
import AtomLabel from '@/components/atoms/AtomLabel.vue'
import {
  MoleculeDialog,
  MoleculeDialogContent,
  MoleculeDialogDescription,
  MoleculeDialogHeader,
  MoleculeDialogTitle,
} from '@/components/molecules/dialog'
import { useReportFailure } from '@/composables/useReportFailure'
import type { WorkoutDraft } from '@/db'
import { dbMutation, logWorkout } from '@/db'
import { useToastStore } from '@/stores/toast'
import type { DurationFormatError, DurationRangeError } from '../history'
import { parseDuration } from '../history'
import type { PaceRangeError } from '../pace'
import { formatSplit, splitFor, wattsFromSplit } from '../pace'

/**
 * Typing a workout in off the monitor — the whole product until Bluetooth
 * lands, and still the fallback afterwards for the row you did on someone
 * else's erg.
 *
 * Distance and time are the only two things asked for, because they are the
 * only two the split and the power can be *derived* from: a form that also
 * asked for the split would have two fields that can disagree, and the one
 * the user retyped would win. Rate is optional and stored as given, since
 * nothing computes it.
 */

const { planSessionId, distanceM } = defineProps<{
  /** Set when logging a session the plan asked for; absent for a free row. */
  planSessionId?: string
  /** Prefills the distance with what the session asks for. */
  distanceM?: number
}>()

const open = defineModel<boolean>('open', { default: false })

const { t } = useI18n()
const toast = useToastStore()

const distance = ref('')
const time = ref('')
const rate = ref('')
// In-flight guard: a double-tap on Save would otherwise log the row twice.
const isSaving = ref(false)

// Prefilled on open rather than on mount: the sheet is mounted for the life
// of the screen and opened repeatedly, and last time's draft is not what
// "log a row" should show.
watch(open, (isOpen) => {
  if (!isOpen) return
  distance.value = distanceM === undefined ? '' : String(distanceM)
  time.value = ''
  rate.value = ''
})

const distanceM_ = computed(() => Number(distance.value.trim()))
const durationMs = computed(() => parseDuration(time.value))

/**
 * The split and the power the two fields work out to, shown live. It is the
 * same arithmetic the plan's targets are built from, so a rower can see
 * straight away whether they hit the session — before it is written down.
 */
const resultText = computed(() =>
  Result.getOrElse(
    Result.gen(function* () {
      const duration = yield* durationMs.value
      const splitMs = yield* splitFor(distanceM_.value, duration)
      const watts = yield* wattsFromSplit(splitMs)
      const split = yield* formatSplit(splitMs)

      return t('logSheet.result', { split, watts: Math.round(watts) })
    }),
    () => '',
  ),
)

// Only complain about text that has actually been typed — an empty field is
// not yet a mistake.
const showInvalidTime = computed(
  () => time.value.trim() !== '' && !Result.isSuccess(durationMs.value),
)

const canSave = computed(() => resultText.value !== '' && !isSaving.value)

// The write edge: only accepts a program whose failures are already handled,
// and invalidates both reactivity keys once the write lands — the log, the
// plan's progress and Today all re-read from disk.
const runMutation = useAtomSet(() => dbMutation, { mode: 'promise' })

// The shared failure branch: a structured log for the developer, a toast for
// the user — see useReportFailure for why it is an Effect.
const reportFailure = useReportFailure('log workout')

/**
 * The row as the repository takes it. Built from the same `Result`s the live
 * readout is built from, so what is stored is exactly what was on screen —
 * there is no second calculation to drift.
 */
type DraftFailure = DurationFormatError | DurationRangeError | PaceRangeError

/**
 * The two fields that are only sometimes there, as keys that are only
 * sometimes there.
 *
 * Both are `Schema.optionalKey` on the row, which admits a *missing* key and
 * not a present one holding `undefined` — so writing them out unconditionally
 * rejects every free row at the decode boundary. (Found by a browser test
 * that saved nothing and said nothing, which is the failure mode the schema
 * exists to make loud.)
 */
type OptionalWorkoutFields = {
  -readonly [K in 'avgRate' | 'planSessionId']?: WorkoutDraft[K]
}

function optionalFields(): OptionalWorkoutFields {
  const fields: OptionalWorkoutFields = {}

  const avgRate = Number(rate.value.trim())
  if (Number.isFinite(avgRate) && avgRate > 0) fields.avgRate = avgRate
  if (planSessionId !== undefined) fields.planSessionId = planSessionId

  return fields
}

function draft(): Result.Result<WorkoutDraft, DraftFailure> {
  return Result.gen(function* () {
    const duration = yield* durationMs.value
    const avgSplitMs = yield* splitFor(distanceM_.value, duration)
    const avgWatts = yield* wattsFromSplit(avgSplitMs)

    return {
      source: 'manual',
      distanceM: Math.round(distanceM_.value),
      durationMs: duration,
      avgSplitMs,
      avgWatts,
      ...optionalFields(),
    } satisfies WorkoutDraft
  })
}

async function save(): Promise<void> {
  const built = draft()
  // `canSave` already ran the same arithmetic, so the second check is for the
  // compiler rather than for the user — and it is the honest way to narrow,
  // since a `getOrThrow` here would make an unreachable branch a crash.
  if (!canSave.value || !Result.isSuccess(built)) return
  isSaving.value = true

  const failed = reportFailure('save workout', t('logSheet.toast.saveFailed'))

  await runMutation(
    logWorkout(built.success).pipe(
      Effect.tap(() =>
        Effect.sync(() => {
          toast.showToast(t('logSheet.toast.saved'))
          open.value = false
        }),
      ),
      Effect.catchTags({ 'Db.DatabaseError': failed, 'Db.WorkoutInvalidError': failed }),
      // Outermost, so the guard is released on both branches — and on an
      // interrupt, which a plain success/failure handler would miss.
      Effect.ensuring(
        Effect.sync(() => {
          isSaving.value = false
        }),
      ),
    ),
  )
}
</script>

<template>
  <MoleculeDialog v-model:open="open">
    <MoleculeDialogContent>
      <MoleculeDialogHeader>
        <MoleculeDialogTitle>
          {{ planSessionId === undefined ? t('logSheet.heading') : t('logSheet.session') }}
        </MoleculeDialogTitle>
        <MoleculeDialogDescription>{{ t('logSheet.description') }}</MoleculeDialogDescription>
      </MoleculeDialogHeader>

      <form class="flex flex-col gap-4" @submit.prevent="save">
        <div class="flex flex-col gap-2">
          <AtomLabel for="log-distance">{{ t('logSheet.distance') }}</AtomLabel>
          <AtomInput
            id="log-distance"
            v-model="distance"
            inputmode="numeric"
            :placeholder="t('logSheet.distancePlaceholder')"
            autocomplete="off"
          />
        </div>

        <div class="flex flex-col gap-2">
          <AtomLabel for="log-time">{{ t('logSheet.time') }}</AtomLabel>
          <AtomInput
            id="log-time"
            v-model="time"
            :placeholder="t('logSheet.timePlaceholder')"
            :aria-describedby="showInvalidTime ? 'log-time-error' : undefined"
            :aria-invalid="showInvalidTime"
            autocomplete="off"
          />
          <p v-if="showInvalidTime" id="log-time-error" class="text-sm text-destructive">
            {{ t('logSheet.invalidTime') }}
          </p>
        </div>

        <div class="flex flex-col gap-2">
          <AtomLabel for="log-rate">
            {{ t('logSheet.rate') }}
            <span class="text-muted-foreground">({{ t('logSheet.optional') }})</span>
          </AtomLabel>
          <AtomInput
            id="log-rate"
            v-model="rate"
            inputmode="numeric"
            :placeholder="t('logSheet.ratePlaceholder')"
            autocomplete="off"
          />
        </div>

        <!-- The derived half, live. Absent rather than zeroed while the two
             fields are incomplete: a split of 0:00 is a claim, a blank is not. -->
        <p
          v-if="resultText !== ''"
          aria-live="polite"
          class="rounded-md bg-muted p-3 text-center text-sm font-medium tabular-nums"
        >
          {{ resultText }}
        </p>

        <AtomButton type="submit" :disabled="!canSave">{{ t('common.buttons.save') }}</AtomButton>
      </form>
    </MoleculeDialogContent>
  </MoleculeDialog>
</template>
