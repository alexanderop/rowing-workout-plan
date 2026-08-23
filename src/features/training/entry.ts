/** The four manual numbers the training feature accepts. */
export type EntryKind = 'metres' | 'duration' | 'split' | 'rate'

const DIGIT_CEILINGS = {
  metres: 5,
  duration: 4,
  split: 5,
  rate: 2,
} satisfies Readonly<Record<EntryKind, number>>

/** The zeros visible in a mask are presentation, never part of its buffer. */
function withoutLeadingZeros(digits: string): string {
  return digits.replace(/^0+/, '')
}

function durationText(digits: string): string {
  const seconds = digits.slice(-2).padStart(2, '0')
  const minutes = digits.slice(0, -2) || '0'

  return `${minutes}:${seconds}`
}

function splitText(digits: string): string {
  const tenths = digits.slice(-1)
  const seconds = digits.slice(-3, -1).padStart(2, '0')
  const minutes = digits.slice(0, -3) || '0'

  return `${minutes}:${seconds}.${tenths}`
}

/** Digits to the value visible in the field. */
export function formatEntry(
  kind: EntryKind,
  digits: string,
  options: { readonly groupSeparator?: string } = {},
): string {
  const canonical = canonicalEntry(kind, digits)
  if (kind !== 'metres' || !options.groupSeparator) return canonical

  return canonical.replace(/\B(?=(\d{3})+(?!\d))/g, options.groupSeparator)
}

/** Digits to the text accepted by the training feature's existing parsers. */
export function canonicalEntry(kind: EntryKind, digits: string): string {
  const normalized = withoutLeadingZeros(digits)
  if (normalized === '') return ''
  if (kind === 'duration') return durationText(normalized)
  if (kind === 'split') return splitText(normalized)

  return normalized
}

/** Existing field text back to the pad's digit buffer. */
export function digitsFrom(_kind: EntryKind, text: string): string {
  return withoutLeadingZeros(text.replace(/\D/g, ''))
}

/** Append one digit when it fits the mask's ceiling. Parsing stays downstream. */
export function pushDigit(kind: EntryKind, digits: string, digit: string): string {
  if (!/^\d$/.test(digit)) return digits
  if (digits === '' && digit === '0') return digits

  const candidate = `${digits}${digit}`
  if (candidate.length > DIGIT_CEILINGS[kind]) return digits

  return candidate
}

/** Remove the digit furthest to the right. */
export function popDigit(digits: string): string {
  return digits.slice(0, -1)
}
