import { describe, expect, it } from '@effect/vitest'

import { pete5k, pete5kLite } from '@/features/training/catalog'

import { sessionsOf } from './planInvariants'

/**
 * The lite plan's transcription pins.
 *
 * Same twelve weeks and same three-week rotation as the full plan, at half the
 * weekly volume — but that is a fact about this plan and is asserted here,
 * not inherited. The one cross-plan case is the last: "lite" has to mean
 * shorter, and only comparing the two says so.
 */
describe('pete5kLite', () => {
  it('is the three-a-week plan the Plans screen names', () => {
    expect(pete5kLite.id).toBe('pete5k-lite')
    expect(pete5kLite.name).toBe('Pete Plan 5k — Lite')
    expect(pete5kLite.source).toBe('thepeteplan.com')
    expect(pete5kLite.descriptionKey).toBe('plans.catalog.pete5kLite.description')
  })

  it('runs four rotations of three weeks, like the full plan', () => {
    expect(pete5kLite.weeks).toHaveLength(12)
    expect(pete5kLite.rotationWeeks).toBe(3)
  })

  it('totals 36 sessions, three every week including the last', () => {
    // No taper: there is no volume to taper from, so week 12 ends on the paced
    // 2k like every other rotation does.
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

  it('lengthens the reps across a rotation', () => {
    const distances = pete5kLite.weeks
      .slice(0, 3)
      .flatMap((week) => week.sessions.filter((session) => session.kind === 'shortRest'))
      .map((session) => session.repDistanceM ?? 0)

    expect(distances).toEqual([500, 750, 1000])
  })

  it('keeps the full plan’s 10k steady floor', () => {
    // "Lite" is three sessions a week rather than six and shorter reps within
    // them, not an easier definition of steady.
    const steady = sessionsOf(pete5kLite).filter((session) => session.kind === 'steady')
    expect(steady).toHaveLength(12)

    for (const session of steady) expect(session.minDistanceM).toBe(10_000)
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
