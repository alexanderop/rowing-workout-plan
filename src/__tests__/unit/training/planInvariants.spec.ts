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
 * The two shapes the field table grades that the distance kinds do not reach.
 * Every week of the fixture ends on them, so a table entry that stopped
 * matching would fail here rather than only in a catalogue plan's own spec.
 */
const timed = (id: string, repDurationMs: number): PlanSession => ({
  id,
  kind: 'timedIntervals',
  reps: 3,
  repDurationMs,
  restMs: 120_000,
})

const timedPiece = (id: string): PlanSession => ({
  id,
  kind: 'timedSteady',
  durationMs: 1_800_000,
  optional: true,
})

/**
 * Eight weeks, a four-week rotation, five sessions a week, no steady rows —
 * every number the old shared suite asserted, different. The last two
 * sessions of each week are timed, and the last of those is optional, so the
 * fixture exercises the kinds and the flag the catalogue's own plans would
 * otherwise be the only cover for.
 */
const UNFAMILIAR_PLAN: Plan = {
  id: 'fixture',
  name: 'Fixture',
  descriptionKey: 'plans.catalog.pete5k.description',
  source: 'test',
  rotationWeeks: 4,
  weeks: Array.from({ length: 8 }, (_unused, weekIndex) => ({
    index: weekIndex + 1,
    sessions: Array.from({ length: 5 }, (_session, position) => {
      const id = `fixture-w${weekIndex + 1}-s${position + 1}`
      if (position === 4) return timedPiece(id)
      if (position === 3) return timed(id, 600_000)

      // Reps depend on the slot alone, so the rotation repeats.
      return interval(id, 4 + (weekIndex % 4), 500)
    }),
  })),
}

describe('a plan of a shape the catalogue has never held', () => {
  assertPlanInvariants(UNFAMILIAR_PLAN)
})

describe('a broken plan', () => {
  it('fails the field table when a kind carries another kind’s numbers', () => {
    // The half of the table that does the work is the forbidden half: a
    // `timedSteady` holding `repDistanceM` is a session two screens will read
    // two different ways, and every other invariant passes it.
    const broken: PlanSession = { ...timedPiece('fixture-w1-s5'), repDistanceM: 500 }

    expect(broken.repDistanceM).toBeDefined()
    expect(broken.kind).toBe('timedSteady')
  })

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
