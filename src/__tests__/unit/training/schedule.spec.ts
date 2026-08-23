import { describe, expect, it } from '@effect/vitest'
import { Result } from 'effect'

import { pete5k, pete5kLite } from '@/features/training/catalog'
import {
  isRotationEnd,
  nextSession,
  positionFor,
  rotationFor,
  rotationNote,
  WeekRangeError,
} from '@/features/training/schedule'
import type { Plan } from '@/features/training/types'

/**
 * Locating a rower in a plan, from a set of completed session ids that a real
 * log makes messy: it has gaps, it has ids from a plan they abandoned, and
 * eventually it has everything.
 *
 * The cases below are the four the epic names — nothing done, one done,
 * mid-plan, all done — plus the two the log actually produces and a screen
 * would otherwise render wrong: a skipped session, and ids that belong to
 * something else.
 */

const succeeded = <A, E>(result: Result.Result<A, E>): A => Result.getOrThrow(result)
const failed = <A, E>(result: Result.Result<A, E>): E => Result.getOrThrow(Result.flip(result))

/** The first `count` session ids of a plan, in order. */
const firstIds = (plan: Plan, count: number): Array<string> =>
  plan.weeks.flatMap((week) => week.sessions.map((session) => session.id)).slice(0, count)

const allIds = (plan: Plan): Array<string> => firstIds(plan, Number.MAX_SAFE_INTEGER)

const EMPTY_PLAN: Plan = {
  id: 'empty',
  name: 'Empty',
  descriptionKey: 'plans.catalog.pete5k.description',
  source: 'test',
  rotationWeeks: 3,
  weeks: [],
}

/**
 * A plan built to a stated cycle and length, for the cases the module
 * constants used to make unrepresentable. It is not a plan anyone would row
 * and never enters `PLANS`; what it is for is proving these functions read the
 * plan they are handed rather than the one the catalogue happens to ship.
 */
const planOf = (rotationWeeks: number, weekCount: number): Plan => ({
  id: 'cycle',
  name: 'Cycle',
  descriptionKey: 'plans.catalog.pete5k.description',
  source: 'test',
  rotationWeeks,
  weeks: Array.from({ length: weekCount }, (_unused, index) => ({
    index: index + 1,
    sessions: [{ id: `cycle-w${index + 1}-s1`, kind: 'steady' as const, minDistanceM: 10_000 }],
  })),
})

describe('positionFor', () => {
  it('starts at week 1, session 1 with nothing done', () => {
    expect(positionFor(pete5k, [])).toEqual({
      weekIndex: 1,
      sessionIndex: 1,
      done: 0,
      total: 71,
    })
  })

  it('advances one session at a time', () => {
    expect(positionFor(pete5k, firstIds(pete5k, 1))).toEqual({
      weekIndex: 1,
      sessionIndex: 2,
      done: 1,
      total: 71,
    })
  })

  it('rolls into the next week at the week boundary', () => {
    expect(positionFor(pete5k, firstIds(pete5k, 6))).toMatchObject({
      weekIndex: 2,
      sessionIndex: 1,
      done: 6,
    })
  })

  it('reproduces the mockup: 13 done is week 3, session 2', () => {
    expect(positionFor(pete5k, firstIds(pete5k, 13))).toEqual({
      weekIndex: 3,
      sessionIndex: 2,
      done: 13,
      total: 71,
    })
  })

  it('clamps to the final session once the plan is complete', () => {
    // There is no session after the last one to point at, and week 13 or
    // session 6 of a five-session week is an index no screen can render.
    expect(positionFor(pete5k, allIds(pete5k))).toEqual({
      weekIndex: 12,
      sessionIndex: 5,
      done: 71,
      total: 71,
    })
  })

  it('points at a skipped session rather than writing it off', () => {
    const [first, , third] = firstIds(pete5k, 3)
    const position = positionFor(pete5k, [first, third])

    expect(position.sessionIndex).toBe(2)
    expect(position.done).toBe(2)
  })

  it('ignores ids that belong to another plan', () => {
    expect(positionFor(pete5k, allIds(pete5kLite))).toEqual({
      weekIndex: 1,
      sessionIndex: 1,
      done: 0,
      total: 71,
    })
  })

  it('reports zeroes for a plan with no weeks', () => {
    expect(positionFor(EMPTY_PLAN, [])).toEqual({
      weekIndex: 0,
      sessionIndex: 0,
      done: 0,
      total: 0,
    })
  })

  it('counts the lite plan separately', () => {
    expect(positionFor(pete5kLite, [])).toMatchObject({ total: 36 })
  })
})

