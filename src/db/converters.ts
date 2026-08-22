import { Schema } from 'effect'

/**
 * What a stored row *is*, defined once as a Schema.
 *
 * This module owns the shapes; `schema.ts` owns the Dexie tables and imports
 * the types from here. Keeping the definitions on this side means the pure
 * decoding rules carry no Dexie dependency — they run in the Node unit tier
 * without IndexedDB — and, more importantly, that there is exactly one
 * description of each row. Dexie's table typing, the read-path decode in the
 * repositories, and backup validation all derive from it, so they cannot
 * drift apart the way a hand-written type and a hand-written schema silently
 * do.
 *
 * Three tables land together because they are one feature: a benchmark paces
 * a plan, an enrolment says which plan, and the workouts are what you did.
 * See docs/local-first.md and docs/adding-a-feature.md step 1.
 */

/**
 * Epoch milliseconds — a non-negative safe integer, which is exactly what
 * `Date.now()` and `Clock.currentTimeMillis` return.
 *
 * `Schema.Number` would have been the obvious field type and is the wrong
 * one: it accepts `NaN` and `±Infinity`. A row with `startedAt: NaN` decodes
 * cleanly and then poisons everything downstream — every comparison against
 * NaN is false, so the workout sorts into an arbitrary position and the log
 * renders a date of "Invalid Date". Since IndexedDB is untrusted input, "a
 * timestamp is a real point in time" has to be a rule the schema enforces
 * rather than an assumption its readers make.
 */
const Timestamp = Schema.Natural

/**
 * A whole number of metres or milliseconds, above zero.
 *
 * Above zero rather than merely non-negative because every one of these feeds
 * the pace arithmetic, which divides by all of them: a zero distance is an
 * `Infinity` split and a zero duration is a division by nothing. `pace.ts`
 * guards its own inputs too — this is the same rule enforced a layer earlier,
 * so a row that could only produce nonsense never reaches disk.
 */
const PositiveWhole = Schema.Natural.check(Schema.isGreaterThan(0))

/**
 * A measured rate: a split, a wattage, a stroke rate. Finite and positive,
 * but not integral — a split of 112_400.5 ms is a real average, and rounding
 * it at the storage boundary would lose precision the log never gets back.
 */
const PositiveMeasure = Schema.Finite.check(Schema.isGreaterThan(0))

// --- benchmarks -----------------------------------------------------------

/**
 * A timed test piece. The 2k is the one the whole trainer is paced from
 * (`features/training/targets.ts`); the 5k and 6k are there because the plan
 * ends on a 5k test and a rower's 6k is the other number they know.
 */
// Emptying these fields is caught, but not by a failing assertion: it makes
// the `Stored*` construction below read an undefined field, so the module
// throws while still being imported and every spec that imports it fails to
// load. Stryker's vitest runner reads the results of the tests it collected,
// and there are none — see docs/mutation-testing.md.
// Stryker disable next-line ObjectLiteral: killed at import time, which the runner cannot observe
const DbBenchmark = Schema.Struct({
  id: Schema.NonEmptyString,
  kind: Schema.Literals(['2k', '5k', '6k']),
  timeMs: PositiveWhole,
  recordedAt: Timestamp,
})

interface DbBenchmark extends Schema.Schema.Type<typeof DbBenchmark> {}

/**
 * What may come back from disk.
 *
 * Nothing is relaxed, and that is a decision rather than an oversight: all
 * four fields are the row's identity, and there is no honest default for any
 * of them. A benchmark with no time is not an old benchmark, it is a damaged
 * one. When a field *is* added later, it gets `Schema.optionalKey` here and a
 * backfill in `toBenchmark`, the way `StoredDbWorkout` already does.
 */
export const StoredDbBenchmark = Schema.Struct({ ...DbBenchmark.fields })

export interface StoredDbBenchmark extends Schema.Schema.Type<typeof StoredDbBenchmark> {}

/** Domain shape the app works with — always complete. */
export type Benchmark = DbBenchmark

/** What a caller supplies to record one; the id and the clock are the repo's. */
export const BenchmarkDraft = Schema.Struct({
  kind: DbBenchmark.fields.kind,
  timeMs: DbBenchmark.fields.timeMs,
})

export interface BenchmarkDraft extends Schema.Schema.Type<typeof BenchmarkDraft> {}

// --- plan enrolments ------------------------------------------------------

/**
 * Which plan a rower is following, and since when.
 *
 * **Deliberately does not store completions.** They derive from workouts
 * carrying a `planSessionId`, so there is one source of truth: a workout is
 * either logged against a session or it is not, and no second table can
 * disagree with it. The alternative — a `completedSessionIds` array here —
 * needs reconciling every time a workout is deleted, and the reconciliation
 * is the bug.
 */
// Stryker disable next-line ObjectLiteral: killed at import time, which the runner cannot observe
const DbPlanEnrolment = Schema.Struct({
  id: Schema.NonEmptyString,
  planId: Schema.NonEmptyString,
  startedAt: Timestamp,
  active: Schema.Boolean,
})

interface DbPlanEnrolment extends Schema.Schema.Type<typeof DbPlanEnrolment> {}

/**
 * `active` is relaxed because it is the one field with an honest default: a
 * row written before the app could hold more than one enrolment is the
 * enrolment, so it is the active one.
 */
export const StoredDbPlanEnrolment = Schema.Struct({
  ...DbPlanEnrolment.fields,
  active: Schema.optionalKey(DbPlanEnrolment.fields.active),
})

export interface StoredDbPlanEnrolment extends Schema.Schema.Type<typeof StoredDbPlanEnrolment> {}

export type PlanEnrolment = DbPlanEnrolment

