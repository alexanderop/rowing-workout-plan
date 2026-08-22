import { Clock, Context, Effect, Layer, Ref } from 'effect'
import type { Workout, WorkoutDraft } from '../converters'
import { decodeStoredWorkout, decodeWorkoutDraft, toWorkout } from '../converters'
import { DatabaseError, WorkoutInvalidError } from '../errors'
import { GenerateId } from '../generateId'
import { db } from '../schema'
import { tryDb } from './support'

export type { WorkoutDraft } from '../converters'

const validateDraft = (draft: WorkoutDraft): Effect.Effect<WorkoutDraft, WorkoutInvalidError> =>
  decodeWorkoutDraft(draft).pipe(
    Effect.mapError((error) => new WorkoutInvalidError({ message: error.message })),
  )

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- the decode boundary itself
const decodeRow = (stored: unknown): Effect.Effect<Workout, DatabaseError> =>
  decodeStoredWorkout(stored).pipe(
    Effect.mapError((cause) => new DatabaseError({ operation: 'decode workout row', cause })),
    Effect.map(toWorkout),
  )

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
      const generateId = yield* GenerateId

      return WorkoutsRepo.of({
        list: Effect.fn('WorkoutsRepo.list')(function* () {
          const stored = yield* tryDb('list workouts', () =>
            db.workouts.orderBy('startedAt').reverse().toArray(),
          )
          return yield* Effect.forEach(stored, decodeRow)
        }),

        create: Effect.fn('WorkoutsRepo.create')(function* (draft: WorkoutDraft) {
          const valid = yield* validateDraft(draft)
          const now = yield* Clock.currentTimeMillis
          const workout: Workout = {
            ...valid,
            id: generateId(),
            // An erg capture knows when the piece *began*, which is not when
            // the row is written; stamping at write time would misdate every
            // workout by its own length.
            startedAt: valid.startedAt ?? now,
            intervals: valid.intervals ?? [],
          }
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

  /** See `BenchmarksRepo.testLayer` — same contract, same semantics. */
  static readonly testLayer = Layer.effect(
    WorkoutsRepo,
    Effect.gen(function* () {
      const rows = yield* Ref.make<ReadonlyMap<string, Workout>>(new Map())
      const generateId = yield* GenerateId

      return WorkoutsRepo.of({
        list: Effect.fn('WorkoutsRepo.Test.list')(function* () {
          const current = [...(yield* Ref.get(rows)).values()]
          return current.sort((left, right) => right.startedAt - left.startedAt)
        }),

        create: Effect.fn('WorkoutsRepo.Test.create')(function* (draft: WorkoutDraft) {
          const valid = yield* validateDraft(draft)
          const now = yield* Clock.currentTimeMillis
          const workout: Workout = {
            ...valid,
            id: generateId(),
            startedAt: valid.startedAt ?? now,
            intervals: valid.intervals ?? [],
          }
          yield* Ref.update(rows, (current) => new Map(current).set(workout.id, workout))
          return workout
        }),

        remove: Effect.fn('WorkoutsRepo.Test.remove')(function* (id: string) {
          yield* Ref.update(rows, (current) => {
            const next = new Map(current)
            next.delete(id)
            return next
          })
        }),

        putMany: Effect.fn('WorkoutsRepo.Test.putMany')(function* (
          incoming: ReadonlyArray<Workout>,
        ) {
          yield* Ref.update(rows, (current) => {
            const next = new Map(current)
            for (const row of incoming) next.set(row.id, row)
            return next
          })
        }),

        clear: Effect.fn('WorkoutsRepo.Test.clear')(function* () {
          yield* Ref.set(rows, new Map())
        }),
      })
    }),
  )
}

export const listWorkouts = WorkoutsRepo.use((repo) => repo.list())

export const logWorkout = (draft: WorkoutDraft) => WorkoutsRepo.use((repo) => repo.create(draft))

export const deleteWorkout = (id: string) => WorkoutsRepo.use((repo) => repo.remove(id))
