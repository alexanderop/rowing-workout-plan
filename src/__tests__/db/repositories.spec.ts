import { Effect } from 'effect'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  deleteBenchmark,
  deleteEnrolment,
  deleteWorkout,
  enrolInPlan,
  listBenchmarks,
  listEnrolments,
  listWorkouts,
  logWorkout,
  recordBenchmark,
  resetDatabase,
  runDb,
  type Benchmark,
  type BenchmarkDraft,
  type PlanEnrolment,
  type PlanEnrolmentDraft,
  type Workout,
  type WorkoutDraft,
  type WorkoutInterval,
} from '@/db'
import { db } from '@/db/schema'

/**
 * The repositories against real IndexedDB.
 *
 * The unit tier already drives the same programs over the in-memory layers,
 * and the two are not redundant: only this one can tell you the storage
 * engine agrees — that Dexie accepts the row, that the index the log reads
 * through exists, and that a structured-clone of an array of intervals
 * survives a round trip through the store.
 */
const A_BENCHMARK: BenchmarkDraft = { kind: '2k', timeMs: 424_200 }
const AN_ENROLMENT: PlanEnrolmentDraft = { planId: 'pete5k' }

const A_WORKOUT: WorkoutDraft = {
  source: 'erg',
  planSessionId: 'pete5k-w3-s2',
  distanceM: 6000,
  durationMs: 1_348_800,
  avgSplitMs: 112_400,
  avgWatts: 246.47,
  avgRate: 25,
  startedAt: 1_700_000_000_000,
  intervals: [{ index: 0, distanceM: 1000, durationMs: 224_800, splitMs: 112_400, restMs: 60_000 }],
}

