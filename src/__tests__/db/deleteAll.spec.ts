import { Effect } from 'effect'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  deleteAllData,
  enrolInPlan,
  exportData,
  importData,
  listEnrolments,
  listWorkouts,
  logWorkout,
  recordBenchmark,
  resetDatabase,
  runDb,
  type WorkoutDraft,
} from '@/db'
import { FULL_BACKUP } from '../helpers/backup'

/**
 * "Delete everything" against real IndexedDB.
 *
 * The unit tier already drives the same program over the in-memory
 * repositories, so what this one adds is the storage engine's opinion: that
 * a cleared Dexie table is empty rather than merely un-indexed, and that the
 * database is still open and writable afterwards — which is the difference
 * between clearing the tables and dropping the database, and the reason
 * `deleteAllData` does the former.
 */
describe('deleting every row', () => {
  beforeEach(async () => {
    await resetDatabase()
  })

  it('empties every table', async () => {
    await runDb(importData(FULL_BACKUP).pipe(Effect.orDie))

    await runDb(deleteAllData.pipe(Effect.orDie))

    expect(await runDb(exportData.pipe(Effect.orDie))).toMatchObject({
      benchmarks: [],
      enrolments: [],
      workouts: [],
    })
  })

  it('leaves the database open and writable', async () => {
    await runDb(importData(FULL_BACKUP).pipe(Effect.orDie))
    await runDb(deleteAllData.pipe(Effect.orDie))

    // The row written here goes through the same connection the wipe used. A
    // `db.delete()` implementation would have closed it, and this is the
    // assertion that would have caught it.
    await runDb(recordBenchmark({ kind: '2k', timeMs: 424_200 }).pipe(Effect.orDie))
    await runDb(enrolInPlan({ planId: 'pete5k' }).pipe(Effect.orDie))
    await runDb(
      logWorkout({
        source: 'manual',
        distanceM: 10_000,
        durationMs: 2_520_000,
        avgSplitMs: 126_000,
      }).pipe(Effect.orDie),
    )

    const enrolments = await runDb(listEnrolments.pipe(Effect.orDie))
    expect(enrolments).toEqual([expect.objectContaining({ planId: 'pete5k', active: true })])
    expect(await runDb(listWorkouts.pipe(Effect.orDie))).toHaveLength(1)
  })

  it('reads back as newest-first once the log is rebuilt', async () => {
    // The `startedAt` index the log reads through belongs to the schema, not
    // to the rows, so clearing the table must leave it in place. A wipe that
    // took the index with it would only show up as a log in the wrong order.
    await runDb(importData(FULL_BACKUP).pipe(Effect.orDie))
    await runDb(deleteAllData.pipe(Effect.orDie))

    const older: WorkoutDraft = {
      source: 'manual',
      distanceM: 6000,
      durationMs: 1_500_000,
      avgSplitMs: 125_000,
    }
    await runDb(logWorkout({ ...older, startedAt: 1_700_000_000_000 }).pipe(Effect.orDie))
    await runDb(logWorkout({ ...older, startedAt: 1_700_000_900_000 }).pipe(Effect.orDie))

    const workouts = await runDb(listWorkouts.pipe(Effect.orDie))
    expect(workouts.map((workout) => workout.startedAt)).toEqual([
      1_700_000_900_000, 1_700_000_000_000,
    ])
  })
})
