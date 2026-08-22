import { Effect } from 'effect'
import type { DatabaseError } from './errors'
import { BenchmarksRepo } from './repositories/benchmarks'
import { EnrolmentsRepo } from './repositories/enrolments'
import { WorkoutsRepo } from './repositories/workouts'

/**
 * Empties every table — the program behind "Delete everything" in settings.
 *
 * Composed from the repositories' `clear` rather than deleting the Dexie
 * database outright, for two reasons. The obvious one is that dropping the
 * database takes the *schema* with it, so every read between the delete and
 * the reopen races a database that does not exist. The other is that this
 * shape is a program: it carries its failure as a `DatabaseError`, runs
 * through `dbMutation` so every read atom re-reads once it lands, and runs
 * over `dbTestLayer` in the Node unit tier the same way `importData` does.
 *
 * It is the mirror image of `exportData`, and the unit tier holds it to that:
 * an export taken straight after this one has to come back with every table
 * empty. A table added to the export and forgotten here fails that assertion
 * rather than quietly surviving a wipe the user asked for.
 *
 * Nothing outside the database is touched. The theme, the language and the
 * dismissed install hint are preferences rather than data, and a user asking
 * for their rowing history to be gone is not asking to be handed a
 * mid-session language switch.
 */
export const deleteAllData: Effect.Effect<
  void,
  DatabaseError,
  BenchmarksRepo | EnrolmentsRepo | WorkoutsRepo
> = Effect.gen(function* () {
  yield* BenchmarksRepo.use((repo) => repo.clear())
  yield* EnrolmentsRepo.use((repo) => repo.clear())
  yield* WorkoutsRepo.use((repo) => repo.clear())
}).pipe(
  // Stryker disable next-line StringLiteral: the span name is observability, not behavior — no unit test should assert it
  Effect.withSpan('Data.deleteAll'),
)
