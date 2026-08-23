/**
 * The editing state machine behind every number this app accepts.
 *
 * One machine, three masks. A phone's software keyboard is the slow path for
 * all four manual entries — and for the two written `43:07` and `7:04.2` it is
 * worse than slow: `inputmode="numeric"` raises a pad with no colon on it in
 * iOS Safari, so a time field summons a keyboard that cannot type the value
 * its own placeholder asks for. A mask that fills from the right never needs
 * the colon typed at all.
 *
 * Values are plain numbers in the unit the field means: metres, strokes per
 * minute, or milliseconds. Text is a draft — `text` holds a decimal string for
 * `decimal` and a raw digit buffer for the two sexagesimal masks — and only
 * `commitNumericEditing` turns it back into a number. Keeping the buffer raw
 * is what makes right-to-left typing reachable: `6`, `0`, `0` passes through
 * `0:60` on its way to `6:00`, and normalising each keystroke would strand the
 * user at `1:00` with a buffer that no longer matches what they see.
 */

/**
 * How a buffer of digits is read, and therefore what the value counts.
 *
 * Not exported: a field names its mask with a literal in its options, so an
 * exported alias would be a name nothing says.
 */
type NumericMask = 'decimal' | 'duration' | 'split'

export interface NumericInputOptions {
  /** Defaults to `decimal`. `duration` is `m:ss`, `split` is `m:ss.t`, both in ms. */
  readonly mask?: NumericMask
  /** Smallest value that can be committed. Negative input is not supported. */
  readonly min?: number
  /** Largest value that can be entered or committed. */
  readonly max?: number
  /** Fractional digits accepted by the keypad. `decimal` only. */
  readonly maximumFractionDigits?: number
  /** Group thousands in the display — `10 000` rather than `10000`. */
  readonly useGrouping?: boolean
  /** Zeros on the shortcut key beside the digits: `00`, `000`, or none. */
  readonly zerosKey?: number
  /** Distance between generated preset values. */
  readonly presetStep?: number
  /** Distance generated on either side of the current value. */
  readonly presetRange?: number
}

export interface ResolvedNumericInputOptions {
  readonly mask: NumericMask
  readonly min: number
  readonly max: number
  readonly maximumFractionDigits: number
  readonly useGrouping: boolean
  readonly zerosKey: number
  readonly presetStep: number
  readonly presetRange: number
}

export interface NumericEditingState {
  readonly text: string
  /** The next digit replaces the draft rather than extending it. */
  readonly fresh: boolean
}

export type NumericInputAction =
  | { readonly type: 'digit'; readonly digit: string }
  | { readonly type: 'decimal' }
  | { readonly type: 'backspace' }
  | { readonly type: 'preset'; readonly value: number }

export type NumericInputKeyboardCommand = NumericInputAction | { readonly type: 'confirm' }

const DEFAULT_OPTIONS: ResolvedNumericInputOptions = {
  mask: 'decimal',
  min: 0,
  max: 999,
  maximumFractionDigits: 0,
  useGrouping: false,
  zerosKey: 0,
  presetStep: 1,
  presetRange: 10,
}

const MAXIMUM_FRACTION_DIGITS = 6
const MAXIMUM_PRESET_STEPS_EACH_SIDE = 20
const MAXIMUM_ZEROS_KEY = 3

const SECONDS_PER_MINUTE = 60
const MS_PER_SECOND = 1000
const MS_PER_TENTH = 100

/**
 * How many digits a mask can hold. `decimal` is bounded by `max` instead —
 * a metre field and a rate field share the mask and not the ceiling.
 */
const DIGIT_CEILING = {
  decimal: Number.POSITIVE_INFINITY,
  duration: 4,
  split: 5,
} satisfies Readonly<Record<NumericMask, number>>

function finiteOr(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) ? value : fallback
}

function roundTo(value: number, fractionDigits: number): number {
  const factor = 10 ** fractionDigits
  return Math.round((value + Number.EPSILON) * factor) / factor
}

function clamp(value: number, options: ResolvedNumericInputOptions): number {
  return Math.min(options.max, Math.max(options.min, value))
}

/** The zeros a mask pads in are presentation, never part of its buffer. */
function withoutLeadingZeros(digits: string): string {
  return digits.replace(/^0+/, '')
}

function twoDigits(value: number): string {
  return String(value).padStart(2, '0')
}

function durationValue(digits: string): number {
  const seconds = Number(digits.slice(-2) || '0')
  const minutes = Number(digits.slice(0, -2) || '0')

  return (minutes * SECONDS_PER_MINUTE + seconds) * MS_PER_SECOND
}

function splitValue(digits: string): number {
  const tenths = Number(digits.slice(-1) || '0')
  const seconds = Number(digits.slice(-3, -1) || '0')
  const minutes = Number(digits.slice(0, -3) || '0')

  return ((minutes * SECONDS_PER_MINUTE + seconds) * 10 + tenths) * MS_PER_TENTH
}

