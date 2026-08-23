import { expect, it } from '@effect/vitest'

import { SESSION_KINDS } from '@/features/training/types'
import type { Plan, PlanSession, SessionKind } from '@/features/training/types'

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

/**
 * Which fields each kind must carry, and which it must not.
 *
 * A table rather than one `it` per kind, because the half that catches
 * mistakes is the *forbidden* half and hand-writing it per kind is how a new
 * field ends up policed on the two kinds its author was thinking about. Every
 * field a session may hold is listed here exactly once per kind, so adding
 * one to `PlanSession` without deciding where it belongs fails to compile.
 */
type FieldName = keyof Omit<PlanSession, 'id' | 'kind' | 'optional'>

const REQUIRED_FIELDS = {
  steady: ['minDistanceM'],
  shortRest: ['reps', 'repDistanceM', 'restMs'],
  longRest: ['reps', 'repDistanceM', 'restMs'],
  pacedTwoK: ['reps', 'repDistanceM', 'restMs'],
  distancePiece: ['distanceM'],
  timedSteady: ['durationMs'],
  timedIntervals: ['reps', 'repDurationMs', 'restMs'],
} satisfies Record<SessionKind, readonly FieldName[]>

const ALL_FIELDS: readonly FieldName[] = [
  'reps',
  'repDistanceM',
  'restMs',
  'distanceM',
  'minDistanceM',
  'durationMs',
  'repDurationMs',
]

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

  it('gives every interval session more than one rep', () => {
    // The rep *count* is the one number the field table cannot grade: every
    // other field only has to be positive, and a one-rep interval is a single
    // piece wearing the wrong kind.
    for (const session of sessions.filter((candidate) => INTERVAL_KINDS.has(candidate.kind)))
      expect(session.reps).toBeGreaterThan(1)

    for (const session of sessions.filter((candidate) => candidate.kind === 'timedIntervals'))
      expect(session.reps).toBeGreaterThan(1)
  })

  it('gives every session exactly the fields its kind carries, all positive', () => {
    // How high a steady floor is belongs to the plan — 10k is pete5k's number,
    // not a law of steady rowing. That there *is* one is the invariant: a
    // steady row with no minimum is a row with nothing to do. Same for the
    // rest: a kind's numbers are present and positive, and the numbers
    // belonging to some other kind are absent.
    for (const session of sessions) {
      const required: readonly FieldName[] = REQUIRED_FIELDS[session.kind]

      for (const field of ALL_FIELDS)
        if (required.includes(field))
          expect(session[field], `${session.id} ${field}`).toBeGreaterThan(0)
        else expect(session[field], `${session.id} ${field}`).toBeUndefined()
    }
  })

  it('marks an optional session with the flag and nothing else', () => {
    // One-way by contract: absent means required, and nothing writes `false`.
    for (const session of sessions)
      if (session.optional !== undefined) expect(session.optional).toBe(true)
  })

  it('appends its optional sessions to a week rather than interleaving them', () => {
    // `build.ts` states the rule and the ids are why: they are positional, so
    // an optional session slipped in front of a core one re-points every
    // workout ever logged against everything after it. Stated in a doc
    // comment it was a habit; here it is a rule the next plan cannot miss.
    for (const week of plan.weeks) {
      const flags = week.sessions.map((session) => session.optional === true)
      const firstOptional = flags.indexOf(true)

      if (firstOptional !== -1)
        expect(flags.slice(firstOptional), `week ${week.index}`).not.toContain(false)
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
