import { describe, expect, it } from '@effect/vitest'

import { PLAN_WEEKS, PLANS, pete5k, pete5kLite, ROTATION_WEEKS } from '@/features/training/catalog'
import { SESSION_KINDS } from '@/features/training/types'
import type { Plan, PlanSession } from '@/features/training/types'

/**
 * The catalogue is data, so these assertions come in two kinds and the
 * difference matters.
 *
 * **Invariants** hold for every session of every plan, and are checked
 * exhaustively rather than with `it.prop`. The catalogue is finite, fixed and
 * small: enumerating it proves what sampling it can only suggest, and a
 * generator that draws from a constant is a slower way of looping.
 *
 * **Transcription pins** are the literal numbers — 71, 12, 36, and week 3
 * session by session. They exist because a plan is the one part of this app a
 * test cannot derive: if a rep distance is wrong, everything downstream is
 * consistently, confidently wrong. Week 3 is pinned against the design canvas;
 * the rest follows from the rotation, which is pinned by weeks 3 and 6 agreeing.
 */

const sessionsOf = (plan: Plan): readonly PlanSession[] =>
  plan.weeks.flatMap((week) => week.sessions)

/** A session minus its id — what the rotation repeats. */
const withoutId = ({ id: _id, ...body }: PlanSession) => body

const INTERVAL_KINDS = new Set(['shortRest', 'longRest', 'pacedTwoK'])

