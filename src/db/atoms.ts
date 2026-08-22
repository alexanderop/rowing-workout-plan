import { Atom } from '@effect/atom-vue'
import type { Effect } from 'effect'
import { dbLayer, type DbServices } from './layer'

/**
 * One Atom runtime for the whole persistence layer, built from the same
 * layer stack `runDb` uses (`./layer.ts` — one definition, so a service added
 * for one runtime cannot go missing from the other). The layer is constructed
 * lazily per registry and torn down with it, which is how browser tests get a
 * fresh db runtime by providing a fresh registry.
 *
 * Not exported yet, and neither are the keys below: a read atom is what
 * imports them (`dbRuntime.atom(program)` wired with
 * `Atom.withReactivity([WORKOUTS_KEY])`), and the first of those arrives with
 * the screens in slice 5. The write half is wired here and now, so a read
 * added later refreshes without anyone having to remember to invalidate.
 */
const dbRuntime = Atom.runtime(dbLayer)

/**
 * Reactivity keys — the names a write invalidates and a read atom subscribes
 * to. Two, not three, and the split is by *how often a thing changes* rather
 * than by table: the log grows every time you row, while the plan you are on
 * and the 2k you are paced from change a handful of times a year. Giving them
 * one key would re-read the whole log every time somebody enrolled.
 */
const WORKOUTS_KEY = 'workouts'
const TRAINING_KEY = 'training'

/**
 * The write edge of the db: a fn atom that executes a mutation program.
 *
 * Effect still does not stop at the Vue boundary. The argument type only
 * admits `Effect<unknown, never, DbServices>` — a program whose every tagged
 * failure was already handled with `Effect.catchTag`/`Effect.catchTags` — so
 * an unhandled failure is a type error here, exactly as it is at `runDb`.
 * Components compose the program (repo call, success taps, failure branches)
 * and hand it to the setter from
 * `useAtomSet(() => dbMutation, { mode: 'promise' })`; the returned promise
 * rejects only on a defect, which Vue routes to `app.config.errorHandler`
 * when the handler returns it.
 *
 * A landed write invalidates the reactivity keys listed here, so read atoms
 * re-read from disk. Both keys are invalidated on every write rather than
 * being matched to the program that ran: a mutation is an opaque
 * `Effect<unknown>` by the time it reaches this atom, so there is nothing
 * here to tell a workout write from an enrolment one. Two extra reads of two
 * small tables is the price, and it is paid only on writes.
 *
 * `concurrent: true` matters: without it a second mutation would interrupt
 * one still in flight — a delete silently undone by a quick tap. With it,
 * every program runs its own fiber to completion.
 */
export const dbMutation = dbRuntime.fn(
  (program: Effect.Effect<unknown, never, DbServices>) => program,
  { reactivityKeys: [WORKOUTS_KEY, TRAINING_KEY], concurrent: true },
)
