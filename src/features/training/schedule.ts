import { Result, Schema } from 'effect'

import { PLAN_WEEKS, ROTATION_WEEKS } from './catalog'
import type { Plan, PlanSession } from './types'

/**
 * Where you are in a plan, and what the rotation means at that point.
 *
 * Completion is not stored. It is derived from the workouts that carry a
 * `planSessionId`, so this module takes the completed ids as a parameter and
 * the database never holds a second, drifting copy of "how far along am I".
 * That is also why every function here is total in the plan: it has to give a
 * sane answer for a set of ids that includes sessions from another plan, or
 * skipped ones, because a real log has both.
 *
 * Pure by construction: no clock, no storage, no ambient reads.
 * docs/functional-core.md.
 */

/** Which pass through the three-week cycle a week belongs to. */
export type Rotation = 1 | 2 | 3 | 4

/**
 * A week index that is not a week of the plan: zero, negative, past the end,
 * or fractional. Namespaced like `pace.ts`'s failures so `Training.…` and
 * `Db.…` can never collide in one `catchTags`.
 */
export class WeekRangeError extends Schema.TaggedError<WeekRangeError>()(
  'Training.WeekRangeError',
  {
    weekIndex: Schema.Number,
  },
) {}

/**
 * Where the next session sits, and how much of the plan is behind it.
 *
 * `weekIndex` and `sessionIndex` are 1-based, matching every screen that says
 * "Week 3 · Session 2 of 6". `done` counts the plan's sessions that are
 * complete, which is not the same as `sessionIndex - 1`: skip session 2 and
 * come back to it and the two disagree, correctly.
 */
export interface PlanPosition {
  readonly weekIndex: number
  readonly sessionIndex: number
  readonly done: number
  readonly total: number
}

/**
 * The next unfinished session, and the totals either side of it.
 *
 * "Next" is the *first* session not yet done rather than the one after the
 * last done: a rower who skipped week 2's long intervals should be offered
 * them again, not have them silently written off. When everything is done the
 * position clamps to the final session and `done === total` is the completion
 * test — there is no session after the last one to point at, and inventing one
 * puts an out-of-range index on a screen.
 *
 * A plan with no weeks reports zeroes, which are out of band for 1-based
 * indices and read as "nowhere in an empty plan".
 */
export function positionFor(plan: Plan, completedSessionIds: Iterable<string>): PlanPosition {
  const completed = new Set(completedSessionIds)

  let done = 0
  let total = 0
  let next: Pick<PlanPosition, 'weekIndex' | 'sessionIndex'> | null = null
  let last: Pick<PlanPosition, 'weekIndex' | 'sessionIndex'> | null = null

  for (const week of plan.weeks) {
    for (const [position, session] of week.sessions.entries()) {
      total += 1
      last = { weekIndex: week.index, sessionIndex: position + 1 }

      if (completed.has(session.id)) done += 1
      else if (next === null) next = last
    }
  }

  const at = next ?? last
  return { weekIndex: at?.weekIndex ?? 0, sessionIndex: at?.sessionIndex ?? 0, done, total }
}

/**
 * The session {@link positionFor} points at, or `null` once the plan is done.
 *
 * Scans for itself rather than looking up `positionFor`'s indices: resolving a
 * week index back to a week needs a `find`, and the "no such week" branch that
 * comes with it is unreachable by construction — dead code no test can enter
 * and no reader can discount. Both functions answer "the first session not
 * done"; saying it twice in four lines is cheaper than a branch that lies.
 */
export function nextSession(plan: Plan, completedSessionIds: Iterable<string>): PlanSession | null {
  const completed = new Set(completedSessionIds)

  for (const week of plan.weeks)
    for (const session of week.sessions) if (!completed.has(session.id)) return session

  return null
}

/** Whether a number is a week of the plan at all. */
function isPlanWeek(weekIndex: number): boolean {
  return Number.isInteger(weekIndex) && weekIndex >= 1 && weekIndex <= PLAN_WEEKS
}

/**
 * Which rotation a week belongs to: weeks 1–3 are rotation 1, 4–6 rotation 2,
 * and so on.
 *
 * A `Result` rather than a clamp because the return type is four literals and
 * there is no honest fourth-and-a-bit — week 13 is not "rotation 4 again", it
 * is a week this plan does not have, and a clamp would quietly pace it as if
 * it did. When the ongoing plan lands, this is where the ceiling comes off.
 */
export function rotationFor(weekIndex: number): Result.Result<Rotation, WeekRangeError> {
  if (!isPlanWeek(weekIndex)) return Result.fail(new WeekRangeError({ weekIndex }))

  // SAFETY: the guard above has established 1 <= weekIndex <= 12 and integral,
  // so the quotient is 0..3 and the result is one of the four literals. The
  // cast is what a dependent return type would express if TypeScript had one.
  return Result.succeed((Math.floor((weekIndex - 1) / ROTATION_WEEKS) + 1) as Rotation)
}

/**
 * Whether a week closes its rotation — the week the reps are at their longest
 * and the paced 2k re-targets the next three.
 *
 * Total where {@link rotationFor} is not: "is week 13 a rotation end" has an
 * honest answer, and it is no.
 */
export function isRotationEnd(weekIndex: number): boolean {
  return isPlanWeek(weekIndex) && weekIndex % ROTATION_WEEKS === 0
}

/**
 * Which sentence a week gets: where it sits in its rotation, or that it is
 * the last week of the plan.
 *
 * The four variants are the four things worth saying about a week, and the
 * plan's end wins over the rotation's: on the final week "from week 13 the
 * cycle restarts" is not merely unhelpful, it names a week that does not
 * exist. Nothing here is a sentence — the variant is the key a screen looks
 * up and the numbers are what it fills in.
 */
type RotationVariant = 'first' | 'middle' | 'last' | 'final'

const VARIANTS: ReadonlyArray<RotationVariant> = ['first', 'middle', 'last']

export interface RotationNote {
  readonly variant: RotationVariant
  readonly rotation: Rotation
  /** The week the next rotation opens on. Unused by the `final` sentence. */
  readonly nextWeek: number
}

export function rotationNote(
  plan: Plan,
  weekIndex: number,
): Result.Result<RotationNote, WeekRangeError> {
  return Result.map(rotationFor(weekIndex), (rotation) => {
    const slot = (weekIndex - 1) % ROTATION_WEEKS
    const isFinalWeek = weekIndex === plan.weeks.length

    // SAFETY: `slot` is 0..2 by construction — `rotationFor` has already
    // rejected a non-integral or out-of-range week — and VARIANTS has an
    // entry for each. The index is total; only TypeScript cannot see it.
    const variant = isFinalWeek ? 'final' : (VARIANTS[slot] as RotationVariant)

    return { variant, rotation, nextWeek: weekIndex + 1 }
  })
}
