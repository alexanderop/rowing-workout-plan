import { Predicate, Result, Schema } from 'effect'
import { durationMsFor } from './pace'

/**
 * Turning a vision model's reading of a monitor photo into a workout draft.
 *
 * The model (src/lib/monitorPhotoModel.ts) is asked to *transcribe* the
 * display — digits as strings, exactly as shown — and every conversion
 * happens here instead. A 256M-parameter model asked to turn `2:44.5` into
 * seconds gets the arithmetic wrong often enough to poison the feature; asked
 * to copy digits it is merely sometimes blind. Copying is also the half a
 * deterministic parser can be graded on, so the flaky step stays as small as
 * it can be made.
 *
 * A summary screen does not always show total time (a Just Row screen shows
 * distance and average split only), so the duration is taken from the time
 * when it is there and *derived* from the split when it is not — the same
 * `durationMsFor` relation the rest of the trainer uses. When both are on the
 * photo they are cross-checked instead of trusted: a reading whose time and
 * split disagree by more than the tolerance is still returned, time winning,
 * but flagged `consistent: false` so the UI can say "check the numbers".
 *
 * Pure by construction: no clock, no storage, no ambient reads.
 * docs/functional-core.md.
 */

/**
 * What the model is asked. Transcription only, for the reason above — and
 * JSON with `null`s rather than prose, because "reply with only JSON" is the
 * one output instruction small VLMs reliably follow.
 */
export const MONITOR_PHOTO_PROMPT = `Look at the rowing machine monitor in the photo. Reply with ONLY a JSON object, no other words, in exactly this shape:
{"distance": "<total metres rowed, the large metre count>", "time": "<total workout time as displayed, or null>", "avgSplit": "<the average /500m pace as displayed, or null>", "rate": "<strokes per minute (s/m), or null>"}
Copy every number exactly as displayed, digit for digit. Use null for anything the screen does not show.`

/**
 * A photo the parser could not turn into a workout: no JSON in the reply, a
 * reply that is not JSON, or numbers that do not add up to a loggable row.
 * One tag with a reason rather than three tags, because no caller branches on
 * which — the UI's only move is "that photo did not read, type it in" — and
 * the reason is for the test naming what went wrong.
 */
export class MonitorPhotoError extends Schema.TaggedError<MonitorPhotoError>()(
  'Training.MonitorPhotoError',
  {
    /** `noJson`, `badJson`, or `badNumbers` — plain string like
     * `PaceRangeError.field`, since no caller branches on it. */
    reason: Schema.String,
  },
) {}

/**
 * One transcribed field as the model may hand it over: digits as a string, a
 * bare JSON number, `null` for "not on the screen" as the prompt asks, or a
 * missing key from a model that dropped one.
 */
const TranscribedDigits = Schema.optionalKey(
  Schema.NullOr(Schema.Union([Schema.String, Schema.Number])),
)

/**
 * The reply's wire shape — the other half of `MONITOR_PHOTO_PROMPT`, decoded
 * rather than trusted, the way every IndexedDB row is (docs/local-first.md):
 * a model is no more trustworthy a writer than a devtools user. Excess keys
 * are ignored; a field holding anything but digits or `null` fails the
 * decode and reads as `badNumbers`.
 */
// Stryker disable next-line ObjectLiteral: emptying the struct is equivalent — a Struct passes excess keys through untouched, and every field reader below already refuses a value that is not digits, so the decode and the readers reject exactly the same inputs.
const ModelReply = Schema.Struct({
  distance: TranscribedDigits,
  time: TranscribedDigits,
  avgSplit: TranscribedDigits,
  rate: TranscribedDigits,
})

interface ModelReply extends Schema.Schema.Type<typeof ModelReply> {}

const decodeReply = Schema.decodeUnknownResult(ModelReply)

/** What one decoded field can hold at a use site. */
type Transcribed = string | number | null | undefined

/** A monitor photo, read: the fields the log sheet prefills. */
export interface MonitorReading {
  readonly distanceM: number
  /** Whole seconds as milliseconds — the log sheet's time mask holds no tenths. */
  readonly durationMs: number
  readonly avgRate?: number
  /**
   * False only when the photo showed both a time and an average split and
   * they disagree by more than the tolerance — the one case where the model
   * demonstrably misread something and the rower has to compare the fields
   * against the monitor before saving.
   */
  readonly consistent: boolean
}

/** Mirrors the log sheet's field ceilings: a reading the form cannot hold is
 * a misread, not a workout. */
const DISTANCE_MAX_M = 99_999
const DURATION_MAX_MS = 5_999_000

const MS_PER_SECOND = 1000
const SECONDS_PER_UNIT = 60

/**
 * Two percent, chosen from what the display itself blurs: an average split is
 * shown truncated to tenths, so time and split legitimately disagree by up to
 * a tenth per 500 m — well under this — while a misread digit is off by
 * whole minutes or metres, well over.
 */
const CONSISTENCY_TOLERANCE = 0.02

/**
 * A number out of one field: a JSON number as it is, or a transcribed string
 * with the display's own furniture — thousands separators, stray spaces, a
 * trailing metre unit.
 */
function numberFrom(value: Transcribed): number | undefined {
  if (Predicate.isNumber(value)) return Number.isFinite(value) ? value : undefined
  if (!Predicate.isString(value)) return undefined

  // An emptied string is `Number('') === 0`, which every caller already
  // rejects — no separate guard.
  const bare = value.replaceAll(',', '').replaceAll(' ', '').replace(/m$/iu, '')
  const parsed = Number(bare)
  return Number.isFinite(parsed) ? parsed : undefined
}

