import { DateTime, Effect, Schema } from 'effect'
import {
  StoredDbBenchmark,
  StoredDbPlanEnrolment,
  StoredDbWorkout,
  toBenchmark,
  toEnrolment,
  toWorkout,
} from './converters'
import { BackupInvalidError, type DatabaseError } from './errors'
import { BenchmarksRepo } from './repositories/benchmarks'
import { EnrolmentsRepo } from './repositories/enrolments'
import { WorkoutsRepo } from './repositories/workouts'

const BACKUP_VERSION = 4 as const

/**
 * What an export contains, as a Schema — the same one an import is decoded
 * with, so a backup accepts exactly the shapes this app writes.
 *
 * The row schemas are the `Stored*` ones the repositories decode with, not the
 * domain shapes. Sharing them is what keeps "The Long Now" honest in both
 * directions: a field added to a row cannot reach disk while dropping out of
 * every export, and a backup written by an older version still imports,
 * because the same converter normalizes it on the way in.
 *
 * The version is bumped past 3 rather than reused, for the same reason 3 was
 * bumped past the notes-era 1 and 2: a v3 payload predates every one of these
 * tables and carries no rows at all, so there is nothing in it to restore.
 */
const BackupSchema = Schema.Struct({
  app: Schema.Literal('vue-pwa-starter'),
  version: Schema.Literal(BACKUP_VERSION),
  exportedAt: Schema.String,
  benchmarks: Schema.Array(StoredDbBenchmark),
  enrolments: Schema.Array(StoredDbPlanEnrolment),
  workouts: Schema.Array(StoredDbWorkout),
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
 * Reads every table and builds the payload *through* `BackupSchema` rather
 * than casting an object literal into its shape. Every row was already
 * validated on the way out of its repository, so this is trusted
 * construction — `make` is the right form, and it fails loudly if the payload
 * and the schema ever disagree (bumping `BACKUP_VERSION` past what the
 * literal accepts, say). A cast would have shipped that mismatch.
 */
export const exportData: Effect.Effect<
  BackupPayload,
  DatabaseError,
  BenchmarksRepo | EnrolmentsRepo | WorkoutsRepo
> = Effect.gen(function* () {
  const benchmarks = yield* BenchmarksRepo.use((repo) => repo.list())
  const enrolments = yield* EnrolmentsRepo.use((repo) => repo.list())
  const workouts = yield* WorkoutsRepo.use((repo) => repo.list())
  const now = yield* DateTime.now

  return BackupSchema.make({
    app: 'vue-pwa-starter',
    version: BACKUP_VERSION,
    exportedAt: DateTime.formatIso(now),
    benchmarks,
    enrolments,
    workouts,
  })
}).pipe(
  // Stryker disable next-line StringLiteral: the span name is observability, not behavior — no unit test should assert it
  Effect.withSpan('Backup.exportData'),
)

/**
 * Validates a backup payload and writes what it carries; existing rows with
 * matching ids are overwritten. Fails with BackupInvalidError for anything
 * that is not a backup file and DatabaseError if a write fails — both visible
 * in the type.
 *
 * Rows go through the same converters a read does, so a payload written by an
 * older version arrives complete rather than half-populated: this is the path
 * that can re-introduce historical shapes long after the migration that would
 * have fixed them has run.
 */
// Stryker disable next-line StringLiteral: the span name is observability, not behavior — no unit test should assert it
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- the decode boundary itself: decodeBackup is the body's first line
export const importData = Effect.fn('Backup.importData')(function* (payload: unknown) {
  const backup = yield* decodeBackup(payload)

  yield* BenchmarksRepo.use((repo) => repo.putMany(backup.benchmarks.map(toBenchmark)))
  yield* EnrolmentsRepo.use((repo) => repo.putMany(backup.enrolments.map(toEnrolment)))
  yield* WorkoutsRepo.use((repo) => repo.putMany(backup.workouts.map(toWorkout)))
})
