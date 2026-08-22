import { Schema } from 'effect'

/**
 * Failures of the persistence layer, as data. Every db program carries these
 * in its Effect error channel, so the compiler knows exactly what can go
 * wrong where.
 *
 * They never reach the Promise edge: `runDb` accepts only programs whose
 * error channel is already `never`, so each one has to be handled inside
 * Effect with `Effect.catchTag`/`Effect.catchTags` first. That is the whole
 * point of the boundary — no rethrowing, no `instanceof` on the Vue side.
 *
 * Tags are namespaced (`Db.…`) like the service keys, so two modules can
 * never collide in one `catchTags` — the class name stays the short one the
 * code reads.
 */

/** An IndexedDB operation failed (quota exceeded, private browsing, …). */
export class DatabaseError extends Schema.TaggedError<DatabaseError>()('Db.DatabaseError', {
  operation: Schema.String,
  cause: Schema.Defect(),
}) {}

/**
 * A draft broke a rule the row schema enforces — a benchmark with no time, a
 * workout with a zero distance.
 *
 * One tag per table rather than one shared `RowInvalidError`, because the
 * whole point of a tag is that a `catchTags` can branch on it: the benchmark
 * form wants to say "that is not a time", and it cannot if the failure it
 * catches might have come from a workout write it never made.
 */
export class BenchmarkInvalidError extends Schema.TaggedError<BenchmarkInvalidError>()(
  'Db.BenchmarkInvalidError',
  {
    message: Schema.String,
  },
) {}

export class EnrolmentInvalidError extends Schema.TaggedError<EnrolmentInvalidError>()(
  'Db.EnrolmentInvalidError',
  {
    message: Schema.String,
  },
) {}

export class WorkoutInvalidError extends Schema.TaggedError<WorkoutInvalidError>()(
  'Db.WorkoutInvalidError',
  {
    message: Schema.String,
  },
) {}

/** The payload handed to importData is not a backup this app understands. */
export class BackupInvalidError extends Schema.TaggedError<BackupInvalidError>()(
  'Db.BackupInvalidError',
  {
    message: Schema.String,
  },
) {}
