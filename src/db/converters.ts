import { Result, Schema } from 'effect'

/**
 * What a note *is*, defined once as a Schema.
 *
 * This module owns the shape; `schema.ts` owns the Dexie tables and imports
 * the types from here. Keeping the definition on this side means the pure
 * decoding rules carry no Dexie dependency — they run in the Node unit tier
 * without IndexedDB — and, more importantly, that there is exactly one
 * description of a note. Dexie's table typing, the read-path decode in the
 * repository, and backup validation all derive from it, so they cannot drift
 * apart the way a hand-written type and a hand-written schema silently do.
 */

/**
 * Epoch milliseconds — a non-negative safe integer, which is exactly what
 * `Date.now()` and `Clock.currentTimeMillis` return.
 *
 * `Schema.Number` would have been the obvious field type and is the wrong one:
 * it accepts `NaN` and `±Infinity`. A row with `updatedAt: NaN` decodes
 * cleanly and then poisons everything downstream — every comparison against
 * NaN is false, so the note sorts into an arbitrary position, and `noteAge`
 * renders it as a bucket count of NaN. Since IndexedDB is untrusted input,
 * "a timestamp is a real point in time" has to be a rule the schema enforces
 * rather than an assumption its readers make. `Schema.Natural` (safe integer,
 * ≥ 0) is that rule; no value this app has ever written fails it.
 */
const Timestamp = Schema.Natural

/**
 * Current on-disk shape of a note (schema v2). Not exported: `Note` below is
 * the name the rest of the app uses, and `StoredDbNote` is what actually
 * crosses the storage boundary.
 */
// Emptying these fields is caught, but not by a failing assertion: it makes
// `DbNote.fields.pinned` undefined, so `Schema.optionalKey` throws while
// `StoredDbNote` is still being constructed and every test file that imports
// this module fails to load. Stryker's vitest runner reads the results of the
// tests it collected, and there are none — see docs/mutation-testing.md.
// Stryker disable next-line ObjectLiteral: killed at import time, which the runner cannot observe
const DbNote = Schema.Struct({
  id: Schema.NonEmptyString,
  title: Schema.String,
  body: Schema.String,
  pinned: Schema.Boolean,
  createdAt: Timestamp,
  updatedAt: Timestamp,
})

interface DbNote extends Schema.Schema.Type<typeof DbNote> {}

/**
 * What may actually come back from disk: rows written by schema v1 lack
 * `pinned` and `updatedAt`. The Dexie upgrade in schema.ts backfills live
 * rows, but old JSON backups can re-introduce v1 rows at import time — so all
 * reads still go through `toNote`, which normalizes either shape. Relaxing
 * exactly those two fields off `DbNote.fields` is what keeps "the stored shape
 * is the current shape minus what v1 didn't have" true by construction.
 */
export const StoredDbNote = Schema.Struct({
  ...DbNote.fields,
  pinned: Schema.optionalKey(DbNote.fields.pinned),
  updatedAt: Schema.optionalKey(DbNote.fields.updatedAt),
})

export interface StoredDbNote extends Schema.Schema.Type<typeof StoredDbNote> {}

/** Domain shape the app works with — always complete. */
export type Note = DbNote

/**
 * Validates one untrusted row. IndexedDB is not a trusted store: rows survive
 * app versions, get restored with a profile, and are editable from devtools,
 * so what comes back is `unknown` no matter what the table's TypeScript type
 * claims. Decoding here is what stops a row with a numeric title from being
 * rendered as a note and then written back out into the user's next backup.
 */
export const decodeStoredNote = Schema.decodeUnknownEffect(StoredDbNote)

/**
 * Normalizes a decoded row (possibly written by an older schema version or
 * re-imported from an old backup) into a complete domain object. Pure and
 * total: never throws, never returns partial data — that keeps data written
 * by any historical version of the app readable ("The Long Now").
 */
export function toNote(stored: StoredDbNote): Note {
  return {
    id: stored.id,
    title: stored.title,
    body: stored.body,
    pinned: stored.pinned ?? false,
    updatedAt: stored.updatedAt ?? stored.createdAt,
    createdAt: stored.createdAt,
  }
}

/**
 * What a caller must supply to create a note, and the one rule the domain
 * adds: a note must have a title.
 *
 * The fields are `Schema.Trim`, so decoding *normalizes* rather than merely
 * inspects — `"  Groceries  "` becomes `"Groceries"`, and a title of nothing
 * but spaces trims to empty and fails the non-empty check. That is why the
 * rule lives here and not in the form: `title.trim().length > 0` in a
 * component is a rule only that component obeys, and `Schema.NonEmptyString`
 * alone would happily accept `"   "` as a title.
 */
// Stryker disable next-line ObjectLiteral: killed at import time via NotePatch's reuse of `.fields`, which the runner cannot observe
export const NoteDraft = Schema.Struct({
  title: Schema.Trim.check(Schema.isNonEmpty()),
  body: Schema.Trim,
})

export interface NoteDraft extends Schema.Schema.Type<typeof NoteDraft> {}

/** Normalizes and validates a draft; the repository's only way to accept one. */
export const decodeNoteDraft = Schema.decodeUnknownEffect(NoteDraft)

/**
 * What a caller may change on an existing note. The field rules are the
 * draft's own (`NoteDraft.fields`), reused rather than restated: a patched
 * title is trimmed and must stay non-empty exactly like a created one, so
 * "a note must have a title" holds on every write path — not just create.
 */
export const NotePatch = Schema.Struct({
  title: Schema.optionalKey(NoteDraft.fields.title),
  body: Schema.optionalKey(NoteDraft.fields.body),
  pinned: Schema.optionalKey(Schema.Boolean),
})

export interface NotePatch extends Schema.Schema.Type<typeof NotePatch> {}

/** Normalizes and validates a patch; the repository's only way to accept one. */
export const decodeNotePatch = Schema.decodeUnknownEffect(NotePatch)

const parseNoteDraft = Schema.decodeUnknownResult(NoteDraft)

/**
 * Would the repository accept this draft? A form uses it to disable Save on
 * exactly the condition the write enforces, instead of restating the rule.
 * Result-based rather than Effect-based because a Vue computed is pure code
 * that wants a yes or no. The repository still validates — a UI guard is a
 * convenience, not the rule.
 */
export const isNoteDraft = (input: { title: string; body: string }): boolean =>
  Result.isSuccess(parseNoteDraft(input))
