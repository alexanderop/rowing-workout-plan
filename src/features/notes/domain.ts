import { Clock, Effect } from 'effect'
import type { Note } from '@/db'

/** Pinned notes first, then most recently updated. Pure — unit-tier tested. */
export function sortNotes(notes: ReadonlyArray<Note>): Array<Note> {
  return notes.toSorted((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    return b.updatedAt - a.updatedAt
  })
}

/** How long ago a note was edited, bucketed for display. Data, not a string — the component maps it to an i18n message. */
export type NoteAge =
  | { unit: 'justNow' }
  | { unit: 'minutes'; count: number }
  | { unit: 'hours'; count: number }
  | { unit: 'days'; count: number }

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/**
 * Reads "now" from Effect's Clock service instead of Date.now(), so the same
 * code runs against the real clock in the app and against TestClock in unit
 * tests — every bucket boundary is testable by adjusting time, no fake
 * timers involved. A future `updatedAt` (clock skew, imported backup) clamps
 * to "just now" rather than counting negative.
 */
// Stryker disable next-line StringLiteral: the span name is observability, not behavior — no unit test should assert it
export const noteAge = Effect.fn('Notes.noteAge')(function* (updatedAt: number) {
  const now = yield* Clock.currentTimeMillis
  const elapsed = Math.max(0, now - updatedAt)
  if (elapsed < MINUTE) return { unit: 'justNow' } as const satisfies NoteAge
  if (elapsed < HOUR)
    return { unit: 'minutes', count: Math.floor(elapsed / MINUTE) } as const satisfies NoteAge
  if (elapsed < DAY)
    return { unit: 'hours', count: Math.floor(elapsed / HOUR) } as const satisfies NoteAge
  return { unit: 'days', count: Math.floor(elapsed / DAY) } as const satisfies NoteAge
})
