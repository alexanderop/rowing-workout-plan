import { Effect } from 'effect'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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
import { db } from '@/db/schema'
import { EMPTY_BACKUP, FULL_BACKUP } from '../helpers/backup'

/**
 * "Delete everything" against real IndexedDB.
 *
 * The unit tier already drives the same program over the in-memory
 * repositories, so what this one adds is the storage engine's opinion: that
 * a cleared Dexie table is empty rather than merely un-indexed, and that the
 * database is still open and writable afterwards — which is the difference
 * between clearing the tables and dropping the database, and the reason
 * `deleteAllData` does the former.
 *
 * It is also the only tier that can grade the transaction. An in-memory
 * `Ref.set` cannot half-happen, so a fake proves nothing about the rollback
 * the production store promises; IndexedDB is where "all three tables or
 * none" is either true or it isn't.
 */
describe('deleting every row', () => {
  beforeEach(async () => {
    await resetDatabase()
  })

  it('empties every table', async () => {
    await runDb(importData(FULL_BACKUP).pipe(Effect.orDie))

    await runDb(deleteAllData.pipe(Effect.orDie))

    // `toEqual` against the empty-backup fixture rather than a per-table
    // match: a partial match passes over the keys it was not given, so a
    // fourth table nobody wiped would still read as a clean database here.
    expect(await runDb(exportData.pipe(Effect.orDie))).toEqual({
      ...EMPTY_BACKUP,
      exportedAt: expect.any(String),
    })
  })

  it('rolls the whole wipe back when one table fails', async () => {
    await runDb(importData(FULL_BACKUP).pipe(Effect.orDie))

    // The only way to see a transaction from outside is to break it. Dexie is
    // the storage boundary rather than an internal collaborator — this spec's
    // sibling reaches for `db` the same way, to write a row no repository
    // would accept — and the throw is synchronous on purpose: a rejected
    // foreign promise inside a transaction leaves its zone, which would test
    // the injection rather than the rollback.
    const clear = vi.spyOn(db.workouts, 'clear').mockImplementation(() => {
      throw new Error('the store gave out mid-wipe')
    })

    const error = await runDb(deleteAllData.pipe(Effect.flip, Effect.orDie))
    expect(error._tag).toBe('Db.DatabaseError')

    clear.mockRestore()

    // Everything, not just the workouts the failure was injected into: the
    // benchmark and the enrolment were cleared before it, and a partial wipe
    // reported as a failure is the state this whole design exists to prevent.
    const survived = await runDb(exportData.pipe(Effect.orDie))
    expect(survived.benchmarks).toEqual(FULL_BACKUP.benchmarks)
    expect(survived.enrolments).toEqual(FULL_BACKUP.enrolments)
    expect(survived.workouts).toEqual(FULL_BACKUP.workouts)
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
