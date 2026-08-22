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
 */

/**
 * Tags are namespaced (`Db.…`) like the service keys, so two modules can
 * never collide in one `catchTags` — the class name stays the short one the
 * code reads.
 */

/** An IndexedDB operation failed (quota exceeded, private browsing, …). */
export class DatabaseError extends Schema.TaggedError<DatabaseError>()('Db.DatabaseError', {
  operation: Schema.String,
  cause: Schema.Defect(),
}) {}

/** The payload handed to importData is not a backup this app understands. */
export class BackupInvalidError extends Schema.TaggedError<BackupInvalidError>()(
  'Db.BackupInvalidError',
  {
    message: Schema.String,
  },
) {}

/**
 * A note draft broke a domain rule — today, an empty title. The rule lives in
 * the repository rather than in the form, so it holds for every caller;
 * carrying it as its own tag lets a form say "title required" instead of
 * showing the generic "could not be saved".
 */
export class NoteInvalidError extends Schema.TaggedError<NoteInvalidError>()(
  'Db.NoteInvalidError',
  {
    message: Schema.String,
  },
) {}
