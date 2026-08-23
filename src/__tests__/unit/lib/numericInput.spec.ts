import { describe, expect, it } from 'vitest'
import type { NumericEditingState, NumericInputOptions } from '@/lib/numericInput'
import {
  beginNumericEditing,
  commitNumericEditing,
  formatNumericValue,
  generateNumericPresets,
  localizeNumericEditingText,
  normalizeNumericPresets,
  numericInputKeyboardCommand,
  resolveNumericInputOptions,
  updateNumericEditing,
} from '@/lib/numericInput'

/** The four fields this app actually configures. */
const DISTANCE = { max: 99_999, zerosKey: 3 } satisfies NumericInputOptions
const DURATION = { mask: 'duration', max: 5_999_000, zerosKey: 2 } satisfies NumericInputOptions
const SPLIT = { mask: 'split', max: 5_999_900 } satisfies NumericInputOptions
const RATE = { max: 60 } satisfies NumericInputOptions

/** Press the digits of `keys`, in order, on a pad opened at `value`. */
function enter(value: number, keys: string, options: NumericInputOptions): NumericEditingState {
  return [...keys].reduce(
    (state, key) =>
      updateNumericEditing(
        state,
        key === '.' ? { type: 'decimal' } : { type: 'digit', digit: key },
        options,
      ),
    beginNumericEditing(value, options),
  )
}

const drafted = (value: number, keys: string, options: NumericInputOptions): string =>
  localizeNumericEditingText(enter(value, keys, options).text, 'en', options)

const committed = (value: number, keys: string, options: NumericInputOptions): number =>
  commitNumericEditing(enter(value, keys, options), options)

describe('the decimal mask', () => {
  it('replaces what was there with the first digit and appends the rest', () => {
    const replaced = enter(4000, '1', DISTANCE)

    expect(replaced).toEqual({ text: '1', fresh: false })
    expect(committed(4000, '10000', DISTANCE)).toBe(10_000)
  })

  it('refuses a digit that would take the value past the maximum', () => {
    // Six digits of metres is not a rowing machine, it is a typo. The key is
    // refused rather than the value clamped: a clamp would answer a mis-tap
    // with a number nobody typed.
    expect(committed(0, '123456', DISTANCE)).toBe(12_345)
    expect(committed(0, '99', RATE)).toBe(9)
  })

  it('backspaces to zero rather than to nothing', () => {
    const cleared = updateNumericEditing(enter(0, '2', RATE), { type: 'backspace' }, RATE)

    expect(cleared.text).toBe('0')
    expect(commitNumericEditing(cleared, RATE)).toBe(0)
  })

  it('groups only when the field asks for it', () => {
    const grouped = { ...DISTANCE, useGrouping: true } satisfies NumericInputOptions

    expect(formatNumericValue(10_000, 'en', DISTANCE)).toBe('10000')
    expect(formatNumericValue(10_000, 'en', grouped)).toBe('10,000')
    expect(drafted(0, '10000', grouped)).toBe('10,000')
  })

  it('writes the decimal separator the locale writes', () => {
    const weight = { max: 500, maximumFractionDigits: 1 } satisfies NumericInputOptions

    expect(drafted(0, '7.5', weight)).toBe('7.5')
    expect(localizeNumericEditingText('7.5', 'de', weight)).toBe('7,5')
    expect(formatNumericValue(7.5, 'de', weight)).toBe('7,5')
  })
})

