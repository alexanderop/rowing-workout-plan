import { describe, expect, it } from '@effect/vitest'
import { Result } from 'effect'

import { pete5k, pete5kLite, PLANS } from '@/features/training/catalog'
import {
  describeSession,
  findSession,
  formatDistance,
  formatRest,
  kilometres,
  pieceDistanceM,
  sessionDistanceM,
  sessionDurationMs,
  weekDistanceM,
} from '@/features/training/session'
import type { PlanSession, PlanWeek } from '@/features/training/types'

/**
 * The translation from numbers to a sentence's worth of parts. The
 * assertions are written as the strings a rower reads, because that is the
 * form any disagreement will arrive in.
 */

const session = (fields: Partial<PlanSession> & Pick<PlanSession, 'kind'>): PlanSession => ({
  id: 'test',
  ...fields,
})

// SAFETY: pete5k is built with twelve weeks and its own spec pins that count,
// so index 2 is week 3 and is present.
/** Week 3 of the full plan — the one the design canvas works through. */
const WEEK_3 = pete5k.weeks[2] as PlanWeek

describe('formatDistance', () => {
  it.each([
    [500, '500m'],
    [750, '750m'],
    [1000, '1k'],
    [1800, '1800m'],
    [2000, '2k'],
    [5000, '5k'],
    [6000, '6k'],
    [10_000, '10k'],
  ])('writes %p m as %p', (metres, expected) => {
    expect(formatDistance(metres)).toBe(expected)
  })

  it('never writes a fraction of a kilometre', () => {
    // "1.8k" is not something anyone says on an erg, and 500 m must not
    // become "0.5k" — both are why the rule is whole kilometres or metres.
    expect(formatDistance(1800)).not.toContain('.')
    expect(formatDistance(500)).not.toContain('k')
  })

  it('stays in metres at zero, which only a malformed session produces', () => {
    expect(formatDistance(0)).toBe('0m')
  })
})

describe('formatRest', () => {
  it.each([
    [60_000, '1′'],
    [180_000, '3′'],
    [240_000, '4′'],
    [210_000, '3′30″'],
    [90_000, '1′30″'],
    [0, '0′'],
  ])('writes %p ms as %p', (restMs, expected) => {
    expect(formatRest(restMs)).toBe(expected)
  })

  it('never uses a colon, which means a split everywhere else in the app', () => {
    for (const restMs of [60_000, 210_000]) expect(formatRest(restMs)).not.toContain(':')
  })
})

describe('describeSession', () => {
  it('writes a steady session as its floor', () => {
    expect(describeSession(session({ kind: 'steady', minDistanceM: 10_000 }))).toEqual({
      style: 'steady',
      reps: 1,
      distance: '10k',
      rest: '0′',
    })
  })

  it('writes short-rest intervals the way the canvas does', () => {
    const description = describeSession(
      session({ kind: 'shortRest', reps: 6, repDistanceM: 1000, restMs: 60_000 }),
    )

    expect(description).toEqual({ style: 'intervals', reps: 6, distance: '1k', rest: '1′' })
  })

  it('writes long-rest intervals the way the canvas does', () => {
    const description = describeSession(
      session({ kind: 'longRest', reps: 4, repDistanceM: 1800, restMs: 240_000 }),
    )

    expect(description).toEqual({ style: 'intervals', reps: 4, distance: '1800m', rest: '4′' })
  })

  it('writes a paced 2k as intervals — it looks like one on the erg', () => {
    const description = describeSession(
      session({ kind: 'pacedTwoK', reps: 3, repDistanceM: 2000, restMs: 180_000 }),
    )

    expect(description).toEqual({ style: 'intervals', reps: 3, distance: '2k', rest: '3′' })
  })

  it('writes a hard piece as its own distance', () => {
    expect(describeSession(session({ kind: 'distancePiece', distanceM: 5000 }))).toEqual({
      style: 'piece',
      reps: 1,
      distance: '5k',
      rest: '0′',
    })
  })

  it('names one rep, not the whole session', () => {
    // The distinction the two functions exist for: the sentence says "6 × 1k"
    // and the week summary counts 6,000 m.
    const intervals = session({ kind: 'shortRest', reps: 6, repDistanceM: 1000, restMs: 60_000 })

    expect(describeSession(intervals).distance).toBe('1k')
    expect(sessionDistanceM(intervals)).toBe(6000)
  })

  it('describes every session in the catalogue without inventing a field', () => {
    for (const plan of PLANS)
      for (const week of plan.weeks)
        for (const planSession of week.sessions) {
          const description = describeSession(planSession)
          expect(description.distance, planSession.id).not.toBe('0m')
          expect(description.reps, planSession.id).toBeGreaterThan(0)
        }
  })
})

describe('sessionDistanceM', () => {
  it('multiplies the reps out', () => {
    expect(
      sessionDistanceM(session({ kind: 'longRest', reps: 4, repDistanceM: 1800, restMs: 1 })),
    ).toBe(7200)
  })

  it('takes the floor for steady, which has no ceiling', () => {
    expect(sessionDistanceM(session({ kind: 'steady', minDistanceM: 10_000 }))).toBe(10_000)
  })

  it('takes the piece for a hard distance', () => {
    expect(sessionDistanceM(session({ kind: 'distancePiece', distanceM: 6000 }))).toBe(6000)
  })

  it('is zero for a session missing the field its kind needs', () => {
    expect(sessionDistanceM(session({ kind: 'steady' }))).toBe(0)
    expect(sessionDistanceM(session({ kind: 'distancePiece' }))).toBe(0)
    expect(sessionDistanceM(session({ kind: 'shortRest', repDistanceM: 1000 }))).toBe(0)
    expect(sessionDistanceM(session({ kind: 'shortRest', reps: 6 }))).toBe(0)
  })
})

