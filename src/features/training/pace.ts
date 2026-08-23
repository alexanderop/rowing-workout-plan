import { Result, Schema } from 'effect'

/**
 * The pace arithmetic every other part of the trainer derives from.
 *
 * A **split** is the time to cover 500 m — the only unit a Concept2 monitor
 * and a rower ever talk in. It is carried as milliseconds everywhere
 * (`1:52.4` is `112_400`), so no call site has to decide whether a number is
 * seconds or minutes, and the formatting happens once, here.
 *
 * Power is Concept2's own relation rather than an approximation of it:
 *
 *     watts = 2.80 / (seconds per metre)³
 *
 * Every function guards its inputs and returns a `Result` rather than a bare
 * number, because the arithmetic below divides by all of them. A zero
 * distance yields `Infinity`, a negative one a negative split, and both
 * render on a screen as confidently as a real number does. A typed failure is
 * something the UI can be made to handle; `NaN` is not.
 *
 * Pure by construction: no clock, no storage, no ambient reads.
 * docs/functional-core.md.
 */

/** The distance a split is quoted over. */
const SPLIT_DISTANCE_M = 500

/**
 * Concept2's power constant. Their monitors and every online calculator use
 * 2.80, so a piece logged here has to agree with the number on the PM5 —
 * this is not a coefficient to tune.
 */
const POWER_CONSTANT = 2.8

const MS_PER_SECOND = 1000
const DECISECONDS_PER_MINUTE = 600

/**
 * A quantity the pace domain cannot work with: a distance, duration, split or
 * wattage that is zero, negative, `NaN` or infinite.
 *
 * It carries the offending parameter *and* its value, because "the split was
 * wrong" is not something a UI can say usefully and neither is a stack trace.
 * Tags are namespaced like the db's, so `Training.…` and `Db.…` can never
 * collide in one `catchTags`.
 */
export class PaceRangeError extends Schema.TaggedError<PaceRangeError>()(
  'Training.PaceRangeError',
  {
    field: Schema.String,
    value: Schema.Number,
  },
) {}

/** The window around a target split the live screen holds you inside. Both
 * edges are splits in milliseconds, so `lower` is the *faster* one. */
export interface PaceBand {
  readonly lower: number
  readonly upper: number
}

/**
 * The one guard the whole module shares. Everything below divides by its
 * inputs, so "finite and above zero" is the single precondition, and stating
 * it once means a caller can never meet a half-checked one.
 */
function requirePositive(field: string, value: number): Result.Result<number, PaceRangeError> {
  if (!Number.isFinite(value) || value <= 0)
    return Result.fail(new PaceRangeError({ field, value }))
  return Result.succeed(value)
}

/** Zero is a legitimate tolerance — "hit it exactly" — so the band's width
 * gets its own guard rather than borrowing the one above. */
function requireNonNegative(field: string, value: number): Result.Result<number, PaceRangeError> {
  if (!Number.isFinite(value) || value < 0) return Result.fail(new PaceRangeError({ field, value }))
  return Result.succeed(value)
}

/** Power a split is worth, by Concept2's relation. */
export function wattsFromSplit(splitMs: number): Result.Result<number, PaceRangeError> {
  return Result.map(requirePositive('splitMs', splitMs), (split) => {
    const secondsPerMetre = split / MS_PER_SECOND / SPLIT_DISTANCE_M
    return POWER_CONSTANT / secondsPerMetre ** 3
  })
}

/** The inverse: the split that holding a given power produces. */
export function splitFromWatts(watts: number): Result.Result<number, PaceRangeError> {
  return Result.map(
    requirePositive('watts', watts),
    (power) => Math.cbrt(POWER_CONSTANT / power) * SPLIT_DISTANCE_M * MS_PER_SECOND,
  )
}

/** How long a distance takes at a split. */
export function durationMsFor(
  distanceM: number,
  splitMs: number,
): Result.Result<number, PaceRangeError> {
  return Result.gen(function* () {
    const distance = yield* requirePositive('distanceM', distanceM)
    const split = yield* requirePositive('splitMs', splitMs)
    return (distance / SPLIT_DISTANCE_M) * split
  })
}

/** The split a distance covered in a duration was rowed at. */
export function splitFor(
  distanceM: number,
  durationMs: number,
): Result.Result<number, PaceRangeError> {
  return Result.gen(function* () {
    const distance = yield* requirePositive('distanceM', distanceM)
    const duration = yield* requirePositive('durationMs', durationMs)
    return (duration / distance) * SPLIT_DISTANCE_M
  })
}

/**
 * A split as a rower reads it: `1:52.4`.
 *
 * Tenths are **truncated**, not rounded, which is the one display decision in
 * this module. It is what the design canvas shows — a 2k of 7:04.2 is written
 * there as `1:46.0 /500m`, and that pace is exactly 1:46.05 — and it makes a
 * displayed split name the same interval a monitor showing the same digits
 * does, so "hold 1:52.4" means one thing on both screens. Rounding instead is
 * a one-line change here and nowhere else.
 *
 * The milliseconds are rounded to whole first, and that half is not
 * cosmetic: a split arrives from `splitFor` as `(duration / distance) * 500`,
 * which in binary floating point lands on 105_999.999… as readily as on
 * 106_000. Truncating that directly would show `1:45.9` for a pace that is
 * 1:46.0 to every other part of the app.
 */
export function formatSplit(splitMs: number): Result.Result<string, PaceRangeError> {
  return Result.map(requirePositive('splitMs', splitMs), (split) => {
    const deciseconds = Math.floor(Math.round(split) / 100)
    const minutes = Math.floor(deciseconds / DECISECONDS_PER_MINUTE)
    const seconds = (deciseconds % DECISECONDS_PER_MINUTE) / 10
    return `${minutes}:${seconds.toFixed(1).padStart(4, '0')}`
  })
}

/**
 * The window the live screen holds you inside, `toleranceMs` either side of
 * the target. A tolerance as wide as the target itself would put the fast
 * edge at or below zero, which is not a split — so it is rejected rather than
 * clamped, because a clamp would silently show a band nobody asked for.
 */
export function paceBand(
  splitMs: number,
  toleranceMs: number,
): Result.Result<PaceBand, PaceRangeError> {
  return Result.gen(function* () {
    const split = yield* requirePositive('splitMs', splitMs)
    const tolerance = yield* requireNonNegative('toleranceMs', toleranceMs)
    if (tolerance >= split)
      return yield* Result.fail(new PaceRangeError({ field: 'toleranceMs', value: toleranceMs }))

    return { lower: split - tolerance, upper: split + tolerance }
  })
}
