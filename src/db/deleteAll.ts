import { Effect } from 'effect'
import type { DatabaseError } from './errors'
import { TrainingStore } from './repositories/store'

/**
 * Empties every table — the program behind "Delete everything" in settings.
 *
 * One call rather than three, and the reason is atomicity: `TrainingStore`
 * clears all three tables inside a single IndexedDB transaction, so a failure
 * part way through rolls the whole wipe back. Composing the repositories'
 * per-table `clear()` here would have been three transactions, and the state
 * that leaves behind — some tables emptied, a toast saying the delete failed,
 * no other copy of the data anywhere — is the one this app must not produce.
 *
 * What that buys is asserted where it can be: the rollback against real
 * IndexedDB in the db tier, the wipe itself over the in-memory store in the
 * unit tier. It stays a program either way, so it runs through `dbMutation`
 * and every read atom re-reads once it lands.
 *
 * It is the mirror image of `exportData`, and the unit tier holds it to that:
 * an export taken straight after this one has to come back empty, envelope
 * and all. A table added to the export and forgotten in the wipe fails that
 * assertion rather than quietly surviving.
 *
 * Nothing outside the database is touched. The theme, the language and the
 * dismissed install hint are preferences rather than data, and a user asking
 * for their rowing history to be gone is not asking to be handed a
 * mid-session language switch.
 */
export const deleteAllData: Effect.Effect<void, DatabaseError, TrainingStore> = TrainingStore.use(
  (store) => store.clearAll(),
).pipe(
  // Stryker disable next-line StringLiteral: the span name is observability, not behavior — no unit test should assert it
  Effect.withSpan('Data.deleteAll'),
)