describe.each(PLANS)('$name', (plan) => {
  const sessions = sessionsOf(plan)

  it('runs twelve weeks, indexed contiguously from 1', () => {
    expect(plan.weeks).toHaveLength(PLAN_WEEKS)
    expect(plan.weeks.map((week) => week.index)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
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
    const intervalSessions = sessions.filter((session) => INTERVAL_KINDS.has(session.kind))
    expect(intervalSessions.length).toBeGreaterThan(0)

    for (const session of intervalSessions) {
      expect(session.reps).toBeGreaterThan(1)
      expect(session.repDistanceM).toBeGreaterThan(0)
      expect(session.restMs).toBeGreaterThan(0)
      expect((session.reps ?? 0) * (session.repDistanceM ?? 0)).toBeGreaterThan(0)
    }
  })

  it('gives every steady row a 10k floor and no rep structure', () => {
    const steady = sessions.filter((session) => session.kind === 'steady')
    expect(steady.length).toBeGreaterThan(0)

    for (const session of steady) {
      expect(session.minDistanceM).toBe(10_000)
      expect(session.reps).toBeUndefined()
      expect(session.distanceM).toBeUndefined()
    }
  })

  it('repeats the same rotation every three weeks', () => {
    // Weeks 3 and 6 sit at the same place in different rotations, so their
    // sessions must be identical but for the ids. This is what makes the
    // eleven weeks the canvas does not show follow from the one it does.
    for (let week = 1; week + ROTATION_WEEKS <= PLAN_WEEKS - 1; week += 1) {
      const here = plan.weeks[week - 1].sessions.map(withoutId)
      const next = plan.weeks[week + ROTATION_WEEKS - 1].sessions.map(withoutId)
      expect(next, `week ${week} and week ${week + ROTATION_WEEKS}`).toEqual(here)
    }
  })

  it('lengthens the reps across a rotation', () => {
    const shortRest = plan.weeks
      .slice(0, ROTATION_WEEKS)
      .flatMap((week) => week.sessions.filter((session) => session.kind === 'shortRest'))

    expect(shortRest).toHaveLength(ROTATION_WEEKS)
    const distances = shortRest.map((session) => session.repDistanceM ?? 0)
    expect(distances[1]).toBeGreaterThan(distances[0])
    expect(distances[2]).toBeGreaterThan(distances[1])
  })
})

describe('pete5k', () => {
  it('is the twelve-week plan the Plans screen names', () => {
    expect(pete5k.id).toBe('pete5k')
    expect(pete5k.name).toBe('Pete Plan 5k')
    expect(pete5k.source).toBe('thepeteplan.com')
  })

  it('totals 71 sessions, not 72', () => {
    // The Plans screen mockup says 72. It is wrong: week 12 tapers into the
    // 5k test and carries five sessions. The catalogue is the source of truth.
    expect(sessionsOf(pete5k)).toHaveLength(71)
    expect(pete5k.weeks.map((week) => week.sessions.length)).toEqual([
      6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 5,
    ])
  })

  it('lays week 3 out exactly as the design canvas does', () => {
    expect(pete5k.weeks[2].sessions).toEqual([
      { id: 'pete5k-w3-s1', kind: 'steady', minDistanceM: 10_000 },
      { id: 'pete5k-w3-s2', kind: 'shortRest', reps: 6, repDistanceM: 1000, restMs: 60_000 },
      { id: 'pete5k-w3-s3', kind: 'steady', minDistanceM: 10_000 },
      { id: 'pete5k-w3-s4', kind: 'longRest', reps: 4, repDistanceM: 1800, restMs: 240_000 },
      { id: 'pete5k-w3-s5', kind: 'steady', minDistanceM: 10_000 },
      { id: 'pete5k-w3-s6', kind: 'pacedTwoK', reps: 3, repDistanceM: 2000, restMs: 180_000 },
    ])
  })

  it('opens each rotation on the shortest reps', () => {
    // Rests included: they are the only thing separating the two interval
    // kinds, so a rest that drifts turns a long-rest week into a short-rest
    // one without changing a single distance.
    expect(pete5k.weeks[0].sessions[1]).toMatchObject({
      kind: 'shortRest',
      reps: 8,
      repDistanceM: 500,
      restMs: 60_000,
    })
    expect(pete5k.weeks[0].sessions[3]).toMatchObject({
      kind: 'longRest',
      reps: 5,
      repDistanceM: 1000,
      restMs: 240_000,
    })
    expect(pete5k.weeks[1].sessions[3]).toMatchObject({
      kind: 'longRest',
      reps: 4,
      repDistanceM: 1500,
      restMs: 240_000,
    })
    expect(pete5k.weeks[0].sessions[5]).toMatchObject({ kind: 'distancePiece', distanceM: 5000 })
    expect(pete5k.weeks[1].sessions[5]).toMatchObject({ kind: 'distancePiece', distanceM: 6000 })
  })

  it('ends every rotation but the last on a paced 2k', () => {
    for (const week of [3, 6, 9])
      expect(pete5k.weeks[week - 1].sessions.at(-1)).toMatchObject({ kind: 'pacedTwoK' })
  })

  it('tapers week 12 into the 5k test', () => {
    const week12 = pete5k.weeks[11].sessions
    expect(week12).toHaveLength(5)
    expect(week12.map((session) => session.kind)).toEqual([
      'steady',
      'shortRest',
      'steady',
      'longRest',
      'distancePiece',
    ])
    expect(week12.at(-1)).toMatchObject({ kind: 'distancePiece', distanceM: 5000 })
  })
})

describe('pete5kLite', () => {
  it('is the three-a-week plan the Plans screen names', () => {
    expect(pete5kLite.id).toBe('pete5k-lite')
    expect(pete5kLite.name).toBe('Pete Plan 5k — Lite')
    expect(pete5kLite.source).toBe('thepeteplan.com')
  })

  it('totals 36 sessions, three every week including the last', () => {
    expect(sessionsOf(pete5kLite)).toHaveLength(36)
    for (const week of pete5kLite.weeks) expect(week.sessions).toHaveLength(3)
  })

  it('prescribes every session it keeps in full', () => {
    expect(pete5kLite.weeks[0].sessions).toEqual([
      { id: 'pete5k-lite-w1-s1', kind: 'shortRest', reps: 6, repDistanceM: 500, restMs: 60_000 },
      { id: 'pete5k-lite-w1-s2', kind: 'steady', minDistanceM: 10_000 },
      { id: 'pete5k-lite-w1-s3', kind: 'longRest', reps: 4, repDistanceM: 1000, restMs: 240_000 },
    ])
    expect(pete5kLite.weeks[1].sessions[2]).toMatchObject({
      kind: 'longRest',
      reps: 3,
      repDistanceM: 1500,
      restMs: 240_000,
    })
    expect(pete5kLite.weeks[2].sessions[2]).toMatchObject({
      kind: 'pacedTwoK',
      reps: 3,
      repDistanceM: 2000,
      restMs: 180_000,
    })
  })

  it('keeps the rotation but drops the hard distance piece', () => {
    expect(pete5kLite.weeks[0].sessions.map((session) => session.kind)).toEqual([
      'shortRest',
      'steady',
      'longRest',
    ])
    expect(pete5kLite.weeks[2].sessions.map((session) => session.kind)).toEqual([
      'shortRest',
      'steady',
      'pacedTwoK',
    ])
    expect(sessionsOf(pete5kLite).some((session) => session.kind === 'distancePiece')).toBe(false)
  })

  it('is shorter than the full plan rep for rep', () => {
    const full = pete5k.weeks[2].sessions[1]
    const lite = pete5kLite.weeks[2].sessions[0]
    expect(lite.kind).toBe(full.kind)
    expect(lite.reps).toBeLessThan(full.reps ?? 0)
  })
})

describe('PLANS', () => {
  it('lists both plans, and gives them distinct ids', () => {
    expect(PLANS).toEqual([pete5k, pete5kLite])
    expect(new Set(PLANS.map((plan) => plan.id)).size).toBe(PLANS.length)
  })

  it('never repeats a session id across plans', () => {
    const ids = PLANS.flatMap((plan) => sessionsOf(plan).map((session) => session.id))
    expect(new Set(ids).size).toBe(ids.length)
  })
})
