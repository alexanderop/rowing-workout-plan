import { describe, expect, it } from '@effect/vitest'
import { Effect, Result, Schema } from 'effect'
import { FastCheck } from 'effect/testing'
import {
  decodeNoteDraft,
  decodeStoredNote,
  isNoteDraft,
  StoredDbNote,
  toNote,
} from '@/db/converters'

describe('toNote', () => {
  it('normalizes a v1-era row (no pinned, no updatedAt)', () => {
    const note = toNote({ id: 'a', title: 'Old row', body: '', createdAt: 111 })

    expect(note).toEqual({
      id: 'a',
      title: 'Old row',
      body: '',
      pinned: false,
      createdAt: 111,
      updatedAt: 111,
    })
  })

  it('passes a complete v2 row through unchanged', () => {
    const stored = {
      id: 'b',
      title: 'Current row',
      body: 'text',
      pinned: true,
      createdAt: 100,
      updatedAt: 200,
    }

    expect(toNote(stored)).toEqual(stored)
  })
})

/**
 * The schema is what stands between an untrusted store and the domain. It has
 * to accept every shape this app has ever written — that is what keeps old
 * data readable — while rejecting anything that is damaged rather than merely
 * old, because a row the repository cannot trust must not be rendered as a
 * note and then written back into the user's next backup.
 */
describe('decodeStoredNote', () => {
  it.effect('accepts a complete v2 row', () =>
    Effect.gen(function* () {
      const row = yield* decodeStoredNote({
        id: 'a',
        title: 'Hello',
        body: 'world',
        pinned: true,
        createdAt: 1,
        updatedAt: 2,
      })

      expect(row.id).toBe('a')
    }),
  )

  it.effect('accepts a v1 row missing pinned and updatedAt', () =>
    Effect.gen(function* () {
      const row = yield* decodeStoredNote({ id: 'a', title: 'Old', body: '', createdAt: 1 })

      expect(row.pinned).toBeUndefined()
      expect(toNote(row).updatedAt).toBe(1)
    }),
  )

  it.effect('rejects a row whose title is not a string', () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        decodeStoredNote({ id: 'a', title: 42, body: '', createdAt: 1 }),
      )

      expect(error.message).not.toHaveLength(0)
    }),
  )

  it.effect('rejects a row with an empty id', () =>
    Effect.gen(function* () {
      yield* Effect.flip(decodeStoredNote({ id: '', title: 'x', body: '', createdAt: 1 }))
    }),
  )

  /**
   * NaN survives every `typeof x === 'number'` check there is, so a timestamp
   * field typed as a bare number lets one through — and a NaN `updatedAt`
   * compares false against everything, which puts the note in an arbitrary
   * place in the list and renders its age as "NaN days ago". The read path is
   * the only place that can stop it.
   */
  it.effect('rejects timestamps that are not a real point in time', () =>
    Effect.forEach([Number.NaN, Number.POSITIVE_INFINITY, -1, 1.5], (updatedAt) =>
      Effect.flip(decodeStoredNote({ id: 'a', title: 'x', body: '', createdAt: 1, updatedAt })),
    ),
  )

  it.effect('applies the same rule to createdAt', () =>
    Effect.gen(function* () {
      yield* Effect.flip(decodeStoredNote({ id: 'a', title: 'x', body: '', createdAt: Number.NaN }))
    }),
  )

  it.effect('rejects a row that is missing a required field', () =>
    Effect.gen(function* () {
      yield* Effect.flip(decodeStoredNote({ id: 'a', title: 'x', createdAt: 1 }))
    }),
  )

  it.effect('rejects a value that is not an object at all', () =>
    Effect.gen(function* () {
      yield* Effect.flip(decodeStoredNote(null))
    }),
  )
})

/**
 * The same rule the repository enforces, exposed as a predicate so a form can
 * disable Save without restating it. If these two ever disagree, the form and
 * the repository disagree about what a note is.
 */
describe('isNoteDraft', () => {
  it('accepts a draft with a title', () => {
    expect(isNoteDraft({ title: 'Something', body: '' })).toBe(true)
  })

  it('accepts a title that still has whitespace around it', () => {
    // The schema trims, so the form must not have to. A user mid-word with a
    // trailing space would otherwise see Save flicker off.
    expect(isNoteDraft({ title: '  Groceries ', body: '' })).toBe(true)
  })

  it('rejects an empty title', () => {
    expect(isNoteDraft({ title: '', body: 'body without a title' })).toBe(false)
  })

  it('rejects a title of nothing but whitespace', () => {
    expect(isNoteDraft({ title: '   ', body: '' })).toBe(false)
  })
})

describe('decodeNoteDraft', () => {
  it.effect('trims both fields', () =>
    Effect.gen(function* () {
      const draft = yield* decodeNoteDraft({ title: '  Groceries  ', body: '  milk\n' })

      expect(draft).toEqual({ title: 'Groceries', body: 'milk' })
    }),
  )

  it.effect('rejects a whitespace-only title once trimmed', () =>
    Effect.gen(function* () {
      yield* Effect.flip(decodeNoteDraft({ title: '\t  ', body: 'orphan' }))
    }),
  )
})

/**
 * Property-based tests. `Schema.toArbitrary` turns the same `StoredDbNote`
 * that validates rows into a fast-check generator for them — a hundred random
 * rows per run, v1 shapes (missing pinned/updatedAt) and v2 shapes alike,
 * with no hand-written fixtures to drift out of date. The examples above pin
 * the exact behavior at each known boundary; the properties here say what
 * must hold for *every* row.
 */
const storedRow = Schema.toArbitrary(StoredDbNote)

describe('toNote properties', () => {
  it.prop(
    'normalizes any decodable row to a complete note',
    { stored: storedRow },
    ({ stored }) => {
      const note = toNote(stored)

      expect(note.pinned).toBe(stored.pinned ?? false)
      expect(note.updatedAt).toBe(stored.updatedAt ?? stored.createdAt)
      expect(note.createdAt).toBe(stored.createdAt)
    },
  )

  it.effect.prop(
    'produces rows the store schema accepts back — normalization is idempotent',
    { stored: storedRow },
    ({ stored }) =>
      Effect.gen(function* () {
        // Whatever toNote emits eventually lands back in IndexedDB and in the
        // user's next backup, so it must itself decode — and normalizing an
        // already-normal row must change nothing.
        const note = toNote(stored)
        const reread = yield* decodeStoredNote(note)

        expect(toNote(reread)).toEqual(note)
      }),
  )
})

describe('draft validation properties', () => {
  it.effect.prop(
    'accepts exactly the drafts whose trimmed title is non-empty, and isNoteDraft agrees',
    { title: FastCheck.string(), body: FastCheck.string() },
    ({ title, body }) =>
      Effect.gen(function* () {
        const decoded = yield* Effect.result(decodeNoteDraft({ title, body }))

        // The domain rule, stated independently of the schema that enforces it.
        expect(Result.isSuccess(decoded)).toBe(title.trim().length > 0)
        // The form guard may never disagree with the write path.
        expect(isNoteDraft({ title, body })).toBe(Result.isSuccess(decoded))

        if (Result.isSuccess(decoded)) {
          expect(decoded.success).toEqual({ title: title.trim(), body: body.trim() })
        }
      }),
  )
})