function durationDigits(value: number): string {
  const total = Math.max(0, Math.round(value / MS_PER_SECOND))
  const minutes = Math.floor(total / SECONDS_PER_MINUTE)

  return withoutLeadingZeros(`${minutes}${twoDigits(total % SECONDS_PER_MINUTE)}`)
}

function splitDigits(value: number): string {
  const tenths = Math.max(0, Math.round(value / MS_PER_TENTH))
  const seconds = Math.floor(tenths / 10)
  const minutes = Math.floor(seconds / SECONDS_PER_MINUTE)

  return withoutLeadingZeros(`${minutes}${twoDigits(seconds % SECONDS_PER_MINUTE)}${tenths % 10}`)
}

function durationText(digits: string): string {
  return `${digits.slice(0, -2) || '0'}:${digits.slice(-2).padStart(2, '0')}`
}

function splitText(digits: string): string {
  const minutes = digits.slice(0, -3) || '0'
  const seconds = digits.slice(-3, -1).padStart(2, '0')

  return `${minutes}:${seconds}.${digits.slice(-1) || '0'}`
}

/** What the draft text is worth, before `min`/`max` have their say. */
function draftValue(text: string, options: ResolvedNumericInputOptions): number {
  if (options.mask === 'duration') return durationValue(text)
  if (options.mask === 'split') return splitValue(text)

  const parsed = Number.parseFloat(text)

  return Number.isFinite(parsed) ? parsed : 0
}

/** The inverse: a committed value as the text a further keystroke extends. */
function draftText(value: number, options: ResolvedNumericInputOptions): string {
  const normalized = normalizeValue(value, options)
  if (options.mask === 'duration') return durationDigits(normalized)
  if (options.mask === 'split') return splitDigits(normalized)

  return String(normalized)
}

function normalizeValue(value: number, options: ResolvedNumericInputOptions): number {
  return clamp(roundTo(value, options.maximumFractionDigits), options)
}

function groupSeparator(locale: string): string {
  return (
    new Intl.NumberFormat(locale).formatToParts(1000).find((part) => part.type === 'group')
      ?.value ?? ','
  )
}

/** Grouping applied to text that is still being typed, integer part only. */
function groupInteger(text: string, locale: string): string {
  const [integer = '', ...rest] = text.split('.')
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, groupSeparator(locale))

  return [grouped, ...rest].join('.')
}

function appendDigit(
  state: NumericEditingState,
  digit: string,
  options: ResolvedNumericInputOptions,
): NumericEditingState {
  if (!/^\d$/.test(digit)) return state

  const current = state.fresh ? '' : state.text
  const candidate = maskedCandidate(current, digit, options)

  if (candidate === undefined) return state
  if (draftValue(candidate, options) > options.max) return state

  return { text: candidate, fresh: false }
}

/**
 * The one place the three masks differ on a keystroke: a decimal draft is a
 * number being written left to right, and a sexagesimal draft is a queue of
 * digits with a ceiling and no leading zero to speak of.
 */
function maskedCandidate(
  current: string,
  digit: string,
  options: ResolvedNumericInputOptions,
): string | undefined {
  if (options.mask === 'decimal') {
    const fractionDigits = current.includes('.') ? (current.split('.')[1]?.length ?? 0) : 0
    if (current.includes('.') && fractionDigits >= options.maximumFractionDigits) return undefined

    return current === '' || current === '0' ? digit : `${current}${digit}`
  }

  if (current === '' && digit === '0') return undefined

  const candidate = `${current}${digit}`

  return candidate.length > DIGIT_CEILING[options.mask] ? undefined : candidate
}

function appendDecimal(
  state: NumericEditingState,
  options: ResolvedNumericInputOptions,
): NumericEditingState {
  if (options.maximumFractionDigits === 0 || state.text.includes('.')) return state

  return { text: state.fresh ? '0.' : `${state.text}.`, fresh: false }
}

function removeLastCharacter(
  state: NumericEditingState,
  options: ResolvedNumericInputOptions,
): NumericEditingState {
  const shortened = state.text.slice(0, -1)
  if (options.mask !== 'decimal') return { text: shortened, fresh: false }

  return { text: shortened === '' ? '0' : shortened, fresh: false }
}

