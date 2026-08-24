import { Clock, Context, Effect, Layer } from 'effect'
import type { Workout, WorkoutDraft } from '../converters'
import { decodeStoredWorkout, decodeWorkoutDraft, toWorkout } from '../converters'
import { DatabaseError, WorkoutInvalidError } from '../errors'
import { GenerateId } from '../generateId'
import { db } from '../schema'
import { draftValidator, inMemoryTable, rowDecoder, tryDb } from './support'

export type { WorkoutDraft } from '../converters'

const validateDraft = draftValidator(
  decodeWorkoutDraft,
  (message) => new WorkoutInvalidError({ message }),
)

const decodeRow = rowDecoder('decode workout row', decodeStoredWorkout, toWorkout)

/** See `BenchmarksRepo`'s `buildBenchmark` — both layers mint a row the same way. */
const buildWorkout = (
  generateId: () => string,
): ((draft: WorkoutDraft) => Effect.Effect<Workout, WorkoutInvalidError>) =>
  Effect.fn('WorkoutsRepo.build')(function* (draft: WorkoutDraft) {
    const valid = yield* validateDraft(draft)
    const now = yield* Clock.currentTimeMillis
    return {
      ...valid,
      id: generateId(),
      // An erg capture knows when the piece *began*, which is not when the row
      // is written; stamping at write time would misdate every workout by its
      // own length.
      startedAt: valid.startedAt ?? now,
      intervals: valid.intervals ?? [],
    }
  })

/** Newest first — the order both layers hand the log back in. */
const newestFirst = (rows: ReadonlyArray<Workout>): Array<Workout> =>
  rows.toSorted((left, right) => right.startedAt - left.startedAt)

/**
 * Workouts: what was actually rowed.
 *
 * `list` returns newest first, reading through the `startedAt` index rather
 * than sorting in memory — the log is the one table that grows without bound,
 * and a full scan plus sort is the read that gets slow first.
 *
 * There is no `update`. A workout is a record of something that happened; the
 * only honest edits are "log it" and "that never happened", so the write
 * surface is `create` and `remove`. Corrections re-log.
 */
export class WorkoutsRepo extends Context.Service<
  WorkoutsRepo,
  {
    /** Newest first. */
    list: () => Effect.Effect<Array<Workout>, DatabaseError>
    create: (draft: WorkoutDraft) => Effect.Effect<Workout, DatabaseError | WorkoutInvalidError>
    remove: (id: string) => Effect.Effect<void, DatabaseError>
    /** Overwrites rows with matching ids — the import primitive. */
    putMany: (rows: ReadonlyArray<Workout>) => Effect.Effect<void, DatabaseError>
    /** Empties the table — the delete-everything primitive. */
    clear: () => Effect.Effect<void, DatabaseError>
  }
>()('vue-pwa-starter/db/WorkoutsRepo') {
  static readonly layer = Layer.effect(
    WorkoutsRepo,
    Effect.gen(function* () {
      const build = buildWorkout(yield* GenerateId)

      return WorkoutsRepo.of({
        list: Effect.fn('WorkoutsRepo.list')(function* () {
          const stored = yield* tryDb('list workouts', () =>
            db.workouts.orderBy('startedAt').reverse().toArray(),
          )
          return yield* Effect.forEach(stored, decodeRow)
        }),

        create: Effect.fn('WorkoutsRepo.create')(function* (draft: WorkoutDraft) {
          const workout = yield* build(draft)
          yield* tryDb('create workout', () => db.workouts.add(workout))
          return workout
        }),

        remove: Effect.fn('WorkoutsRepo.remove')(function* (id: string) {
          yield* tryDb('delete workout', async () => {
            await db.workouts.delete(id)
          })
        }),

        putMany: Effect.fn('WorkoutsRepo.putMany')(function* (rows: ReadonlyArray<Workout>) {
          yield* tryDb('bulk import workouts', async () => {
            await db.workouts.bulkPut([...rows])
          })
        }),

        clear: Effect.fn('WorkoutsRepo.clear')(function* () {
          yield* tryDb('clear workouts', () => db.workouts.clear())
        }),
      })
    }),
  )

  /**
   * The in-memory fake. `list` is overridden because the real one reads
   * through the `startedAt` index: a fake that handed rows back in insertion
   * order would let a screen that depends on newest-first pass here and fail
   * on a phone.
   */
  static readonly testLayer = Layer.effect(
    WorkoutsRepo,
    Effect.gen(function* () {
      const table = yield* inMemoryTable<Workout>('WorkoutsRepo')
      const build = buildWorkout(yield* GenerateId)

      return WorkoutsRepo.of({
        ...table,

        list: Effect.fn('WorkoutsRepo.Test.list')(function* () {
          return newestFirst(yield* table.list())
        }),

        create: Effect.fn('WorkoutsRepo.Test.create')(function* (draft: WorkoutDraft) {
          const workout = yield* build(draft)
          yield* table.insert(workout)
          return workout
        }),
      })
    }),
  )
}

export const listWorkouts = WorkoutsRepo.use((repo) => repo.list())

export const logWorkout = (draft: WorkoutDraft) => WorkoutsRepo.use((repo) => repo.create(draft))

export const deleteWorkout = (id: string) => WorkoutsRepo.use((repo) => repo.remove(id))
