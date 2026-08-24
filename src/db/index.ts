/**
 * Public surface of the persistence layer. Everything outside src/db
 * imports from here — never from schema.ts or the repositories directly.
 * That keeps the storage engine swappable and is enforced by the
 * architecture tests (src/__tests__/architecture).
 *
 * The API is Effect-based: each operation is a program with its failures in
 * the type (`Effect<A, DatabaseError | …>`). Compose those programs with
 * `Effect.*` combinators all the way into the component and handle every
 * failure with `Effect.catchTag`/`Effect.catchTags` — both execution edges
 * accept only programs whose error channel is `never`:
 *
 * - Reads that drive the UI are atoms built on `dbRuntime`; wire them with
 *   `Atom.withReactivity([WORKOUTS_KEY])` (or `TRAINING_KEY`) so writes
 *   refresh them. The feature owns the atom — `src/features/training/atoms.ts`
 *   is the worked example — because what a screen reads is the feature's
 *   business; what it reads it *through* is this surface's.
 * - Writes run through `useDbWrite`, the composable over the `dbMutation` fn
 *   atom: it invalidates those keys after the program lands, holds the
 *   in-flight guard, and rethrows a defect the atom would otherwise swallow.
 * - `runDb` remains the imperative edge for programs that read and leave
 *   (backup export, test assertions) — nothing there to invalidate.
 *
 * The failure *classes* are deliberately not re-exported. Recovery is by tag
 * — `Effect.catchTags({ 'Db.DatabaseError': … })` — and a tag is a string, so
 * a component never needs the constructor. Anything that genuinely does
 * (a spec asserting `toBeInstanceOf`) is inside src/db's own tests and
 * imports `./errors` directly.
 */
export { dbMutation, dbRuntime, TRAINING_KEY, WORKOUTS_KEY } from './atoms'
export type { DbProgram } from './atoms'
export { exportData, importData } from './backup'
export type {
  Benchmark,
  BenchmarkDraft,
  PlanEnrolment,
  PlanEnrolmentDraft,
  Workout,
  WorkoutDraft,
  WorkoutInterval,
} from './converters'
export { deleteAllData } from './deleteAll'
export { deleteBenchmark, listBenchmarks, recordBenchmark } from './repositories/benchmarks'
export { deleteEnrolment, enrolInPlan, listEnrolments } from './repositories/enrolments'
export { deleteWorkout, listWorkouts, logWorkout } from './repositories/workouts'
export { runDb } from './runtime'
export { resetDatabase } from './schema'
