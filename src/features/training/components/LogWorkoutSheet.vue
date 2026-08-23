<script setup lang="ts">
import { Effect, Result } from 'effect'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import AtomButton from '@/components/atoms/AtomButton.vue'
import MoleculeNumberField from '@/components/molecules/MoleculeNumberField.vue'
import {
  MoleculeDialog,
  MoleculeDialogContent,
  MoleculeDialogDescription,
  MoleculeDialogHeader,
  MoleculeDialogTitle,
} from '@/components/molecules/dialog'
import { useDbWrite } from '@/composables/useDbWrite'
import { useReportFailure } from '@/composables/useReportFailure'
import type { WorkoutDraft } from '@/db'
import { logWorkout } from '@/db'
import type { NumericInputOptions } from '@/lib/numericInput'
import { useToastStore } from '@/stores/toast'
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
 *
 * All three are numbers, not text. The pad behind each field is the only way
 * in, so there is no such thing here as a malformed entry — `42:7` cannot be
 * expressed — and the two errors left are the ones a well-formed number can
 * still be: missing, or zero.
 */

const { planSessionId, distanceM } = defineProps<{
  /** Set when logging a session the plan asked for; absent for a free row. */
  planSessionId?: string
  /** Prefills the distance with what the session asks for. */
  distanceM?: number
}>()

const open = defineModel<boolean>('open', { default: false })

/** A monitor reports whole metres, so the field does too. */
const DISTANCE_OPTIONS = { max: 99_999, zerosKey: 3 } satisfies NumericInputOptions

/** 99:59, the longest a four-digit `m:ss` mask can say. */
const TIME_OPTIONS = { mask: 'duration', max: 5_999_000, zerosKey: 2 } satisfies NumericInputOptions

const RATE_OPTIONS = { max: 60 } satisfies NumericInputOptions

/** The distances a rower actually types, and rates a stroke rate actually is. */
const DISTANCE_PRESETS = [2000, 5000, 6000, 10_000] as const
const RATE_PRESETS = [18, 20, 22, 24, 26, 28, 30, 32] as const

const { t } = useI18n()
const toast = useToastStore()

const distance = ref(0)
const duration = ref(0)
const rate = ref(0)

// The write edge, with the in-flight guard: a double-tap on Save would
// otherwise log the row twice. The mutation invalidates both reactivity keys
// once it lands — the log, the plan's progress and Today all re-read.
const { isWriting, write } = useDbWrite()

// Prefilled on open rather than on mount: the sheet is mounted for the life
// of the screen and opened repeatedly, and last time's draft is not what
// "log a row" should show.
watch(open, (isOpen) => {
  if (!isOpen) return
  distance.value = distanceM ?? 0
  duration.value = 0
  rate.value = 0
})

/**
 * The split and the power the two fields work out to, shown live. It is the
 * same arithmetic the plan's targets are built from, so a rower can see
 * straight away whether they hit the session — before it is written down.
 */
const resultText = computed(() =>
  Result.getOrElse(
    Result.gen(function* () {
      const splitMs = yield* splitFor(distance.value, duration.value)
      const watts = yield* wattsFromSplit(splitMs)
      const split = yield* formatSplit(splitMs)

      return t('logSheet.result', { split, watts: Math.round(watts) })
    }),
    () => '',
  ),
)

// Say which half is missing rather than leaving Save disabled and silent —
// a button that will not press and will not say why reads as the app being
// broken. Only once the other half is there: an untouched sheet is not yet a
// mistake.
const missingDistance = computed(() =>
  distance.value === 0 && duration.value > 0 ? t('logSheet.missingDistance') : undefined,
)
const missingTime = computed(() =>
  duration.value === 0 && distance.value > 0 ? t('logSheet.missingTime') : undefined,
)

const canSave = computed(() => resultText.value !== '' && !isWriting.value)

// The shared failure branch: a structured log for the developer, a toast for
// the user — see useReportFailure for why it is an Effect.
const reportFailure = useReportFailure('log workout')

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

  if (rate.value > 0) fields.avgRate = rate.value
  if (planSessionId !== undefined) fields.planSessionId = planSessionId

  return fields
}

/**
 * The row as the repository takes it. Built from the same `Result` the live
 * readout is built from, so what is stored is exactly what was on screen —
 * there is no second calculation to drift.
 */
function draft(): Result.Result<WorkoutDraft, PaceRangeError> {
  return Result.gen(function* () {
    const avgSplitMs = yield* splitFor(distance.value, duration.value)
    const avgWatts = yield* wattsFromSplit(avgSplitMs)

    return {
      source: 'manual',
      distanceM: distance.value,
      durationMs: duration.value,
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

  const failed = reportFailure('save workout', t('logSheet.toast.saveFailed'))

  await write(
    logWorkout(built.success).pipe(
      Effect.tap(() =>
        Effect.sync(() => {
          toast.showToast(t('logSheet.toast.saved'))
          open.value = false
        }),
      ),
      Effect.catchTags({ 'Db.DatabaseError': failed, 'Db.WorkoutInvalidError': failed }),
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
        <MoleculeNumberField
          id="log-distance"
          v-model="distance"
          :label="t('logSheet.distance')"
          :title="t('logSheet.distanceTitle')"
          :description="t('logSheet.distanceHelp')"
          :placeholder="t('logSheet.distancePlaceholder')"
          :options="DISTANCE_OPTIONS"
          :presets="DISTANCE_PRESETS"
          :error="missingDistance"
          unit="m"
        />

        <MoleculeNumberField
          id="log-time"
          v-model="duration"
          :label="t('logSheet.time')"
          :title="t('logSheet.timeTitle')"
          :description="t('logSheet.timeHelp')"
          :placeholder="t('logSheet.timePlaceholder')"
          :options="TIME_OPTIONS"
          :error="missingTime"
        />

        <MoleculeNumberField
          id="log-rate"
          v-model="rate"
          :label="t('logSheet.rate')"
          :title="t('logSheet.rateTitle')"
          :description="t('logSheet.rateHelp')"
          :placeholder="t('logSheet.ratePlaceholder')"
          :options="RATE_OPTIONS"
          :presets="RATE_PRESETS"
        >
          <template #label>
            <span class="text-muted-foreground">({{ t('logSheet.optional') }})</span>
          </template>
        </MoleculeNumberField>

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