/** What a caller supplies to enrol. */
export const PlanEnrolmentDraft = Schema.Struct({
  planId: DbPlanEnrolment.fields.planId,
})

export interface PlanEnrolmentDraft extends Schema.Schema.Type<typeof PlanEnrolmentDraft> {}

// --- workouts -------------------------------------------------------------

/**
 * One rep or piece within a workout, as the monitor reported it.
 *
 * Nested in the workout rather than given a table of its own: an interval has
 * no life outside its piece, is never queried across workouts, and a row per
 * rep would make every read a join IndexedDB has no good way to do.
 */
// Stryker disable next-line ObjectLiteral: killed at import time, which the runner cannot observe
const DbWorkoutInterval = Schema.Struct({
  /** Position in the piece, from zero — the same order the monitor sent them. */
  index: Schema.Natural,
  distanceM: PositiveWhole,
  durationMs: PositiveWhole,
  splitMs: PositiveMeasure,
  watts: Schema.optionalKey(PositiveMeasure),
  rate: Schema.optionalKey(PositiveMeasure),
  /** Rest *after* this interval. Zero is legitimate; the last rep has none. */
  restMs: Schema.optionalKey(Schema.Natural),
})

export interface WorkoutInterval extends Schema.Schema.Type<typeof DbWorkoutInterval> {}

/**
 * A completed piece of work.
 *
 * `planSessionId` is what makes a workout count towards a plan, and its
 * absence is what makes one a free row — so it is optional in the *domain*
 * shape too, not just on disk. `schedule.positionFor` reads exactly this
 * field, across every workout, to say where a rower is.
 */
// Stryker disable next-line ObjectLiteral: killed at import time, which the runner cannot observe
const DbWorkout = Schema.Struct({
  id: Schema.NonEmptyString,
  startedAt: Timestamp,
  source: Schema.Literals(['erg', 'manual']),
  planSessionId: Schema.optionalKey(Schema.NonEmptyString),
  distanceM: PositiveWhole,
  durationMs: PositiveWhole,
  avgSplitMs: PositiveMeasure,
  avgWatts: Schema.optionalKey(PositiveMeasure),
  avgRate: Schema.optionalKey(PositiveMeasure),
  intervals: Schema.Array(DbWorkoutInterval),
})

interface DbWorkout extends Schema.Schema.Type<typeof DbWorkout> {}

/**
 * Two fields are relaxed, both with an honest backfill:
 *
 * - `intervals` — a row written before the app captured per-rep data, or a
 *   hand-typed one, has none. An empty list is what "no intervals recorded"
 *   means, and it is what every reader already handles.
 * - `source` — a row that does not say where it came from was not captured
 *   off an erg, because erg capture is the thing that would have said so.
 */
export const StoredDbWorkout = Schema.Struct({
  ...DbWorkout.fields,
  source: Schema.optionalKey(DbWorkout.fields.source),
  intervals: Schema.optionalKey(DbWorkout.fields.intervals),
})

export interface StoredDbWorkout extends Schema.Schema.Type<typeof StoredDbWorkout> {}

export type Workout = DbWorkout

/**
 * What a caller supplies to log one. `startedAt` is optional and defaults to
 * the clock: an erg capture knows when the piece *began*, which is not when
 * the row is written, and stamping it at write time would misdate every
 * workout by its own length.
 */
export const WorkoutDraft = Schema.Struct({
  startedAt: Schema.optionalKey(DbWorkout.fields.startedAt),
  source: DbWorkout.fields.source,
  planSessionId: DbWorkout.fields.planSessionId,
  distanceM: DbWorkout.fields.distanceM,
  durationMs: DbWorkout.fields.durationMs,
  avgSplitMs: DbWorkout.fields.avgSplitMs,
  avgWatts: DbWorkout.fields.avgWatts,
  avgRate: DbWorkout.fields.avgRate,
  intervals: Schema.optionalKey(DbWorkout.fields.intervals),
})

export interface WorkoutDraft extends Schema.Schema.Type<typeof WorkoutDraft> {}

// --- decoding -------------------------------------------------------------

/**
 * Validates one untrusted row. IndexedDB is not a trusted store: rows survive
 * app versions, get restored with a profile, and are editable from devtools,
 * so what comes back is `unknown` no matter what the table's TypeScript type
 * claims. Decoding here is what stops a workout with a distance of `"far"`
 * being rendered in the log and then written back into the user's next backup.
 */
export const decodeStoredBenchmark = Schema.decodeUnknownEffect(StoredDbBenchmark)
export const decodeStoredEnrolment = Schema.decodeUnknownEffect(StoredDbPlanEnrolment)
export const decodeStoredWorkout = Schema.decodeUnknownEffect(StoredDbWorkout)

export const decodeBenchmarkDraft = Schema.decodeUnknownEffect(BenchmarkDraft)
export const decodeEnrolmentDraft = Schema.decodeUnknownEffect(PlanEnrolmentDraft)
export const decodeWorkoutDraft = Schema.decodeUnknownEffect(WorkoutDraft)

/**
 * Normalizes a decoded row into a complete domain object. Pure and total:
 * never throws, never returns partial data — that keeps data written by any
 * historical version of the app readable ("The Long Now").
 */
export function toBenchmark(stored: StoredDbBenchmark): Benchmark {
  return stored
}

export function toEnrolment(stored: StoredDbPlanEnrolment): PlanEnrolment {
  return {
    id: stored.id,
    planId: stored.planId,
    startedAt: stored.startedAt,
    active: stored.active ?? true,
  }
}

export function toWorkout(stored: StoredDbWorkout): Workout {
  return {
    ...stored,
    source: stored.source ?? 'manual',
    intervals: stored.intervals ?? [],
  }
}
