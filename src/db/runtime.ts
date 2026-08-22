import { Effect, ManagedRuntime } from 'effect'
import { dbLayer, type DbServices } from './layer'

/**
 * The imperative runtime for the persistence layer. Components run their
 * programs through the atoms in `./atoms.ts`; this ManagedRuntime backs
 * `runDb`, the promise edge for programs that read and leave — backup
 * export, test assertions against what is actually on disk. The layer is
 * built lazily on first use and lives for the lifetime of the page, and is
 * the same stack the atom runtime uses — see `./layer.ts`.
 */
const runtime = ManagedRuntime.make(dbLayer)

/**
 * Executes a db program. Effect does not stop at the component boundary: the
 * error channel must already be `never`, meaning every tagged failure was
 * handled inside the program with `Effect.catchTag`/`Effect.catchTags` (or
 * deliberately promoted to a defect with `Effect.orDie`). The compiler is
 * what enforces it — a program with an unhandled `DatabaseError` does not
 * type-check here, so there is no unwrapping, no rethrow, and no `instanceof`
 * on the Vue side.
 *
 * The returned Promise still rejects on a *defect*, and that is the point:
 * a defect is a bug, not an expected failure, and belongs in
 * `app.config.errorHandler` rather than in a toast. For that routing to
 * happen, event handlers *return* this promise to Vue instead of `void`ing
 * it — Vue only catches rejections of promises it is handed. The
 * `unhandledrejection` listener in main.ts is the backstop for anything
 * else.
 */
export function runDb<A>(effect: Effect.Effect<A, never, DbServices>): Promise<A> {
  return runtime.runPromise(effect)
}
