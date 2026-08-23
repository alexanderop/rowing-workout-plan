import { Result } from 'effect'

import { rotationFor } from './schedule'
import { targetFor } from './targets'
import type { SessionTarget } from './targets'
import type { PlanSession, PlanWeek } from './types'

/**
 * A week of the plan, priced.
 *
 * `targets.ts` prices a session against a *rotation* and `schedule.ts` says
 * which rotation a week is; every screen that lists sessions had to know both
 * and join them by hand. Three screens did, in three copies of the same
 * five-line `Result.flatMap`/`getOrElse` chain — and a fourth screen would
 * have written a fourth. Worse, the chain decides what happens when there is
 * no answer, and a decision written three times is a decision three screens
 * can disagree about.
 *
 * So this module owns the join, and the shell asks it the question it
 * actually has: *what do I put on the screen for this week?*
 *
 * Pure by construction: no clock, no storage, no ambient reads.
 * docs/functional-core.md.
 */

/**
 * The target for one session of one plan week, or `null`.
 *
 * Three ways to get nothing and one answer for all of them: no 2k has been
 * entered yet, the week is outside the plan's rotation table, or the pace
 * arithmetic could not price this session. A screen lists the session either
 * way — what you are meant to row does not depend on knowing how fast — so
 * distinguishing them would only push a decision outward that has one answer.
 *
 * `benchmark2kMs` is nullable on purpose. "No benchmark yet" is the app's
 * opening state, not an error, and every caller had to write the same guard
 * before it could call `targetFor`.
 */
export function targetInWeek(
  session: PlanSession,
  benchmark2kMs: number | null,
  weekIndex: number,
): SessionTarget | null {
  if (benchmark2kMs === null) return null

  return Result.getOrElse(
    Result.flatMap(rotationFor(weekIndex), (rotation) =>
      targetFor(session, benchmark2kMs, rotation),
    ),
    () => null,
  )
}

/** One line of a week's session list — exactly what `SessionRow` renders. */
export interface WeekRow {
  readonly session: PlanSession
  /** 1-based, as the row prints it. */
  readonly position: number
  readonly target: SessionTarget | null
  readonly done: boolean
}

/** What a week's rows are derived from, beyond the week itself. */
export interface WeekContext {
  readonly benchmark2kMs: number | null
  /** Plan-session ids with a workout logged against them — `progress.completedSessionIds`. */
  readonly completedIds: ReadonlySet<string>
}

/**
 * A week's sessions as the rows a screen renders, in plan order.
 *
 * Today and the week detail both list a week and both print the same three
 * things beside each session; before this they built that list separately,
 * which is how the app once showed one steady session as a band on one screen
 * and a single split on another. The list is now one function, so the two
 * screens cannot drift — and because it is core, the ordering and the
 * position numbering are unit-tested rather than eyeballed.
 *
 * A missing week is an empty list rather than a failure: a screen that has
 * not resolved its week yet renders nothing, which is what it wants.
 */
export function weekRows(week: PlanWeek | null, context: WeekContext): ReadonlyArray<WeekRow> {
  if (week === null) return []

  return week.sessions.map((session, index) => ({
    session,
    position: index + 1,
    target: targetInWeek(session, context.benchmark2kMs, week.index),
    done: context.completedIds.has(session.id),
  }))
}

/** The week a plan calls `index`, or `null` — the lookup every caller of {@link weekRows} does first. */
export function weekAt(weeks: ReadonlyArray<PlanWeek>, weekIndex: number): PlanWeek | null {
  return weeks.find((candidate) => candidate.index === weekIndex) ?? null
}