describe('pieceDistanceM', () => {
  it('is one rep for an interval session', () => {
    expect(
      pieceDistanceM(session({ kind: 'shortRest', reps: 6, repDistanceM: 1000, restMs: 1 })),
    ).toBe(1000)
  })

  it('is the whole session for the two kinds that are a single effort', () => {
    // The per-rep list on the session screen shows one row for these, and
    // that row is the session — which is why they are not multiplied out.
    expect(pieceDistanceM(session({ kind: 'steady', minDistanceM: 10_000 }))).toBe(10_000)
    expect(pieceDistanceM(session({ kind: 'distancePiece', distanceM: 5000 }))).toBe(5000)
  })

  it('is what the sentence names, where sessionDistanceM is what the week counts', () => {
    const intervals = session({ kind: 'longRest', reps: 4, repDistanceM: 1800, restMs: 1 })

    expect(pieceDistanceM(intervals)).toBe(1800)
    expect(sessionDistanceM(intervals)).toBe(7200)
  })

  it('is zero for a session missing the field its kind needs', () => {
    expect(pieceDistanceM(session({ kind: 'shortRest', reps: 6 }))).toBe(0)
  })
})

describe('sessionDurationMs', () => {
  const succeeded = <A, E>(result: Result.Result<A, E>): A => Result.getOrThrow(result)
  const failed = <A, E>(result: Result.Result<A, E>): E => Result.getOrThrow(Result.flip(result))

  it('is the canvas estimate for week 3 session 2', () => {
    // 6 × 1k at 1:52.0 is 22.4 minutes of work plus five minutes of rest —
    // "~27 min incl. rest", which is what the design canvas prints.
    const intervals = session({ kind: 'shortRest', reps: 6, repDistanceM: 1000, restMs: 60_000 })

    expect(Math.round(succeeded(sessionDurationMs(intervals, 112_050)) / 60_000)).toBe(27)
  })

  it('counts the gaps between the reps, not one per rep', () => {
    // The last rest is not rest, it is the end of the session.
    const four = session({ kind: 'shortRest', reps: 4, repDistanceM: 500, restMs: 60_000 })
    const work = succeeded(sessionDurationMs({ ...four, restMs: 0 }, 120_000))

    expect(succeeded(sessionDurationMs(four, 120_000)) - work).toBe(3 * 60_000)
  })

  it('has no rest term for the two kinds that are a single effort', () => {
    const steady = session({ kind: 'steady', minDistanceM: 10_000 })
    const piece = session({ kind: 'distancePiece', distanceM: 5000 })

    expect(succeeded(sessionDurationMs(steady, 126_000))).toBe(2_520_000)
    expect(succeeded(sessionDurationMs(piece, 112_000))).toBe(1_120_000)
  })

  it('refuses a session with no target rather than reporting no time', () => {
    const steady = session({ kind: 'steady', minDistanceM: 10_000 })

    expect(failed(sessionDurationMs(steady, 0))).toMatchObject({ field: 'splitMs' })
  })

  it('refuses a session with no distance', () => {
    expect(failed(sessionDurationMs(session({ kind: 'steady' }), 126_000))).toMatchObject({
      field: 'distanceM',
    })
  })
})

describe('weekDistanceM', () => {
  it('adds up the canvas week: three 10k steady, 6 × 1k, 4 × 1800m, 3 × 2k', () => {
    expect(weekDistanceM(WEEK_3)).toBe(30_000 + 6000 + 7200 + 6000)
  })

  it('is zero for a week with no sessions', () => {
    expect(weekDistanceM({ index: 1, sessions: [] })).toBe(0)
  })

  it('is smaller for the lite plan, which is the point of it', () => {
    // SAFETY: both plans are twelve weeks, asserted in catalog.spec.ts.
    expect(weekDistanceM(pete5kLite.weeks[2] as PlanWeek)).toBeLessThan(weekDistanceM(WEEK_3))
  })
})

describe('kilometres', () => {
  it.each([
    [49_200, 49],
    [49_600, 50],
    [500, 1],
    [400, 0],
  ])('rounds %p m to %p km', (metres, expected) => {
    expect(kilometres(metres)).toBe(expected)
  })
})

describe('findSession', () => {
  it('finds a session by the id a route carries', () => {
    const found = findSession(PLANS, 'pete5k-w3-s2')

    expect(found?.plan).toBe(pete5k)
    expect(found?.week.index).toBe(3)
    expect(found?.session.id).toBe('pete5k-w3-s2')
    expect(found?.position).toBe(2)
  })

  it('numbers the position from one, the way the screen says it', () => {
    expect(findSession(PLANS, 'pete5k-w3-s1')?.position).toBe(1)
    expect(findSession(PLANS, 'pete5k-w3-s6')?.position).toBe(6)
  })

  it('tells the two plans apart even though their ids share a prefix', () => {
    // 'pete5k-lite-w1-s1' starts with 'pete5k-', which is exactly the trap a
    // parsed id would fall into.
    expect(findSession(PLANS, 'pete5k-lite-w1-s1')?.plan).toBe(pete5kLite)
    expect(findSession(PLANS, 'pete5k-w1-s1')?.plan).toBe(pete5k)
  })

  it('is null for an id no plan has', () => {
    expect(findSession(PLANS, 'pete5k-w13-s1')).toBeNull()
    expect(findSession(PLANS, '')).toBeNull()
  })

  it('finds every session in the catalogue by its own id', () => {
    for (const plan of PLANS)
      for (const week of plan.weeks)
        for (const planSession of week.sessions)
          expect(findSession(PLANS, planSession.id)?.session, planSession.id).toBe(planSession)
  })
})
