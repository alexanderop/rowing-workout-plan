import { DateTime, Effect, Schema } from 'effect'
import { BackupInvalidError } from './errors'

const BACKUP_VERSION = 3 as const

/**
 * What an export contains, as a Schema — the same one an import is decoded
 * with, so a backup accepts exactly the shapes this app writes.
 *
 * It carries no rows yet: the notes worked example was removed and the
 * training tables land in their own slice. The envelope is still real, and
 * exporting it still proves the round trip works, which is what keeps a
 * table added later from quietly failing to reach a backup. Sharing the
 * stored-row schemas between the repository and this file is what keeps "The
 * Long Now" honest: a field added to a row cannot reach disk while dropping
 * out of every export.
 *
 * The version is bumped past the notes-era 1 and 2 rather than reused: those
 * payloads carried a `notes` array this app no longer has anywhere to put.
 */
const BackupSchema = Schema.Struct({
  app: Schema.Literal('vue-pwa-starter'),
  version: Schema.Literal(BACKUP_VERSION),
  exportedAt: Schema.String,
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
 * Builds the payload *through* `BackupSchema` rather than casting an object
 * literal into its shape. Everything in it was already validated on the way
 * out of the database, so this is trusted construction — `make` is the right
 * form, and it fails loudly if the payload and the schema ever disagree
 * (bumping `BACKUP_VERSION` past what the literal accepts, say). A cast would
 * have shipped that mismatch.
 */
export const exportData: Effect.Effect<BackupPayload> = Effect.gen(function* () {
  const now = yield* DateTime.now
  return BackupSchema.make({
    app: 'vue-pwa-starter',
    version: BACKUP_VERSION,
    exportedAt: DateTime.formatIso(now),
  })
}).pipe(
  // Stryker disable next-line StringLiteral: the span name is observability, not behavior — no unit test should assert it
  Effect.withSpan('Backup.exportData'),
)

/**
 * Validates a backup payload and writes what it carries; existing rows with
 * matching ids are overwritten. Fails with BackupInvalidError for anything
 * that is not a backup file — visible in the type, and the only way it can
 * fail while there are no rows to write.
 */
// Stryker disable next-line StringLiteral: the span name is observability, not behavior — no unit test should assert it
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- the decode boundary itself: decodeBackup is the body's first line
export const importData = Effect.fn('Backup.importData')(function* (payload: unknown) {
  yield* decodeBackup(payload)
})
