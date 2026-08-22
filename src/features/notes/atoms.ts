import { Atom } from '@effect/atom-vue'
import { Effect } from 'effect'
import { dbRuntime, listNotes, NOTES_KEY } from '@/db'
import { sortNotes } from './domain'

/**
 * The notes list as a read atom — the feature's replacement for a store. Its
 * value is an `AsyncResult<Array<Note>, DatabaseError>`: loading, failure,
 * and data are one value, so a component subscribes with
 * `useAtomValue(() => notesAtom)` and renders whichever state is true
 * instead of tracking an `isLoaded` flag beside the data.
 *
 * `Atom.withReactivity([NOTES_KEY])` is what keeps it honest: every program
 * run through `dbMutation` invalidates that key, and this atom re-reads from
 * IndexedDB — the list always mirrors what is actually persisted, with no
 * store method remembering to re-read after a write.
 *
 * The failure stays in the value on purpose (the view renders it as an
 * error state rather than a toast over a blank page); the `tapError` only
 * adds the structured log entry every reported failure carries.
 */
export const notesAtom = dbRuntime
  .atom(
    listNotes.pipe(
      Effect.map(sortNotes),
      Effect.tapError((error) =>
        Effect.logError(error).pipe(
          Effect.annotateLogs({ boundary: 'notes', operation: 'load notes', failure: error._tag }),
        ),
      ),
    ),
  )
  .pipe(Atom.withReactivity([NOTES_KEY]))
