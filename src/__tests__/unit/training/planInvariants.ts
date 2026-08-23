import { expect, it } from '@effect/vitest'

import { SESSION_KINDS } from '@/features/training/types'
import type { Plan, PlanSession } from '@/features/training/types'

/**
 * What is true of *any* plan, as a block of `it`s a plan's `describe` adopts.
 *
 * The catalogue spec used to hold this and the pete5k family's numbers in one
 * file, with a header explaining the difference and nothing enforcing it — so
 * "twelve weeks" and "a three-week rotation" were asserted over every plan,
 * and a differently-shaped plan would have failed them for being different
 * rather than for being wrong. This file is the half that generalises. The
 * literals live in `pete5k.spec.ts` and `pete5kLite.spec.ts`, where the plan
 * they were transcribed from is.
 *
 * Checked exhaustively rather than with `it.prop`: a plan is finite, fixed and
 * small, so enumerating it proves what sampling can only suggest.
 *
 * The rule for adding one: if a plan could be *correct* and fail it, it is a
 * pin and belongs beside its plan. Weeks, rotation length, a steady floor and
 * whether the reps lengthen are all pins by that test.
 */

/** Every session of a plan, in order. */
export const sessionsOf = (plan: Plan): readonly PlanSession[] =>
  plan.weeks.flatMap((week) => week.sessions)

/** A session minus its id — what the rotation repeats. */
const withoutId = ({ id: _id, ...body }: PlanSession) => body

const INTERVAL_KINDS = new Set<string>(['shortRest', 'longRest', 'pacedTwoK'])

export function assertPlanInvariants(plan: Plan): void {
  const sessions = sessionsOf(plan)

  it('indexes its weeks contiguously from 1', () => {
    expect(plan.weeks.map((week) => week.index)).toEqual(
      Array.from({ length: plan.weeks.length }, (_unused, index) => index + 1),
    )
  })

  it('runs a rotation of at least one week, no longer than the plan', () => {
    expect(Number.isInteger(plan.rotationWeeks)).toBe(true)
    expect(plan.rotationWeeks).toBeGreaterThan(0)
    expect(plan.rotationWeeks).toBeLessThanOrEqual(plan.weeks.length)
  })

  it('gives every session a unique, positional id', () => {
    const ids = sessions.map((session) => session.id)
    expect(new Set(ids).size).toBe(ids.length)

    for (const week of plan.weeks)
      for (const [position, session] of week.sessions.entries())
        expect(session.id).toBe(`${plan.id}-w${week.index}-s${position + 1}`)
  })

  it('uses only kinds that exist', () => {
    for (const session of sessions) expect(SESSION_KINDS).toContain(session.kind)
  })

  it('gives every interval session positive reps, distance and rest', () => {
    for (const session of sessions.filter((candidate) => INTERVAL_KINDS.has(candidate.kind))) {
      expect(session.reps).toBeGreaterThan(1)
      expect(session.repDistanceM).toBeGreaterThan(0)
      expect(session.restMs).toBeGreaterThan(0)
    }
  })

  it('gives every steady row a floor and no rep structure', () => {
    // How high the floor is belongs to the plan — 10k is pete5k's number, not
    // a law of steady rowing. That there *is* one is the invariant: a steady
    // row with no minimum is a row with nothing to do.
    for (const session of sessions.filter((candidate) => candidate.kind === 'steady')) {
      expect(session.minDistanceM).toBeGreaterThan(0)
      expect(session.reps).toBeUndefined()
      expect(session.repDistanceM).toBeUndefined()
      expect(session.restMs).toBeUndefined()
      expect(session.distanceM).toBeUndefined()
    }
  })

  it('repeats itself every rotation', () => {
    // Two weeks a rotation apart sit at the same slot, so their sessions are
    // identical but for the ids. This is what makes the weeks a plan does not
    // spell out follow from the ones it does.
    //
    // The plan's last week is exempt, and only the last: a taper is a week
    // that deliberately leaves the rotation, and it is always the final one —
    // an override anywhere else still fails here, which is the point.
    const { rotationWeeks, weeks } = plan

    for (let week = 1; week + rotationWeeks <= weeks.length - 1; week += 1) {
      const here = weeks[week - 1].sessions.map(withoutId)
      const next = weeks[week + rotationWeeks - 1].sessions.map(withoutId)
      expect(next, `week ${week} and week ${week + rotationWeeks}`).toEqual(here)
    }
  })
}
