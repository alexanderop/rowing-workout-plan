import { describe, expect, it } from '@effect/vitest'

import { peteBeginner } from '@/features/training/catalog'
import type { PlanSession } from '@/features/training/types'

import { sessionsOf } from './planInvariants'

/**
 * The beginner plan's transcription pins.
 *
 * This plan is printed week by week on thepeteplan.com, so unlike the two 5k
 * plans there is nothing here that was derived — every number below is one
 * that was read off the page. That is exactly why the pins matter: a rep
 * distance typed wrong is wrong consistently, every invariant still passes,
 * and the app confidently prescribes a session Pete never wrote.
 *
 * Two weeks are laid out in full rather than one: week 1 is the plan's shape
 * before it changes, and week 12 is the week it changes into.
 */

const MINUTE = 60_000

const optionalOf = (session: PlanSession): boolean => session.optional === true

describe('peteBeginner', () => {
  it('is the 24-week plan the Plans screen names', () => {
    expect(peteBeginner.id).toBe('pete-beginner')
    expect(peteBeginner.name).toBe('Pete Plan — Beginner')
    expect(peteBeginner.source).toBe('thepeteplan.com')
    expect(peteBeginner.descriptionKey).toBe('plans.catalog.peteBeginner.description')
  })

  it('runs 24 weeks with no rotation inside them', () => {
    // One pass through the cycle *is* the plan, which is what keeps
    // `targets.ts`'s per-rotation step from ever firing here.
    expect(peteBeginner.weeks).toHaveLength(24)
    expect(peteBeginner.rotationWeeks).toBe(24)
  })

  it('offers five sessions a week and requires three', () => {
    expect(sessionsOf(peteBeginner)).toHaveLength(120)

    for (const week of peteBeginner.weeks) {
      expect(week.sessions, `week ${week.index}`).toHaveLength(5)
      expect(week.sessions.filter(optionalOf), `week ${week.index}`).toHaveLength(2)
    }

    expect(sessionsOf(peteBeginner).filter(optionalOf)).toHaveLength(48)
  })

  it('puts the two optional sessions last in every week, never in the middle', () => {
    // The ids are positional, so an optional session in front of a core one
    // re-points every workout logged against everything after it.
    for (const week of peteBeginner.weeks)
      expect(week.sessions.map(optionalOf), `week ${week.index}`).toEqual([
        false,
        false,
        false,
        true,
        true,
      ])
  })

  it('prescribes week 1 exactly as the page prints it', () => {
    expect(peteBeginner.weeks[0].sessions).toEqual([
      { id: 'pete-beginner-w1-s1', kind: 'steady', minDistanceM: 5000 },
      {
        id: 'pete-beginner-w1-s2',
        kind: 'longRest',
        reps: 6,
        repDistanceM: 500,
        restMs: 2 * MINUTE,
      },
      { id: 'pete-beginner-w1-s3', kind: 'steady', minDistanceM: 5000 },
      {
        id: 'pete-beginner-w1-s4',
        kind: 'timedSteady',
        durationMs: 20 * MINUTE,
        optional: true,
      },
      {
        id: 'pete-beginner-w1-s5',
        kind: 'timedIntervals',
        reps: 2,
        repDurationMs: 10 * MINUTE,
        restMs: 2 * MINUTE,
        optional: true,
      },
    ])
  })

  it('prescribes week 12 exactly, where the plan changes shape', () => {
    // The single rows stop climbing and the second of them becomes timed
    // endurance work. A plan that lost the timed kinds would still pass every
    // invariant and quietly be eleven weeks long.
    expect(peteBeginner.weeks[11].sessions).toEqual([
      { id: 'pete-beginner-w12-s1', kind: 'steady', minDistanceM: 10_000 },
      {
        id: 'pete-beginner-w12-s2',
        kind: 'shortRest',
        reps: 4,
        repDistanceM: 1500,
        restMs: 3 * MINUTE,
      },
      {
        id: 'pete-beginner-w12-s3',
        kind: 'timedIntervals',
        reps: 3,
        repDurationMs: 10 * MINUTE,
        restMs: 2 * MINUTE,
      },
      { id: 'pete-beginner-w12-s4', kind: 'steady', minDistanceM: 8000, optional: true },
      {
        id: 'pete-beginner-w12-s5',
        kind: 'longRest',
        reps: 4,
        repDistanceM: 800,
        restMs: 2 * MINUTE,
        optional: true,
      },
    ])
  })

  it('climbs the first single row 500m a week for eleven weeks, then holds', () => {
    const opening = peteBeginner.weeks.map((week) => week.sessions[0].minDistanceM)

    expect(opening.slice(0, 11)).toEqual([
      5000, 5500, 6000, 6500, 7000, 7500, 8000, 8500, 9000, 9500, 10_000,
    ])
    expect(opening.slice(11)).toEqual([
      10_000, 10_000, 10_000, 10_000, 10_500, 10_500, 11_000, 10_000, 12_000, 10_000, 12_000,
      10_000, 12_000,
    ])
  })

  it('keeps the second single row a steady row until week 12, then times it', () => {
    const third = peteBeginner.weeks.map((week) => week.sessions[2].kind)

    expect(third.slice(0, 11)).toEqual(new Array<string>(11).fill('steady'))
    expect(third.slice(11)).not.toContain('steady')
  })

  it('runs the hard session through the two interval kinds in the published order', () => {
    // Pete's own grouping, as the rest-to-work rule reproduces it: `longRest`
    // is his Group 3 speed work (500m to 1000m reps at roughly 1:1) and
    // `shortRest` his Group 2 speed endurance (1500m and 2000m at 1:2). The
    // early weeks lean on the shorter reps and the two settle into a strict
    // alternation from week 7 — which is the page's sequence, not a rule, so
    // it is pinned literally.
    const hard = ['longRest', 'shortRest'] as const
    expect(peteBeginner.weeks.map((week) => week.sessions[1].kind)).toEqual([
      hard[0],
      hard[0],
      hard[1],
      hard[0],
      hard[0],
      hard[1],
      ...Array.from({ length: 18 }, (_unused, index) => hard[index % 2]),
    ])
  })

  it('keeps the 2 × 2500m as short-rest intervals, deviation and all', () => {
    // Week 4's optional session is a 20% rest-to-work ratio, so the rule puts
    // it on `shortRest` and it is paced at 2k+6s — where Pete describes it as
    // endurance work nearer 2k+20s. The catalogue has no steady-paced
    // distance-interval kind and one session in 120 does not justify an
    // eighth. Pinned so nobody quietly "fixes" it into a lie about the source.
    expect(peteBeginner.weeks[3].sessions[4]).toEqual({
      id: 'pete-beginner-w4-s5',
      kind: 'shortRest',
      reps: 2,
      repDistanceM: 2500,
      restMs: 2 * MINUTE,
      optional: true,
    })
  })

  it('ends on its hardest week rather than tapering', () => {
    // There is no test to taper into: what comes after week 24 is a 2k, and
    // the page says to treat that as any other session.
    expect(peteBeginner.weeks[23].sessions.map((session) => session.kind)).toEqual([
      'steady',
      'shortRest',
      'timedSteady',
      'timedIntervals',
      'longRest',
    ])
    expect(peteBeginner.weeks[23].sessions[0].minDistanceM).toBe(12_000)
  })

  it('never prescribes a hard distance piece or a paced 2k', () => {
    // Both are test sessions, and this plan tests nobody. The 5k plans are
    // where they belong.
    const kinds = new Set(sessionsOf(peteBeginner).map((session) => session.kind))

    expect(kinds.has('distancePiece')).toBe(false)
    expect(kinds.has('pacedTwoK')).toBe(false)
  })
})
