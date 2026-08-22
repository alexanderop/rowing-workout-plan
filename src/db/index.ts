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
 *   refresh them. Those three live in `./atoms.ts` and join this surface with
 *   the first read atom, in slice 5 — every write already invalidates both
 *   keys, so a read added later needs no change here.
 * - Writes run through the `dbMutation` fn atom, which invalidates those
 *   keys after the program lands.
 * - `runDb` remains the imperative edge for programs that read and leave
 *   (backup export, test assertions) — nothing there to invalidate.
 *
 * The failure *classes* are deliberately not re-exported. Recovery is by tag
 * — `Effect.catchTags({ 'Db.DatabaseError': … })` — and a tag is a string, so
 * a component never needs the constructor. Anything that genuinely does
 * (a spec asserting `toBeInstanceOf`) is inside src/db's own tests and
 * imports `./errors` directly.
 */
export { dbMutation } from './atoms'
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
export { deleteBenchmark, listBenchmarks, recordBenchmark } from './repositories/benchmarks'
export { deleteEnrolment, enrolInPlan, listEnrolments } from './repositories/enrolments'
export { deleteWorkout, listWorkouts, logWorkout } from './repositories/workouts'
export { runDb } from './runtime'
export { resetDatabase } from './schema'
