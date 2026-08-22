import { describe, expect, it } from '@effect/vitest'
import { Effect } from 'effect'
import { deleteAllData } from '@/db/deleteAll'
import { exportData, importData } from '@/db/backup'
import { dbTestLayer } from '@/db/layer'
import { FULL_BACKUP } from '../../helpers/backup'

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
 * The browser tier drives the same program against real Dexie
 * (`src/__tests__/db/deleteAll.spec.ts`); what that one adds is the storage
 * engine's opinion of a cleared table.
 */
describe('deleteAllData', () => {
  it.effect('leaves every table empty', () =>
    Effect.gen(function* () {
      yield* importData(FULL_BACKUP)

      yield* deleteAllData

      expect(yield* exportData).toMatchObject({ benchmarks: [], enrolments: [], workouts: [] })
    }).pipe(Effect.provide(dbTestLayer)),
  )

  it.effect('is a no-op on a database that is already empty', () =>
    Effect.gen(function* () {
      // The button is offered whether or not there is anything to delete, so
      // "nothing there" has to be a success rather than a failure the user
      // reads as "your data could not be deleted".
      yield* deleteAllData

      expect(yield* exportData).toMatchObject({ benchmarks: [], enrolments: [], workouts: [] })
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
