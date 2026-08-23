<script setup lang="ts">
import { AsyncResult, useAtomSet, useAtomValue } from '@effect/atom-vue'
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
import { useReportFailure } from '@/composables/useReportFailure'
import { dbMutation, recordBenchmark } from '@/db'
import type { NumericInputOptions } from '@/lib/numericInput'
import { useToastStore } from '@/stores/toast'
import { benchmarkAtom } from '../atoms'
import { formatSplit } from '../pace'
import { benchmarkPace } from '../targets'

/**
 * Where the whole app's pacing comes from: one 2,000 m time.
 *
 * A 2k time and a 500 m split are written the same way — `7:04.2`, `1:46.0` —
 * so the `split` mask is the codec for both. It is named for the split
 * because that is what it mostly carries, not because a time is a different
 * notation.
 */

const open = defineModel<boolean>('open', { default: false })

const { t } = useI18n()
const toast = useToastStore()

// The sheet reads the benchmark itself rather than being handed one: it is
// opened from two places, and a prop would make both of them responsible for
// keeping the prefill current.
const benchmarkResult = useAtomValue(() => benchmarkAtom)
const current = computed(() => AsyncResult.getOrElse(benchmarkResult.value, () => null))

/** 99:59.9 — the longest a five-digit `m:ss.t` mask can say. */
const TIME_OPTIONS = { mask: 'split', max: 5_999_900 } satisfies NumericInputOptions

const timeMs = ref(0)
// In-flight guard: a double-tap on Save would otherwise record two benchmarks
// before the first write resolves.
const isSaving = ref(false)

// Prefilled on open rather than on mount, because the sheet outlives its
// contents — it is mounted for the life of the screen and opened repeatedly,
// and a stale draft from last time is not what "change your 2k" should show.
watch(open, (isOpen) => {
  if (isOpen) timeMs.value = current.value?.timeMs ?? 0
})

/**
 * The 500 m split the entered time works out to, echoed back live. It is the
 * number every session target is built from, so seeing it before saving is
 * what catches a 2k typed as a split — `1:46.0` parses perfectly and is a
 * world record 2k.
 */
const paceText = computed(() =>
  benchmarkPace(timeMs.value).pipe(
    Result.flatMap(formatSplit),
    Result.getOrElse(() => ''),
  ),
)

// The field says what the time means rather than what is wrong with it: the
// pad cannot produce `9:9`, so the only rejectable entry left is an empty
// one, and Save being disabled is the honest answer to that.
const paceHint = computed(() =>
  paceText.value === '' ? undefined : t('benchmark.pace', { split: paceText.value }),
)
const canSave = computed(() => timeMs.value > 0 && !isSaving.value)

// The write edge: only accepts a program whose failures are already handled,
// and invalidates the training key once the write lands — every target on
// every screen re-derives itself, with no store re-read.
const runMutation = useAtomSet(() => dbMutation, { mode: 'promise' })

// The shared failure branch: a structured log for the developer, a toast for
// the user — see useReportFailure for why it is an Effect.
const reportFailure = useReportFailure('benchmark')

/**
 * The guard is set synchronously, before the first await, so two submits in
 * the same tick cannot both reach the repository. The mutation promise is
 * awaited (and so returned to Vue): with both failures caught by tag, a
 * rejection can only be a defect, which Vue routes to
 * `app.config.errorHandler`.
 */
async function save(): Promise<void> {
  if (!canSave.value) return
  isSaving.value = true

  await runMutation(
    recordBenchmark({ kind: '2k', timeMs: timeMs.value }).pipe(
      Effect.tap(() =>
        Effect.sync(() => {
          toast.showToast(t('benchmark.toast.saved'))
          open.value = false
        }),
      ),
      // Two ways to fail, two messages. A rejected draft should not get here
      // at all — `canSave` refuses a zero — but the repository owns the rule
      // and the compiler makes this side answer for it either way.
      Effect.catchTags({
        'Db.DatabaseError': reportFailure('save benchmark', t('benchmark.toast.saveFailed')),
        'Db.BenchmarkInvalidError': reportFailure('save benchmark', t('benchmark.invalid')),
      }),
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
        <MoleculeDialogTitle>{{ t('benchmark.heading') }}</MoleculeDialogTitle>
        <MoleculeDialogDescription>{{ t('benchmark.description') }}</MoleculeDialogDescription>
      </MoleculeDialogHeader>

      <form class="flex flex-col gap-4" @submit.prevent="save">
        <MoleculeNumberField
          id="benchmark-time"
          v-model="timeMs"
          :label="t('benchmark.label')"
          :title="t('benchmark.label')"
          :description="t('benchmark.help')"
          :placeholder="t('benchmark.placeholder')"
          :options="TIME_OPTIONS"
          :hint="paceHint"
        />

        <AtomButton type="submit" :disabled="!canSave">{{ t('common.buttons.save') }}</AtomButton>
      </form>
    </MoleculeDialogContent>
  </MoleculeDialog>
</template>
