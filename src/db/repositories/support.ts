import { Effect } from 'effect'
import { DatabaseError } from '../errors'

/**
 * Shared plumbing for the three training repositories.
 *
 * One copy rather than three: `tryDb` is the seam where a storage failure
 * becomes a typed value, and three near-identical copies of it are three
 * places for the operation name to go stale or the catch to be forgotten.
 */

/** Wraps one Dexie call, turning any rejection into a tagged DatabaseError. */
export const tryDb = <A>(
  operation: string,
  run: () => Promise<A>,
): Effect.Effect<A, DatabaseError> =>
  Effect.tryPromise({
    try: run,
    catch: (cause) => new DatabaseError({ operation, cause }),
  })