describe('the duration mask', () => {
  it('fills from the right, so the colon is never typed', () => {
    expect(drafted(0, '4', DURATION)).toBe('0:04')
    expect(drafted(0, '43', DURATION)).toBe('0:43')
    expect(drafted(0, '430', DURATION)).toBe('4:30')
    expect(drafted(0, '4307', DURATION)).toBe('43:07')
    expect(committed(0, '4307', DURATION)).toBe(2_587_000)
  })

  it('passes through a transient seconds pair on the way to a valid time', () => {
    // `6`, `0`, `0` has to go through `0:60` to reach `6:00`. Refusing the
    // second keystroke would make `6:00` unreachable, so the draft shows it
    // and the value it commits to is the minute the digits add up to.
    expect(drafted(0, '60', DURATION)).toBe('0:60')
    expect(committed(0, '60', DURATION)).toBe(60_000)
    expect(drafted(0, '600', DURATION)).toBe('6:00')
    expect(committed(0, '600', DURATION)).toBe(360_000)
  })

  it('holds four digits and no more', () => {
    expect(drafted(0, '43075', DURATION)).toBe('43:07')
  })

  it('ignores a leading zero, since the mask pads its own', () => {
    expect(enter(0, '0', DURATION).text).toBe('')
    expect(drafted(0, '0', DURATION)).toBe('0:00')
  })

  it('backspaces a digit at a time, right to left', () => {
    const shortened = updateNumericEditing(
      enter(0, '4307', DURATION),
      { type: 'backspace' },
      DURATION,
    )

    expect(localizeNumericEditingText(shortened.text, 'en', DURATION)).toBe('4:30')
  })

  it('writes a committed value the way the field reads it', () => {
    expect(formatNumericValue(2_587_000, 'en', DURATION)).toBe('43:07')
    // The transient `0:60` commits to a minute, and a minute is written `1:00`.
    expect(formatNumericValue(60_000, 'en', DURATION)).toBe('1:00')
  })

  it('round-trips every time the mask can express', () => {
    // The property the whole mask exists for: what the pad shows, reopened,
    // is what the pad shows. A value that could not be typed back in is a
    // value a rower cannot correct.
    for (let seconds = 0; seconds <= 5999; seconds += 1) {
      const value = seconds * 1000
      const reopened = beginNumericEditing(value, DURATION)

      expect(commitNumericEditing(reopened, DURATION)).toBe(value)
    }
  })
})

describe('the split mask', () => {
  it('fills tenths first', () => {
    expect(drafted(0, '7', SPLIT)).toBe('0:00.7')
    expect(drafted(0, '70', SPLIT)).toBe('0:07.0')
    expect(drafted(0, '7042', SPLIT)).toBe('7:04.2')
    expect(committed(0, '7042', SPLIT)).toBe(424_200)
  })

  it('holds five digits, which is 99:59.9', () => {
    expect(drafted(0, '123456', SPLIT)).toBe('12:34.5')
  })

  it('writes a committed value the way the benchmark reads it', () => {
    expect(formatNumericValue(424_200, 'en', SPLIT)).toBe('7:04.2')
    expect(formatNumericValue(112_400, 'en', SPLIT)).toBe('1:52.4')
  })

  it('round-trips every tenth the mask can express', () => {
    for (let tenths = 0; tenths <= 5999; tenths += 1) {
      const value = tenths * 100
      const reopened = beginNumericEditing(value, SPLIT)

      expect(commitNumericEditing(reopened, SPLIT)).toBe(value)
    }
  })
})

describe('options', () => {
  it('has no decimal key on a sexagesimal mask, whatever it is asked for', () => {
    const resolved = resolveNumericInputOptions({ ...DURATION, maximumFractionDigits: 2 })

    expect(resolved.maximumFractionDigits).toBe(0)
    expect(enter(0, '43.07', DURATION).text).toBe('4307')
  })

  it('clamps a value into range on commit', () => {
    expect(commitNumericEditing({ text: '9999999', fresh: false }, DISTANCE)).toBe(99_999)
    expect(commitNumericEditing({ text: '', fresh: true }, DURATION)).toBe(0)
  })
})

describe('presets', () => {
  it('keeps only the offered values that the field can hold', () => {
    expect(normalizeNumericPresets([2000, 5000, 250_000, -1], DISTANCE)).toEqual([2000, 5000])
  })

  it('generates a window around the current value when none are offered', () => {
    expect(generateNumericPresets(24, { ...RATE, presetStep: 2, presetRange: 4 })).toEqual([
      20, 22, 24, 26, 28,
    ])
  })

  it('starts a fresh draft, so the next digit replaces the preset', () => {
    const picked = updateNumericEditing(
      beginNumericEditing(0, DISTANCE),
      { type: 'preset', value: 5000 },
      DISTANCE,
    )

    expect(picked).toEqual({ text: '5000', fresh: true })
    expect(committed(5000, '2', DISTANCE)).toBe(2)
  })
})

describe('a physical keyboard', () => {
  it('maps the keys a pad has and ignores the rest', () => {
    expect(numericInputKeyboardCommand('7')).toEqual({ type: 'digit', digit: '7' })
    expect(numericInputKeyboardCommand(',')).toEqual({ type: 'decimal' })
    expect(numericInputKeyboardCommand('Backspace')).toEqual({ type: 'backspace' })
    expect(numericInputKeyboardCommand('Enter')).toEqual({ type: 'confirm' })
    expect(numericInputKeyboardCommand('a')).toBeUndefined()
  })
})
