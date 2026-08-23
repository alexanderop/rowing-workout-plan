import { describe, expect, it } from '@effect/vitest'

import { SESSION_KINDS } from '@/features/training/types'
import type { Plan } from '@/features/training/types'

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

/**
 * `descriptionKey` is a template literal type over the catalogue's own message
 * keys, which is a compile-time claim and therefore untestable at runtime —
 * except through `@ts-expect-error`, which fails the build if the line it
 * guards *does* compile. Without the directive these cases assert nothing:
 * they are two object literals nobody reads.
 *
 * The doc comment on `Plan` claimed "a plan added to the catalogue without a
 * description does not compile" for as long as the field was `string`. This is
 * the assertion that makes it true.
 */
describe('PlanDescriptionKey', () => {
  const IDENTITY = { id: 'x', name: 'X', source: 'test', rotationWeeks: 1, weeks: [] } as const

  it('accepts a key the message catalogue actually has', () => {
    const plan: Plan = { ...IDENTITY, descriptionKey: 'plans.catalog.pete5k.description' }
    expect(plan.descriptionKey).toBe('plans.catalog.pete5k.description')
  })

  it('refuses a key naming a catalogue entry that does not exist', () => {
    // @ts-expect-error `plans.catalog.notAPlan` is not in en.ts, so this is
    // the compile error that stops a plan shipping with no description.
    const plan: Plan = { ...IDENTITY, descriptionKey: 'plans.catalog.notAPlan.description' }
    expect(plan.descriptionKey).toBe('plans.catalog.notAPlan.description')
  })

  it('refuses a key that is not a plan description at all', () => {
    // @ts-expect-error the shape is fixed too, not just the middle segment.
    const plan: Plan = { ...IDENTITY, descriptionKey: 'plans.catalog.pete5k.name' }
    expect(plan.descriptionKey).toBe('plans.catalog.pete5k.name')
  })
})