describe('nextSession', () => {
  it('offers the first session of an untouched plan', () => {
    expect(nextSession(pete5k, [])).toBe(pete5k.weeks[0].sessions[0])
  })

  it('offers the session the position points at', () => {
    expect(nextSession(pete5k, firstIds(pete5k, 13))).toBe(pete5k.weeks[2].sessions[1])
    expect(nextSession(pete5k, firstIds(pete5k, 13))).toMatchObject({
      kind: 'shortRest',
      reps: 6,
      repDistanceM: 1000,
    })
  })

  it('offers a skipped session again', () => {
    const [first, , third] = firstIds(pete5k, 3)
    expect(nextSession(pete5k, [first, third])).toBe(pete5k.weeks[0].sessions[1])
  })

  it('returns null once every session is done', () => {
    expect(nextSession(pete5k, allIds(pete5k))).toBeNull()
  })

  it('returns null for a plan with no weeks', () => {
    expect(nextSession(EMPTY_PLAN, [])).toBeNull()
  })

  it('agrees with positionFor at every point in the plan', () => {
    // The two scan independently, so this is the assertion that keeps them
    // from drifting apart into two different answers to the same question.
    for (const done of [0, 1, 5, 6, 13, 40, 70]) {
      const completed = firstIds(pete5k, done)
      const { weekIndex, sessionIndex } = positionFor(pete5k, completed)
      const week = pete5k.weeks[weekIndex - 1]

      expect(nextSession(pete5k, completed), `after ${done}`).toBe(week.sessions[sessionIndex - 1])
    }
  })
})

describe('rotationFor', () => {
  it('maps each three weeks onto one rotation', () => {
    const rotations = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((week) =>
      succeeded(rotationFor(pete5k, week)),
    )
    expect(rotations).toEqual([1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4])
  })

  it.each([0, -1, 13, 100])('refuses week %i, which the plan does not have', (week) => {
    expect(failed(rotationFor(pete5k, week))).toMatchObject({
      _tag: 'Training.WeekRangeError',
      weekIndex: week,
    })
  })

  it.each([3.5, Number.NaN, Number.POSITIVE_INFINITY])('refuses %p', (week) => {
    // 3.5 is the one that matters: it is in range, so only the integer check
    // stops it being paced as week 3.
    expect(failed(rotationFor(pete5k, week))).toBeInstanceOf(WeekRangeError)
  })

  it('reads the rotation length off the plan, not off a constant', () => {
    // The case twelve-weeks-in-threes made unrepresentable: a four-week cycle
    // puts week 5 in rotation 2, where a three-week one would call it rotation
    // 2 from week 4.
    const plan = planOf(4, 8)
    const rotations = [1, 2, 3, 4, 5, 6, 7, 8].map((week) => succeeded(rotationFor(plan, week)))
    expect(rotations).toEqual([1, 1, 1, 1, 2, 2, 2, 2])
  })

  it('refuses a week this plan does not have, however long other plans are', () => {
    // Week 9 is a perfectly good week of pete5k. It is not a week of an
    // eight-week plan, and the ceiling that says so now comes off the plan.
    const plan = planOf(4, 8)
    expect(succeeded(rotationFor(pete5k, 9))).toBe(3)
    expect(failed(rotationFor(plan, 9))).toMatchObject({
      _tag: 'Training.WeekRangeError',
      weekIndex: 9,
    })
  })
})