describe('the training repositories', () => {
  beforeEach(async () => {
    await resetDatabase()
  })

  it('creates and lists a benchmark', async () => {
    const created: Benchmark = await runDb(recordBenchmark(A_BENCHMARK).pipe(Effect.orDie))

    expect(created.id).not.toHaveLength(0)
    expect(created.kind).toBe('2k')
    // Stamped from the Clock, not passed in — so it is a real instant even
    // though the test never supplied one.
    expect(created.recordedAt).toBeGreaterThan(0)

    expect(await runDb(listBenchmarks.pipe(Effect.orDie))).toEqual([created])
  })

  it('refuses a benchmark the schema would not accept', async () => {
    // A 2k of zero milliseconds is not a fast 2k. The rule lives in the row
    // schema, so it holds for every caller rather than for whichever form
    // remembered to check.
    const error = await runDb(
      recordBenchmark({ kind: '2k', timeMs: 0 }).pipe(Effect.flip, Effect.orDie),
    )

    expect(error._tag).toBe('Db.BenchmarkInvalidError')
    expect(await runDb(listBenchmarks.pipe(Effect.orDie))).toEqual([])
  })

  it('deletes a benchmark', async () => {
    const created = await runDb(recordBenchmark(A_BENCHMARK).pipe(Effect.orDie))
    await runDb(deleteBenchmark(created.id).pipe(Effect.orDie))

    expect(await runDb(listBenchmarks.pipe(Effect.orDie))).toEqual([])
  })

  it('refuses an enrolment with no plan', async () => {
    const error = await runDb(enrolInPlan({ planId: '' }).pipe(Effect.flip, Effect.orDie))
    expect(error._tag).toBe('Db.EnrolmentInvalidError')
  })

  it('refuses a workout that would divide by zero downstream', async () => {
    // Distance and duration feed the pace arithmetic, which divides by both.
    // `pace.ts` guards its own inputs too; this is the same rule enforced a
    // layer earlier, so a row that could only produce nonsense never lands.
    const error = await runDb(
      logWorkout({ ...A_WORKOUT, distanceM: 0 }).pipe(Effect.flip, Effect.orDie),
    )

    expect(error._tag).toBe('Db.WorkoutInvalidError')
    expect(await runDb(listWorkouts.pipe(Effect.orDie))).toEqual([])
  })

  it('deletes an enrolment', async () => {
    const created = await runDb(enrolInPlan(AN_ENROLMENT).pipe(Effect.orDie))
    await runDb(deleteEnrolment(created.id).pipe(Effect.orDie))

    expect(await runDb(listEnrolments.pipe(Effect.orDie))).toEqual([])
  })

  it('keeps at most one enrolment active', async () => {
    const first: PlanEnrolment = await runDb(enrolInPlan(AN_ENROLMENT).pipe(Effect.orDie))
    const second = await runDb(enrolInPlan({ planId: 'pete5k-lite' }).pipe(Effect.orDie))

    const enrolments = await runDb(listEnrolments.pipe(Effect.orDie))
    const active = enrolments.filter((enrolment) => enrolment.active)

    expect(enrolments).toHaveLength(2)
    expect(active.map((enrolment) => enrolment.id)).toEqual([second.id])
    expect(enrolments.find((enrolment) => enrolment.id === first.id)?.active).toBe(false)
  })

  it('round-trips a workout with its intervals through the store', async () => {
    const created: Workout = await runDb(logWorkout(A_WORKOUT).pipe(Effect.orDie))
    const [read] = await runDb(listWorkouts.pipe(Effect.orDie))

    expect(read).toEqual(created)
    expect(read.planSessionId).toBe('pete5k-w3-s2')

    // The nested array is the part IndexedDB could plausibly mangle: it is
    // structured-cloned rather than stored as a column.
    const interval: WorkoutInterval = read.intervals[0]
    expect(read.intervals).toHaveLength(1)
    expect(interval).toEqual(A_WORKOUT.intervals?.[0])
  })

  it('honours the startedAt a capture supplies rather than stamping the write', async () => {
    const created = await runDb(logWorkout(A_WORKOUT).pipe(Effect.orDie))
    expect(created.startedAt).toBe(1_700_000_000_000)
  })

  it('lists workouts newest first', async () => {
    await runDb(logWorkout({ ...A_WORKOUT, startedAt: 1_000 }).pipe(Effect.orDie))
    await runDb(logWorkout({ ...A_WORKOUT, startedAt: 3_000 }).pipe(Effect.orDie))
    await runDb(logWorkout({ ...A_WORKOUT, startedAt: 2_000 }).pipe(Effect.orDie))

    const workouts = await runDb(listWorkouts.pipe(Effect.orDie))
    expect(workouts.map((workout) => workout.startedAt)).toEqual([3_000, 2_000, 1_000])
  })

  it('deletes a workout', async () => {
    const created = await runDb(logWorkout(A_WORKOUT).pipe(Effect.orDie))
    await runDb(deleteWorkout(created.id).pipe(Effect.orDie))

    expect(await runDb(listWorkouts.pipe(Effect.orDie))).toEqual([])
  })

  it('normalizes a historical row on the way out', async () => {
    // Written straight to Dexie, past the repository, the way a restored
    // profile or an old backup would arrive: no `source`, no `intervals`.
    await db.workouts.add({
      id: 'legacy-1',
      startedAt: 1_700_000_000_000,
      distanceM: 10_000,
      durationMs: 2_520_000,
      avgSplitMs: 126_000,
    })

    const [workout] = await runDb(listWorkouts.pipe(Effect.orDie))
    expect(workout.source).toBe('manual')
    expect(workout.intervals).toEqual([])
  })

  it('fails the whole read on a damaged row rather than dropping it', async () => {
    // Quietly skipping it would show the user a short list they might then
    // export over their last good backup.
    await runDb(logWorkout(A_WORKOUT).pipe(Effect.orDie))
    // SAFETY: the assertion is deliberately false — writing a row the schema
    // forbids is the whole premise, and it is the only way to reach the
    // decode failure without a corrupted profile. Dexie's table type would
    // otherwise refuse exactly the row this test needs.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see above
    await db.workouts.add({ id: 'damaged', startedAt: 1, distanceM: 'far' } as any)

    const error = await runDb(listWorkouts.pipe(Effect.flip, Effect.orDie))
    expect(error._tag).toBe('Db.DatabaseError')
    expect(error.operation).toBe('decode workout row')
  })
})
