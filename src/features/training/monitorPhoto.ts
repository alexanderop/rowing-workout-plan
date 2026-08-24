import { Result, Schema } from 'effect'
import { durationMsFor } from './pace'

/**
 * Turning a vision model's reading of a monitor photo into a workout draft.
 *
 * The model (src/lib/monitorPhotoModel.ts) is asked for one thing only:
 * *where every word on the photo is and what it says*. It is never asked
 * which number is the distance, never asked to convert `2:44.5` into
 * seconds, never asked to fill in a JSON shape. A small model asked to fill
 * a template copies the template back — the 500M SmolVLM this feature
 * shipped on returned the prompt's own `<total metres rowed>` placeholders,
 * word for word, and the feature never once read a real photo. Asked instead
 * to transcribe with boxes, a *smaller* model (Florence-2-base-ft, 0.23B)
 * reads a PM5 correctly in about a second.
 *
 * So every judgement lives here, in ordinary code that can be graded:
 *
 * - **Which token is a value.** A PM5 draws values roughly twice the height
 *   of the unit labels beside them, so a token shorter than half the tallest
 *   one is furniture, not a number. Without this the `/500m` under the pace
 *   reads as a 500 metre row.
 * - **Which field a value is.** The words to its right, on its own line —
 *   the PM5 labels every value that way (`4559 m`, `2:44.5 ave /500m`,
 *   `874 split m`, `4559 projected finish`). `split` and `projected` are
 *   parts of a workout, not the workout, and are dropped by name.
 * - **What the digits mean.** Sexagesimal, separators, display units, and
 *   the ranges the log sheet's fields can hold.
 *
 * A summary screen does not always show total time (a Just Row screen shows
 * distance and average split only), so the duration is taken from the time
 * when it is there and *derived* from the split when it is not — the same
 * `durationMsFor` relation the rest of the trainer uses. When both are on the
 * photo they are cross-checked instead of trusted: a reading whose time and
 * split disagree by more than the tolerance is still returned, time winning,
 * but flagged `consistent: false` so the UI can say "check the numbers".
 *
 * Known limit: the labels are read to the *right* of a value, which is how
 * the PM5 lays out every live screen. The end-of-workout summary *table*
 * puts its labels in column headers above instead, and is not read — that
 * photo fails the scan and the rower types the row in, which is the same
 * move the UI already offers for any photo that does not read.
 *
 * Pure by construction: no clock, no storage, no ambient reads.
 * docs/functional-core.md.
 */

/**
 * What the model is asked. Florence-2 takes a task token rather than an
 * instruction — this one means "every line of text, with its box" — and the
 * model module hands it to the processor, which expands it into the sentence
 * the weights were trained on. Transcription only, for the reason above.
 */
export const MONITOR_PHOTO_TASK = '<OCR_WITH_REGION>'

/**
 * A photo the parser could not turn into a workout: no transcription in the
 * reply, or numbers that do not add up to a loggable row. One tag with a
 * reason rather than two tags, because no caller branches on which — the
 * UI's only move is "that photo did not read, type it in" — and the reason
 * is for the test naming what went wrong.
 */
export class MonitorPhotoError extends Schema.TaggedError<MonitorPhotoError>()(
  'Training.MonitorPhotoError',
  {
    /** `noText` or `badNumbers` — plain string like `PaceRangeError.field`,
     * since no caller branches on it. */
    reason: Schema.String,
  },
) {}

/**
 * One line the model transcribed, and where it sat. Coordinates are
 * Florence-2's own thousandths-of-the-image buckets, kept exactly as the
 * reply writes them: only *relative* position is ever asked of them — is
 * this word right of that number, on the same line — so the photo's pixel
 * size never has to come along.
 */
interface OcrToken {
  readonly text: string
  readonly left: number
  readonly top: number
  readonly right: number
  readonly bottom: number
}

/** The four corners Florence-2 writes after every line, as `<loc_n>` pairs. */
const QUAD = /(?:<loc_\d+>){8}/gu
const LOC = /<loc_(\d+)>/gu

/**
 * The tokenizer's own furniture, which a reply is wrapped and interleaved
 * with — `</s>`, `<s>`, `<pad>`. Anything in angle brackets, rather than a
 * list of the ones seen so far: a monitor has no `<` on it, so nothing the
 * PM5 displays can be lost this way.
 */
const SPECIAL_TOKEN = /<[^>]*>/gu

/**
 * The reply as lines with boxes. A Florence-2 region reply is a flat
 * alternation — text, eight `<loc_>` corners, text, eight corners — so each
 * quad closes the line whose text ran from the end of the quad before it.
 */
function tokensFrom(reply: string): ReadonlyArray<OcrToken> {
  const quads = [...reply.matchAll(QUAD)]

  return quads.map((quad, index) => {
    const previous = quads[index - 1]
    const from = previous === undefined ? 0 : previous.index + previous[0].length
    const locs = [...quad[0].matchAll(LOC)].map(([, value]) => Number(value))
    const xs = locs.filter((_, at) => at % 2 === 0)
    const ys = locs.filter((_, at) => at % 2 === 1)

    return {
      text: reply.slice(from, quad.index).replaceAll(SPECIAL_TOKEN, '').trim(),
      left: Math.min(...xs),
      top: Math.min(...ys),
      right: Math.max(...xs),
      bottom: Math.max(...ys),
    }
  })
}

