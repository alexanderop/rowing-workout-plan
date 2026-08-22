import { describe, expect, it } from '@effect/vitest'

import { SESSION_KINDS } from '@/features/training/types'

/**
 * `types.ts` is mostly types, which compile away and cannot be asserted at
 * runtime. The one thing that does not is `SESSION_KINDS` — and it is load
 * bearing, because the `SessionKind` union is derived from it. Pin the list
 * and the union is pinned with it; let it drift and the catalogue's
 * "every kind is a real kind" invariant starts grading itself.
 */
describe('SESSION_KINDS', () => {
  it('is the five kinds, in the order the union derives from', () => {
    expect(SESSION_KINDS).toEqual(['steady', 'shortRest', 'longRest', 'pacedTwoK', 'distancePiece'])
  })

  it('has no duplicates', () => {
    expect(new Set(SESSION_KINDS).size).toBe(SESSION_KINDS.length)
  })
})
