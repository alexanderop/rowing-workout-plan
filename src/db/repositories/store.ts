import { Context, Effect, Layer } from 'effect'
import type { DatabaseError } from '../errors'
import { db } from '../schema'
import { BenchmarksRepo } from './benchmarks'
import { EnrolmentsRepo } from './enrolments'
import { WorkoutsRepo } from './workouts'
import { tryDb } from './support'

/**
 * The database as a whole — the operations that span every table and so
 * belong to none of the repositories. Today there is exactly one: emptying it.
 *
 * It exists because atomicity cannot be composed. Three `clear()` calls in a
 * row are three transactions, and a failure on the third leaves the first two
 * committed: the workouts still on disk, the 2k and the plan gone, and a toast
 * saying the delete did not happen. In a local-first app that is the worst
 * kind of wrong — the user cannot check anywhere else. IndexedDB gives all or
 * nothing per transaction, so the wipe has to be *one*, which means one place
 * that knows all three tables.
 *
 * The callback stays pure Dexie for the reason `EnrolmentsRepo.create` gives:
 * a foreign promise inside a transaction — an Effect yield included — leaves
 * its zone and the transaction commits early.
 */
export class TrainingStore extends Context.Service<
  TrainingStore,
  {
    /** Empties every table. All of them, or none. */
    clearAll: () => Effect.Effect<void, DatabaseError>
  }
>()('vue-pwa-starter/db/TrainingStore') {
  static readonly layer = Layer.succeed(
    TrainingStore,
    TrainingStore.of({
      clearAll: Effect.fn('TrainingStore.clearAll')(function* () {
        yield* tryDb('clear every table', () =>
          db.transaction('rw', db.benchmarks, db.enrolments, db.workouts, async () => {
            await db.benchmarks.clear()
            await db.enrolments.clear()
            await db.workouts.clear()
          }),
        )
      }),
    }),
  )

  /**
   * The in-memory store, built from the repositories' own fakes rather than
   * from a second copy of their state — so the program under test empties the
   * same maps every other unit-tier assertion reads through.
   *
   * No transaction, and none to have: a `Ref.set` cannot half-happen. What
   * this layer buys is that `deleteAllData` is still a program the Node tier
   * can run; the rollback the production layer promises is asserted against
   * real IndexedDB in `src/__tests__/db/deleteAll.spec.ts`, which is the only
   * tier that can tell you a transaction was real.
   */
  static readonly testLayer = Layer.effect(
    TrainingStore,
    Effect.gen(function* () {
      const benchmarks = yield* BenchmarksRepo
      const enrolments = yield* EnrolmentsRepo
      const workouts = yield* WorkoutsRepo

      return TrainingStore.of({
        clearAll: Effect.fn('TrainingStore.Test.clearAll')(function* () {
          yield* benchmarks.clear()
          yield* enrolments.clear()
          yield* workouts.clear()
        }),
      })
    }),
  )
}
