import { describe, expect, it } from '@effect/vitest'
import { Result } from 'effect'
import { FastCheck } from 'effect/testing'
import {
  canonicalEntry,
  digitsFrom,
  formatEntry,
  popDigit,
  pushDigit,
  type EntryKind,
} from '@/features/training/entry'
import { parseDuration } from '@/features/training/history'

const ENTRY_KINDS: ReadonlyArray<EntryKind> = ['metres', 'duration', 'split', 'rate']

/** Produce only buffers a user can reach by pressing the pad. */
function entered(kind: EntryKind, presses: ReadonlyArray<number>): string {
  return presses.reduce((digits, press) => pushDigit(kind, digits, String(press)), '')
}

describe('formatEntry', () => {
  it.each([
    ['duration', '4307', '43:07'],
    ['duration', '7', '0:07'],
    ['duration', '437', '4:37'],
    ['split', '7042', '7:04.2'],
    ['split', '2', '0:00.2'],
    ['rate', '24', '24'],
  ] as const)('formats %s digits %p as %p', (kind, digits, expected) => {
    expect(formatEntry(kind, digits)).toBe(expected)
  })

  it('groups metres only with the separator its caller supplies', () => {
    expect(formatEntry('metres', '10000')).toBe('10000')
    expect(formatEntry('metres', '10000', { groupSeparator: ',' })).toBe('10,000')
    expect(formatEntry('metres', '10000', { groupSeparator: '.' })).toBe('10.000')
    expect(formatEntry('metres', '1000000', { groupSeparator: ',' })).toBe('1,000,000')
    expect(formatEntry('rate', '10000', { groupSeparator: ',' })).toBe('10000')
  })

  it.each(ENTRY_KINDS)('leaves an empty %s empty', (kind) => {
    expect(formatEntry(kind, '')).toBe('')
    expect(canonicalEntry(kind, '')).toBe('')
  })
})

describe('digitsFrom', () => {
  it.each([
    ['duration', '43:07', '4307'],
    ['duration', '0:07', '7'],
    ['split', '7:04.2', '7042'],
    ['metres', '10,000', '10000'],
    ['metres', '10.000', '10000'],
    ['rate', '24', '24'],
  ] as const)('recovers %s digits from %p', (kind, text, expected) => {
    expect(digitsFrom(kind, text)).toBe(expected)
  })
})

describe('key handling', () => {
  it.each([
    ['duration', [6, 0, 0], '600', '6:00'],
    ['duration', [5, 9, 5, 9], '5959', '59:59'],
    ['split', [7, 0, 4, 2], '7042', '7:04.2'],
  ] as const)(
    'keeps a valid %s reachable through every intermediate key',
    (kind, presses, digits, text) => {
      expect(entered(kind, presses)).toBe(digits)
      expect(canonicalEntry(kind, digits)).toBe(text)
    },
  )

  it('leaves transient time text to the existing parser', () => {
    const transient = canonicalEntry('duration', entered('duration', [6, 0]))

    expect(transient).toBe('0:60')
    expect(Result.isFailure(parseDuration(transient))).toBe(true)
  })

  it.each([
    ['metres', '12345'],
    ['duration', '1234'],
    ['split', '12345'],
    ['rate', '12'],
  ] as const)('holds %s at its digit ceiling', (kind, full) => {
    expect(pushDigit(kind, full, '9')).toBe(full)
  })

  it.each([
    ['metres', '1234', '5'],
    ['duration', '123', '4'],
    ['split', '1234', '5'],
    ['rate', '1', '2'],
  ] as const)('accepts the final digit allowed for %s', (kind, before, digit) => {
    expect(pushDigit(kind, before, digit)).toBe(`${before}${digit}`)
  })

  it.each(ENTRY_KINDS)('refuses a leading zero for %s', (kind) => {
    expect(pushDigit(kind, '', '0')).toBe('')
  })

  it('refuses anything other than one digit', () => {
    expect(pushDigit('duration', '43', '00')).toBe('43')
    expect(pushDigit('duration', '43', ':')).toBe('43')
  })

  it('removes the rightmost digit and stops cleanly at empty', () => {
    expect(popDigit('4307')).toBe('430')
    expect(popDigit('')).toBe('')
  })
})

describe('the parser contract', () => {
  const PRESSES = FastCheck.array(FastCheck.integer({ min: 0, max: 9 }), {
    minLength: 1,
    maxLength: 12,
  })

  it.prop(
    'round-trips every value the pad can emit',
    [FastCheck.constantFrom(...ENTRY_KINDS), PRESSES],
    ([kind, presses]) => {
      const digits = entered(kind, presses)
      const canonical = canonicalEntry(kind, digits)

      expect(canonicalEntry(kind, digitsFrom(kind, canonical))).toBe(canonical)
    },
  )

  it.prop(
    'can enter every whole-second duration within the four-digit mask',
    [FastCheck.integer({ min: 0, max: 99 }), FastCheck.integer({ min: 0, max: 59 })],
    ([minutes, seconds]) => {
      FastCheck.pre(minutes > 0 || seconds > 0)
      const text = `${minutes}:${String(seconds).padStart(2, '0')}`
      const digits = digitsFrom('duration', text)
      const throughPad = entered('duration', [...digits].map(Number))

      expect(canonicalEntry('duration', throughPad)).toBe(text)
      expect(Result.getOrThrow(parseDuration(text))).toBe((minutes * 60 + seconds) * 1000)
    },
  )
})