// A line with no text is not filtered out: Florence-2 writes none, and one
// would be inert anyway — it holds no digits, so it is never a value, and it
// matches no label rule, so it never names one either.

/**
 * How short a line has to be, against the tallest line holding digits,
 * before it counts as a label rather than a value. Measured from what a PM5
 * draws: on the photo this feature was built from, values run 62–100% of the
 * tallest, and every unit label 20–30% — the gap either side of a half is
 * wide enough that the exact fraction does not matter.
 */
const VALUE_HEIGHT_RATIO = 0.5

const height = (token: OcrToken): number => token.bottom - token.top

const hasDigit = (token: OcrToken): boolean => /\d/u.test(token.text)

const textOf = (token: OcrToken): string => token.text

/** A run of non-space, which is what "a word" means to the rules below. */
const WORD = /\S+/gu

/** The words in one transcribed line. */
function wordsIn(text: string): ReadonlyArray<string> {
  return [...text.matchAll(WORD)].map(([word]) => word)
}

/**
 * The digits at the head of a line, and whatever unit trails them: `"4559m"`
 * is a value of `4559` labelled `m`. The unit is barred from starting with a
 * digit so the two halves cannot both claim the same character — an
 * ambiguity a linter reads, correctly, as backtracking waiting to happen.
 */
// Stryker disable next-line Regex: the leading `^` is graded below — a line
// whose digits sit inside a word is not a value. The trailing `$` cannot be:
// `.*` is greedy and stops only at a newline, which no transcribed line
// holds, so anchoring the end changes nothing the model can produce.
const VALUE_TEXT = /^(?<digits>[\d.:,]+)(?<unit>[^\d.:,].*)?$/u

/**
 * Whether `label` sits to the right of `value` on the same line of the
 * display. Vertical *overlap* rather than a shared baseline, because the PM5
 * stacks two half-height labels (`ave` over `/500m`) beside one full-height
 * number.
 */
function isRightOf(label: OcrToken, value: OcrToken): boolean {
  return label.left >= value.right && label.top < value.bottom && label.bottom > value.top
}

/**
 * The fields a value can be, once its labels are read. `ignore` is a field
 * like any other — the current pace, a split, a projection, the monitor's
 * own branding all get read and filed, they are simply filed where nothing
 * looks. A name rather than an absence, so filing needs no branch.
 */
type Field = 'distance' | 'time' | 'avgSplit' | 'rate' | 'ignore'

/**
 * What each label word means, in the order the rules are tried — first match
 * wins, so the disqualifying words come before the describing ones. `2:44.5
 * ave /500m` is an average before it is a `/500m` pace, and `874 split m` is
 * a split before it is a metre count. The misspellings are the model's own:
 * `projted` and `flish` are what Florence-2 makes of `projected finish` on a
 * blurry LCD, and dropping that row hangs on catching them.
 *
 * The pace rule matches a bare `500` as well as a `500m`, because the words
 * arrive split: a `/500 m` the model spaced out would otherwise reach the
 * distance rule on its `m` and turn the current pace into a 500 metre row.
 */
// Stryker disable Regex,StringLiteral: every mutant this table takes is an
// anchor or a quantifier moved inside one of these patterns, and the words
// they are matched against are a fixed vocabulary of about a dozen — `m`,
// `ave`, `split`, `projted`, `flish`, `s/m`, `/500m`, `cal`, `watts`. None
// of them tells an original from its mutant *given the order the rules run
// in*, which is the part that can go wrong and is graded word by word in the
// spec's `which field a value is` block. `IGNORE` names a bucket no reader
// opens, so its spelling is inert for the same reason.
const IGNORE = 'ignore'

const FIELD_RULES: ReadonlyArray<readonly [RegExp, Field]> = [
  [/spl/u, IGNORE],
  [/^pro|fi.?ish/u, IGNORE],
  [/^avg?/u, 'avgSplit'],
  [/cal|watt/u, IGNORE],
  [/^s\/?m$|^spm$|stroke/u, 'rate'],
  [/^\/?500$|500\s*m/u, IGNORE],
  [/time|elapsed/u, 'time'],
  [/^m$|^met/u, 'distance'],
]
// Stryker restore Regex,StringLiteral

/**
 * The field the words beside a value name. Each word is tried whole rather
 * than one run-together string, so `m` can be matched exactly: the metre
 * unit is the word `m` and nothing else, and a `/500m` beside it must not
 * count as one.
 */
function fieldFor(words: ReadonlyArray<string>): Field {
  const lower = words.map((word) => word.toLowerCase())

  return FIELD_RULES.find(([pattern]) => lower.some((word) => pattern.test(word)))?.[1] ?? IGNORE
}

/** The fields of one photo, as the model transcribed them — the same shape
 * the numeric readers below take, so what changed with the model stops
 * here. */
