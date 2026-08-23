import { describe, expect, it } from '@effect/vitest'
import { Result } from 'effect'

import { pete5k, pete5kLite, peteBeginner } from '@/features/training/catalog'
import {
  isRotationEnd,
  nextSession,
  positionFor,
  requiredSessionCount,
  rotationFor,
  rotationNote,
  WeekRangeError,
} from '@/features/training/schedule'
import type { Plan, PlanWeek } from '@/features/training/types'

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

/** The sessions of a week that `positionFor` counts, in order. */
const requiredOf = (week: PlanWeek) => week.sessions.filter((session) => session.optional !== true)

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
    //
    // `sessionIndex` counts required sessions, so it indexes the *required*
    // list — the two coincide for pete5k, which has no optional sessions, and
    // the interleaved plan below is where the difference is actually proven.
    for (const done of [0, 1, 5, 6, 13, 40, 70]) {
      const completed = firstIds(pete5k, done)
      const { weekIndex, sessionIndex } = positionFor(pete5k, completed)
      const required = requiredOf(pete5k.weeks[weekIndex - 1])

      expect(nextSession(pete5k, completed), `after ${done}`).toBe(required[sessionIndex - 1])
    }
  })
})

describe('optional sessions', () => {
  /**
   * The beginner plan is the shape the flag exists for: five sessions printed
   * every week, three of them asked for. Everything here would pass trivially
   * against a plan with no optional sessions, which is why it is asserted
   * against the one that has 48.
   */
  const WEEK_ONE = peteBeginner.weeks[0]
  const core = WEEK_ONE.sessions.slice(0, 3).map((session) => session.id)

  it('does not count toward the plan', () => {
    // 24 weeks × 3, not × 5. The bar is out of what the plan asks for, so
    // finishing what it asks for finishes it.
    expect(positionFor(peteBeginner, []).total).toBe(72)
  })

  it('is not what comes next, however long it goes unrowed', () => {
    const next = nextSession(peteBeginner, core)

    expect(next?.id).toBe('pete-beginner-w2-s1')
    expect(next?.optional).toBeUndefined()
  })

  it('does not stall the plan it sits at the end of', () => {
    // The failure this guards: an optional day nobody meant to row becoming
    // the session Today offers forever, with the bar frozen behind it.
    const position = positionFor(peteBeginner, core)

    expect(position.weekIndex).toBe(2)
    expect(position.sessionIndex).toBe(1)
    expect(position.done).toBe(3)
  })

  it('moves nothing when it is rowed', () => {
    // Logged, ticked in the week list, and worth no progress. That is what
    // optional means — the alternative is a plan you can finish early by
    // doing extra work.
    const withExtras = positionFor(peteBeginner, [...core, 'pete-beginner-w1-s4'])

    expect(withExtras.done).toBe(3)
    expect(withExtras.total).toBe(72)
  })

  it('counts a week by what it asks for, not by what it prints', () => {
    // The other half of "Session 1 of 3". An ordinal counted over required
    // sessions and a total counted over all of them is a counter that stops
    // at 3 and claims to be going to 5.
    expect(requiredSessionCount(WEEK_ONE)).toBe(3)
    expect(WEEK_ONE.sessions.length).toBe(5)
    expect(requiredSessionCount(pete5k.weeks[0])).toBe(pete5k.weeks[0].sessions.length)
  })

  it('numbers required sessions in order even when an optional one splits them', () => {
    // Every plan in the catalogue appends its optional sessions, so a slot in
    // `week.sessions` happens to be the right ordinal — and would stop being
    // one the day a plan does not. Asserted against a plan that already does
    // not, so the fix cannot rot back into an array index.
    const interleaved: Plan = {
      ...pete5kLite,
      id: 'interleaved',
      weeks: [
        {
          index: 1,
          sessions: [
            { id: 'interleaved-w1-s1', kind: 'steady', minDistanceM: 10_000 },
            { id: 'interleaved-w1-s2', kind: 'steady', minDistanceM: 10_000, optional: true },
            { id: 'interleaved-w1-s3', kind: 'steady', minDistanceM: 10_000 },
          ],
        },
      ],
    }
    const position = positionFor(interleaved, ['interleaved-w1-s1'])

    // The second *required* session, which sits third in the printed week.
    expect(position.sessionIndex).toBe(2)
    expect(position.total).toBe(2)
    expect(nextSession(interleaved, ['interleaved-w1-s1'])?.id).toBe('interleaved-w1-s3')
  })

  it('reaches the end when every required session is done', () => {
    const required = peteBeginner.weeks.flatMap((week) =>
      week.sessions.filter((session) => session.optional !== true).map((session) => session.id),
    )
    const position = positionFor(peteBeginner, required)

    expect(position.done).toBe(position.total)
    expect(position.weekIndex).toBe(24)
    expect(nextSession(peteBeginner, required)).toBeNull()
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
