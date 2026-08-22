import Dexie, { type Table } from 'dexie'
import type { StoredDbBenchmark, StoredDbPlanEnrolment, StoredDbWorkout } from './converters'

/**
 * Dexie tables and migrations. The *shape* of a row lives in `converters.ts`,
 * as a Schema this file's table typing derives from — a type here and a
 * schema there would be two descriptions of the same row, free to drift.
 *
 * Every table is typed `Stored*`, not the domain shape: what comes back from
 * disk may be missing a field a later version added, and keeping the stored
 * type honest about optionality is what makes the compiler enforce that reads
 * go through the decode-and-normalize path in `converters.ts` rather than
 * trusting the row.
 *
 * All three tables are declared on version 1. This is a fresh install, not a
 * migration: the notes worked example was removed before any training data
 * existed, so there is no shipped shape to upgrade from and an `upgrade()`
 * here would be migrating rows that have never been written. When one of
 * these *does* change, that is when the version bumps — see
 * docs/adding-a-feature.md.
 *
 * Indexes are the queries, not the fields. `workouts` is indexed by
 * `startedAt` because the log reads newest-first, and by `planSessionId`
 * because "which sessions of this plan are done" is the question the whole
 * schedule is derived from and it must not be a full scan.
 */
class TrainerDatabase extends Dexie {
  benchmarks!: Table<StoredDbBenchmark, string>
  enrolments!: Table<StoredDbPlanEnrolment, string>
  workouts!: Table<StoredDbWorkout, string>

  constructor() {
    super('vue-pwa-starter')

    this.version(1).stores({
      benchmarks: 'id, recordedAt',
      enrolments: 'id, planId',
      workouts: 'id, startedAt, planSessionId',
    })
  }
}

export const db = new TrainerDatabase()

/**
 * Deletes and reopens the database. Test isolation only — it drops the schema
 * along with the rows, so anything holding a connection is left reading a
 * database that no longer exists. "Delete everything" in settings is
 * `deleteAllData` (`./deleteAll.ts`), which empties the tables instead and is
 * a program the read atoms can be invalidated by.
 */
export async function resetDatabase(): Promise<void> {
  await db.delete()
  await db.open()
}
