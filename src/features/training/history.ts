import type { Workout } from '@/db'

/**
 * The log's own vocabulary: which week a workout belongs to, what a month
 * adds up to, and how a duration is written and read.
 *
 * Everything here takes `now` as a parameter. That is the functional-core
 * rule, and it is also the only way the interesting case is testable at all:
 * "this week" depends entirely on what day it is, so a module that reads the
 * clock can only be tested on the day it happens to be run.
 *
 * The weeks are **local calendar weeks starting Monday**, not rolling
 * seven-day windows and emphatically not epoch weeks. `Math.floor(t / WEEK)`
 * is the tempting one-liner and it is wrong: the epoch began on a Thursday,
 * so its week boundaries fall mid-week, and a Tuesday session viewed on a
 * Saturday lands under "last week". That is the case the design review
 * caught, and `history.spec.ts` pins it.
 *
 * Local time is deliberate rather than an oversight: a rower's week is the
 * one on their wall. It is also why the date arithmetic goes through `Date`
 * mutators (`setDate`, `setHours`) instead of subtracting milliseconds —
 * across a daylight-saving boundary a "week" is 167 or 169 hours, and
 * subtracting 7 × 86,400,000 puts Monday an hour into Sunday twice a year.
 *
 * Pure by construction: no clock, no storage, no ambient reads.
 * docs/functional-core.md.
 */

const MS_PER_SECOND = 1000
const SECONDS_PER_MINUTE = 60
const MINUTES_PER_HOUR = 60
const DAYS_PER_WEEK = 7

/** Which of the log's three headings a workout sits under. */
type HistoryBucket = 'thisWeek' | 'lastWeek' | 'earlier'

/** In the order the log shows them, newest first. */
const BUCKETS: ReadonlyArray<HistoryBucket> = ['thisWeek', 'lastWeek', 'earlier']

export interface WorkoutGroup {
  readonly bucket: HistoryBucket
  readonly workouts: ReadonlyArray<Workout>
}

/** Midnight local time on the Monday of the week a timestamp falls in. */
function startOfWeek(at: number): number {
  const date = new Date(at)
  date.setHours(0, 0, 0, 0)

  // `getDay()` counts from Sunday. A rowing week — and an ISO one — starts on
  // Monday, so Sunday is six days *into* its week rather than the first day of
  // the next one, which is the off-by-one this expression exists to avoid.
  const daysSinceMonday = (date.getDay() + DAYS_PER_WEEK - 1) % DAYS_PER_WEEK
  date.setDate(date.getDate() - daysSinceMonday)

  return date.getTime()
}

function bucketFor(startedAt: number, thisWeek: number, lastWeek: number): HistoryBucket {
  if (startedAt >= thisWeek) return 'thisWeek'
  if (startedAt >= lastWeek) return 'lastWeek'

  return 'earlier'
}

/**
 * The log, under its headings. Newest first inside each group, and an empty
 * group is left out rather than rendered as a heading with nothing under it.
 *
 * The order is imposed here rather than trusted from the caller: the
 * repository does return workouts newest first, but a screen that depends on
 * that silently re-orders itself the day someone adds a second read path.
 */
export function groupByWeek(
  workouts: ReadonlyArray<Workout>,
  now: number,
): ReadonlyArray<WorkoutGroup> {
  const thisWeek = startOfWeek(now)
  // One millisecond before this Monday is the previous Sunday night, so the
  // week it belongs to is last week's — no subtraction of a fixed span, and
  // therefore nothing for a daylight-saving hour to shift.
  const lastWeek = startOfWeek(thisWeek - 1)
  const newestFirst = workouts.toSorted((left, right) => right.startedAt - left.startedAt)

  return BUCKETS.map((bucket) => ({
    bucket,
    workouts: newestFirst.filter(
      (workout) => bucketFor(workout.startedAt, thisWeek, lastWeek) === bucket,
    ),
  })).filter((group) => group.workouts.length > 0)
}

/** Midnight local time on the first of the month a timestamp falls in. */
function startOfMonth(at: number): number {
  const date = new Date(at)
  date.setHours(0, 0, 0, 0)
  date.setDate(1)

  return date.getTime()
}

/** The same, one month on — the exclusive upper bound of the month. */
function startOfNextMonth(at: number): number {
  const date = new Date(startOfMonth(at))
  // The day is already 1, which is what keeps this from being the classic
  // month-arithmetic bug: `setMonth(+1)` on the 31st of January lands in March.
  date.setMonth(date.getMonth() + 1)

  return date.getTime()
}

export interface MonthTotals {
  readonly distanceM: number
  readonly durationMs: number
  readonly sessions: number
}

/** What the calendar month containing `now` adds up to. */
export function monthTotals(workouts: ReadonlyArray<Workout>, now: number): MonthTotals {
  const from = startOfMonth(now)
  const until = startOfNextMonth(now)

  let distanceM = 0
  let durationMs = 0
  let sessions = 0

  for (const workout of workouts) {
    if (workout.startedAt < from || workout.startedAt >= until) continue
    distanceM += workout.distanceM
    durationMs += workout.durationMs
    sessions += 1
  }

  return { distanceM, durationMs, sessions }
}

/** The log's filter chips. `plan` is a session you were told to row. */
export type WorkoutFilter = 'all' | 'plan' | 'free'

export const WORKOUT_FILTERS: ReadonlyArray<WorkoutFilter> = ['all', 'plan', 'free']

export function filterWorkouts(
  workouts: ReadonlyArray<Workout>,
  filter: WorkoutFilter,
): ReadonlyArray<Workout> {
  if (filter === 'all') return workouts

  const wantsPlan = filter === 'plan'
  return workouts.filter((workout) => (workout.planSessionId !== undefined) === wantsPlan)
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/**
 * A workout's time as a monitor shows it: `43:07`, and `1:03:22` past the
 * hour. The leading field is never padded, because `04:07` reads as four
 * hours at a glance and 43:07 is the common case.
 */
export function formatDuration(durationMs: number): string {
  const totalSeconds = Math.round(durationMs / MS_PER_SECOND)
  const seconds = totalSeconds % SECONDS_PER_MINUTE
  const totalMinutes = Math.floor(totalSeconds / SECONDS_PER_MINUTE)
  const minutes = totalMinutes % MINUTES_PER_HOUR
  const hours = Math.floor(totalMinutes / MINUTES_PER_HOUR)

  if (hours === 0) return `${minutes}:${pad(seconds)}`
  return `${hours}:${pad(minutes)}:${pad(seconds)}`
}

/** Hours and minutes, for a total nobody reads to the second. */
export interface Elapsed {
  readonly hours: number
  readonly minutes: number
}

/**
 * A month's time, broken up for the message that writes it out. Data rather
 * than a string, because "9h 54m" is not how every language says it.
 */
export function elapsed(durationMs: number): Elapsed {
  const totalMinutes = Math.floor(durationMs / MS_PER_SECOND / SECONDS_PER_MINUTE)

  return {
    hours: Math.floor(totalMinutes / MINUTES_PER_HOUR),
    minutes: totalMinutes % MINUTES_PER_HOUR,
  }
}
