/**
 * Public surface of the persistence layer. Everything outside src/db
 * imports from here — never from schema.ts or the repositories directly.
 * That keeps the storage engine swappable and is enforced by the
 * architecture tests (src/__tests__/architecture).
 *
 * The API is Effect-based: each operation is a program with its failures in
 * the type (`Effect<A, DatabaseError | …>`). Compose those programs with
 * `Effect.*` combinators all the way into the component and handle every
 * failure with `Effect.catchTag`/`Effect.catchTags` — both execution edges
 * accept only programs whose error channel is `never`:
 *
 * - Reads that drive the UI are atoms built on `dbRuntime`
 *   (`src/features/notes/atoms.ts` is the worked example); wire them with
 *   `Atom.withReactivity([NOTES_KEY])` so writes refresh them.
 * - Writes run through the `dbMutation` fn atom, which invalidates
 *   `NOTES_KEY` after the program lands.
 * - `runDb` remains the imperative edge for programs that read and leave
 *   (backup export, test assertions) — nothing there to invalidate.
 */
export { dbMutation, dbRuntime, NOTES_KEY } from './atoms'
export { exportData, importData } from './backup'
export type { Note, NoteDraft } from './converters'
export { isNoteDraft } from './converters'
export { BackupInvalidError, DatabaseError, NoteInvalidError } from './errors'
export {
  createNote,
  deleteNote,
  listNotes,
  toggleNotePinned,
  updateNote,
} from './repositories/notes'
export { runDb } from './runtime'
export { resetDatabase } from './schema'