/**
 * A clock reading as seconds: `"12:34"`, `"2:44.5"`, `"1:02:33"`, a bare
 * seconds count, or a JSON number. Sexagesimal is parsed here — see the
 * module comment for why the model is never asked to.
 */
function clockSeconds(value: Transcribed): number | undefined {
  if (Predicate.isNumber(value)) return Number.isFinite(value) && value > 0 ? value : undefined
  if (!Predicate.isString(value)) return undefined

  return clockFromParts(value.split(':'))
}

/** `[h?, m?, s]` — every part left of the seconds is a whole count under 60. */
function clockFromParts(parts: ReadonlyArray<string>): number | undefined {
  if (parts.length > 3 || parts.some((part) => part === '')) return undefined

  // No per-part finiteness guard: a `NaN` or infinite part poisons the
  // total, which the final check refuses wholesale. A *negative* part is the
  // one shape that can still sum to a plausible positive total, so it is the
  // one refused by name.
  const numbers = parts.map(Number)
  if (numbers.some((part) => part < 0)) return undefined
  if (numbers.slice(0, -1).some((part) => !Number.isInteger(part))) return undefined
  if (numbers.slice(1).some((part) => part >= SECONDS_PER_UNIT)) return undefined

  const total = numbers.reduce((sum, part) => sum * SECONDS_PER_UNIT + part, 0)
  return Number.isFinite(total) && total > 0 ? total : undefined
}

/** Whole positive metres the distance field can hold. `NaN` for a value that
 * was no number, which the range check refuses like any other misread. */
function metresFrom(value: Transcribed): number | undefined {
  const rounded = Math.round(numberFrom(value) ?? Number.NaN)
  return rounded > 0 && rounded <= DISTANCE_MAX_M ? rounded : undefined
}

/** A stroke rate the rate field can hold; anything else is dropped rather
 * than failing the reading — the rate is optional on the form too. */
function rateFrom(value: Transcribed): { avgRate?: number } {
  const rounded = Math.round(numberFrom(value) ?? Number.NaN)
  return rounded >= 10 && rounded <= 60 ? { avgRate: rounded } : {}
}

/** The braces-to-braces slice of the reply, parsed and decoded — a model
 * that obeys the prompt sends bare JSON, one that does not wraps it in
 * prose, and one that fills a field with something else fails the decode. */
function replyFrom(text: string): Result.Result<ModelReply, MonitorPhotoError> {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  // Stryker disable next-line EqualityOperator: `end === start` is unreachable — one index holds '{', the other '}', so `<=` and `<` cannot be told apart.
  if (start === -1 || end <= start) return Result.fail(new MonitorPhotoError({ reason: 'noJson' }))

  try {
    return Result.mapError(
      decodeReply(JSON.parse(text.slice(start, end + 1))),
      () => new MonitorPhotoError({ reason: 'badNumbers' }),
    )
  } catch {
    return Result.fail(new MonitorPhotoError({ reason: 'badJson' }))
  }
}

/**
 * The time the photo's average split implies, in exact milliseconds.
 * `getOrThrow` rather than a guard: both callers have already validated the
 * distance and the split as positive, so `durationMsFor` cannot fail here,
 * and a defensive branch would only be an assertion no test can reach.
 */
function impliedMs(distanceM: number, splitSeconds: number): number {
  return Result.getOrThrow(durationMsFor(distanceM, splitSeconds * MS_PER_SECOND))
}

/** Duration from the photo: the shown time when there is one, the split's
 * implication otherwise — rounded to the whole seconds the time mask holds. */
function durationFrom(
  distanceM: number,
  timeSeconds: number | undefined,
  splitSeconds: number | undefined,
): number | undefined {
  if (timeSeconds !== undefined) return Math.round(timeSeconds) * MS_PER_SECOND
  if (splitSeconds === undefined) return undefined

  return Math.round(impliedMs(distanceM, splitSeconds) / MS_PER_SECOND) * MS_PER_SECOND
}

/** True unless the photo showed a time *and* a split that contradict it. */
function isConsistent(
  distanceM: number,
  durationMs: number,
  timeSeconds: number | undefined,
  splitSeconds: number | undefined,
): boolean {
  if (timeSeconds === undefined || splitSeconds === undefined) return true

  const difference = Math.abs(impliedMs(distanceM, splitSeconds) - durationMs)
  return difference <= durationMs * CONSISTENCY_TOLERANCE
}

/**
 * The model's reply as the fields the log sheet prefills, or why it cannot
 * be. Never writes anything: the reading goes into the same form the rower
 * would have typed into, and the existing save path derives split and power
 * from it — a photo scan that skipped the form would also skip its checks.
 */
export function parseMonitorReading(
  text: string,
): Result.Result<MonitorReading, MonitorPhotoError> {
  return Result.gen(function* () {
    const fields = yield* replyFrom(text)

    const distanceM = metresFrom(fields.distance)
    if (distanceM === undefined)
      return yield* Result.fail(new MonitorPhotoError({ reason: 'badNumbers' }))

    const timeSeconds = clockSeconds(fields.time)
    const splitSeconds = clockSeconds(fields.avgSplit)
    const durationMs = durationFrom(distanceM, timeSeconds, splitSeconds)
    if (durationMs === undefined || durationMs <= 0 || durationMs > DURATION_MAX_MS)
      return yield* Result.fail(new MonitorPhotoError({ reason: 'badNumbers' }))

    return {
      distanceM,
      durationMs,
      consistent: isConsistent(distanceM, durationMs, timeSeconds, splitSeconds),
      ...rateFrom(fields.rate),
    }
  })
}
