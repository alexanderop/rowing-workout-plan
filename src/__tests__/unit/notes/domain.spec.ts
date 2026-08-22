import { describe, expect, it } from '@effect/vitest'
import { Clock, Effect, Schema } from 'effect'
import { FastCheck, TestClock } from 'effect/testing'
import type { Note } from '@/db'
import { StoredDbNote, toNote } from '@/db/converters'
import { noteAge, sortNotes } from '@/features/notes/domain'

function makeNote(overrides: Partial<Note> & Pick<Note, 'id'>): Note {
  return {
    title: overrides.id,
    body: '',
    pinned: false,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  }
}

describe('sortNotes', () => {
  it('puts pinned notes first, each group newest-updated first', () => {
    const notes = [
      makeNote({ id: 'old', updatedAt: 1 }),
      makeNote({ id: 'pinned-old', pinned: true, updatedAt: 2 }),
      makeNote({ id: 'new', updatedAt: 9 }),
      makeNote({ id: 'pinned-new', pinned: true, updatedAt: 5 }),
    ]

    expect(sortNotes(notes).map((note) => note.id)).toEqual([
      'pinned-new',
      'pinned-old',
      'new',
      'old',
    ])
  })

  it('does not mutate its input', () => {
    const notes = [makeNote({ id: 'b', updatedAt: 1 }), makeNote({ id: 'a', updatedAt: 2 })]
    const snapshot = [...notes]

    sortNotes(notes)

    expect(notes).toEqual(snapshot)
  })

  /**
   * The example above pins one hand-picked ordering; this property pins the
   * *definition* of the order for every input. Notes are generated from the
   * same schema the store decodes with (`StoredDbNote` → `toNote`), so the
   * generator can never drift from what a note actually is.
   */
  it.prop(
    'orders any notes pinned-first, newest-updated within each group, losing nothing',
    { rows: Schema.toArbitrary(Schema.Array(StoredDbNote)) },
    ({ rows }) => {
      const notes = rows.map(toNote)
      const sorted = sortNotes(notes)

      // A reordering only: same notes in, same notes out.
      const canonical = (list: ReadonlyArray<Note>) => list.map((n) => JSON.stringify(n)).sort()
      expect(canonical(sorted)).toEqual(canonical(notes))

      sorted.slice(1).forEach((next, i) => {
        // SAFETY: `i` indexes `sorted.slice(1)`, so it is one short of
        // `sorted`'s last index — `sorted[i]` is always in bounds. The
        // assertion only removes the `| undefined` noUncheckedIndexedAccess
        // adds.
        const prev = sorted[i] as Note

        // An unpinned note never precedes a pinned one…
        expect(prev.pinned || !next.pinned).toBe(true)
        // …and within a group, updatedAt never increases.
        if (prev.pinned === next.pinned) {
          expect(prev.updatedAt).toBeGreaterThanOrEqual(next.updatedAt)
        }
      })
    },
  )
})

/**
 * This is what reading time from the Clock service buys: `it.effect` swaps
 * in TestClock, so every bucket boundary is pinned by adjusting time
 * forward — no vi.useFakeTimers, no Date mocking, no flaky "almost 60s"
 * sleeps. The edit happens at the TestClock's current instant; the
 * assertions then travel to exactly the moment under test.
 */
describe('noteAge', () => {
  it.effect('stays "just now" for the whole first minute', () =>
    Effect.gen(function* () {
      const editedAt = yield* Clock.currentTimeMillis

      yield* TestClock.adjust('59 seconds')

      expect(yield* noteAge(editedAt)).toEqual({ unit: 'justNow' })
    }),
  )

  it.effect('ticks over to minutes at exactly 60 seconds', () =>
    Effect.gen(function* () {
      const editedAt = yield* Clock.currentTimeMillis

      yield* TestClock.adjust('60 seconds')

      expect(yield* noteAge(editedAt)).toEqual({ unit: 'minutes', count: 1 })
    }),
  )

  /**
   * Every bucket edge belongs to the *larger* unit — 60 minutes is one hour,
   * not "60 minutes ago". Each boundary needs its exact moment pinned, not a
   * value from the middle of the bucket: `elapsed < HOUR` and `elapsed <= HOUR`
   * agree everywhere except at the boundary itself, so a test at 90 minutes
   * passes under both and says nothing about which one is written.
   */
  it.effect('ticks over to hours at exactly 60 minutes', () =>
    Effect.gen(function* () {
      const editedAt = yield* Clock.currentTimeMillis

      yield* TestClock.adjust('60 minutes')

      expect(yield* noteAge(editedAt)).toEqual({ unit: 'hours', count: 1 })
    }),
  )

  it.effect('reports whole hours once minutes run out', () =>
    Effect.gen(function* () {
      const editedAt = yield* Clock.currentTimeMillis

      yield* TestClock.adjust('90 minutes')

      expect(yield* noteAge(editedAt)).toEqual({ unit: 'hours', count: 1 })
    }),
  )

  it.effect('ticks over to days at exactly 24 hours', () =>
    Effect.gen(function* () {
      const editedAt = yield* Clock.currentTimeMillis

      yield* TestClock.adjust('24 hours')

      expect(yield* noteAge(editedAt)).toEqual({ unit: 'days', count: 1 })
    }),
  )

  it.effect('reports days from 24 hours on', () =>
    Effect.gen(function* () {
      const editedAt = yield* Clock.currentTimeMillis

      yield* TestClock.adjust('3 days')

      expect(yield* noteAge(editedAt)).toEqual({ unit: 'days', count: 3 })
    }),
  )

  it.effect('clamps a future updatedAt (clock skew, imported backup) to "just now"', () =>
    Effect.gen(function* () {
      const now = yield* Clock.currentTimeMillis

      expect(yield* noteAge(now + 5 * 60_000)).toEqual({ unit: 'justNow' })
    }),
  )

  // The examples pin each bucket boundary; the property pins what the UI
  // relies on for *every* timestamp, past or future: a bucketed age never
  // carries a zero or negative count — "0 minutes ago" is not a thing.
  it.effect.prop(
    'never reports a zero or negative count, whatever the timestamp',
    { updatedAt: FastCheck.integer() },
    ({ updatedAt }) =>
      Effect.gen(function* () {
        const age = yield* noteAge(updatedAt)

        if (age.unit !== 'justNow') {
          expect(age.count).toBeGreaterThanOrEqual(1)
        }
      }),
  )
})
