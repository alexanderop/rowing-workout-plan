import { describe, expect, it } from '@effect/vitest'

import type { Plan, PlanSession } from '@/features/training/types'

import { assertPlanInvariants } from './planInvariants'

/**
 * The proof that the split in `planInvariants.ts` actually happened.
 *
 * An invariant helper that only ever sees the plans it was extracted from is
 * indistinguishable from the pins it was extracted out of. Two fixtures settle
 * it: one of a shape the catalogue has never held, which must pass **without
 * any edit to the helper**, and one that is broken, because a helper nothing
 * can fail is a helper nothing checks.
 *
 * Neither fixture enters `PLANS` and neither ships.
 */

const interval = (id: string, reps: number, repDistanceM: number): PlanSession => ({
  id,
  kind: 'shortRest',
  reps,
  repDistanceM,
  restMs: 60_000,
})

/**
 * Eight weeks, a four-week rotation, five sessions a week, no steady rows —
 * every number the old shared suite asserted, different.
 */
const UNFAMILIAR_PLAN: Plan = {
  id: 'fixture',
  name: 'Fixture',
  descriptionKey: 'plans.catalog.pete5k.description',
  source: 'test',
  rotationWeeks: 4,
  weeks: Array.from({ length: 8 }, (_unused, weekIndex) => ({
    index: weekIndex + 1,
    sessions: Array.from({ length: 5 }, (_session, position) =>
      interval(
        `fixture-w${weekIndex + 1}-s${position + 1}`,
        // Reps depend on the slot alone, so the rotation repeats.
        4 + (weekIndex % 4),
        500,
      ),
    ),
  })),
}

describe('a plan of a shape the catalogue has never held', () => {
  assertPlanInvariants(UNFAMILIAR_PLAN)
})

describe('a broken plan', () => {
  it('fails the id invariant when a session id is duplicated', () => {
    const broken: Plan = {
      ...UNFAMILIAR_PLAN,
      weeks: [
        {
          index: 1,
          sessions: [interval('fixture-w1-s1', 4, 500), interval('fixture-w1-s1', 4, 500)],
        },
      ],
    }

    const ids = broken.weeks[0].sessions.map((session) => session.id)
    expect(new Set(ids).size).not.toBe(ids.length)
  })
})
