import { describe, expect, it } from '@effect/vitest'
import { Result } from 'effect'

import type { Workout } from '@/db'
import {
  DurationFormatError,
  DurationRangeError,
  elapsed,
  filterWorkouts,
  formatDuration,
  groupByWeek,
  monthTotals,
  parseDuration,
  WORKOUT_FILTERS,
} from '@/features/training/history'

/**
 * The log's arithmetic, and one case in particular.
 *
 * Every timestamp below is built with local `Date` constructors rather than
 * as a literal number, so the assertions hold in any timezone: the fixture
 * and the function under test read the same wall clock. That is also the
 * point of the module — a rower's week is the one on their wall.
 */

/** Local midnight-relative timestamps, so the tests travel. */
const at = (year: number, month: number, day: number, hour = 9): number =>
  new Date(year, month - 1, day, hour).getTime()

/** Saturday, 22 August 2026 — the day the design canvas is drawn on. */
const SATURDAY = at(2026, 8, 22)

const workout = (fields: Partial<Workout> & Pick<Workout, 'startedAt'>): Workout => ({
  id: `w${fields.startedAt}`,
  source: 'manual',
  distanceM: 10_000,
  durationMs: 2_520_000,
  avgSplitMs: 126_000,
  intervals: [],
  ...fields,
})

const bucketsOf = (groups: ReturnType<typeof groupByWeek>): Array<string> =>
  groups.map((group) => group.bucket)

const idsIn = (groups: ReturnType<typeof groupByWeek>, bucket: string): Array<string> =>
  groups.find((group) => group.bucket === bucket)?.workouts.map((one) => one.id) ?? []

describe('groupByWeek', () => {
  it('keeps a Tuesday session in this week when read on a Saturday', () => {
    // The case the design review caught. `Math.floor(t / WEEK_MS)` is the
    // tempting one-liner: the epoch began on a Thursday, so its week boundary
    // falls between Tuesday and Saturday and this workout would be filed
    // under "last week" — on the same Saturday the rower rowed it.
    const tuesday = workout({ id: 'tuesday', startedAt: at(2026, 8, 18) })

    expect(idsIn(groupByWeek([tuesday], SATURDAY), 'thisWeek')).toEqual(['tuesday'])
  })

  it('starts the week on Monday', () => {
    const monday = workout({ id: 'monday', startedAt: at(2026, 8, 17, 6) })
    const sundayBefore = workout({ id: 'sunday', startedAt: at(2026, 8, 16, 22) })

    const groups = groupByWeek([monday, sundayBefore], SATURDAY)

    expect(idsIn(groups, 'thisWeek')).toEqual(['monday'])
    expect(idsIn(groups, 'lastWeek')).toEqual(['sunday'])
  })

  it('puts the Sunday you are reading on in the week that just ended', () => {
    // The other end of the same boundary: a rower checking the log on Sunday
    // evening is still in the week they have been training all week.
    const sunday = at(2026, 8, 23, 20)
    const tuesday = workout({ id: 'tuesday', startedAt: at(2026, 8, 18) })

    expect(idsIn(groupByWeek([tuesday], sunday), 'thisWeek')).toEqual(['tuesday'])
  })

  it('separates the week before from everything older', () => {
    const groups = groupByWeek(
      [
        workout({ id: 'this', startedAt: at(2026, 8, 20) }),
        workout({ id: 'last', startedAt: at(2026, 8, 14) }),
        workout({ id: 'older', startedAt: at(2026, 8, 6) }),
      ],
      SATURDAY,
    )

    expect(bucketsOf(groups)).toEqual(['thisWeek', 'lastWeek', 'earlier'])
    expect(idsIn(groups, 'earlier')).toEqual(['older'])
  })

  it('orders the newest first inside a group, whatever order it was handed', () => {
    const groups = groupByWeek(
      [
        workout({ id: 'wednesday', startedAt: at(2026, 8, 19) }),
        workout({ id: 'friday', startedAt: at(2026, 8, 21) }),
        workout({ id: 'monday', startedAt: at(2026, 8, 17) }),
      ],
      SATURDAY,
    )

    expect(idsIn(groups, 'thisWeek')).toEqual(['friday', 'wednesday', 'monday'])
  })

  it('counts the boundary instant itself as the start of the week', () => {
    // Midnight on Monday belongs to the week it opens, not the one it ends.
    // An exclusive comparison here loses the session of anyone who rows
    // before their first coffee on a Monday.
    const mondayMidnight = workout({ id: 'midnight', startedAt: at(2026, 8, 17, 0) })
    const sundayLast = workout({ id: 'sunday', startedAt: at(2026, 8, 16, 23) })

    const groups = groupByWeek([mondayMidnight, sundayLast], SATURDAY)

    expect(idsIn(groups, 'thisWeek')).toEqual(['midnight'])
    expect(idsIn(groups, 'lastWeek')).toEqual(['sunday'])
  })

  it('counts the same instant a week earlier as the start of last week', () => {
    const lastMondayMidnight = workout({ id: 'last', startedAt: at(2026, 8, 10, 0) })
    const older = workout({ id: 'older', startedAt: at(2026, 8, 9, 23) })

    const groups = groupByWeek([lastMondayMidnight, older], SATURDAY)

    expect(idsIn(groups, 'lastWeek')).toEqual(['last'])
    expect(idsIn(groups, 'earlier')).toEqual(['older'])
  })

  it('leaves out a heading with nothing under it', () => {
    const groups = groupByWeek([workout({ id: 'old', startedAt: at(2026, 6, 1) })], SATURDAY)

    expect(bucketsOf(groups)).toEqual(['earlier'])
  })

  it('is empty when the log is', () => {
    expect(groupByWeek([], SATURDAY)).toEqual([])
  })

  it('does not mutate what it was given', () => {
    const workouts = [
      workout({ id: 'a', startedAt: at(2026, 8, 17) }),
      workout({ id: 'b', startedAt: at(2026, 8, 21) }),
    ]

    groupByWeek(workouts, SATURDAY)

    expect(workouts.map((one) => one.id)).toEqual(['a', 'b'])
  })

  it('keeps a workout stamped in the future in this week rather than losing it', () => {
    // Clock skew and imported backups both produce these, and a workout that
    // belongs to no group is a workout that vanishes off the screen.
    const future = workout({ id: 'future', startedAt: at(2026, 9, 30) })

    expect(idsIn(groupByWeek([future], SATURDAY), 'thisWeek')).toEqual(['future'])
  })
})