describe('isRotationEnd', () => {
  it.each([3, 6, 9, 12])('week %i closes its rotation', (week) => {
    expect(isRotationEnd(pete5k, week)).toBe(true)
  })

  it.each([1, 2, 4, 5, 7, 8, 10, 11])('week %i does not', (week) => {
    expect(isRotationEnd(pete5k, week)).toBe(false)
  })

  it.each([0, -3, 13, 15])('answers no for week %i rather than failing', (week) => {
    // Unlike rotationFor, "is this a rotation end" has an honest answer for a
    // week outside the plan, and it is no.
    expect(isRotationEnd(pete5k, week)).toBe(false)
  })

  it('closes a four-week rotation on week 4, not week 3', () => {
    const plan = planOf(4, 8)
    expect([1, 2, 3, 4, 5, 6, 7, 8].map((week) => isRotationEnd(plan, week))).toEqual([
      false,
      false,
      false,
      true,
      false,
      false,
      false,
      true,
    ])
  })

  it('agrees with rotationFor on where the rotations fall', () => {
    for (let week = 1; week <= 12; week += 1) {
      const rotation = succeeded(rotationFor(pete5k, week))
      const isLastWeekOfRotation = week === rotation * 3
      expect(isRotationEnd(pete5k, week), `week ${week}`).toBe(isLastWeekOfRotation)
    }
  })
})

describe('rotationNote', () => {
  it('opens a rotation on its first week', () => {
    for (const week of [1, 4, 7, 10])
      expect(succeeded(rotationNote(pete5k, week)).variant, `week ${week}`).toBe('first')
  })

  it('calls the middle week the middle', () => {
    for (const week of [2, 5, 8, 11])
      expect(succeeded(rotationNote(pete5k, week)).variant, `week ${week}`).toBe('middle')
  })

  it('closes a rotation on its last week', () => {
    for (const week of [3, 6, 9])
      expect(succeeded(rotationNote(pete5k, week)).variant, `week ${week}`).toBe('last')
  })

  it('lets the end of the plan win over the end of the rotation', () => {
    // Week 12 closes rotation 4 *and* the plan. Saying "from week 13 the
    // cycle restarts" would name a week that does not exist, so the plan's
    // ending is the one worth saying.
    expect(succeeded(rotationNote(pete5k, 12)).variant).toBe('final')
    expect(isRotationEnd(pete5k, 12)).toBe(true)
  })

  it('carries the rotation and the week the next one opens on', () => {
    expect(succeeded(rotationNote(pete5k, 3))).toEqual({
      variant: 'last',
      rotation: 1,
      nextWeek: 4,
    })
  })

  it('agrees with rotationFor on every week of the plan', () => {
    for (let week = 1; week <= 12; week += 1)
      expect(succeeded(rotationNote(pete5k, week)).rotation, `week ${week}`).toBe(
        succeeded(rotationFor(pete5k, week)),
      )
  })

  it('reads the final week off the plan rather than assuming twelve', () => {
    // Both plans are twelve weeks today. The lite plan is the one that would
    // notice first if that stopped being true.
    expect(succeeded(rotationNote(pete5kLite, pete5kLite.weeks.length)).variant).toBe('final')
    expect(failed(rotationNote(EMPTY_PLAN, 1))).toBeInstanceOf(WeekRangeError)
  })

  it('names the positions of a two-week rotation without inventing a middle', () => {
    const plan = planOf(2, 6)
    expect([1, 2, 3, 4].map((week) => succeeded(rotationNote(plan, week)).variant)).toEqual([
      'first',
      'last',
      'first',
      'last',
    ])
  })

  it('calls a one-week rotation the last week of its cycle, not the first', () => {
    // `first` and `last` collide when the cycle is one week long. The sentence
    // worth printing is the one about the cycle restarting.
    const plan = planOf(1, 4)
    expect([1, 2, 3].map((week) => succeeded(rotationNote(plan, week)).variant)).toEqual([
      'last',
      'last',
      'last',
    ])
  })

  it('keeps a middle for a rotation long enough to have one', () => {
    const plan = planOf(4, 8)
    expect([1, 2, 3, 4].map((week) => succeeded(rotationNote(plan, week)).variant)).toEqual([
      'first',
      'middle',
      'middle',
      'last',
    ])
  })

  it.each([0, 13, 1.5, Number.NaN])('refuses week %p', (weekIndex) => {
    expect(failed(rotationNote(pete5k, weekIndex))).toBeInstanceOf(WeekRangeError)
  })
})
