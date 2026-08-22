import type { Benchmark, PlanEnrolment, Workout } from '@/db'

import type { Plan } from './types'

/**
 * What the stored rows say about where the athlete stands.
 *
 * Three tables arrive as flat arrays and three questions have to be answered
 * from them before any screen can render: which 2k paces you, which plan you
 * are on, and which of its sessions are behind you. Each answer is a decision
 * with an edge case — two benchmarks recorded in the same millisecond, an
 * enrolment naming a plan that is no longer in the catalogue, a workout
 * logged against another plan's session — and each one is answered here,
 * once, rather than in a `computed` on every screen that asks.
 *
 * The inputs are database rows and the output is never one: nothing in this
 * module writes, and nothing it returns is stored. That is what keeps
 * completion derived — see `schedule.ts` for why the database holds no second
 * copy of "how far along am I".
 *
 * Pure by construction: no clock, no storage, no ambient reads.
 * docs/functional-core.md.
 */

/**
 * The benchmark kind every target is derived from.
 *
 * A 5k or 6k time is a legitimate row and a useless substitute: `targets.ts`
 * reads its argument as a 2k, so pacing off a 5k would quietly hand every
 * session in the plan a target some fifteen seconds too slow and say nothing.
 * Filtering here is what makes "no 2k yet" a state the screen can show.
 */
const BENCHMARK_KIND = '2k'

/**
 * The 2k the plan is paced from: the most recently recorded one.
 *
 * Recorded, not fastest. A benchmark is a statement about your current
 * fitness, and last winter's personal best is not one — pacing a plan off it
 * makes every session too hard for as long as it stands. Ties go to the row
 * that arrives later, so re-entering a time you mistyped takes effect even
 * when both rows land in the same millisecond.
 */
export function currentBenchmark(benchmarks: ReadonlyArray<Benchmark>): Benchmark | null {
  let latest: Benchmark | null = null

  for (const benchmark of benchmarks) {
    if (benchmark.kind !== BENCHMARK_KIND) continue
    if (latest === null || benchmark.recordedAt >= latest.recordedAt) latest = benchmark
  }

  return latest
}

/**
 * The plan the active enrolment names, or `null`.
 *
 * Two ways to get nothing, and they are deliberately the same answer: nobody
 * has enrolled, or the enrolment points at a plan this build no longer ships.
 * The second is not hypothetical — enrolments survive a backup taken against
 * an older catalogue — and the screen's response to both is the same one, so
 * distinguishing them here would only push the decision outward.
 *
 * The **most recently started** active enrolment wins. The repository keeps
 * there to only be one — `create` and `putMany` both deactivate the others in
 * their own transaction — so this tiebreak should never be reached. It exists
 * because the alternative was taking whichever came first, and "first" out of
 * `toArray()` is primary-key order over random UUIDs: an answer that is
 * arbitrary rather than merely unlikely. `startedAt` is on every row, and the
 * plan you started last is what "the plan I am on" means.
 */
export function activePlan(
  plans: ReadonlyArray<Plan>,
  enrolments: ReadonlyArray<PlanEnrolment>,
): Plan | null {
  let enrolment: PlanEnrolment | null = null

  for (const candidate of enrolments) {
    if (!candidate.active) continue
    if (enrolment === null || candidate.startedAt >= enrolment.startedAt) enrolment = candidate
  }

  if (enrolment === null) return null

  return plans.find((plan) => plan.id === enrolment.planId) ?? null
}

/**
 * The plan sessions that have a workout logged against them.
 *
 * Every plan's sessions at once, not one plan's: the ids are globally unique
 * (`pete5k-w3-s2`), so filtering by plan would be work that changes no
 * answer, and `positionFor` already ignores ids that are not its own.
 */
export function completedSessionIds(workouts: ReadonlyArray<Workout>): ReadonlySet<string> {
  const ids = new Set<string>()

  for (const workout of workouts) {
    if (workout.planSessionId !== undefined) ids.add(workout.planSessionId)
  }

  return ids
}

/** What a plan offers, before you have done any of it. */
export interface PlanSummary {
  readonly weekCount: number
  readonly sessionsPerWeek: number
  readonly totalSessions: number
}

/**
 * The three numbers a browse card prints, counted off the plan itself.
 *
 * `sessionsPerWeek` is the widest week rather than the average, because it is
 * read as a commitment — "six a week" is what you have to have time for, and
 * a taper week that asks for five does not change that.
 */
export function planSummary(plan: Plan): PlanSummary {
  let sessionsPerWeek = 0
  let totalSessions = 0

  for (const week of plan.weeks) {
    sessionsPerWeek = Math.max(sessionsPerWeek, week.sessions.length)
    totalSessions += week.sessions.length
  }

  return { weekCount: plan.weeks.length, sessionsPerWeek, totalSessions }
}
