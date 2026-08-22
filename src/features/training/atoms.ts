import { Atom } from '@effect/atom-vue'
import { Effect } from 'effect'

import {
  dbRuntime,
  listBenchmarks,
  listEnrolments,
  listWorkouts,
  TRAINING_KEY,
  WORKOUTS_KEY,
} from '@/db'

import { PLANS } from './catalog'
import { activePlan, completedSessionIds, currentBenchmark } from './progress'

/**
 * What the training screens read — the feature's replacement for a store.
 *
 * Each atom's value is an `AsyncResult`: loading, failure and data in one
 * value, so a component subscribes with `useAtomValue(() => atom)` and
 * renders whichever state is true instead of tracking an `isLoaded` flag
 * beside the data. Subscribing *is* the load; there is no `onMounted` fetch.
 *
 * `Atom.withReactivity` is what keeps them honest: every program run through
 * `dbMutation` invalidates both keys, and the atoms named by them re-read
 * from IndexedDB. Which key an atom takes is not decoration — it is the
 * declaration of how often it expects to be woken, and the two keys exist
 * because the log grows every time you row while the plan you are on does
 * not (see `src/db/atoms.ts`).
 *
 * Three atoms rather than one program that reads all three tables: the
 * benchmark sheet needs only the first, and a screen that combines them says
 * so with `AsyncResult.all`, which reports the first failure and stays
 * `waiting` until every part has landed. One combined atom would make the
 * sheet re-read the whole log to show a 2k.
 *
 * The catalogue is *not* an atom. It is a frozen module constant with no
 * async, no failure and nothing to invalidate — wrapping it would buy a layer
 * of indirection and no capability. `activePlanAtom` closes over it because
 * resolving an enrolment to a plan is a read that can come up empty, which is
 * exactly what an `AsyncResult` is for.
 */

/**
 * The shared failure branch. The failure stays *in* the atom's value on
 * purpose — the screen renders it as an error state rather than a toast over
 * a blank page — so this only adds the structured log entry every reported
 * failure carries.
 */
function logFailure<A, E extends { readonly _tag: string }, R>(
  operation: string,
  program: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> {
  return Effect.tapError(program, (error) =>
    Effect.logError(error).pipe(
      Effect.annotateLogs({ boundary: 'training', operation, failure: error._tag }),
    ),
  )
}

/** The 2k every target on every screen is derived from, or `null` if none. */
export const benchmarkAtom = dbRuntime
  .atom(logFailure('load benchmark', listBenchmarks).pipe(Effect.map(currentBenchmark)))
  .pipe(Atom.withReactivity([TRAINING_KEY]))

/** The plan the active enrolment names, or `null` if nobody has enrolled. */
export const activePlanAtom = dbRuntime
  .atom(
    logFailure('load enrolments', listEnrolments).pipe(
      Effect.map((enrolments) => activePlan(PLANS, enrolments)),
    ),
  )
  .pipe(Atom.withReactivity([TRAINING_KEY]))

/**
 * The plan sessions already rowed, as ids. `WORKOUTS_KEY`, not `TRAINING_KEY`:
 * this is the one of the three that a finished workout changes.
 */
export const completedSessionsAtom = dbRuntime
  .atom(logFailure('load workouts', listWorkouts).pipe(Effect.map(completedSessionIds)))
  .pipe(Atom.withReactivity([WORKOUTS_KEY]))
