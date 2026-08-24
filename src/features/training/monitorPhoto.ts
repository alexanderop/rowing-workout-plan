import { Result, Schema } from 'effect'
import type { OcrLine } from '@/lib/ocr'
import { durationMsFor } from './pace'

/**
 * Turning a text recogniser's reading of a monitor photo into a workout
 * draft.
 *
 * The models (src/lib/monitorPhotoModel.ts) are asked for one thing only:
 * *where every word on the photo is and what it says*. Nothing above them is
 * asked which number is the distance, or to convert `2:44.5` into seconds,
 * or to fill in a JSON shape. A model asked to fill a template copies the
 * template back — the 500M SmolVLM this feature first shipped on returned
 * the prompt's own `<total metres rowed>` placeholders, word for word, and
 * never once read a real photo.
 *
 * So every judgement lives here, in ordinary code that can be graded:
 *
 * - **Which line is a value.** A PM5 draws values roughly twice the height
 *   of the unit labels beside them, so a line shorter than half the tallest
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
 * How sure the recogniser has to be of a line before this reads it as one.
 *
 * A photographed erg is not a page: the PM5's six round rubber buttons and
 * the frame's own edges come back as lines of text too. Confidence does not
 * sort them from the screen — on the captures the buttons run right up
 * through the range the real lines occupy, and the *lowest* confidence on
 * either photo belongs to a real word — so this is a floor under the obvious
 * noise, not a filter. Both captures read correctly without it, on the
 * height rule below alone.
 *
 * It is here for the one case that rule cannot catch, because it is that
 * rule's own input: a misread box that is also *tall* resets the scale every
 * value is measured against, and one tall enough puts every real value under
 * the half-height line at once, so the photo fails for having no values on
 * it. A line the recogniser barely believes should not get to decide how big
 * a digit is.
 */
const MIN_CONFIDENCE = 0.5

/**
 * How short a line has to be, against the tallest line holding digits,
 * before it counts as a label rather than a value. Measured from what a PM5
 * draws: on the photo this feature was built from, values run 62–100% of the
 * tallest, and every unit label 20–30% — the gap either side of a half is
 * wide enough that the exact fraction does not matter.
 */
const VALUE_HEIGHT_RATIO = 0.5

const height = (token: OcrLine): number => token.bottom - token.top

const hasDigit = (token: OcrLine): boolean => /\d/u.test(token.text)

const textOf = (token: OcrLine): string => token.text

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

/** The middle of a box, across and down. */
const centreX = (line: OcrLine): number => (line.left + line.right) / 2
const middleY = (line: OcrLine): number => (line.top + line.bottom) / 2

/**
 * Whether `label` sits to the right of `value` on the same line of the
 * display.
 *
 * Vertical *overlap* rather than a shared baseline, because the PM5 stacks
 * two half-height labels (`ave` over `/500m`) beside one full-height number.
 *
 * Horizontally it is centre against centre, not `label.left >= value.right`.
 * An edge test assumes boxes that never overlap, which is true of a model
 * that writes one box per line and false of a detector that pads every box
 * it finds: the `m` of `4559 m` then starts a few pixels left of where the
 * number's box ends, and the distance loses its unit.
 */
