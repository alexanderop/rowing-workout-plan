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
 * Exported through `./index.ts` for the feature atoms to build reads on
 * (`dbRuntime.atom(program)` wired with `Atom.withReactivity([TRAINING_KEY])`).
 * The write half below was wired before there was a single read, which is why
 * nothing had to be remembered when the first one arrived.
 */
export const dbRuntime = Atom.runtime(dbLayer)

/**
 * Reactivity keys — the names a write invalidates and a read atom subscribes
 * to. Two, not three, and the split is by *how often a thing changes* rather
 * than by table: the log grows every time you row, while the plan you are on
 * and the 2k you are paced from change a handful of times a year. Giving them
 * one key would re-read the whole log every time somebody enrolled.
 */
export const WORKOUTS_KEY = 'workouts'
export const TRAINING_KEY = 'training'

/**
 * A write, ready to run: a db program whose every tagged failure has already
 * been handled with `Effect.catchTag`/`Effect.catchTags`.
 *
 * Named because it is the contract at two boundaries rather than one — this
 * module's `dbMutation` and `useDbWrite`'s `write` — and a composable outside
 * `src/db` cannot spell `DbServices`, which is `layer.ts`'s and stays there.
 */
export type DbProgram = Effect.Effect<unknown, never, DbServices>

/**
 * The write edge of the db: a fn atom that executes a mutation program.
 *
 * Effect still does not stop at the Vue boundary. The argument type only
 * admits `Effect<unknown, never, DbServices>` — a program whose every tagged
 * failure was already handled with `Effect.catchTag`/`Effect.catchTags` — so
 * an unhandled failure is a type error here, exactly as it is at `runDb`.
 * Components compose the program (repo call, success taps, failure branches)
 * and reach this through `useDbWrite`, which is where the in-flight guard and
 * the defect handling live. Do not call `useAtomSet(() => dbMutation)`
 * directly: the setter's promise resolves with `undefined` on a *defect*
 * rather than rejecting, so a crash mid-write reaches neither
 * `app.config.errorHandler` nor the `unhandledrejection` backstop in
 * `main.ts` — it simply disappears. `useDbWrite.write` catches the defect
 * inside the program and rethrows it out of the promise, which is what makes
 * those two backstops work.
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
export const dbMutation = dbRuntime.fn((program: DbProgram) => program, {
  reactivityKeys: [WORKOUTS_KEY, TRAINING_KEY],
  concurrent: true,
})
