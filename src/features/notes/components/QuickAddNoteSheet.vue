<script setup lang="ts">
import { useAtomSet } from '@effect/atom-vue'
import { Effect } from 'effect'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AtomButton from '@/components/atoms/AtomButton.vue'
import {
  MoleculeDialog,
  MoleculeDialogContent,
  MoleculeDialogDescription,
  MoleculeDialogHeader,
  MoleculeDialogTitle,
} from '@/components/molecules/dialog'
import AtomInput from '@/components/atoms/AtomInput.vue'
import AtomLabel from '@/components/atoms/AtomLabel.vue'
import AtomTextarea from '@/components/atoms/AtomTextarea.vue'
import { useReportFailure } from '@/composables/useReportFailure'
import type { NoteDraft } from '@/db'
import { createNote, dbMutation, isNoteDraft } from '@/db'
import { useToastStore } from '@/stores/toast'

const open = defineModel<boolean>('open', { default: false })

const { t } = useI18n()
const toast = useToastStore()

// The write edge: only accepts a program whose failures are already handled,
// and invalidates the notes read atoms once the write lands — the list
// refreshes itself, no store re-read.
const runMutation = useAtomSet(() => dbMutation, { mode: 'promise' })

const title = ref('')
const body = ref('')
// In-flight guard: a double-tap on Save would otherwise run save() twice and
// create two identical notes before the first write resolves.
const isSaving = ref(false)

/**
 * What the form will submit — one value, so the guard and the write agree.
 * Deliberately not trimmed here: the draft schema trims, so a title typed
 * with a trailing space is normalized by the repository rather than by every
 * caller remembering to.
 */
const draft = computed<NoteDraft>(() => ({ title: title.value, body: body.value }))

// The button is disabled on exactly the rule the repository enforces, run
// through the same schema rather than restated as `trim().length > 0`. The
// repository still validates: this only saves the user a round-trip.
const canSave = computed(() => isNoteDraft(draft.value) && !isSaving.value)

// The shared failure branch: a structured log for the developer, a toast for
// the user — see useReportFailure for why it is an Effect.
const reportFailure = useReportFailure('notes')

// The draft deliberately survives a dismissal — an accidental tap on the
// overlay must not destroy what the user typed. It is cleared only after a
// write actually lands, which is why clearing sits on the success branch of
// the program rather than after it.
//
// The guard is still set synchronously, before the first await, so two
// submits in the same tick cannot both reach the repository. The mutation
// promise is awaited (and so returned to Vue): with both failures caught by
// tag, a rejection can only be a defect, which Vue routes to
// `app.config.errorHandler` — but only for promises it is handed.
async function save(): Promise<void> {
  if (!canSave.value) return
  isSaving.value = true

  await runMutation(
    createNote(draft.value).pipe(
      Effect.tap(() =>
        Effect.sync(() => {
          title.value = ''
          body.value = ''
          // The sheet closes itself, so confirm the save through a toast.
          toast.showToast(t('notes.toast.created'))
          open.value = false
        }),
      ),
      // Two ways to fail, two messages. Storage genuinely fails in the wild
      // (quota exceeded, private browsing); a rejected draft should not get
      // here at all, since `canSave` runs the same rule, but the repository
      // owns that rule and the compiler makes this side answer for it. Either
      // way the sheet and the draft stay open, and nothing fails silently.
      Effect.catchTags({
        'Db.DatabaseError': reportFailure('save note', t('notes.toast.saveFailed')),
        'Db.NoteInvalidError': reportFailure('save note', t('notes.toast.titleRequired')),
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
        <MoleculeDialogTitle>{{ t('notes.form.heading') }}</MoleculeDialogTitle>
        <MoleculeDialogDescription>{{ t('notes.form.description') }}</MoleculeDialogDescription>
      </MoleculeDialogHeader>
      <form class="flex flex-col gap-4" @submit.prevent="save">
        <div class="flex flex-col gap-2">
          <AtomLabel for="note-title">{{ t('notes.form.titleLabel') }}</AtomLabel>
          <AtomInput
            id="note-title"
            v-model="title"
            :placeholder="t('notes.form.titlePlaceholder')"
          />
        </div>
        <div class="flex flex-col gap-2">
          <AtomLabel for="note-body">{{ t('notes.form.bodyLabel') }}</AtomLabel>
          <AtomTextarea
            id="note-body"
            v-model="body"
            :placeholder="t('notes.form.bodyPlaceholder')"
          />
        </div>
        <AtomButton type="submit" :disabled="!canSave">{{ t('common.buttons.save') }}</AtomButton>
      </form>
    </MoleculeDialogContent>
  </MoleculeDialog>
</template>
