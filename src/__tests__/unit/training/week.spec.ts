import { describe, expect, it } from '@effect/vitest'
import { Result } from 'effect'

import { PLAN_WEEKS, pete5k } from '@/features/training/catalog'
import { rotationFor } from '@/features/training/schedule'
import { targetFor } from '@/features/training/targets'
import type { PlanWeek } from '@/features/training/types'
import { targetInWeek, weekAt, weekRows } from '@/features/training/week'

/**
 * The join between `schedule` (which rotation is this week) and `targets`
 * (what does this session cost in that rotation), which three screens used to
 * write out for themselves.
 *
 * The interesting assertions are all about the "no answer" edge, because that
 * is the part the screens were each deciding separately: no benchmark yet, a
 * week outside the plan, a week that does not exist.
 */

/** A 7:04.2 2k — the design canvas's rower, and the one `targets.spec.ts` uses. */
const BENCHMARK_2K_MS = 424_200

const week3 = pete5k.weeks[2]
/** A steady row: the same target in every rotation, so an unshifted baseline. */
const session = week3.sessions[0]
/** `shortRest` — one of the two kinds a rotation actually re-paces. */
const shifted = week3.sessions[1]

describe('targetInWeek', () => {
  it('agrees with targetFor composed by hand', () => {
    // The whole point of the module: the three screens that used to write this
    // chain get the same number they used to compute.
    const rotation = Result.getOrThrow(rotationFor(week3.index))
    const expected = Result.getOrThrow(targetFor(session, BENCHMARK_2K_MS, rotation))

    expect(targetInWeek(session, BENCHMARK_2K_MS, week3.index)).toEqual(expected)
  })

  it('is null before a 2k has been entered', () => {
    expect(targetInWeek(session, null, week3.index)).toBeNull()
  })

  it('is null for a week the plan does not have', () => {
    // The rotation table stops at the end of the plan, and a target for week
    // 13 would be a number invented for a week nobody can row.
    expect(targetInWeek(session, BENCHMARK_2K_MS, PLAN_WEEKS + 1)).toBeNull()
    expect(targetInWeek(session, BENCHMARK_2K_MS, 0)).toBeNull()
    expect(targetInWeek(session, BENCHMARK_2K_MS, 1.5)).toBeNull()
  })

  it('is null when the session cannot be priced', () => {
    // A 2k time `pace.ts` refuses: everything there divides by its inputs, so
    // "finite and above zero" is the precondition. The failure is swallowed to
    // `null` rather than surfaced — the row still lists the session.
    expect(targetInWeek(session, -1, week3.index)).toBeNull()
    expect(targetInWeek(session, Number.POSITIVE_INFINITY, week3.index)).toBeNull()
  })

  it('re-paces a rotation-shifted session as the rotations advance', () => {
    // The plan's spine, seen through this function: within a rotation the
    // target holds while the reps get longer, between rotations it steps down.
    const first = targetInWeek(shifted, BENCHMARK_2K_MS, 1)
    const sameRotation = targetInWeek(shifted, BENCHMARK_2K_MS, 3)
    const nextRotation = targetInWeek(shifted, BENCHMARK_2K_MS, 4)

    expect(sameRotation?.splitMs).toBe(first?.splitMs)
    expect(nextRotation?.splitMs).toBeLessThan(first?.splitMs ?? 0)
  })

  it('holds a steady target across every rotation', () => {
    // Steady is not a target to beat, so the rotation must not walk it faster.
    const splits = [1, 4, 7, 10].map(
      (week) => targetInWeek(session, BENCHMARK_2K_MS, week)?.splitMs,
    )

    expect(new Set(splits).size).toBe(1)
  })
})

describe('weekRows', () => {
  const context = { benchmark2kMs: BENCHMARK_2K_MS, completedIds: new Set<string>() }

  it('numbers the sessions from one, in plan order', () => {
    const rows = weekRows(week3, context)

    expect(rows.map((row) => row.position)).toEqual(week3.sessions.map((_, index) => index + 1))
    expect(rows.map((row) => row.session.id)).toEqual(week3.sessions.map((one) => one.id))
  })

  it('prices every row the way targetInWeek does', () => {
    for (const row of weekRows(week3, context)) {
      expect(row.target).toEqual(targetInWeek(row.session, BENCHMARK_2K_MS, week3.index))
    }
  })

  it('marks the rows whose session is in the completed set, and only those', () => {
    const [first, second] = week3.sessions
    const rows = weekRows(week3, { ...context, completedIds: new Set([first.id]) })

    expect(rows.find((row) => row.session.id === first.id)?.done).toBe(true)
    expect(rows.find((row) => row.session.id === second.id)?.done).toBe(false)
  })

  it('ignores completed ids belonging to other sessions', () => {
    // A real log carries workouts from other plans and other weeks.
    const rows = weekRows(week3, { ...context, completedIds: new Set(['pete5k-w9-s1', 'nope']) })

    expect(rows.every((row) => !row.done)).toBe(true)
  })

  it('still lists every session with no benchmark, targets null', () => {
    const rows = weekRows(week3, { ...context, benchmark2kMs: null })

    expect(rows).toHaveLength(week3.sessions.length)
    expect(rows.every((row) => row.target === null)).toBe(true)
  })

  it('is empty for a week that has not resolved', () => {
    expect(weekRows(null, context)).toEqual([])
  })

  it('prices against the week it is handed, not the plan order it sits in', () => {
    // A week carries its own index, and that index is what picks the rotation.
    // Relabelling week 3 as week 10 re-prices the rows that a rotation shifts —
    // which is what a screen showing a week by number depends on.
    const relabelled: PlanWeek = { ...week3, index: 10 }
    const [row] = weekRows(relabelled, context).filter((one) => one.session.id === shifted.id)

    expect(row.target).toEqual(targetInWeek(shifted, BENCHMARK_2K_MS, 10))
    expect(row.target?.splitMs).not.toBe(targetInWeek(shifted, BENCHMARK_2K_MS, 3)?.splitMs)
  })
})

describe('weekAt', () => {
  it('finds a week by the number a screen says', () => {
    expect(weekAt(pete5k.weeks, 3)).toBe(week3)
  })

  it('is null for a week the plan does not have', () => {
    expect(weekAt(pete5k.weeks, PLAN_WEEKS + 1)).toBeNull()
    expect(weekAt(pete5k.weeks, 0)).toBeNull()
  })

  it('matches on the declared index, not the array position', () => {
    // The plan's weeks happen to be in order; nothing in the type says so.
    const sparse: ReadonlyArray<PlanWeek> = [
      { index: 7, sessions: [] },
      { index: 2, sessions: [session] },
    ]

    expect(weekAt(sparse, 2)?.sessions).toHaveLength(1)
  })
})
