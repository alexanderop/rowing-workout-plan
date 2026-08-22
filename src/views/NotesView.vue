<script setup lang="ts">
import { AsyncResult, useAtomSet, useAtomValue } from '@effect/atom-vue'
import { Effect } from 'effect'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { dbMutation, deleteNote, toggleNotePinned } from '@/db'
import { useReportFailure } from '@/composables/useReportFailure'
import NoteCard from '@/features/notes/components/NoteCard.vue'
import { notesAtom } from '@/features/notes/atoms'
import { useToastStore } from '@/stores/toast'

const { t } = useI18n()
const toast = useToastStore()

// Subscribing is the load: the atom reads IndexedDB when the first
// subscriber arrives and re-reads whenever a mutation invalidates it — no
// onMounted, no manual re-read after writes. One AsyncResult carries
// loading, failure, and data; the computeds below name the states the
// template renders. `getOrElse` keeps the previous list visible while a
// refresh is in flight, so the screen never flashes empty between writes.
const notesResult = useAtomValue(() => notesAtom)
const notes = computed(() => AsyncResult.getOrElse(notesResult.value, () => []))
const loadFailed = computed(() => AsyncResult.isFailure(notesResult.value))
const isLoaded = computed(() => AsyncResult.isNotInitial(notesResult.value))

// Storage genuinely fails in the wild (quota exceeded, Firefox private
// browsing). Each handler recovers from that inside Effect, which is what
// leaves `never` in the error channel — the only thing dbMutation accepts.
// An unhandled DatabaseError here is a type error, not a silent no-op.
//
// Every handler hands its mutation promise back to Vue: with the failures
// already caught by tag, a rejection can only be a defect, and Vue routes it
// to `app.config.errorHandler` — but only for promises it is handed. The
// handlers await rather than return, so the contract is `Promise<void>`: the
// atom's success value is nothing a caller reads.
const runMutation = useAtomSet(() => dbMutation, { mode: 'promise' })

// The shared failure branch: a structured log for the developer, a toast for
// the user — see useReportFailure for why it is an Effect.
const reportFailure = useReportFailure('notes')

async function handleTogglePinned(id: string): Promise<void> {
  await runMutation(
    toggleNotePinned(id).pipe(
      Effect.catchTag(
        'Db.DatabaseError',
        reportFailure('toggle pinned', t('notes.toast.pinFailed')),
      ),
    ),
  )
}

async function handleDelete(id: string): Promise<void> {
  await runMutation(
    deleteNote(id).pipe(
      // Only a delete that landed is confirmed — the tap runs on the success
      // branch alone, so the catch below cannot double up on it.
      Effect.tap(() => Effect.sync(() => toast.showToast(t('notes.toast.deleted')))),
      Effect.catchTag(
        'Db.DatabaseError',
        reportFailure('delete note', t('notes.toast.deleteFailed')),
      ),
    ),
  )
}
</script>

<template>
  <div class="mx-auto flex w-full max-w-lg flex-col gap-section p-4">
    <h1 class="text-page-title font-bold tracking-tight">{{ t('notes.title') }}</h1>

    <div v-if="loadFailed" role="alert" class="rounded-lg border border-dashed p-8 text-center">
      <p class="text-sm text-muted-foreground">{{ t('notes.loadError') }}</p>
    </div>

    <div
      v-else-if="isLoaded && notes.length === 0"
      class="rounded-lg border border-dashed p-8 text-center"
    >
      <h2 class="text-section-title font-semibold">{{ t('notes.empty.title') }}</h2>
      <p class="mt-2 text-sm text-muted-foreground">{{ t('notes.empty.body') }}</p>
    </div>

    <ul v-else class="flex list-none flex-col gap-3 p-0">
      <li v-for="note in notes" :key="note.id">
        <NoteCard
          :note="note"
          @toggle-pinned="handleTogglePinned(note.id)"
          @delete="handleDelete(note.id)"
        />
      </li>
    </ul>
  </div>
</template>
