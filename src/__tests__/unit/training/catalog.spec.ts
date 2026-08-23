import { describe, expect, it } from '@effect/vitest'

import { PLANS } from '@/features/training/catalog'

import { assertPlanInvariants, sessionsOf } from './planInvariants'

/**
 * The catalogue as a whole, and every plan in it held to the invariants.
 *
 * The numbers — 71, 12, 36, week 3 session by session — are *not* here. They
 * are transcription pins, true of one plan and meaningless about the next, so
 * each plan keeps its own beside it (`pete5k.spec.ts`, `pete5kLite.spec.ts`).
 * A plan with no pin file is a plan nobody transcribed carefully.
 *
 * What is left is the part a third plan inherits by being added to `PLANS`:
 * see `planInvariants.ts` for the rule that decides which side a case lands on.
 */
describe.each(PLANS)('$name', (plan) => {
  assertPlanInvariants(plan)
})

describe('PLANS', () => {
  it('lists at least one plan', () => {
    // `describe.each` over an empty array is zero tests and no failure, so
    // every invariant above would silently stop running if this ever emptied.
    expect(PLANS.length).toBeGreaterThan(0)
  })

  it('gives every plan a distinct id', () => {
    expect(new Set(PLANS.map((plan) => plan.id)).size).toBe(PLANS.length)
  })

  it('gives every plan a distinct description key', () => {
    expect(new Set(PLANS.map((plan) => plan.descriptionKey)).size).toBe(PLANS.length)
  })

  it('never repeats a session id across plans', () => {
    // Ids are positional and plan-prefixed, so this holds as long as the ids
    // are — and a workout in the log points at exactly one plan's session.
    const ids = PLANS.flatMap((plan) => sessionsOf(plan).map((session) => session.id))
    expect(new Set(ids).size).toBe(ids.length)
  })
})