export function resolveNumericInputOptions(
  input: NumericInputOptions = {},
): ResolvedNumericInputOptions {
  const mask = input.mask ?? DEFAULT_OPTIONS.mask
  const min = Math.max(0, finiteOr(input.min, DEFAULT_OPTIONS.min))
  const max = Math.max(min, finiteOr(input.max, DEFAULT_OPTIONS.max))
  // A sexagesimal draft is whole tenths or whole seconds by construction, so
  // a fraction-digit budget on top of it would only invent a decimal key the
  // mask has nowhere to put.
  const maximumFractionDigits =
    mask === 'decimal'
      ? Math.min(
          MAXIMUM_FRACTION_DIGITS,
          Math.max(0, Math.trunc(finiteOr(input.maximumFractionDigits, 0))),
        )
      : 0
  const zerosKey = Math.min(MAXIMUM_ZEROS_KEY, Math.max(0, Math.trunc(finiteOr(input.zerosKey, 0))))
  const presetStep = Math.max(Number.EPSILON, finiteOr(input.presetStep, 1))
  const requestedRange = Math.max(0, finiteOr(input.presetRange, presetStep * 10))
  const presetRange = Math.min(
    requestedRange,
    presetStep * MAXIMUM_PRESET_STEPS_EACH_SIDE,
    max - min,
  )

  return {
    mask,
    min,
    max,
    maximumFractionDigits,
    useGrouping: input.useGrouping ?? DEFAULT_OPTIONS.useGrouping,
    zerosKey,
    presetStep,
    presetRange,
  }
}

export function beginNumericEditing(
  value: number,
  input: NumericInputOptions | ResolvedNumericInputOptions = {},
): NumericEditingState {
  const options = resolveNumericInputOptions(input)

  return { text: draftText(value, options), fresh: true }
}

export function updateNumericEditing(
  state: NumericEditingState,
  action: NumericInputAction,
  input: NumericInputOptions | ResolvedNumericInputOptions = {},
): NumericEditingState {
  const options = resolveNumericInputOptions(input)

  switch (action.type) {
    case 'digit':
      return appendDigit(state, action.digit, options)
    case 'decimal':
      return appendDecimal(state, options)
    case 'backspace':
      return removeLastCharacter(state, options)
    case 'preset':
      return beginNumericEditing(action.value, options)
  }
}

export function commitNumericEditing(
  state: NumericEditingState,
  input: NumericInputOptions | ResolvedNumericInputOptions = {},
): number {
  const options = resolveNumericInputOptions(input)

  return normalizeValue(draftValue(state.text, options), options)
}

export function generateNumericPresets(
  currentValue: number,
  input: NumericInputOptions | ResolvedNumericInputOptions = {},
): ReadonlyArray<number> {
  const options = resolveNumericInputOptions(input)
  const current = normalizeValue(currentValue, options)
  const start = Math.ceil(Math.max(options.min, current - options.presetRange) / options.presetStep)
  const end = Math.floor(Math.min(options.max, current + options.presetRange) / options.presetStep)
  const values = Array.from({ length: Math.max(0, end - start + 1) }, (_, index) =>
    normalizeValue((start + index) * options.presetStep, options),
  )

  return [...new Set([...values, current])].sort((left, right) => left - right)
}

export function normalizeNumericPresets(
  presets: ReadonlyArray<number>,
  input: NumericInputOptions | ResolvedNumericInputOptions = {},
): ReadonlyArray<number> {
  const options = resolveNumericInputOptions(input)

  return [
    ...new Set(
      presets
        .filter((value) => Number.isFinite(value) && value >= options.min && value <= options.max)
        .map((value) => normalizeValue(value, options)),
    ),
  ].sort((left, right) => left - right)
}

export function numericInputKeyboardCommand(key: string): NumericInputKeyboardCommand | undefined {
  if (/^\d$/.test(key)) return { type: 'digit', digit: key }
  if (key === '.' || key === ',') return { type: 'decimal' }
  if (key === 'Backspace' || key === 'Delete') return { type: 'backspace' }
  if (key === 'Enter') return { type: 'confirm' }

  return undefined
}

export function numericDecimalSeparator(locale: string): string {
  return (
    new Intl.NumberFormat(locale).formatToParts(1.1).find((part) => part.type === 'decimal')
      ?.value ?? '.'
  )
}

/**
 * The draft as the pad shows it, transient states and all — `0:60` is a
 * legitimate thing to be looking at halfway through typing `6:00`.
 */
export function localizeNumericEditingText(
  text: string,
  locale: string,
  input: NumericInputOptions | ResolvedNumericInputOptions = {},
): string {
  const options = resolveNumericInputOptions(input)
  if (options.mask === 'duration') return durationText(text)
  if (options.mask === 'split') return splitText(text)

  const grouped = options.useGrouping ? groupInteger(text, locale) : text

  return grouped.replace('.', numericDecimalSeparator(locale))
}

/** A committed value, written the way the field writes it. */
export function formatNumericValue(
  value: number,
  locale: string,
  input: NumericInputOptions | ResolvedNumericInputOptions = {},
): string {
  const options = resolveNumericInputOptions(input)
  if (options.mask !== 'decimal')
    return localizeNumericEditingText(draftText(value, options), locale, options)

  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: options.maximumFractionDigits,
    useGrouping: options.useGrouping,
  }).format(value)
}
