import { DateTime, Effect, Schema } from 'effect'
import { StoredDbNote, toNote } from './converters'
import { BackupInvalidError, type DatabaseError } from './errors'
import { NotesRepo } from './repositories/notes'

const BACKUP_VERSION = 2 as const

// `StoredDbNote` is the same schema the repository decodes rows with, so a
// backup accepts exactly the shapes this app has ever written — current (v2)
// and legacy (v1), normalized by the converter on import. Sharing it is what
// keeps "The Long Now" honest: a field added to a note cannot reach disk
// while quietly dropping out of every export.
const BackupSchema = Schema.Struct({
  app: Schema.Literal('vue-pwa-starter'),
  version: Schema.Literals([1, BACKUP_VERSION]),
  exportedAt: Schema.String,
  notes: Schema.Array(StoredDbNote),
})

export type BackupPayload = (typeof BackupSchema)['Type']

const decodePayload = Schema.decodeUnknownEffect(BackupSchema)

/**
 * Pure validation: unknown JSON in, typed payload or BackupInvalidError out.
 * No IndexedDB involved, which is what makes the import rules testable in
 * the Node unit tier.
 */
// This *is* the boundary `no-unknown-parameters` redirects to: `payload` is a
// user-picked file's JSON and the next line runs BackupSchema over it. A named
// type here would be the unchecked claim the rule exists to prevent.
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- the decode boundary itself
export const decodeBackup = (payload: unknown): Effect.Effect<BackupPayload, BackupInvalidError> =>
  decodePayload(payload).pipe(
    Effect.mapError((error) => new BackupInvalidError({ message: error.message })),
  )

/**
 * Reads every note and builds the payload *through* `BackupSchema` rather
 * than casting an object literal into its shape. The notes were already
 * validated on the way out of the repository, so this is trusted
 * construction — `make` is the right form, and it fails loudly if the payload
 * and the schema ever disagree (bumping `BACKUP_VERSION` past what
 * `Schema.Literals` accepts, say). A cast would have shipped that mismatch.
 */
export const exportData: Effect.Effect<BackupPayload, DatabaseError, NotesRepo> = Effect.gen(
  function* () {
    const repo = yield* NotesRepo
    const notes = yield* repo.list()
    const now = yield* DateTime.now
    return BackupSchema.make({
      app: 'vue-pwa-starter',
      version: BACKUP_VERSION,
      exportedAt: DateTime.formatIso(now),
      notes,
    })
  },
).pipe(
  // Stryker disable next-line StringLiteral: the span name is observability, not behavior — no unit test should assert it
  Effect.withSpan('Backup.exportData'),
)

/**
 * Validates and imports a backup payload; existing rows with matching ids
 * are overwritten. Fails with BackupInvalidError for anything that is not a
 * backup file and DatabaseError if the write itself fails — both visible in
 * the type. Returns the number of imported notes.
 */
// Stryker disable next-line StringLiteral: the span name is observability, not behavior — no unit test should assert it
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- the decode boundary itself: decodeBackup is the body's first line
export const importData = Effect.fn('Backup.importData')(function* (payload: unknown) {
  const backup = yield* decodeBackup(payload)
  const repo = yield* NotesRepo
  const notes = backup.notes.map(toNote)
  yield* repo.putMany(notes)
  return notes.length
})
