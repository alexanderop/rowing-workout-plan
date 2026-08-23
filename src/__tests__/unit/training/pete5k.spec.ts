import { describe, expect, it } from '@effect/vitest'

import { pete5k } from '@/features/training/catalog'

import { sessionsOf } from './planInvariants'

/**
 * The full plan's transcription pins: the literal numbers a test cannot
 * derive.
 *
 * They exist because a plan is the one part of this app that comes from
 * outside it — if a rep distance is wrong, everything downstream is
 * consistently, confidently wrong, and every invariant still passes. Week 3 is
 * pinned against the design canvas; the rest follows from the rotation, which
 * is pinned by weeks 3 and 6 agreeing (`planInvariants.ts`).
 *
 * Nothing here is true of plans in general. That half is inherited from
 * `catalog.spec.ts`.
 */
describe('pete5k', () => {
  it('is the twelve-week plan the Plans screen names', () => {
    expect(pete5k.id).toBe('pete5k')
    expect(pete5k.name).toBe('Pete Plan 5k')
    expect(pete5k.source).toBe('thepeteplan.com')
    expect(pete5k.descriptionKey).toBe('plans.catalog.pete5k.description')
  })

  it('runs four rotations of three weeks', () => {
    expect(pete5k.weeks).toHaveLength(12)
    expect(pete5k.rotationWeeks).toBe(3)
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

  it('lengthens the reps across a rotation', () => {
    const shortRest = pete5k.weeks
      .slice(0, 3)
      .flatMap((week) => week.sessions.filter((session) => session.kind === 'shortRest'))

    expect(shortRest).toHaveLength(3)
    const distances = shortRest.map((session) => session.repDistanceM ?? 0)
    expect(distances[1]).toBeGreaterThan(distances[0])
    expect(distances[2]).toBeGreaterThan(distances[1])
  })

  it('holds every steady row at the 10k floor', () => {
    // The floor is this plan's number, not a rule of the catalogue — a lighter
    // plan is free to state a lower one, and the invariants only require that
    // there be one at all.
    const steady = sessionsOf(pete5k).filter((session) => session.kind === 'steady')
    expect(steady).toHaveLength(35)

    for (const session of steady) expect(session.minDistanceM).toBe(10_000)
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