interface MonitorFields {
  distance?: string
  time?: string
  avgSplit?: string
  rate?: string
  /** Where the pace, the splits and the projection go. Never read. */
  ignore?: string
}

/**
 * Every value on the photo, filed under what its labels call it. A field
 * already filled is left alone: the PM5 draws the workout's own totals above
 * the split rows, so the first `m` down the screen is the distance rowed.
 */
function fieldsFrom(tokens: ReadonlyArray<OcrToken>): MonitorFields {
  const tallest = Math.max(...tokens.filter(hasDigit).map(height))
  const isValue = (token: OcrToken): boolean =>
    hasDigit(token) && height(token) >= tallest * VALUE_HEIGHT_RATIO
  const labels = tokens.filter((token) => !isValue(token))

  const fields: MonitorFields = {}
  for (const token of tokens.filter(isValue)) {
    const parts = VALUE_TEXT.exec(token.text)?.groups
    if (parts === undefined) continue

    // Cut into words rather than taken as they came. Florence-2 runs a whole
    // row of the display together as readily as it separates it — the photo
    // this was built from has `:00` and the stroke rate as one line — so the
    // `m` of `4559 m 874` has to be found *inside* a line, not only as one.
    // Each line is cut on its own rather than joined and cut once, so two
    // that happen to sit next to each other can never fuse into a word
    // neither of them contains.
    const words = [parts.unit, ...labels.filter((label) => isRightOf(label, token)).map(textOf)]
      .filter((text) => text !== undefined)
      .flatMap(wordsIn)

    fields[fieldFor(words)] ??= parts.digits
  }

  return fields
}

/** What one transcribed field can hold at a use site. Never a number: the
 * model writes text and nothing but, and `fieldsFrom` hands its digits on
 * exactly as written. */
type Transcribed = string | undefined

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
 * A number out of one field. Only the thousands separator has to come off:
 * the digits reached this point through `VALUE_TEXT`, which admits nothing
 * but digits and `.:,` — no sign, no exponent, no unit, no space.
 */
function numberFrom(value: Transcribed): number | undefined {
  if (value === undefined) return undefined

  // An emptied string is `Number('') === 0`, which every caller already
  // rejects — no separate guard.
  const parsed = Number(value.replaceAll(',', ''))
  return Number.isFinite(parsed) ? parsed : undefined
}

/**
 * A clock reading as seconds: `"12:34"`, `"2:44.5"`, `"1:02:33"`, or a bare
 * seconds count. Sexagesimal is parsed here — see the module comment for why
 * the model is never asked to.
 */
function clockSeconds(value: Transcribed): number | undefined {
  return value === undefined ? undefined : clockFromParts(value.split(':'))
}

/** `[h?, m?, s]` — every part left of the seconds is a whole count under 60. */
function clockFromParts(parts: ReadonlyArray<string>): number | undefined {
  if (parts.length > 3 || parts.some((part) => part === '')) return undefined

  // No per-part guard: a part that is no number poisons the total, and the
  // final check refuses the lot. Nor a sign check — `VALUE_TEXT` has already
  // refused every character a negative could be written with.
  const numbers = parts.map(Number)
  if (numbers.slice(0, -1).some((part) => !Number.isInteger(part))) return undefined
  if (numbers.slice(1).some((part) => part >= SECONDS_PER_UNIT)) return undefined

  // Finite *and* positive, because the two failures are different: `NaN` is
  // no number and fails `> 0` on its own, but a digit run long enough to
  // overflow a double is `Infinity`, which passes it. An infinite split
  // reaches `durationMsFor`, which cannot hold it — and that failure would
  // *throw* out of `parseMonitorReading` rather than come back as a
  // `MonitorPhotoError`, leaving the sheet reading a photo forever.
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

/** True unless the photo showed a time *and* a split that contradict it.
 * Compared against the exact shown time, not the whole-second rounding the
 * form stores — on a short piece the rounding alone is more than 2%. */
function isConsistent(
  distanceM: number,
  timeSeconds: number | undefined,
  splitSeconds: number | undefined,
): boolean {
  if (timeSeconds === undefined || splitSeconds === undefined) return true

  const exactMs = timeSeconds * MS_PER_SECOND
  const difference = Math.abs(impliedMs(distanceM, splitSeconds) - exactMs)
  return difference <= exactMs * CONSISTENCY_TOLERANCE
}

/**
 * The model's reply as the fields the log sheet prefills, or why it cannot
 * be. Never writes anything: the reading goes into the same form the rower
 * would have typed into, and the existing save path derives split and power
 * from it — a photo scan that skipped the form would also skip its checks.
 */
export function parseMonitorReading(
  reply: string,
): Result.Result<MonitorReading, MonitorPhotoError> {
  return Result.gen(function* () {
    const tokens = tokensFrom(reply)
    if (tokens.every((token) => !hasDigit(token)))
      return yield* Result.fail(new MonitorPhotoError({ reason: 'noText' }))

    const fields = fieldsFrom(tokens)

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
      consistent: isConsistent(distanceM, timeSeconds, splitSeconds),
      ...rateFrom(fields.rate),
    }
  })
}