function isRightOf(label: OcrLine, value: OcrLine): boolean {
  return centreX(label) > centreX(value) && label.top < value.bottom && label.bottom > value.top
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
// `rn`, `ave`, `split`, `projted`, `flish`, `s/m`, `/500m`, `cal`, `watts`. None
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
  // `rn`, `mn` and `nn` are what a 40-pixel lowercase m comes back as about
  // half the time — it is two strokes at that size, and the recogniser reads
  // two letters. The PM5 has no other unit they could be, and the same
  // tolerance is already granted to `projted` and `flish` above.
  [/^(?:m|rn|mn|nn)$|^met/u, 'distance'],
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
 * What each field can hold, as the readers below already define it. One
 * definition rather than two: a value is filed under a field only if that
 * field could later read it, so the two can never drift into a state where
 * something is filed and then rejected.
 */
const CAN_BE = {
  distance: (digits: string) => metresFrom(digits) !== undefined,
  time: (digits: string) => clockSeconds(digits) !== undefined,
  avgSplit: (digits: string) => clockSeconds(digits) !== undefined,
  rate: (digits: string) => rateFrom(digits).avgRate !== undefined,
  ignore: () => true,
} satisfies Record<Field, (digits: string) => boolean>

/**
 * The value a label describes: of the values it sits to the right of, the
 * one whose middle it is nearest.
 *
 * One owner, not every value it overlaps. The PM5 draws `2:44.5 ave /500m`
 * and `874 split m` a few pixels apart, so on a tightly boxed reading the
 * `split` of the row below reaches up into the average — and `split`
 * disqualifies, so the average split is filed under `ignore` and the whole
 * photo fails for want of a duration.
 */
function ownerOf(label: OcrLine, values: ReadonlyArray<OcrLine>): OcrLine | undefined {
  return values
    .filter((value) => isRightOf(label, value))
    .reduce<
      OcrLine | undefined
    >((nearest, value) => (nearest === undefined || Math.abs(middleY(label) - middleY(value)) < Math.abs(middleY(label) - middleY(nearest)) ? value : nearest), undefined)
}

/**
 * Every value on the photo, filed under what its labels call it. A field
 * already filled is left alone: the PM5 draws the workout's own totals above
 * the split rows, so the first `m` down the screen is the distance rowed.
 */
function fieldsFrom(lines: ReadonlyArray<OcrLine>): MonitorFields {
  const tallest = Math.max(...lines.filter(hasDigit).map(height))
  const isValue = (line: OcrLine): boolean =>
    hasDigit(line) && height(line) >= tallest * VALUE_HEIGHT_RATIO
  const values = lines.filter(isValue)
  const labels = lines.filter((line) => !isValue(line))

  const fields: MonitorFields = {}
  for (const value of values) {
    const parts = VALUE_TEXT.exec(value.text)?.groups
    if (parts === undefined) continue

    // Cut into words rather than taken as they came. A recogniser runs a
    // whole row of the display together as readily as it separates it — the
    // photos this was built from have `:00` and the stroke rate as one line
    // — so the `m` of `4559 m 874` has to be found *inside* a line, not only
    // as one. Each line is cut on its own rather than joined and cut once,
    // so two that happen to sit next to each other can never fuse into a
    // word neither of them contains.
    const words = [
      parts.unit,
      ...labels.filter((label) => ownerOf(label, values) === value).map(textOf),
    ]
      .filter((text) => text !== undefined)
      .flatMap(wordsIn)

    // Filed only if it could be that field. Without this the `s/m` beside
    // the stroke rate, which every model here reads as a bare `m`, hands the
    // distance to the `:00` next to it — and holds it, because the first
    // value to claim a field keeps it. The slot stays open for the 4559 two
    // rows down instead.
    const field = fieldFor(words)
    if (CAN_BE[field](parts.digits)) fields[field] ??= parts.digits
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
 * What the recogniser read as the fields the log sheet prefills, or why it
 * cannot be. Never writes anything: the reading goes into the same form the
 * rower would have typed into, and the existing save path derives split and
 * power from it — a photo scan that skipped the form would also skip its
 * checks.
 */
export function parseMonitorReading(
  lines: ReadonlyArray<OcrLine>,
): Result.Result<MonitorReading, MonitorPhotoError> {
  return Result.gen(function* () {
    // Read once here rather than inside each rule below, so every later
    // judgement — which line is tallest included — is made over the same set
    // of lines this is willing to believe.
    const read = lines.filter((line) => line.confidence >= MIN_CONFIDENCE)
    if (read.every((line) => !hasDigit(line)))
      return yield* Result.fail(new MonitorPhotoError({ reason: 'noText' }))

    const fields = fieldsFrom(read)

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