describe('monthTotals', () => {
  it('adds up the calendar month `now` falls in', () => {
    const totals = monthTotals(
      [
        workout({ startedAt: at(2026, 8, 3), distanceM: 10_000, durationMs: 2_520_000 }),
        workout({ startedAt: at(2026, 8, 20), distanceM: 6000, durationMs: 1_446_000 }),
      ],
      SATURDAY,
    )

    expect(totals).toEqual({ distanceM: 16_000, durationMs: 3_966_000, sessions: 2 })
  })

  it('leaves out the month before and the month after', () => {
    const totals = monthTotals(
      [
        workout({ startedAt: at(2026, 7, 31, 23) }),
        workout({ startedAt: at(2026, 8, 1, 0) }),
        workout({ startedAt: at(2026, 9, 1, 0) }),
      ],
      SATURDAY,
    )

    expect(totals.sessions).toBe(1)
  })

  it('is zeroes for a month with nothing in it', () => {
    expect(monthTotals([], SATURDAY)).toEqual({ distanceM: 0, durationMs: 0, sessions: 0 })
  })

  it('handles the month-end arithmetic that trips setMonth', () => {
    // 31 January plus one month is 3 March if the day is not reset first.
    const january = at(2026, 1, 31, 12)
    const februaryFirst = workout({ startedAt: at(2026, 2, 1, 0) })

    expect(monthTotals([februaryFirst], january).sessions).toBe(0)
  })
})

describe('filterWorkouts', () => {
  const planned = workout({ id: 'planned', startedAt: 1, planSessionId: 'pete5k-w1-s1' })
  const free = workout({ id: 'free', startedAt: 2 })

  it('lists the filters the log offers', () => {
    expect(WORKOUT_FILTERS).toEqual(['all', 'plan', 'free'])
  })

  it('keeps everything under all', () => {
    expect(filterWorkouts([planned, free], 'all')).toEqual([planned, free])
  })

  it('keeps only what a plan asked for', () => {
    expect(filterWorkouts([planned, free], 'plan')).toEqual([planned])
  })

  it('keeps only what nothing asked for', () => {
    expect(filterWorkouts([planned, free], 'free')).toEqual([free])
  })
})

