import { describe, expect, it } from '@effect/vitest'
import { Effect } from 'effect'
import { deleteAllData } from '@/db/deleteAll'
import { exportData, importData } from '@/db/backup'
import { dbTestLayer } from '@/db/layer'
import { EMPTY_BACKUP, FULL_BACKUP } from '../../helpers/backup'

/**
 * "Delete everything", as a program — no IndexedDB, so it runs in the Node
 * unit tier over the repositories' in-memory layers, exactly like the backup
 * programs beside it.
 *
 * Every assertion here goes through `exportData`, and that is deliberate
 * rather than convenient: the export is the one program that reads *all*
 * three tables, so a table added to the app and forgotten in `deleteAllData`
 * fails here. Listing the tables a second time in this spec would only mean
 * both copies could be forgotten together.
 *
 * And they are `toEqual` against the empty-backup fixture rather than
 * `toMatchObject` over the three arrays, which is the same argument one level
 * up: a partial match ignores keys it was not told about, so the fourth table
 * nobody wiped would pass a per-table assertion while failing the promise
 * this spec is here to make. What a wipe leaves behind is an *empty backup*,
 * envelope included, and that is exactly what is asserted.
 *
 * The browser tier drives the same program against real Dexie
 * (`src/__tests__/db/deleteAll.spec.ts`); what that one adds is the storage
 * engine's opinion of a cleared table.
 */
/** An export off an emptied database: the fixture, stamped by TestClock. */
const EMPTIED = { ...EMPTY_BACKUP, exportedAt: '1970-01-01T00:00:00.000Z' }

describe('deleteAllData', () => {
  it.effect('leaves every table empty', () =>
    Effect.gen(function* () {
      yield* importData(FULL_BACKUP)

      yield* deleteAllData

      expect(yield* exportData).toEqual(EMPTIED)
    }).pipe(Effect.provide(dbTestLayer)),
  )

  it.effect('is a no-op on a database that is already empty', () =>
    Effect.gen(function* () {
      // The button is offered whether or not there is anything to delete, so
      // "nothing there" has to be a success rather than a failure the user
      // reads as "your data could not be deleted".
      yield* deleteAllData

      expect(yield* exportData).toEqual(EMPTIED)
    }).pipe(Effect.provide(dbTestLayer)),
  )

  it.effect('leaves an app that can be used again', () =>
    Effect.gen(function* () {
      yield* importData(FULL_BACKUP)
      yield* deleteAllData

      // Deleting your data is not deleting the app: the next thing a user
      // does after a wipe is start over, and a restore is the likeliest one.
      yield* importData(FULL_BACKUP)

      const restored = yield* exportData
      expect(restored.benchmarks).toEqual(FULL_BACKUP.benchmarks)
      expect(restored.enrolments).toEqual(FULL_BACKUP.enrolments)
      expect(restored.workouts).toEqual(FULL_BACKUP.workouts)
    }).pipe(Effect.provide(dbTestLayer)),
  )

  it.effect('deletes the enrolment as well, so no plan is left active', () =>
    Effect.gen(function* () {
      // The enrolments table is the one with an invariant of its own ("at
      // most one active row"), and the one a half-finished wipe would leave
      // pointing the Today tab at a plan whose sessions are all gone.
      yield* importData(FULL_BACKUP)
      yield* deleteAllData

      expect((yield* exportData).enrolments).toHaveLength(0)
    }).pipe(Effect.provide(dbTestLayer)),
  )
})
