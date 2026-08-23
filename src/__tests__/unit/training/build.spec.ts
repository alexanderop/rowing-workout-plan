import { describe, expect, it } from '@effect/vitest'

import {
  definePlan,
  longRest,
  pacedTwoK,
  piece,
  rotating,
  shortRest,
  steady,
  withIds,
} from '@/features/training/catalog/build'
import type { SessionBody, WeekBody } from '@/features/training/catalog/build'

/**
 * The machinery a plan file is written with, tested away from any plan.
 *
 * `pete5k.spec.ts` and `pete5kLite.spec.ts` already prove this produces the
 * two plans the catalogue ships. What they cannot show is the behaviour a
 * *third* plan will depend on: an empty week, a rotation that is not three
 * long, an override that lands nowhere. Those are here.
 */

const ROW: SessionBody = steady(10_000)

describe('withIds', () => {
  it('numbers weeks from 1 and sessions from 1 within a week', () => {
    expect(withIds('demo', [[ROW, ROW], [ROW]])).toEqual([
      {
        index: 1,
        sessions: [
          { id: 'demo-w1-s1', kind: 'steady', minDistanceM: 10_000 },
          { id: 'demo-w1-s2', kind: 'steady', minDistanceM: 10_000 },
        ],
      },
      { index: 2, sessions: [{ id: 'demo-w2-s1', kind: 'steady', minDistanceM: 10_000 }] },
    ])
  })

  it('gives every session a unique id, however many weeks there are', () => {
    const weeks = withIds(
      'demo',
      Array.from({ length: 9 }, () => [ROW, ROW, ROW]),
    )
    const ids = weeks.flatMap((week) => week.sessions.map((session) => session.id))

    expect(ids).toHaveLength(27)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('keeps the body it was handed, and adds only the id', () => {
    const [week] = withIds('demo', [[shortRest(6, 1000, 60_000)]])
    expect(week.sessions[0]).toEqual({
      id: 'demo-w1-s1',
      kind: 'shortRest',
      reps: 6,
      repDistanceM: 1000,
      restMs: 60_000,
    })
  })

  it('yields a week with no sessions rather than throwing', () => {
    // A rest week is a week. It is not this function's business to have an
    // opinion about whether a plan should contain one.
    expect(withIds('demo', [[], [ROW]])).toEqual([
      { index: 1, sessions: [] },
      { index: 2, sessions: [{ id: 'demo-w2-s1', kind: 'steady', minDistanceM: 10_000 }] },
    ])
  })

  it('yields no weeks for no bodies', () => {
    expect(withIds('demo', [])).toEqual([])
  })
})

describe('rotating', () => {
  /** A slot function that records what it was asked for. */
  const recorder = () => {
    const slots: number[] = []
    const week = (slot: number): WeekBody => {
      slots.push(slot)
      return [piece(1000 * (slot + 1))]
    }

    return { slots, week }
  }

  it('runs the cycle once per rotation, slot by slot', () => {
    const { week, slots } = recorder()
    const weeks = rotating({ rotations: 2, rotationWeeks: 3, week })

    expect(weeks).toHaveLength(6)
    expect(slots).toEqual([0, 1, 2, 0, 1, 2])
  })

  it('puts the same week at the same slot of every rotation', () => {
    const { week } = recorder()
    const weeks = rotating({ rotations: 2, rotationWeeks: 3, week })

    expect(weeks[3]).toEqual(weeks[0])
    expect(weeks[4]).toEqual(weeks[1])
    expect(weeks[5]).toEqual(weeks[2])
    expect(weeks[0]).toEqual([{ kind: 'distancePiece', distanceM: 1000 }])
    expect(weeks[2]).toEqual([{ kind: 'distancePiece', distanceM: 3000 }])
  })

  it('reads the rotation length off the spec, not off a constant', () => {
    const { week, slots } = recorder()
    expect(rotating({ rotations: 2, rotationWeeks: 4, week })).toHaveLength(8)
    expect(slots).toEqual([0, 1, 2, 3, 0, 1, 2, 3])
  })

  it('replaces exactly the week an override names', () => {
    const { week } = recorder()
    const taper = [piece(5000)]
    const weeks = rotating({ rotations: 2, rotationWeeks: 3, week, overrides: { 6: taper } })

    expect(weeks[5]).toBe(taper)
    expect(weeks[4]).toEqual(weeks[1])
    expect(weeks[3]).toEqual(weeks[0])
    expect(weeks[2]).toEqual([{ kind: 'distancePiece', distanceM: 3000 }])
  })

  it('overrides the first week as readily as the last', () => {
    const { week } = recorder()
    const opener = [piece(2000)]
    const weeks = rotating({ rotations: 1, rotationWeeks: 3, week, overrides: { 1: opener } })

    expect(weeks[0]).toBe(opener)
    expect(weeks[1]).toEqual([{ kind: 'distancePiece', distanceM: 2000 }])
  })

  it('takes more than one override', () => {
    const { week } = recorder()
    const first = [piece(100)]
    const last = [piece(200)]
    const weeks = rotating({
      rotations: 2,
      rotationWeeks: 2,
      week,
      overrides: { 1: first, 4: last },
    })

    expect(weeks).toEqual([first, [{ kind: 'distancePiece', distanceM: 2000 }], weeks[2], last])
  })

  it.each([0, 7, -1, 1.5])(
    'throws at build time for an override on week %p, which the plan does not have',
    (weekIndex) => {
      // A silent no-op would leave the rotation's week on screen with nothing
      // to say the author meant to replace it.
      const { week } = recorder()
      expect(() =>
        rotating({ rotations: 2, rotationWeeks: 3, week, overrides: { [weekIndex]: [piece(1)] } }),
      ).toThrow(new RegExp(`6 weeks has no week ${weekIndex}`))
    },
  )

  it('accepts the last week the plan has, and refuses the one after it', () => {
    const { week } = recorder()
    const spec = { rotations: 2, rotationWeeks: 3, week }

    expect(() => rotating({ ...spec, overrides: { 6: [piece(1)] } })).not.toThrow()
    expect(() => rotating({ ...spec, overrides: { 7: [piece(1)] } })).toThrow(RangeError)
  })
})

describe('definePlan', () => {
  const SPEC = {
    id: 'demo',
    name: 'Demo',
    descriptionKey: 'plans.catalog.pete5k.description' as const,
    source: 'test',
    rotationWeeks: 2,
    weeks: [[ROW], [ROW, ROW]],
  }

  it('carries the identity through and stamps the ids', () => {
    expect(definePlan(SPEC)).toEqual({
      id: 'demo',
      name: 'Demo',
      descriptionKey: 'plans.catalog.pete5k.description',
      source: 'test',
      rotationWeeks: 2,
      weeks: [
        { index: 1, sessions: [{ id: 'demo-w1-s1', kind: 'steady', minDistanceM: 10_000 }] },
        {
          index: 2,
          sessions: [
            { id: 'demo-w2-s1', kind: 'steady', minDistanceM: 10_000 },
            { id: 'demo-w2-s2', kind: 'steady', minDistanceM: 10_000 },
          ],
        },
      ],
    })
  })

  it('prefixes the ids with the plan id, so two plans never collide', () => {
    const other = definePlan({ ...SPEC, id: 'other' })
    expect(other.weeks[0].sessions[0].id).toBe('other-w1-s1')
  })

  it('freezes the plan — nobody owns catalogue data', () => {
    expect(Object.isFrozen(definePlan(SPEC))).toBe(true)
  })

  it('composes with rotating, which is the whole point of the seam', () => {
    const plan = definePlan({
      ...SPEC,
      rotationWeeks: 2,
      weeks: rotating({ rotations: 2, rotationWeeks: 2, week: () => [ROW] }),
    })

    expect(plan.weeks.map((week) => week.index)).toEqual([1, 2, 3, 4])
  })
})

describe('the session helpers', () => {
  it.each([
    ['steady', steady(10_000), { kind: 'steady', minDistanceM: 10_000 }],
    [
      'shortRest',
      shortRest(8, 500, 60_000),
      { kind: 'shortRest', reps: 8, repDistanceM: 500, restMs: 60_000 },
    ],
    [
      'longRest',
      longRest(5, 1000, 240_000),
      { kind: 'longRest', reps: 5, repDistanceM: 1000, restMs: 240_000 },
    ],
    [
      'pacedTwoK',
      pacedTwoK(3, 2000, 180_000),
      { kind: 'pacedTwoK', reps: 3, repDistanceM: 2000, restMs: 180_000 },
    ],
    ['distancePiece', piece(5000), { kind: 'distancePiece', distanceM: 5000 }],
  ])('gives a %s exactly the fields its kind carries, and no others', (_label, body, expected) => {
    // `toEqual` over `toMatchObject` deliberately: an extra field would be a
    // rep structure on a steady row, or a distance on an interval — which is
    // exactly what `planInvariants.ts` asserts no plan has.
    expect(body).toEqual(expected)
  })
})