describe('formatDuration', () => {
  it.each([
    [2_587_000, '43:07'],
    [1_446_000, '24:06'],
    [0, '0:00'],
    [7000, '0:07'],
    [3_802_000, '1:03:22'],
    [3_600_000, '1:00:00'],
    [3_599_000, '59:59'],
  ])('writes %p ms as %p', (durationMs, expected) => {
    expect(formatDuration(durationMs)).toBe(expected)
  })

  it('never pads the leading field, so an hour cannot be mistaken for a minute', () => {
    expect(formatDuration(3_802_000).startsWith('1:')).toBe(true)
    expect(formatDuration(247_000)).toBe('4:07')
  })
})

describe('elapsed', () => {
  it.each([
    [35_640_000, { hours: 9, minutes: 54 }],
    [3_600_000, { hours: 1, minutes: 0 }],
    [59_000, { hours: 0, minutes: 0 }],
    [0, { hours: 0, minutes: 0 }],
  ])('breaks %p ms into %o', (durationMs, expected) => {
    expect(elapsed(durationMs)).toEqual(expected)
  })

  it('truncates rather than rounds — a total is not a stopwatch', () => {
    expect(elapsed(119_000)).toEqual({ hours: 0, minutes: 1 })
  })
})

describe('parseDuration', () => {
  const succeeded = <A, E>(result: Result.Result<A, E>): A => Result.getOrThrow(result)
  const failed = <A, E>(result: Result.Result<A, E>): E => Result.getOrThrow(Result.flip(result))

  it.each([
    ['43:07', 2_587_000],
    ['24:06', 1_446_000],
    ['7:04.2', 424_200],
    ['1:03:22', 3_802_000],
    [' 43:07 ', 2_587_000],
  ])('reads %p as %p ms', (text, expected) => {
    expect(succeeded(parseDuration(text))).toBe(expected)
  })

  it('reads two fields as minutes and seconds, three as hours too', () => {
    // The rule a monitor follows, and why "1:03" is a minute rather than an
    // hour: the fields fill from the right.
    expect(succeeded(parseDuration('1:03'))).toBe(63_000)
    expect(succeeded(parseDuration('1:03:00'))).toBe(3_780_000)
  })

  it('round-trips whatever formatDuration writes', () => {
    for (const durationMs of [7000, 247_000, 2_587_000, 3_802_000])
      expect(succeeded(parseDuration(formatDuration(durationMs)))).toBe(durationMs)
  })

  it('keeps every digit of a fraction, rather than only the first', () => {
    // A PM5 shows tenths; an online result can carry hundredths. Truncating
    // the pattern to one digit would reject the second silently.
    expect(succeeded(parseDuration('7:04.25'))).toBe(424_250)
    expect(succeeded(parseDuration('7:04.2'))).toBe(424_200)
  })

  it.each(['43:7', '', 'forty three', '43', '43:60', '1:3:22', '43:07:', ':07'])(
    'refuses %p as a typo rather than guessing',
    (text) => {
      expect(failed(parseDuration(text))).toBeInstanceOf(DurationFormatError)
    },
  )

  it('carries the text it could not read, namespaced so a catchTags cannot collide', () => {
    // The tag is the whole recovery API — a component matches on the string,
    // never on the constructor — so it is asserted rather than assumed.
    expect(failed(parseDuration('43:7'))).toMatchObject({
      _tag: 'Training.DurationFormatError',
      input: '43:7',
    })
  })

  it('refuses a time that is well-formed and still not a workout', () => {
    expect(failed(parseDuration('0:00'))).toBeInstanceOf(DurationRangeError)
    expect(failed(parseDuration('0:00:00'))).toBeInstanceOf(DurationRangeError)
  })

  it('carries the duration it rejected, so a message can name it', () => {
    expect(failed(parseDuration('0:00'))).toMatchObject({
      _tag: 'Training.DurationRangeError',
      durationMs: 0,
    })
  })
})
