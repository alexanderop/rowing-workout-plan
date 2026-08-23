import { describe, expect, it } from '@effect/vitest'

import type { Benchmark, PlanEnrolment, Workout } from '@/db'
import { pete5k, pete5kLite, peteBeginner, PLANS } from '@/features/training/catalog'
import {
  activePlan,
  completedSessionIds,
  currentBenchmark,
  planSummary,
} from '@/features/training/progress'
import type { Plan, PlanSession } from '@/features/training/types'

/**
 * Three tables in, three answers out — and every assertion here is about the
 * case where the rows disagree with each other. The happy path is one line per
 * function; the reason the module exists is everything below it.
 */

function benchmark(fields: Partial<Benchmark> = {}): Benchmark {
  return { id: 'b1', kind: '2k', timeMs: 424_200, recordedAt: 1_000, ...fields }
}

function enrolment(fields: Partial<PlanEnrolment> = {}): PlanEnrolment {
  return { id: 'e1', planId: 'pete5k', startedAt: 1_000, active: true, ...fields }
}

function workout(fields: Partial<Workout> = {}): Workout {
  return {
    id: 'w1',
    startedAt: 1_000,
    source: 'manual',
    distanceM: 6_000,
    durationMs: 1_500_000,
    avgSplitMs: 125_000,
    intervals: [],
    ...fields,
  }
}

describe('currentBenchmark', () => {
  it('is null with nothing recorded', () => {
    expect(currentBenchmark([])).toBeNull()
  })

  it('takes the most recently recorded 2k, not the fastest', () => {
    const personalBest = benchmark({ id: 'old', timeMs: 400_000, recordedAt: 1_000 })
    const today = benchmark({ id: 'new', timeMs: 440_000, recordedAt: 2_000 })

    expect(currentBenchmark([today, personalBest])).toBe(today)
  })

  it('finds the latest wherever it sits in the list', () => {
    const latest = benchmark({ id: 'latest', recordedAt: 9_000 })

    expect(currentBenchmark([latest, benchmark({ id: 'a', recordedAt: 1 })])).toBe(latest)
    expect(currentBenchmark([benchmark({ id: 'a', recordedAt: 1 }), latest])).toBe(latest)
  })

  it('gives a tie to the row recorded last, so a correction takes effect', () => {
    // Two writes in the same millisecond is not hypothetical — it is what
    // re-entering a mistyped time looks like on a fast machine.
    const typo = benchmark({ id: 'typo', timeMs: 404_200, recordedAt: 5_000 })
    const correction = benchmark({ id: 'fixed', timeMs: 424_200, recordedAt: 5_000 })

    expect(currentBenchmark([typo, correction])).toBe(correction)
  })

  it('ignores a 5k or a 6k, which are not what the targets are derived from', () => {
    const other: ReadonlyArray<Benchmark> = [
      benchmark({ id: '5k', kind: '5k', recordedAt: 9_000 }),
      benchmark({ id: '6k', kind: '6k', recordedAt: 9_000 }),
    ]

    expect(currentBenchmark(other)).toBeNull()
    expect(currentBenchmark([...other, benchmark({ id: 'the 2k' })])?.id).toBe('the 2k')
  })
})

describe('activePlan', () => {
  it('is null with no enrolments at all', () => {
    expect(activePlan(PLANS, [])).toBeNull()
  })

  it('resolves the active enrolment to its catalogue entry', () => {
    expect(activePlan(PLANS, [enrolment({ planId: 'pete5k-lite' })])).toBe(pete5kLite)
  })

  it('skips enrolments that have been deactivated', () => {
    const rows = [
      enrolment({ id: 'past', planId: 'pete5k-lite', active: false }),
      enrolment({ id: 'now', planId: 'pete5k' }),
    ]

    expect(activePlan(PLANS, rows)).toBe(pete5k)
  })

  it('is null when every enrolment is inactive', () => {
    expect(activePlan(PLANS, [enrolment({ active: false })])).toBeNull()
  })

  it('is null when the active enrolment names a plan this build does not ship', () => {
    // Not hypothetical: an enrolment survives a backup taken against an older
    // catalogue, and the screen has to be able to say "no plan" rather than
    // crash on an undefined.
    expect(activePlan(PLANS, [enrolment({ planId: 'pete5k-2019' })])).toBeNull()
  })

  it('takes the most recently started when two rows are somehow both active', () => {
    // The repository keeps there to only be one, so this should be
    // unreachable. It is pinned because the alternative — whichever row came
    // first — is primary-key order over random UUIDs, which is arbitrary
    // rather than merely unlikely.
    const rows = [
      enrolment({ id: 'old', planId: 'pete5k', startedAt: 1_000 }),
      enrolment({ id: 'new', planId: 'pete5k-lite', startedAt: 2_000 }),
    ]

    expect(activePlan(PLANS, rows)).toBe(pete5kLite)
    expect(activePlan(PLANS, rows.toReversed())).toBe(pete5kLite)
  })

  it('gives a startedAt tie to the row that arrives later', () => {
    const rows = [
      enrolment({ id: 'a', planId: 'pete5k', startedAt: 5_000 }),
      enrolment({ id: 'b', planId: 'pete5k-lite', startedAt: 5_000 }),
    ]

    expect(activePlan(PLANS, rows)).toBe(pete5kLite)
  })

  it('ignores a deactivated row that started later than the active one', () => {
    const rows = [
      enrolment({ id: 'now', planId: 'pete5k', startedAt: 1_000 }),
      enrolment({ id: 'abandoned', planId: 'pete5k-lite', startedAt: 9_000, active: false }),
    ]

    expect(activePlan(PLANS, rows)).toBe(pete5k)
  })
})

