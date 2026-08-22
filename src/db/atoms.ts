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
 * Not exported yet: a read atom is what imports it (`dbRuntime.atom(program)`
 * wired with `Atom.withReactivity([…])`), and there are no tables to read
 * until the training slices land.
 */
const dbRuntime = Atom.runtime(dbLayer)

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
 * re-read from disk. There are none while the database has no tables; a table
 * brings its key alongside, and adds it to `reactivityKeys`.
 *
 * `concurrent: true` matters: without it a second mutation would interrupt
 * one still in flight — a delete silently undone by a quick tap. With it,
 * every program runs its own fiber to completion.
 */
export const dbMutation = dbRuntime.fn(
  (program: Effect.Effect<unknown, never, DbServices>) => program,
  { reactivityKeys: [], concurrent: true },
)