describe('completedSessionIds', () => {
  it('is empty with no workouts', () => {
    expect([...completedSessionIds([])]).toEqual([])
  })

  it('collects the plan sessions a workout was logged against', () => {
    const rows = [
      workout({ id: 'a', planSessionId: 'pete5k-w1-s1' }),
      workout({ id: 'b', planSessionId: 'pete5k-w1-s2' }),
    ]

    expect([...completedSessionIds(rows)]).toEqual(['pete5k-w1-s1', 'pete5k-w1-s2'])
  })

  it('ignores a free row — a workout with no plan session behind it', () => {
    const rows = [
      workout({ id: 'free' }),
      workout({ id: 'planned', planSessionId: 'pete5k-w1-s1' }),
    ]

    expect([...completedSessionIds(rows)]).toEqual(['pete5k-w1-s1'])
  })

  it('counts a session rowed twice once', () => {
    const rows = [
      workout({ id: 'a', planSessionId: 'pete5k-w1-s1' }),
      workout({ id: 'b', planSessionId: 'pete5k-w1-s1' }),
    ]

    expect([...completedSessionIds(rows)]).toEqual(['pete5k-w1-s1'])
  })

  it('keeps every plan at once, because the ids already say which plan they are', () => {
    const rows = [
      workout({ id: 'a', planSessionId: 'pete5k-w1-s1' }),
      workout({ id: 'b', planSessionId: 'pete5k-lite-w1-s1' }),
    ]

    expect(completedSessionIds(rows).size).toBe(2)
  })
})

describe('planSummary', () => {
  /** `count` plain sessions for week `week`, ids positional as the real ones are. */
  const core = (count: number, week: number): PlanSession[] =>
    Array.from({ length: count }, (_unused, index) => ({
      id: `w${week}-s${index + 1}`,
      kind: 'steady' as const,
      minDistanceM: 10_000,
    }))

  /** The same, flagged — appended after a week's core sessions. */
  const extra = (count: number, week: number): PlanSession[] =>
    core(count, week).map((session, index) => ({
      ...session,
      id: `w${week}-x${index + 1}`,
      optional: true as const,
    }))

  it('counts the full plan', () => {
    expect(planSummary(pete5k)).toEqual({
      weekCount: 12,
      sessionsPerWeek: 6,
      optionalPerWeek: 0,
      totalSessions: 71,
    })
  })

  it('counts the lite plan', () => {
    expect(planSummary(pete5kLite)).toEqual({
      weekCount: 12,
      sessionsPerWeek: 3,
      optionalPerWeek: 0,
      totalSessions: 36,
    })
  })

  it('reports the widest week, not the average — the commitment is the maximum', () => {
    // pete5k's week 12 tapers to five, and a card claiming "5 / week" would
    // understate every other week of the plan.
    const finalWeek = pete5k.weeks.at(-1)
    expect(finalWeek?.sessions.length).toBe(5)
    expect(planSummary(pete5k).sessionsPerWeek).toBe(6)
  })

  it('reports zeroes for a plan with no weeks rather than dividing by one', () => {
    const empty: Plan = {
      id: 'empty',
      name: 'Empty',
      descriptionKey: 'plans.catalog.pete5k.description',
      source: 'test',
      rotationWeeks: 3,
      weeks: [],
    }

    expect(planSummary(empty)).toEqual({
      weekCount: 0,
      sessionsPerWeek: 0,
      optionalPerWeek: 0,
      totalSessions: 0,
    })
  })

  it('counts the commitment and the invitation apart', () => {
    // The beginner plan is the case the two numbers exist for: five sessions
    // are printed every week and three of them are asked for. A card saying
    // "5 / week" would turn its own invitation into a reason not to start.
    expect(planSummary(peteBeginner)).toEqual({
      weekCount: 24,
      sessionsPerWeek: 3,
      optionalPerWeek: 2,
      totalSessions: 120,
    })
  })

  it('takes both numbers off one week, so the pair describes a week that exists', () => {
    // Maxed apart, a 4+1 week and a 3+2 week advertise "4 a week, 2 optional"
    // — a six-session week this plan does not contain. The badges sit side by
    // side and are read as one commitment, so they come off one week.
    const mixed: Plan = {
      id: 'mixed',
      name: 'Mixed',
      descriptionKey: 'plans.catalog.pete5k.description',
      source: 'test',
      rotationWeeks: 1,
      weeks: [
        { index: 1, sessions: [...core(4, 1), ...extra(1, 1)] },
        { index: 2, sessions: [...core(3, 2), ...extra(2, 2)] },
      ],
    }

    expect(planSummary(mixed)).toMatchObject({ sessionsPerWeek: 4, optionalPerWeek: 1 })
  })

  it('breaks a tie toward the week offering the most on top', () => {
    // Both weeks ask for three, so neither is "wider" — and picking the one
    // with no extras would hide the invitation the other week makes.
    const tied: Plan = {
      id: 'tied',
      name: 'Tied',
      descriptionKey: 'plans.catalog.pete5k.description',
      source: 'test',
      rotationWeeks: 1,
      weeks: [
        { index: 1, sessions: core(3, 1) },
        { index: 2, sessions: [...core(3, 2), ...extra(2, 2)] },
      ],
    }

    expect(planSummary(tied)).toMatchObject({ sessionsPerWeek: 3, optionalPerWeek: 2 })
  })

  it('totals the sessions rather than multiplying weeks by the widest one', () => {
    // 12 × 6 is 72; the plan has 71. A summary that multiplies would agree
    // with the design mockup and disagree with the catalogue.
    expect(planSummary(pete5k).totalSessions).not.toBe(
      planSummary(pete5k).weekCount * planSummary(pete5k).sessionsPerWeek,
    )
  })
})
